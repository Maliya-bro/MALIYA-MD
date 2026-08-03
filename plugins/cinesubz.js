/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Bugfix: Advanced Context + Reply Number Tracking (No Freezes)
 * Platform: Optimized for MALIYA-MD Framework
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// VajiraOfficial ගේ Scraper Package එක Import කරගැනීම
const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require('cinesubz-scraper');

// Session tracking සඳහා Objects
const pendingSearch = {};
const pendingQuality = {};

// ─── 💬 1. MAIN FILM SEARCH COMMAND ──────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine"],
  react: "🎬",
  desc: "Search & download movies from CineSubz using Package Engine",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  
  try {
    // 🔍 NPM Package එකෙන් සර්ච් කිරීම
    const results = await searchCineSubz(q);
    if (!results || !results.length) return reply(`*❌ No results found for "${q}"*`);

    // Dynamic Session එකක් Store කිරීම
    pendingSearch[sender] = { 
      results, 
      timestamp: Date.now() 
    };

    let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}.* ${r.title.trim()} ${r.rating ? `[⭐ ${r.rating}]` : ''}\n`;
    });
    text += `\n*📌 Note:* Reply to this message with the number (e.g. 1) to select your movie.`;
    
    return reply(text);
  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. ADVANCED TEXT LISTENER (Number Processing Engine) ─────────────────
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const input = body?.trim();
  
  // ආපු මැසේජ් එක අංකයක් නොවේ නම් වෙනත් ප්ලගින්ස් වලට ඉඩ දී ඉවත් වන්න
  if (!input || isNaN(input)) return; 
  const index = parseInt(input) - 1;

  // 1️⃣ FLOW A: චිත්‍රපට අංකය තෝරාගැනීම (Movie Number Reply Handling)
  if (pendingSearch[sender]) {
    const session = pendingSearch[sender];
    
    // වැරදි අංකයක් එවා ඇත්නම් බ්ලොක් නොකර සිටීම
    if (index < 0 || index >= session.results.length) return;
    
    const selectedMovie = session.results[index];
    delete pendingSearch[sender]; // Lock එක ඉවත් කිරීම

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    
    try {
      // චිත්‍රපටයේ සම්පූර්ණ විස්තර සහ ලින්ක්ස් Scrape කිරීම
      const metadata = await scrapeCineSubz(selectedMovie.url);
      if (!metadata.downloadLinks || !metadata.downloadLinks.length) {
        return reply("*❌ Download links නොමැත! වෙනත් එකක් උත්සාහ කරන්න.*");
      }

      let msg = `*🎬 ${metadata.title || selectedMovie.title}*\n${"─".repeat(32)}\n`;
      if (metadata.imdb_rate) msg += `⭐ *IMDb:* ${metadata.imdb_rate}\n`;
      if (metadata.duration) msg += `⏱️ *Duration:* ${metadata.duration}\n`;
      if (metadata.genre) msg += `🎭 *Genre:* ${metadata.genre}\n\n`;
      
      msg += `*📥 Quality Select:*\n`;
      metadata.downloadLinks.forEach((l, i) => { 
        msg += `*${i + 1}.* ${l.quality}\n`; 
      });
      msg += `\n*📌 Note:* Reply with the quality number to extract the final file.`;

      // ඊලඟ පියවර (Quality Selection) සඳහා දත්ත සේව් කිරීම
      pendingQuality[sender] = { 
        title: metadata.title || selectedMovie.title, 
        links: metadata.downloadLinks, 
        timestamp: Date.now() 
      };
      
      return reply(msg);
    } catch (e) {
      return reply(`*❌ Metadata Error:* ${e.message}`);
    }
  }

  // 2️⃣ FLOW B: Quality අංකය තෝරාගැනීම (Quality Number Reply Handling)
  if (pendingQuality[sender]) {
    const session = pendingQuality[sender];
    
    if (index < 0 || index >= session.links.length) return;
    
    const chosenLink = session.links[index];
    delete pendingQuality[sender]; // Lock එක ඉවත් කිරීම

    reply(`*⏳ Grabbing Direct Stream for ${chosenLink.quality}...*\nPlease wait... ⏳`);

    try {
      // Backend එකෙන් final direct stream එක decrypt කර ගැනීම
      const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);
      
      if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
        return reply(`*❌ Direct Stream එක ලබාගැනීමට අපොහොසත් විය. පසුව උත්සාහ කරන්න.*`);
      }

      // ටෙලිග්‍රෑම් චැනල් ලින්ක් එකක් පමණක් ලැබුනහොත්
      if (decryptedData.telegram && !decryptedData.directUrl) {
        return reply(`*📲 Private Telegram Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
      }

      const finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;
      const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
      const tempFilePath = path.join(__dirname, cleanFileName);

      // Axios මඟින් File Stream එකක් ලෙස Local එකට Download කිරීම
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
      
      // MALIYA-MD මඟින් Document එකක් ලෙස WhatsApp එකට යැවීම
      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName: cleanFileName,
        caption: `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n*💾 Size:* ${decryptedData.size || 'N/A'}\n\n_Delivered by MALIYA-MD_`
      }, { quoted: mek });

      // වැඩේ ඉවර වුණාම Local File එක මකා දැමීම
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reply(`*⚠️ Direct WhatsApp sending failed.*\n\n🔗 Manual Download Link:\n${chosenLink.directUrl}`);
    }
  }
});

// Cache Cleaner (විනාඩි 5කින් පසු Sessions Expire කිරීමට)
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);
