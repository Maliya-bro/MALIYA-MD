/**
 * 🎬 Cinesubz Downloader Plugin
 * API: DARKSHAN API (https://api-dark-shan-yt.koyeb.app)
 * API Key: 631bfcfb450f9160
 */

const { cmd } = require("../command");
const axios = require("axios");

const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160";

const cinesubzSessions = {};

// Helper: Cinesubz API Request Handler
async function getCinesubzData(endpoint, params) {
  try {
    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      params: { ...params, apikey: API_KEY },
      timeout: 20000
    });
    return response.data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err.message);
    return null;
  }
}

// ─── 1. SEARCH / DIRECT LINK COMMAND (.cs / .cinesubz) ─────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cs <movie name OR cinesubz url>*\n\n_Example 1: .cs Jungle Cruise_\n_Example 2: .cs https://cinesubz.lk/movies/jungle-cruise-2021-sinhala-subtitles/_");
  }

  // A. DIRECT CINESUBZ LINK SUBMITTED
  if (q.includes("cinesubz.lk")) {
    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    reply("*⏳ Direct Link detected! Fetching download sources...*");

    const dlData = await getCinesubzData("/movie/cinesubz-download", { url: q });
    if (!dlData) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *Download links extraction failed from API.*");
    }

    return await handleDownloadAndSend(maliya, mek, from, "Cinesubz Movie", dlData, reply);
  }

  // B. SEARCH BY MOVIE NAME
  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  const searchData = await getCinesubzData("/movie/cinesubz-search", { q: q });
  const results = searchData?.result || searchData?.data || searchData;

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
});

// ─── 2. SELECTION REPLY HANDLER ────────────────────────────────────
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
  reply("*⏳ Fetching Movie Download Links...*");

  const movieUrl = selectedMovie.url || selectedMovie.link;
  const dlData = await getCinesubzData("/movie/cinesubz-download", { url: movieUrl });

  if (!dlData) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply("❌ *මෙම චිත්‍රපටය සඳහා Download Links ලබාගැනීමට නොහැකි විය.*");
  }

  await handleDownloadAndSend(maliya, mek, from, selectedMovie.title || "Movie", dlData, reply);
});

// ─── 3. DOWNLOAD & SEND FUNCTION ──────────────────────────────────
async function handleDownloadAndSend(maliya, mek, from, title, apiResponse, reply) {
  try {
    let linksArray = apiResponse?.result || apiResponse?.data || apiResponse?.downloads || (Array.isArray(apiResponse) ? apiResponse : []);

    if (!linksArray || linksArray.length === 0) {
      return reply("❌ No downloadable video links found in API response.");
    }

    // Direct / Pixeldrain / 720p Link filter
    let selected = linksArray.find(item => {
      const str = JSON.stringify(item).toLowerCase();
      return str.includes("pixeldrain") || str.includes("720p") || str.includes("direct");
    }) || linksArray[0];

    let downloadUrl = selected.url || selected.link || selected.dl_url || selected.direct_link || (typeof selected === 'string' ? selected : null);

    if (!downloadUrl) {
      return reply("❌ Failed to parse valid direct download URL.");
    }

    // Fix Pixeldrain viewer link to direct stream link
    if (downloadUrl.includes("pixeldrain.com/u/")) {
      downloadUrl = downloadUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    const quality = selected.quality || selected.title || "HD";
    const size = selected.size || "Direct File";

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Sending File (${quality})...*\n_කරුණාකර මොහොතක් රැඳී සිටින්න._`);

    // WhatsApp Document ලෙස යැවීම
    await maliya.sendMessage(from, {
      document: { url: downloadUrl },
      mimetype: "video/mp4",
      fileName: `${title.replace(/[^a-zA-Z0-9 ]/g, "_")}.mp4`,
      caption: `*🎬 ${title}*\n⚙️ *Quality:* ${quality}\n📦 *Size:* ${size}\n\n_Powered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("Sending Document Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.message}`);
  }
}

// Session Expire Cleanup
setInterval(() => {
  const now = Date.now();
  for (const key in cinesubzSessions) {
    if (now - cinesubzSessions[key].timestamp > 300000) delete cinesubzSessions[key];
  }
}, 60000);
