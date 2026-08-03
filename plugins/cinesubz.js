/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Features: Auto Search, Meta Scraper & Stream Decryption
 * Bugfix: Strict Context Matching for Text Listener Selection.
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Package එක Import කරගැනීම
const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require('cinesubz-scraper');

// Storage objects for session tracking
const pendingSearch = {};
const pendingQuality = {};

// ─── 💬 1. Main Movie Search Command ──────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["movie", "cinesubz"],
  react: "🎬",
  desc: "Search and directly download files from CineSubz using official scraper",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  
  try {
    const results = await searchCineSubz(q);
    if (!results || !results.length) return reply(`*❌ No results found for "${q}"*`);

    // Session එක Store කරගැනීම (Sender ID එක මත පදනම්ව)
    pendingSearch[sender] = { results, timestamp: Date.now() };

    let text = `*🎬 MALIYA-MD Search Results: "${q}"*\n\n`;
    results.forEach((r, i) => { 
      text += `*${i + 1}.* ${r.title.trim()} ${r.rating ? `[⭐ ${r.rating}]` : ''}\n`; 
    });
    text += `\n*📌 Note:* Reply to this message with just the number (e.g., 1) to proceed.`;
    
    return reply(text);
  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. Strict Text Listener (Fully Fixed Number Router) ──────────────────
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const input = body?.trim();
  
  // අංකයක් නොවේ නම් ඉදිරියට යන්න එපා (අනිත් ප්ලගින් වලට ඉඩ දෙන්න)
  if (!input || isNaN(input)) return; 
  const index = parseInt(input) - 1;

  // 1️⃣ Step A: චිත්‍රපට අංකය තෝරාගැනීම 처리
  if (pendingSearch[sender]) {
    const session = pendingSearch[sender];
    
    // වැරදි අංකයක් නම් බ්ලොක් නොකර ඉවත් වන්න
    if (index < 0 || index >= session.results.length) return;
    
    const selectedMovie = session.results[index];
    delete pendingSearch[sender]; // Session Lock එක ක්ලියර් කිරීම

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    
    try {
      const metadata = await scrapeCineSubz(selectedMovie.url);
      if (!metadata.downloadLinks || !metadata.downloadLinks.length) {
        return reply("*❌ No download links available for this movie.*");
      }

      let msg = `*🎬 ${metadata.title}*\n`;
      if (metadata.imdb_rate) msg += `⭐ *IMDb:* ${metadata.imdb_rate}\n`;
      if (metadata.duration) msg += `⏱️ *Duration:* ${metadata.duration}\n`;
      if (metadata.genre) msg += `🎭 *Genre:* ${metadata.genre}\n\n`;
      
      msg += `*📥 Select Quality:*\n`;
      metadata.downloadLinks.forEach((l, i) => { 
        msg += `*${i + 1}.* ${l.quality}\n`; 
      });
      msg += `\n*📌 Note:* Reply with the quality number to download the file.`;

      // ඊලඟ පියවර (Quality Selection) සඳහා Data Save කිරීම
      pendingQuality[sender] = { 
        title: metadata.title, 
        links: metadata.downloadLinks, 
        timestamp: Date.now() 
      };
      
      return reply(msg);
    } catch (e) {
      return reply(`*❌ Scraper Error:* ${e.message}`);
    }
  }

  // 2️⃣ Step B: Quality අංකය තෝරාගෙන ෆයිල් එක බාගත කිරීම 처리
  if (pendingQuality[sender]) {
    const session = pendingQuality[sender];
    
    if (index < 0 || index >= session.links.length) return;
    
    const chosenLink = session.links[index];
    delete pendingQuality[sender]; // Session Lock එක ක්ලියර් කිරීම

    reply(`*⬇️ Decrypting Stream & Downloading File...*\nPlease wait... ⏳`);

    try {
      const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);
      
      if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
        return reply(`*❌ Failed to bypass security layers. Try again.*`);
      }

      // ටෙලිග්‍රෑම් ලින්ක් එකක් පමණක් ලැබුනහොත්
      if (decryptedData.telegram && !decryptedData.directUrl) {
        return reply(`*📲 Private Telegram Stream Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
      }

      const finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;
      const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
      const tempFilePath = path.join(__dirname, cleanFileName);

      // Axios File Stream
      const response = await axios({
        method: 'get',
        url: finalDownloadUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

      reply(`*⬆️ Uploading movie file to WhatsApp...*`);
      
      // WhatsApp එකට Document එකක් ලෙස වීඩියෝව යැවීම
      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName: cleanFileName,
        caption: `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n*💾 Size:* ${decryptedData.size || 'N/A'}\n\n_Delivered by MALIYA-MD_`
      }, { quoted: mek });

      // Temp file එක Delete කිරීම
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reply(`*⚠️ Direct File Upload Failed.*\n\n🔗 Manual Download Link:\n${chosenLink.directUrl}`);
    }
  }
});

// Cache Cleaner (විනාඩි 5කින් සෙෂන් ඉබේම එක්ස්පයර් වේ)
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);
