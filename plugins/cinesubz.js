/**
 * 🎬 Cinesubz Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * API: DARKSHAN API (https://api-dark-shan-yt.koyeb.app)
 * Command: .cinesubz <movie name>
 */

const { cmd } = require("../command");
const axios = require("axios");

// API Configuration
const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160"; // ඔයාගේ DARKSHAN API Key එක මෙතැනට යොදන්න (තිබේ නම්)

// Session memory for reply handling
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
    return reply("*🎬 Usage: .cinesubz <movie name>*\n\n_Example: .cinesubz Avatar_");
  }

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // 1. Cinesubz Search Request
    const searchRes = await axios.get(`${API_BASE_URL}/movie/cinesubz-search`, {
      params: { q: q, apikey: API_KEY }
    });

    const results = searchRes.data?.result || searchRes.data?.data || searchRes.data;

    if (!results || results.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ "${q}" සඳහා Cinesubz හි කිසිදු චිත්‍රපටයක් හමුවූයේ නැත.*`);
    }

    const topResults = results.slice(0, 10);

    let text = `*🎬 CINESUBZ MOVIE SEARCH RESULTS*\n${"─".repeat(30)}\n\n`;
    topResults.forEach((item, index) => {
      text += `*${index + 1}.* ${item.title || item.name}\n`;
    });
    text += `\n*📌 Reply with the number (1-${topResults.length}) to select movie.*`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // Save Session
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
  delete cinesubzSessions[sender]; // Clear Session

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    const movieUrl = selectedMovie.url || selectedMovie.link;

    // 1. Movie Info Fetching
    reply("*⏳ Fetching Movie Details & Download Links...*");

    const infoRes = await axios.get(`${API_BASE_URL}/movie/cinesubz-info`, {
      params: { url: movieUrl, apikey: API_KEY }
    });

    const info = infoRes.data?.result || infoRes.data;

    let caption = `*🎬 ${info.title || selectedMovie.title}*\n${"─".repeat(30)}\n`;
    if (info.imdb) caption += `⭐ *IMDb:* ${info.imdb}\n`;
    if (info.date) caption += `📅 *Release Date:* ${info.date}\n`;
    if (info.category) caption += `🏷️ *Category:* ${info.category}\n`;

    // Movie Poster Send
    if (info.image || info.poster) {
      await maliya.sendMessage(from, { 
        image: { url: info.image || info.poster }, 
        caption: caption 
      }, { quoted: mek });
    }

    // 2. Fetch Download Links
    const dlRes = await axios.get(`${API_BASE_URL}/movie/cinesubz-download`, {
      params: { url: movieUrl, apikey: API_KEY }
    });

    const dlData = dlRes.data?.result || dlRes.data?.download || dlRes.data;

    if (!dlData || dlData.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *මෙම චිත්‍රපටය සඳහා Download Links කිසිවක් හමුවූයේ නැත.*");
    }

    // 720p හෝ පළමු Download Link එක තෝරාගැනීම
    const targetDl = Array.isArray(dlData) 
      ? (dlData.find(d => (d.quality || d.title || "").includes("720p")) || dlData[0]) 
      : dlData;

    const downloadUrl = targetDl.url || targetDl.link || targetDl.dl_url;

    if (!downloadUrl) {
      return reply("❌ Direct Download URL Extraction Failed.");
    }

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Downloading Movie File (${targetDl.quality || 'Direct Link'})...*\n_කරුණාකර සුළු වෙලාවක් රැඳී සිටින්න._`);

    // 3. Send Video Document to WhatsApp
    await maliya.sendMessage(from, {
      document: { url: downloadUrl },
      mimetype: "video/mp4",
      fileName: `${selectedMovie.title || 'Cinesubz_Movie'}.mp4`,
      caption: `*🎬 ${selectedMovie.title || 'Cinesubz Movie'}*\n⚙️ *Quality:* ${targetDl.quality || 'HD'}\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ Cinesubz Download Error:", error.response?.data || error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.response?.data?.message || error.message}`);
  }
});

// Auto Session Cleanup
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in cinesubzSessions) {
    if (now - cinesubzSessions[s].timestamp > ttl) delete cinesubzSessions[s];
  }
}, 60000);
