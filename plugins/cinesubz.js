/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Fix: Filter-based session matching + Dynamic Referer Bypass + .mkv Patch
 * Flow: .film -> reply with number (Select) -> reply with number (Download)
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require('cinesubz-scraper');

// Session tracking සඳහා Objects
const pendingSearch = {};
const pendingQuality = {};

// Helper: මාතෘකා පිරිසිදු කිරීමට
function cleanTitle(t = "") {
  return t.replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "").replace(/sinhala subtitles?.*/i, "").replace(/සිංහල.*/i, "").replace(/\|.*/i, "").replace(/[-–]\s*$/, "").trim();
}

// ─── 💬 1. MAIN FILM SEARCH COMMAND ──────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine"],
  react: "🎬",
  desc: "Search movies from CineSubz using Package Engine",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await searchCineSubz(q);
    if (!results || !results.length) return reply(`*❌ No results found for "${q}"*`);

    let text = `*🎬 MALIYA-MD Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}.* ${cleanTitle(r.title)} ${r.rating ? `[⭐ ${r.rating}]` : ''}\n`;
    });
    text += `\n*📌 Note:* Reply with the number to select (quoting this message works too).`;

    const sent = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // Session එක Store කිරීම
    pendingSearch[sender] = {
      results,
      messageId: sent?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. FILTER-BASED SELECTION HANDLER (Movie Selection) ─────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingSearch[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingSearch[sender].results.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingSearch[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selectedMovie = session.results[index];
  delete pendingSearch[sender]; // Search session එක ක්ලියර් කිරීම

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    const metadata = await scrapeCineSubz(selectedMovie.url);
    if (!metadata.downloadLinks || !metadata.downloadLinks.length) {
      return reply("*❌ Download links no longer available.*");
    }

    let msg = `*🎬 ${metadata.title || selectedMovie.title}*\n${"─".repeat(32)}\n`;
    if (metadata.imdb_rate) msg += `⭐ *IMDb:* ${metadata.imdb_rate}\n`;
    if (metadata.duration) msg += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.genre) msg += `🎭 *Genre:* ${metadata.genre}\n\n`;

    msg += `*📥 Quality Select:*\n`;
    metadata.downloadLinks.forEach((l, i) => {
      msg += `*${i + 1}.* ${l.quality}\n`;
    });
    msg += `\n*📌 Note:* Reply with the quality number to download (quoting this message works too).`;

    const sentQualityMsg = await maliya.sendMessage(from, { text: msg }, { quoted: mek });

    pendingQuality[sender] = {
      title: metadata.title || selectedMovie.title,
      links: metadata.downloadLinks,
      messageId: sentQualityMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (e) {
    return reply(`*❌ Metadata Error:* ${e.message}`);
  }
});

// ─── 💬 3. FILTER-BASED QUALITY HANDLER (Download & Firewall Bypass) ────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingQuality[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingQuality[sender].links.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingQuality[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const chosenLink = session.links[index];
  delete pendingQuality[sender]; // Quality session එක ක්ලියර් කිරීම

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });
  reply(`*⏳ Bypassing Firewalls & Fetching Direct Link...*`);

  const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
  const tempFilePath = path.join(__dirname, cleanFileName);

  try {
    // දැනටමත් Direct File Link එකක්ද බැලීම
    const isAlreadyDirectFile = /\.(mp4|mkv|avi|mov)(\?.*)?$/i.test(chosenLink.directUrl);

    let finalDownloadUrl;
    let sizeInfo = null;

    if (isAlreadyDirectFile) {
      finalDownloadUrl = chosenLink.directUrl;
      sizeInfo = chosenLink.size || null;
    } else {
      const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);

      if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
        return reply(`*❌ Stream Link Decryption Failed.*`);
      }

      if (decryptedData.telegram && !decryptedData.directUrl) {
        return reply(`*📲 Telegram Stream Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
      }

      finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;
      sizeInfo = decryptedData.size;
    }

    // 🔥 Invalid Server HTML බග් එක වළක්වා ගැනීමට .mkv ඒවා .mp4 වලට හැරවීම
    if (finalDownloadUrl.includes('ext=mkv')) {
      finalDownloadUrl = finalDownloadUrl.replace('ext=mkv', 'ext=mp4');
    } else if (finalDownloadUrl.endsWith('.mkv')) {
      finalDownloadUrl = finalDownloadUrl.replace(/\.mkv$/, '.mp4');
    }

    // 🔥 ලැබෙන හොස්ට් සර්වර් එක අනුව ඔටෝමැටිකලි නිවැරදි Referer එක ගැලපීම (Bypass Block)
    let dynamicReferer = 'https://cinesubz.lk/';
    try {
      const parsedUrl = new URL(finalDownloadUrl);
      dynamicReferer = `${parsedUrl.protocol}//${parsedUrl.host}/`;
    } catch (e) {
      console.log("URL parsing error, using default referer");
    }

    // File Download Stream
    const response = await axios({
      method: 'get',
      url: finalDownloadUrl,
      responseType: 'stream',
      timeout: 0, // 🔥 ලොකු ෆයිල් මැදදී කට් නොවෙන්න Timeout එක නැති කරා
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': dynamicReferer, // 🔥 Sonic-Cloud Cloudflare Bypass
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const contentLength = parseInt(response.headers['content-length'] || '0');

    // සර්වර් එකෙන් ආයෙත් HTML Error එකක් ආවොත් බ්ලොක් කිරීම
    if (contentType.includes('text/html') || contentType.includes('application/json') || (contentLength > 0 && contentLength < 10 * 1024 * 1024)) {
      return reply(`*❌ Server rejected direct download (Cloudflare Challenge or Invalid Server).*\n\n🎬 *Movie:* ${session.title}\n\n🔗 *මෙන්න ඩිරෙක්ට් බ්‍රවුසර් ලින්ක් එක:* \n${finalDownloadUrl}`);
    }

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

    // හාඩ් ඩිස්ක් එකට ආපු ෆයිල් එකේ සයිස් එක චෙක් කිරීම
    const stats = fs.statSync(tempFilePath);
    if (stats.size < 10 * 1024 * 1024) { 
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return reply(`*❌ Download Failed (Server returned an invalid file).* \n\n🔗 *ඔයාම මේ ලින්ක් එකෙන් ට්‍රයි කරන්න:* \n${finalDownloadUrl}`);
    }

    reply(`*⬆️ Uploading movie file to WhatsApp...*`);

    await maliya.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n*💾 Size:* ${sizeInfo || 'N/A'}\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.log("❌ CineSubz Upload Error:", err.message);
    
    let errMsg = err.message;
    if (err.response) errMsg += ` (Status: ${err.response.status})`;
    
    reply(`*⚠️ Direct Upload Failed.*\n*Reason:* ${errMsg}\n\n🔗 Download Link:\n${chosenLink.directUrl}`);
  }
});

// විනාඩි 5න් සෙෂන් ඉබේම එක්ස්පයර් වීමේ ආරක්ෂිත ලොජික් එක
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);

module.exports = { pendingSearch, pendingQuality };
