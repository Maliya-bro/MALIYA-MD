/**
 * 🎬 Cinesubz Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Flow: cinesubz-search => cinesubz-info => cinesubz-download
 * API: DARKSHAN API
 */

const { cmd } = require("../command");
const axios = require("axios");

const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160"; // Darkshan API Key

// User choice tracking session
const cinesubzSessions = {};

// ─── 1. SEARCH COMMAND (.cs / .cinesubz) ───────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz via Darkshan API",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cs <movie name>*\n\n_Example: .cs Spider Man_");
  }

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // Step 1: Cinesubz Search API Request
    const searchUrl = `${API_BASE_URL}/movie/cinesubz-search?q=${encodeURIComponent(q)}&apikey=${API_KEY}`;
    const searchRes = await axios.get(searchUrl, { timeout: 15000 });

    const results = searchRes.data?.result || searchRes.data?.data || (Array.isArray(searchRes.data) ? searchRes.data : []);

    if (!results || results.length === 0) {
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

    // Store session for selection
    cinesubzSessions[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error("❌ Step 1 (Search) Error:", error.response?.data || error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Search API Error:* ${error.message}`);
  }
});

// ─── 2. SELECTION HANDLER (Info => Download Pipeline) ───────────────
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

  const moviePageUrl = selectedMovie.url || selectedMovie.link;

  if (!moviePageUrl) {
    return reply("❌ Movie URL is missing from Search Response.");
  }

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    // -----------------------------------------------------------------
    // Step 2: Call Cinesubz Info API
    // -----------------------------------------------------------------
    reply("*⏳ Fetching Movie Info...*");
    const infoApiUrl = `${API_BASE_URL}/movie/cinesubz-info?url=${encodeURIComponent(moviePageUrl)}&apikey=${API_KEY}`;
    const infoRes = await axios.get(infoApiUrl, { timeout: 15000 });

    const infoData = infoRes.data?.result || infoRes.data?.data || infoRes.data;

    let movieTitle = infoData?.title || selectedMovie.title || "Cinesubz Movie";
    let posterUrl = infoData?.image || infoData?.poster || selectedMovie.image;
    let imdb = infoData?.imdb || infoData?.rating || "N/A";
    let releaseDate = infoData?.date || infoData?.releaseDate || "N/A";

    // Send Movie Info Caption + Poster
    let captionText = `*🎬 ${movieTitle}*\n${"─".repeat(30)}\n`;
    captionText += `⭐ *IMDb Rating:* ${imdb}\n`;
    captionText += `📅 *Release Date:* ${releaseDate}\n\n`;
    captionText += `_⏳ Fetching direct download links..._`;

    if (posterUrl) {
      await maliya.sendMessage(from, { image: { url: posterUrl }, caption: captionText }, { quoted: mek });
    } else {
      await reply(captionText);
    }

    // -----------------------------------------------------------------
    // Step 3: Call Cinesubz Download API
    // -----------------------------------------------------------------
    const dlApiUrl = `${API_BASE_URL}/movie/cinesubz-download?url=${encodeURIComponent(moviePageUrl)}&apikey=${API_KEY}`;
    const dlRes = await axios.get(dlApiUrl, { timeout: 20000 });

    const dlData = dlRes.data?.result || dlRes.data?.data || dlRes.data?.downloads || (Array.isArray(dlRes.data) ? dlRes.data : null);

    if (!dlData || dlData.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *cinesubz-download API එකෙන් Download Links ලැබුණේ නැත (Server Empty Response).*");
    }

    // Direct / Pixeldrain / Best Quality selection
    let selectedDL = Array.isArray(dlData) 
      ? (dlData.find(d => JSON.stringify(d).toLowerCase().includes("720p") || JSON.stringify(d).toLowerCase().includes("pixeldrain")) || dlData[0])
      : dlData;

    let finalDownloadUrl = selectedDL?.url || selectedDL?.link || selectedDL?.dl_url || selectedDL?.direct_link || (typeof selectedDL === "string" ? selectedDL : null);

    if (!finalDownloadUrl) {
      return reply("❌ Valid Direct Video URL extract කර ගැනීමට නොහැකි විය.");
    }

    // Convert Pixeldrain View URL to Direct Stream Link
    if (finalDownloadUrl.includes("pixeldrain.com/u/")) {
      finalDownloadUrl = finalDownloadUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    const quality = selectedDL?.quality || selectedDL?.title || "HD";
    const size = selectedDL?.size || "Direct File";

    // -----------------------------------------------------------------
    // Step 4: Send Document File to WhatsApp
    // -----------------------------------------------------------------
    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Uploading Movie Document (${quality})...*\n_කරුණාකර සුළු වෙලාවක් රැඳී සිටින්න._`);

    await maliya.sendMessage(from, {
      document: { url: finalDownloadUrl },
      mimetype: "video/mp4",
      fileName: `${movieTitle.replace(/[^a-zA-Z0-9 ]/g, "_")}.mp4`,
      caption: `*🎬 ${movieTitle}*\n⚙️ *Quality:* ${quality}\n📦 *Size:* ${size}\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ Pipeline Error:", error.response?.data || error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Process Error:* ${error.response?.data?.message || error.message}`);
  }
});

// Auto Cleanup Sessions
setInterval(() => {
  const now = Date.now();
  for (const s in cinesubzSessions) {
    if (now - cinesubzSessions[s].timestamp > 300000) delete cinesubzSessions[s];
  }
}, 60000);
