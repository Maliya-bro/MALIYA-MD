/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Bugfix: Strict StanzaId Context Matching to prevent Global Plugin Freezes.
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
    text += `\n*📌 Note:* You MUST reply (Quote) to this message with the number to select.`;
    
    // මැසේජ් එක Send කර එහි ID එක ලබා ගැනීම
    const sent = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // Session එක Store කිරීම (Sent Message ID එකත් සමඟ)
    pendingSearch[sender] = { 
      results, 
      messageId: sent.key.id,
      timestamp: Date.now() 
    };

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. STANCE-ID LOCKED TEXT LISTENER (Zero Interference) ────────────────
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const input = body?.trim();
  
  // 1. ආපු මැසේජ් එක ධන අංකයක්දැයි බැලීම
  if (!input || isNaN(input) || parseInt(input) <= 0) return; 
  const index = parseInt(input) - 1;

  // 2. පරිශීලකයා වෙනත් මැසේජ් එකකට Reply (Quote) කර ඇත්දැයි බැලීම
  const repliedId = mek.message?.extendedTextMessage?.contextInfo?.stanzaId;
  if (!repliedId) return; // Reply එකක් නොවේ නම් කිසිදු බාධාවකින් තොරව ඉවත් වන්න

  // ─── FLOW A: Movie Selection Handling ───
  if (pendingSearch[sender] && repliedId === pendingSearch[sender].messageId) {
    const session = pendingSearch[sender];
    
    if (index < 0 || index >= session.results.length) return reply("*⚠️ Invalid selection number.*");
    
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
      msg += `\n*📌 Note:* Reply (Quote) to this message with the quality number to download.`;

      // Quality මැසේජ් එක යවා එහි ID එක ලබා ගැනීම
      const sentQualityMsg = await maliya.sendMessage(from, { text: msg }, { quoted: mek });

      // Next step එක සඳහා දත්ත සේව් කිරීම
      pendingQuality[sender] = { 
        title: metadata.title || selectedMovie.title, 
        links: metadata.downloadLinks, 
        messageId: sentQualityMsg.key.id,
        timestamp: Date.now() 
      };
      
    } catch (e) {
      return reply(`*❌ Metadata Error:* ${e.message}`);
    }
    return; // Flow එක නතර කිරීම
  }

  // ─── FLOW B: Quality Download Handling ───
  if (pendingQuality[sender] && repliedId === pendingQuality[sender].messageId) {
    const session = pendingQuality[sender];
    
    if (index < 0 || index >= session.links.length) return reply("*⚠️ Invalid quality number.*");
    
    const chosenLink = session.links[index];
    delete pendingQuality[sender]; // Quality session එක ක්ලියර් කිරීම

    reply(`*⏳ Bypassing Firewalls & Fetching Direct Link...*`);

    try {
      const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);
      
      if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
        return reply(`*❌ Stream Link Decryption Failed.*`);
      }

      // ටෙලිග්‍රෑම් ලින්ක් එකක් පමණක් ඇත්නම්
      if (decryptedData.telegram && !decryptedData.directUrl) {
        return reply(`*📲 Telegram Stream Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
      }

      const finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;
      const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
      const tempFilePath = path.join(__dirname, cleanFileName);

      // File Download Stream
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
      
      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName: cleanFileName,
        caption: `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n*💾 Size:* ${decryptedData.size || 'N/A'}\n\n_Delivered by MALIYA-MD_`
      }, { quoted: mek });

      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reply(`*⚠️ Direct Upload Failed.*\n\n🔗 Download Link:\n${chosenLink.directUrl}`);
    }
  }
});

// විනාඩි 5න් සෙෂන් ඉබේම එක්ස්පයර් වීමේ ආරක්ෂිත ලොජික් එක
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);
