/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Features: Auto Search, Meta Scraper & Stream Decryption
 * Bugfix: Isolated Message Core to prevent Global Plugin Freezes.
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
    // 🔍 NPM Package එකෙන් Search කිරීම
    const results = await searchCineSubz(q);
    if (!results || !results.length) return reply(`*❌ No results found for "${q}"*`);

    // Session එක Store කරගැනීම
    pendingSearch[sender] = { results, timestamp: Date.now() };

    let text = `*🎬 MALIYA-MD Search Results: "${q}"*\n\n`;
    results.forEach((r, i) => { 
      text += `*${i + 1}.* ${r.title.trim()} ${r.rating ? `[⭐ ${r.rating}]` : ''}\n`; 
    });
    text += `\n*Reply with the number you want to download.*`;
    reply(text);
  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. Isolated Text Listener (Prevents Other Plugins From Freezing) ─────
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const input = body?.trim();
  if (!input || isNaN(input)) return; 
  const index = parseInt(input) - 1;

  // Step A: චිත්‍රපටය තෝරාගත් විට (Handle Movie Selection)
  if (pendingSearch[sender]) {
    const session = pendingSearch[sender];
    if (index < 0 || index >= session.results.length) return;
    
    const selectedMovie = session.results[index];
    delete pendingSearch[sender]; // Lock එක අයින් කිරීම

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    
    try {
      // 📑 Package එකෙන් Movie Meta & Download Links ලබාගැනීම
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
      msg += `\n*Reply with the quality number to extract final file.*`;

      // ඊලඟ පියවර සඳහා Data Save කිරීම
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

  // Step B: Quality එක තෝරාගෙන ෆයිල් එක Download කරන විට (Handle File Download)
  if (pendingQuality[sender]) {
    const session = pendingQuality[sender];
    if (index < 0 || index >= session.links.length) return;
    
    const chosenLink = session.links[index];
    delete pendingQuality[sender]; // Lock එක අයින් කිරීම

    reply(`*⬇️ Decrypting Backend Stream & Downloading...*\nPlease wait... ⏳`);

    try {
      // 🌐 Server Link එක Decrypt කර අවසන් ටෙලිග්‍රෑම්/ඩිරෙක්ට් ස්ට්‍රීම් එක ලබාගැනීම
      const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);
      
      if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
        return reply(`*❌ Failed to decrypt security layers.*`);
      }

      // ටෙලිග්‍රෑම් ලින්ක් එකක් පමණක් ලැබුනහොත්
      if (decryptedData.telegram && !decryptedData.directUrl) {
        return reply(`*📲 Private Telegram Stream Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
      }

      // ඩිරෙක්ට් ෆයිල් එකක් තිබේ නම් Download කර WhatsApp යැවීම
      const finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;
      const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
      const tempFilePath = path.join(__dirname, cleanFileName);

      // Axios මඟින් ෆයිල් එක Stream එකක් ලෙස බාගත කිරීම
      const response = await axios({
        method: 'get',
        url: finalDownloadUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' }
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

      // Temporary ෆයිල් එක Delete කිරීම
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
    } catch (err) {
      reply(`*⚠️ Direct File Upload Failed.*\n\n🔗 Manual Download Link:\n${chosenLink.directUrl}`);
    }
  }
});

// Cache Cleaner (විනාඩි 5කට පසු සෙෂන් ඉබේම මැකී යයි)
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);
