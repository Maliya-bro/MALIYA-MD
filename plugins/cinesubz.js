/**
 * Films365 Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: films365-scraper NPM Package by VajiraOfficial
 * Command: .movie <films365-movie-url>
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { scrapeMovieData } = require('films365-scraper');

cmd({
  pattern: "movie",
  alias: ["f365", "fmovie"],
  react: "🎬",
  desc: "Download movies directly from Films365 links",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, reply }) => {
  
  // 1. ලින්ක් එකක් දීලා තියෙනවාදැයි චෙක් කිරීම
  if (!q || !q.includes("films365.org")) {
    return reply("*🎬 Usage: .movie <films365_movie_url>*\n\n_Example: .movie https://www.films365.org/movie/..._");
  }

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  reply(`*⏳ Launching Films365 decryption automation worker...*`);

  // ෆයිල් එක සේව් වෙන්න ඕනේ තාවකාලික පාත් එක
  let tempFilePath;

  try {
    // 2. පැකේජ් එක හරහා මෙටාඩේටා ස්ක්‍රේප් කිරීම
    const metadata = await scrapeMovieData(q.trim());

    if (!metadata || !metadata.downloadUrl) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ Failed to extract download URL from this link.*`);
    }

    // වීඩියෝ විස්තර ටික ලස්සනට මැසේජ් එකක් විදිහට සකස් කිරීම
    let movieDetails = `*🎬 ${metadata.title || 'Unknown Title'}*\n`;
    movieDetails += `${"─".repeat(30)}\n`;
    if (metadata.date) movieDetails += `📅 *Release Date:* ${metadata.date}\n`;
    if (metadata.duration) movieDetails += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.rate) movieDetails += `⭐ *Rating:* ${metadata.rate}/10\n\n`;
    if (metadata.desc) movieDetails += `📝 *Plot:* ${metadata.desc}\n\n`;
    movieDetails += `*📥 Downloading movie file from server... Please wait!*`;

    await reply(movieDetails);
    await maliya.sendMessage(from, { react: { text: "📥", key: mek.key } });

    // ෆයිල් එකේ නම පිරිසිදු කර ගැනීම
    const safeTitle = (metadata.title || "Movie").replace(/[^\w\s.\-\[\]()]/gi, "").trim();
    const cleanFileName = `${safeTitle}.mp4`;
    tempFilePath = path.join(__dirname, cleanFileName);

    // 3. Axios Stream එකක් හරහා වීඩියෝව ඩවුන්ලෝඩ් කිරීම
    const response = await axios({
      method: 'get',
      url: metadata.downloadUrl,
      responseType: 'stream',
      timeout: 0, // ලොකු ෆයිල් වලදී හිර නොවී බෑමට
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    // සර්වර් එකෙන් වැරදිලා HTML පේජ් එකක් ආවොත් බ්ලොක් කිරීම (Bypass error logs)
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return reply(`*❌ Server rejected direct download stream.*\n\n🔗 *You can download via browser:* \n${metadata.downloadUrl}`);
    }

    // ෆයිල් එක Local Storage එකට ලියවීම
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
    });

    // 4. බාගත් ෆයිල් එකේ ප්‍රමාණය පරික්ෂා කිරීම
    const stats = fs.statSync(tempFilePath);
    if (stats.size < 5 * 1024 * 1024) { // 5MB ට අඩු නම් එරර් එකක්
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return reply(`*❌ Downloaded file is corrupted or too small.*`);
    }

    await maliya.sendMessage(from, { react: { text: "⬆️", key: mek.key } });
    reply(`*⬆️ Uploading movie to WhatsApp...*`);

    // 5. ඩොකියුමන්ට් එකක් ලෙස WhatsApp එකට යැවීම
    await maliya.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${metadata.title}*\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    // වැඩේ ඉවර වුන ගමන් තාවකාලික ෆයිල් එක ඩිලීට් කිරීම
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    // මොකක් හරි අවුලක් ගියොත් හාඩ් එකේ ඉතුරු වෙන ෆයිල් එක අයින් කිරීම
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    
    console.error("❌ Films365 Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*⚠️ Extraction/Upload Failed.*\n*Reason:* ${error.message}`);
  }
});
