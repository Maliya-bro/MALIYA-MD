/**
 * 🎬 Cinesubz Movie Downloader Plugin (Fixed Download & Direct Link Support)
 * ─────────────────────────────────────────────────────────────
 * API: DARKSHAN API
 * API Key: 631bfcfb450f9160
 */

const { cmd } = require("../command");
const axios = require("axios");

const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160";

const cinesubzSessions = {};

// Helper Function: Movie URL එකෙන් Download Links ලබා ගැනීම
async function fetchCinesubzDownloads(movieUrl) {
  try {
    const res = await axios.get(`${API_BASE_URL}/movie/cinesubz-download`, {
      params: { url: movieUrl, apikey: API_KEY },
      timeout: 15000
    });

    const data = res.data;
    let links = data?.result || data?.data || data?.downloads || (Array.isArray(data) ? data : []);

    if (links && links.length > 0) return links;

    // Fallback: Link එකේ අගට download/ එකතු කර උත්සාහ කිරීම
    const altUrl = movieUrl.endsWith('/') ? `${movieUrl}download/` : `${movieUrl}/download/`;
    const resAlt = await axios.get(`${API_BASE_URL}/movie/cinesubz-download`, {
      params: { url: altUrl, apikey: API_KEY },
      timeout: 15000
    });

    const dataAlt = resAlt.data;
    return dataAlt?.result || dataAlt?.data || dataAlt?.downloads || (Array.isArray(dataAlt) ? dataAlt : []);
  } catch (err) {
    console.error("Fetch Download Links Failed:", err.message);
    return [];
  }
}

// ─── 1. COMMAND: .cs / .cinesubz ──────────────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cs <movie name OR cinesubz url>*\n\n_Example 1: .cs Spider Man_\n_Example 2: .cs https://cinesubz.lk/movies/jungle-cruise-2021-sinhala-subtitles/_");
  }

  // 💡 DIRECT LINK CHECK: User දුන්නේ Cinesubz Direct Link එකක් නම්
  if (q.startsWith("http://") || q.startsWith("https://")) {
    if (!q.includes("cinesubz.lk")) {
      return reply("❌ *කරුණාකර වලංගු Cinesubz Link එකක් ලබාදෙන්න.*");
    }

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    reply("*⏳ Direct Link detected! Fetching Download Links...*");

    const dlLinks = await fetchCinesubzDownloads(q);

    if (!dlLinks || dlLinks.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *මෙම Cinesubz Link එක සඳහා Download Links ලබාගැනීමට නොහැකි විය. API Server එක මගින් Link එක Block කර ඇත.*");
    }

    return await processAndSendMovie(maliya, mek, from, "Cinesubz Movie", dlLinks, reply);
  }

  // 💡 MOVIE NAME SEARCH: සාමාන්‍ය නමක් සෙවීම
  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const searchRes = await axios.get(`${API_BASE_URL}/movie/cinesubz-search`, {
      params: { q: q, apikey: API_KEY }
    });

    const results = searchRes.data?.result || searchRes.data?.data || searchRes.data;

    if (!results || !Array.isArray(results) || results.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ "${q}" සඳහා Cinesubz හි කිසිදු චිත්‍රපටයක් හමුවූයේ නැත.*`);
    }

    const topResults = results.slice(0, 10);

    let text = `*🎬 CINESUBZ MOVIE SEARCH RESULTS*\n${"─".repeat(30)}\n\n`;
    topResults.forEach((item, index) => {
      text += `*${index + 1}.* ${item.title || item.name}\n`;
    });
    text += `\n*📌 Reply with the number (1-${topResults.length}) to download.*`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    cinesubzSessions[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error("❌ Cinesubz Search Error:", error.response?.data || error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Search Error:* ${error.response?.data?.message || error.message}`);
  }
});

// ─── 2. REPLY SELECTION HANDLER ──────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!cinesubzSessions[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= cinesubzSessions[sender].results.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = cinesubzSessions[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selectedMovie = session.results[index];
  delete cinesubzSessions[sender];

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply("*⏳ Fetching Download Links via Darkshan API...*");

  const movieUrl = selectedMovie.url || selectedMovie.link;
  const dlLinks = await fetchCinesubzDownloads(movieUrl);

  if (!dlLinks || dlLinks.length === 0) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply("❌ *මෙම චිත්‍රපටය සඳහා Download Links ලබාගැනීමට නොහැකි විය (API Cloudflare Limit/Link Extraction Failed).*");
  }

  await processAndSendMovie(maliya, mek, from, selectedMovie.title || "Cinesubz Movie", dlLinks, reply);
});

// ─── 3. HELPER FUNCTION TO SEND MOVIE DOCUMENT ────────────────────
async function processAndSendMovie(maliya, mek, from, title, downloadArray, reply) {
  try {
    // Pixeldrain / Direct 720p URL එකක් තෝරා ගැනීම
    let selectedObj = downloadArray.find(d => 
      (d.quality || d.title || "").toLowerCase().includes("720p") || 
      (d.type || d.link || "").toLowerCase().includes("pixeldrain")
    ) || downloadArray[0];

    let fileUrl = selectedObj.url || selectedObj.link || selectedObj.dl_url || selectedObj.direct_link;

    // Pixeldrain link formatting fix (If pixeldrain page link provided)
    if (fileUrl.includes("pixeldrain.com/u/")) {
      fileUrl = fileUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    if (!fileUrl) {
      return reply("❌ Direct Download File URL Extract කිරීමට නොහැකි විය.");
    }

    const qualityInfo = selectedObj.quality || selectedObj.title || "HD";
    const sizeInfo = selectedObj.size || "Unknown Size";

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Uploading Movie Document (${qualityInfo})...*\n_කරුණාකර සුළු වෙලාවක් රැඳී සිටින්න._`);

    await maliya.sendMessage(from, {
      document: { url: fileUrl },
      mimetype: "video/mp4",
      fileName: `${title.replace(/[^a-zA-Z0-9 ]/g, "")}.mp4`,
      caption: `*🎬 ${title}*\n⚙️ *Quality:* ${qualityInfo}\n📦 *Size:* ${sizeInfo}\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("❌ Process Movie Error:", err);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Movie Upload Failed:* ${err.message}`);
  }
}

// Session TTL Cleanup
setInterval(() => {
  const now = Date.now();
  for (const s in cinesubzSessions) {
    if (now - cinesubzSessions[s].timestamp > 300000) delete cinesubzSessions[s];
  }
}, 60000);
