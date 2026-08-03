/**
 * Films365 Live AJAX Search & Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: Live API Suggestion Scraper + films365-scraper NPM Package
 * Flow: .movie <name> -> AJAX Search -> Reply Number -> Direct Download
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// පැකේජ් එකෙන් ලින්ක් එක ඩිකෝඩ් කරන ෆන්ක්ෂන් එක විතරක් ගනිමු
const { scrapeMovieData } = require('films365-scraper');

// Session tracking සඳහා Object එක
const pendingMovieSearch = {};

// Helper: සයිට් එකේ ටයිටල් පිරිසිදු කිරීමට
function cleanMovieTitle(t = "") {
  return t.replace(/sinhala subtitles?.*/i, "").replace(/සිංහල.*/i, "").trim();
}

// ─── 💬 1. MOVIE SEARCH COMMAND (Live AJAX Search Engine) ──────────────────
cmd({
  pattern: "film",
  alias: ["f365", "films365"],
  react: "🎬",
  desc: "Search and download movies from Films365 Live Suggestion",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .movie <movie name>*\n\n_Example: .movie spider man_");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // 🔥 සයිට් එකේ Live Search එකට යන internal API endpoint එක
    const apiUrl = `https://www.films365.org/api/search?keyword=${encodeURIComponent(q)}`;
    
    const response = await axios.get(apiUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.films365.org/'
      }
    });

    // API එකෙන් එන ඩේටා ලිස්ට් එක (සාමාන්‍යයෙන් response.data හෝ response.data.results)
    const data = response.data;
    const items = Array.isArray(data) ? data : (data.results || data.data || []);

    if (!items || items.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ No results found for "${q}" on Films365*`);
    }

    const results = [];
    items.forEach((item) => {
      // API එකෙන් එන movie id හෝ slug එක අනුව full url එක හදාගැනීම
      const movieSlug = item.slug || item.id; 
      if (movieSlug) {
        results.push({
          title: cleanMovieTitle(item.title || item.name),
          url: `https://www.films365.org/movie/${movieSlug}`,
          year: item.year || item.release_date || ""
        });
      }
    });

    if (results.length === 0) {
      return reply(`*❌ Search structure mismatch. Could not extract links.*`);
    }

    // පළමු රිසල්ට්ස් 10 පමණක් තෝරා ගැනීම
    const topResults = results.slice(0, 10);

    let text = `*🎬 MALIYA-MD Films365 Search: "${q}"*\n${"─".repeat(28)}\n`;
    topResults.forEach((r, i) => {
      text += `*${i + 1}.* ${r.title} ${r.year ? `[📅 ${r.year.substring(0,4)}]` : ''}\n`;
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
    console.error("❌ Live Search API Error:", e.message);
    
    // Fallback: API එකේ වෙනසක් වුනොත් කෙලින්ම common route එකෙන් ට්‍රැක් කරන්න
    try {
        const fallbackUrl = `https://www.films365.org/api/movies?search=${encodeURIComponent(q)}`;
        const fbRes = await axios.get(fallbackUrl);
        // ... (Fallback handling properties can go here if primary fails)
    } catch(err){}

    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}\n\n💡 _Note: සයිට් එකේ internal API එකෙන් ඩේටා බ්ලොක් කරනවා විය හැක._`);
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
  delete pendingMovieSearch[sender]; 

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply(`*📥 Fetching metadata for:* _${selectedMovie.title}_\n🔗 ${selectedMovie.url}`);

  let tempFilePath;

  try {
    // 📦 සිලෙක්ට් කරපු ලින්ක් එක (https://www.films365.org/movie/13226d13...) කෙලින්ම වජිරගේ පැකේජ් එකට දීම
    const metadata = await scrapeMovieData(selectedMovie.url);

    if (!metadata || !metadata.downloadUrl) {
      return reply(`*❌ Failed to extract download URL for this movie.*`);
    }

    let details = `*🎬 ${metadata.title || selectedMovie.title}*\n`;
    details += `${"─".repeat(30)}\n`;
    if (metadata.date) details += `📅 *Release Date:* ${metadata.date}\n`;
    if (metadata.duration) details += `⏱️ *Duration:* ${metadata.duration}\n\n`;
    details += `*⬆️ Downloading and uploading to WhatsApp... Please wait!*`;

    await reply(details);

    const safeTitle = (metadata.title || "Movie").replace(/[^\w\s.\-\[\]()]/gi, "").trim();
    const cleanFileName = `${safeTitle}.mp4`;
    tempFilePath = path.join(__dirname, cleanFileName);

    const response = await axios({
      method: 'get',
      url: metadata.downloadUrl,
      responseType: 'stream',
      timeout: 0, 
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*'
      }
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
    });

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
    reply(`*⚠️ Failed to process download.* ${error.message}`);
  }
});

// සෙෂන් ඔටෝ ක්ලියර් එක
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingMovieSearch) if (now - pendingMovieSearch[s].timestamp > ttl) delete pendingMovieSearch[s];
}, 60000);

module.exports = { pendingMovieSearch };
