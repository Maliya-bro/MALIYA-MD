/**
 * 🎬 Cinesubz Downloader Plugin (Pure Scraper Version)
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package
 * Direct CDN Resolver: Sonic-Cloud 302 Location Header Interceptor
 */

const { cmd } = require("../command");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");
const axios = require("axios");
const cheerio = require("cheerio");

const cinesubzSessions = {};

// Helper: Intermediate Sonic-Cloud Page එකෙන් Real Direct MP4 CDN URL එක Extract කිරීම
async function resolveSonicCloudDirectLink(sonicCloudUrl) {
  try {
    const res = await axios.get(sonicCloudUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': sonicCloudUrl
      }
    });

    if (res.headers.location) {
      return res.headers.location;
    }

    const $ = cheerio.load(res.data);
    const directBtn = $('a:contains("Direct Download")').attr('href') || $('a.btn-download').attr('href');
    
    if (directBtn) {
      const btnRes = await axios.get(directBtn, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': sonicCloudUrl
        }
      });
      return btnRes.headers.location || directBtn;
    }

    return sonicCloudUrl;
  } catch (error) {
    if (error.response && error.response.headers.location) {
      return error.response.headers.location;
    }
    return sonicCloudUrl;
  }
}

// ─── 1. SEARCH COMMAND (.cs / .cinesubz) ───────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz using cinesubz-scraper",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply("*🎬 Usage: .cs <movie name>*\n\n_Example: .cs Jungle Cruise_");
  }

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // NPM Package Search
    const results = await searchCineSubz(q);

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

// ─── 2. SELECTION HANDLER (NPM Info + Direct CDN Resolver) ─────────────
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
    reply("*⏳ Fetching details & resolving direct CDN link...*");

    // NPM Package Details Scraper
    const metadata = await scrapeCineSubz(moviePageUrl);

    let movieTitle = metadata?.title || selectedMovie.title || "Cinesubz Movie";
    let posterUrl = metadata?.poster || selectedMovie.image;
    let imdb = metadata?.imdb_rate || metadata?.vote || "N/A";
    let duration = metadata?.duration || metadata?.info || "N/A";

    let captionText = `*🎬 ${movieTitle}*\n${"─".repeat(30)}\n`;
    captionText += `⭐ *IMDb Rating:* ${imdb}\n`;
    captionText += `⏱️ *Duration:* ${duration}\n\n`;
    captionText += `_⏳ Extracting direct MP4 stream URL from sonic-cloud..._`;

    if (posterUrl) {
      await maliya.sendMessage(from, { image: { url: posterUrl }, caption: captionText }, { quoted: mek });
    } else {
      await reply(captionText);
    }

    if (!metadata.downloadLinks || metadata.downloadLinks.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *Download Links සොයාගැනීමට නොහැකි විය.*");
    }

    // NPM Package එකෙන් එන sonic-cloud link එක අරගෙන Real MP4 CDN Link එකට Bypassed කිරීම
    let intermediateUrl = metadata.downloadLinks[0].directUrl || metadata.downloadLinks[0].url;
    let finalDirectMp4Url = intermediateUrl;

    if (intermediateUrl.includes("sonic-cloud")) {
      finalDirectMp4Url = await resolveSonicCloudDirectLink(intermediateUrl);
    } else if (intermediateUrl.includes("pixeldrain.com/u/")) {
      finalDirectMp4Url = intermediateUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    // Send Document
    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Downloading Movie Document...*\n_Resolved CDN Link: ✅_`);

    await maliya.sendMessage(from, {
      document: { url: finalDirectMp4Url },
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
