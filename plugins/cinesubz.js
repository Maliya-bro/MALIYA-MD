/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: cinesubz-scraper NPM Package by VajiraOfficial
 * Fix: filter-based session matching (same reliable pattern as sinhalasub.js)
 *      instead of strict stanzaId-only matching, which was silently failing
 *      when contextInfo.stanzaId didn't match sent.key.id exactly.
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

    // Session එක Store කිරීම — messageId used only as a soft hint now, not a hard gate
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

// ─── 💬 3. FILTER-BASED QUALITY HANDLER (Download) ──────────────────────────
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
    const decryptedData = await scrapeCineSubzServerLink(chosenLink.directUrl);

    if (!decryptedData || (!decryptedData.telegram && !decryptedData.directUrl)) {
      return reply(`*❌ Stream Link Decryption Failed.*`);
    }

    // ටෙලිග්‍රෑම් ලින්ක් එකක් පමණක් ඇත්නම්
    if (decryptedData.telegram && !decryptedData.directUrl) {
      return reply(`*📲 Telegram Stream Link:* ${decryptedData.telegram}\n*(Size: ${decryptedData.size || 'Unknown'})*`);
    }

    const finalDownloadUrl = decryptedData.directUrl || chosenLink.directUrl;

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
});

// විනාඩි 5න් සෙෂන් ඉබේම එක්ස්පයර් වීමේ ආරක්ෂිත ලොජික් එක
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);

module.exports = { pendingSearch, pendingQuality };
