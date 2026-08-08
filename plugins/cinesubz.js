/**
 * 🎬 Cinesubz Downloader Plugin (Hybrid Fix)
 * ─────────────────────────────────────────────────────────────
 * Search & Info: DARKSHAN API
 * Download Link: Direct Scraping Bypasser (Fixes "data: null" error)
 */

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

const API_BASE_URL = "https://api-dark-shan-yt.koyeb.app";
const API_KEY = "631bfcfb450f9160";

const cinesubzSessions = {};

// Helper: Direct Cinesubz Page Scraper for Download Links
async function scrapeDirectDownloadLink(pageUrl) {
  try {
    const { data } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    let downloadUrl = null;

    // Pixeldrain / Direct Download Links සොයාගැනීම
    $('a[href*="pixeldrain.com"], a[href*="file"], a.btn-download, .download-link a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !downloadUrl) {
        downloadUrl = href;
      }
    });

    return downloadUrl;
  } catch (err) {
    console.error("Scrape Link Error:", err.message);
    return null;
  }
}

// ─── 1. SEARCH COMMAND (.cs / .cinesubz) ───────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cs <movie name>*\n\n_Example: .cs Jungle Cruise_");
  }

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // API Call 1: Search
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

    cinesubzSessions[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error("❌ Search Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Search Error:* ${error.message}`);
  }
});

// ─── 2. SELECTION HANDLER (Info API + Scraped DL Link) ───────────────
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

  const moviePageUrl = selectedMovie.url || selectedMovie.link;

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    // API Call 2: Movie Info
    reply("*⏳ Fetching Movie Info via Darkshan API...*");
    const infoApiUrl = `${API_BASE_URL}/movie/cinesubz-info?url=${encodeURIComponent(moviePageUrl)}&apikey=${API_KEY}`;
    const infoRes = await axios.get(infoApiUrl, { timeout: 15000 });

    const infoData = infoRes.data?.result || infoRes.data?.data || infoRes.data;

    let movieTitle = infoData?.title || selectedMovie.title || "Cinesubz Movie";
    let posterUrl = infoData?.image || infoData?.poster || selectedMovie.image;
    let imdb = infoData?.imdb || infoData?.rating || "N/A";
    let releaseDate = infoData?.date || infoData?.releaseDate || "N/A";

    let captionText = `*🎬 ${movieTitle}*\n${"─".repeat(30)}\n`;
    captionText += `⭐ *IMDb Rating:* ${imdb}\n`;
    captionText += `📅 *Release Date:* ${releaseDate}\n\n`;
    captionText += `_⏳ Bypassing broken download API & fetching direct file link..._`;

    if (posterUrl) {
      await maliya.sendMessage(from, { image: { url: posterUrl }, caption: captionText }, { quoted: mek });
    } else {
      await reply(captionText);
    }

    // Fallback: API Download එක broken නිසා Direct Cinesubz Page එකෙන් Scrape කිරීම
    let downloadUrl = await scrapeDirectDownloadLink(moviePageUrl);

    if (!downloadUrl) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *Direct Download Link එක සොයාගැනීමට නොහැකි විය. Cinesubz හි මෙම Movie එකට Links නැත.*");
    }

    // Convert Pixeldrain View URL to Direct File Link
    if (downloadUrl.includes("pixeldrain.com/u/")) {
      downloadUrl = downloadUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    // Send Document
    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Downloading Movie Document...*\n_කරුණාකර සුළු වෙලාවක් රැඳී සිටින්න._`);

    await maliya.sendMessage(from, {
      document: { url: downloadUrl },
      mimetype: "video/mp4",
      fileName: `${movieTitle.replace(/[^a-zA-Z0-9 ]/g, "_")}.mp4`,
      caption: `*🎬 ${movieTitle}*\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ Process Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.message}`);
  }
});
