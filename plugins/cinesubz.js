/**
 * Films365 Smart Search & Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: Custom Cheerio Search + films365-scraper NPM Package by VajiraOfficial
 * Flow: .movie <name> -> reply with number -> Direct Download
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio"); // සයිට් එකෙන් ලින්ක්ස් සූරන්න අනිවාර්යයි

// පැකේජ් එකෙන් ලින්ක් එක ඩිකෝඩ් කරන ෆන්ක්ෂන් එක විතරක් ගනිමු
const { scrapeMovieData } = require('films365-scraper');

// Session tracking සඳහා Object එක
const pendingMovieSearch = {};

// Helper: සයිට් එකේ ටයිටල් පිරිසිදු කිරීමට
function cleanMovieTitle(t = "") {
  return t.replace(/sinhala subtitles?.*/i, "").replace(/සිංහල.*/i, "").trim();
}

// ─── 💬 1. MOVIE SEARCH COMMAND (Direct Site Scraper Search) ──────────────────
cmd({
  pattern: "film",
  alias: ["f365", "films365"],
  react: "🎬",
  desc: "Search and download movies from Films365",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .movie <movie name>*\n\n_Example: .movie spider man_");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // 🔥 Films365 සර්ච් URL එක සාදා ගැනීම
    const searchUrl = `https://www.films365.org/?s=${encodeURIComponent(q)}`;
    
    const response = await axios.get(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' 
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // සයිට් එකේ HTML ව්‍යුහය ඇතුලෙන් /movie/ හෝ /tvshows/ ලින්ක්ස් සහ titles සූරා ගැනීම
    $("a").each((i, el) => {
      const href = $(el).attr("href") || "";
      const title = $(el).text().trim();
      
      // අපිට අවශ්‍ය /movie/ හෝ /tvshows/ ලින්ක් එකක් සහ වලංගු මාතෘකාවක් තිබේ නම් පමණක් එකතු කර ගනී
      if ((href.includes("/movie/") || href.includes("/tvshows/")) && title.length > 2) {
        const fullUrl = href.startsWith("http") ? href : `https://www.films365.org${href}`;
        
        // ඩුප්ලිකේට් ලින්ක්ස් අයින් කිරීම
        if (!results.some(r => r.url === fullUrl)) {
          results.push({
            title: cleanMovieTitle(title),
            url: fullUrl
          });
        }
      }
    });

    if (results.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ No results found for "${q}" on Films365*`);
    }

    // පළමු රිසල්ට්ස් 10 පමණක් තෝරා ගැනීම
    const topResults = results.slice(0, 10);

    let text = `*🎬 MALIYA-MD Films365 Search: "${q}"*\n${"─".repeat(28)}\n`;
    topResults.forEach((r, i) => {
      text += `*${i + 1}.* ${r.title}\n`;
    });
    text += `\n*📌 Note:* Reply with the number to download this movie.`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // සෙෂන් එක සේව් කර ගැනීම
    pendingMovieSearch[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (e) {
    console.error("❌ Search Link Error:", e.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. FILTER-BASED SELECTION & DOWNLOAD HANDLER ────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingMovieSearch[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingMovieSearch[sender].results.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingMovieSearch[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selectedMovie = session.results[index];
  delete pendingMovieSearch[sender]; // සෙෂන් එක ක්ලියර් කිරීම

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply(`*📥 Fetching metadata for:* _${selectedMovie.title}_`);

  let tempFilePath;

  try {
    // 📦 සිලෙක්ට් කරපු ලින්ක් එක වජිරගේ පැකේජ් එකට දීලා direct download url එක ගනිමු
    const metadata = await scrapeMovieData(selectedMovie.url);

    if (!metadata || !metadata.downloadUrl) {
      return reply(`*❌ Failed to extract download URL for this movie.*`);
    }

    let details = `*🎬 ${metadata.title || selectedMovie.title}*\n`;
    details += `${"─".repeat(30)}\n`;
    if (metadata.date) details += `📅 *Release Date:* ${metadata.date}\n`;
    if (metadata.duration) details += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.rate) details += `⭐ *Rating:* ${metadata.rate}/10\n\n`;
    if (metadata.desc) details += `📝 *Plot:* ${metadata.desc}\n\n`;
    details += `*⬆️ Downloading and uploading to WhatsApp... Please wait!*`;

    await reply(details);

    const safeTitle = (metadata.title || "Movie").replace(/[^\w\s.\-\[\]()]/gi, "").trim();
    const cleanFileName = `${safeTitle}.mp4`;
    tempFilePath = path.join(__dirname, cleanFileName);

    // 🌐 Axios Stream එකෙන් බාගැනීම
    const response = await axios({
      method: 'get',
      url: metadata.downloadUrl,
      responseType: 'stream',
      timeout: 0, 
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return reply(`*❌ Server rejected direct stream.*\n\n🔗 *Download via Browser:* \n${metadata.downloadUrl}`);
    }

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
    });

    const stats = fs.statSync(tempFilePath);
    if (stats.size < 5 * 1024 * 1024) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return reply(`*❌ Downloaded file is invalid or corrupted.*`);
    }

    // ⬆️ WhatsApp අප්ලෝඩ් එක
    await maliya.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${metadata.title || selectedMovie.title}*\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error("❌ Films365 Error:", error.message);
    reply(`*⚠️ Failed to process download.*\n*Reason:* ${error.message}`);
  }
});

// සෙෂන් ඔටෝ ක්ලියර් එක
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingMovieSearch) if (now - pendingMovieSearch[s].timestamp > ttl) delete pendingMovieSearch[s];
}, 60000);

module.exports = { pendingMovieSearch };
