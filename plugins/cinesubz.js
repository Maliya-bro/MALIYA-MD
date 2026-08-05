/**
 * 🎬 Cinesubz Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * API: DARKSHAN API (cinesubz-download)
 * API Key: 631bfcfb450f9160
 */

const { cmd } = require("../command");
const axios = require("axios");

const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160";

const cinesubzSessions = {};

// ─── 🔍 1. SEARCH COMMAND ──────────────────────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search and download movies from Cinesubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cinesubz <movie name>*\n\n_Example: .cinesubz Jungle Cruise_");
  }

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

// ─── 💬 2. SELECTION & DOWNLOAD HANDLER ────────────────────────────
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

  try {
    const movieUrl = selectedMovie.url || selectedMovie.link;

    reply("*⏳ Fetching Movie Download Links via Darkshan API...*");

    // Direct Cinesubz Download API Call
    const dlRes = await axios.get(`${API_BASE_URL}/movie/cinesubz-download`, {
      params: { url: movieUrl, apikey: API_KEY }
    });

    const apiData = dlRes.data;
    const downloadArray = apiData?.result || apiData?.data || apiData?.downloads || (Array.isArray(apiData) ? apiData : []);

    if (!downloadArray || downloadArray.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *මෙම චිත්‍රපටය සඳහා Download Links ලබාගැනීමට නොහැකි විය.*");
    }

    // Best Download Quality/Link selection (Prefer 720p or PixelDrain or Direct MP4 link)
    let selectedLinkObj = downloadArray.find(d => 
      (d.quality || d.title || "").toLowerCase().includes("720p") || 
      (d.type || "").toLowerCase().includes("pixeldrain")
    ) || downloadArray[0];

    const finalDownloadUrl = selectedLinkObj.url || selectedLinkObj.link || selectedLinkObj.dl_url || selectedLinkObj.direct_link;

    if (!finalDownloadUrl) {
      return reply("❌ Direct Download URL Extract කිරීමට නොහැකි විය.");
    }

    const qualityInfo = selectedLinkObj.quality || selectedLinkObj.title || "HD Quality";
    const sizeInfo = selectedLinkObj.size || "Direct File";

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Downloading Movie File (${qualityInfo})...*\n_කරුණාකර සුළු වෙලාවක් රැඳී සිටින්න._`);

    // WhatsApp Document ලෙස යැවීම
    await maliya.sendMessage(from, {
      document: { url: finalDownloadUrl },
      mimetype: "video/mp4",
      fileName: `${selectedMovie.title || 'Cinesubz_Movie'}.mp4`,
      caption: `*🎬 ${selectedMovie.title || 'Cinesubz Movie'}*\n⚙️ *Quality:* ${qualityInfo}\n📦 *Size:* ${sizeInfo}\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ Cinesubz Download Error:", error.response?.data || error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.response?.data?.message || error.message}`);
  }
});
