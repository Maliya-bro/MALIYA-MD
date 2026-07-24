/**
 * CineSubz.lk Movie Download Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────
 * npm install axios cheerio cinesubz-scraper
 */

const { cmd } = require("../command");
const axios   = require("axios"); // Kept as requested
const cheerio = require("cheerio"); // Kept as requested
const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require('cinesubz-scraper');

const pendingSearch  = {};
const pendingQuality = {};

const BASE    = "https://cinesubz.lk";
const MAX_MB  = 2048;
const TIMEOUT = 20_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanTitle(t = "") {
  return t
    .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
    .replace(/sinhala subtitles?.*/i, "")
    .replace(/සිංහල.*/i, "")
    .replace(/\|.*/i, "")
    .replace(/[-–]\s*$/, "")
    .trim();
}

function parseSizeMB(s = "") {
  const u = s.toUpperCase().trim();
  const n = parseFloat(u);
  if (isNaN(n)) return 9999;
  if (u.includes("GB")) return n * 1024;
  if (u.includes("MB")) return n;
  return 9999;
}

function normalizeQuality(t = "") {
  const u = t.toUpperCase();
  if (u.includes("2160") || u.includes("4K"))  return "4K";
  if (u.includes("1080") || u.includes("FHD")) return "1080p";
  if (u.includes("720")  || u.includes("HD"))  return "720p";
  if (u.includes("480")  || u.includes("SD"))  return "480p";
  if (u.includes("360"))                        return "360p";
  return t.trim() || "Unknown";
}

// ─── 1. Search (Using cinesubz-scraper) ───────────────────────────────────────

async function searchMovies(query) {
  const results = await searchCineSubz(query);
  
  // Mapping the NPM output to the structure MALIYA-MD expects
  return results.map(r => ({
    title: r.title,
    url: r.url,
    imdb: r.rating || "",
    year: "", // Will be extracted from the title implicitly by users
    thumb: ""
  })).slice(0, 10);
}

// ─── 2. Movie page (Using cinesubz-scraper) ───────────────────────────────────

async function getMovieMeta(movieUrl) {
  const meta = await scrapeCineSubz(movieUrl);

  const links = (meta.downloadLinks || []).map(l => {
    // Attempting to extract the size from the quality string (e.g., "720p HD 800MB")
    // If not found, a fallback size of "1000MB" is used to ensure it passes the MAX_MB filter
    const sizeMatch = l.quality.match(/(\d+\.?\d*)\s*(GB|MB)/i);
    return {
      label: l.quality,
      quality: l.quality,
      size: sizeMatch ? sizeMatch[0] : "1000MB",
      ztUrl: l.directUrl
    };
  });

  return { 
    title: cleanTitle(meta.title), 
    thumb: meta.poster || "", 
    imdb: meta.imdb_rate || meta.vote || "", 
    duration: meta.duration || "", 
    genres: meta.genre ? meta.genre.split(',').map(g => g.trim()) : [], 
    directors: [], 
    subBy: "", 
    links 
  };
}

// ─── 3. Resolve direct .mp4 URL (Using cinesubz-scraper) ──────────────────────

async function resolveZtLink(ztUrl) {
  if (!ztUrl) return null;
  
  // Return Telegram links immediately if they are already direct
  if (ztUrl.includes("t.me/") && !ztUrl.includes("CineSubzAdmin")) {
    return ztUrl;
  }

  try {
    // Using the NPM package to decrypt the backend stream
    const serverData = await scrapeCineSubzServerLink(ztUrl);
    
    // If a decrypted telegram link is extracted
    if (serverData && serverData.telegram) {
      return serverData.telegram;
    }
    
    // Fallback to original URL
    return ztUrl;
  } catch (error) {
    return ztUrl;
  }
}

// ─── Bot Commands ─────────────────────────────────────────────────────────────

cmd({
  pattern : "film",
  alias   : ["movie", "cinema", "cine", "sub", "films"],
  react   : "🎬",
  desc    : "Search & download movies from CineSubz.lk",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply(
    "*🎬 CineSubz Movie Search*\n\n" +
    "Usage: *film <name>*\nExample: *film spider man*\n\n" +
    "Sinhala subtitles සමඟ film/series! 🍿"
  );

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  reply("*🔍 Searching MALIYA-MD FILM DB...*");

  let results;
  try       { results = await searchMovies(q); }
  catch (e) { return reply(`*❌ Search error:* ${e.message}`); }

  if (!results.length)
    return reply(`*❌ "${q}" No results found.*\nTry a different name.`);

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
  results.forEach((r, i) => {
    text += `*${i + 1}.* ${cleanTitle(r.title)}`;
    if (r.year) text += ` (${r.year})`;
    if (r.imdb) text += `  ⭐${r.imdb}`;
    text += "\n";
  });
  text += `\n*Reply a number (1-${results.length})*`;
  reply(text);
});

// ── Step 2: movie selected ────────────────────────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingSearch[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingSearch[sender].results.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const selected = pendingSearch[sender].results[+body.trim() - 1];
  delete pendingSearch[sender];

  reply("*⏳ Getting Film Details..*");

  let meta;
  try       { meta = await getMovieMeta(selected.url); }
  catch (e) { return reply(`*❌ Error:* ${e.message}`); }

  const title = meta.title || cleanTitle(selected.title);

  let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
  if (meta.imdb)             msg += `⭐ *IMDb:* ${meta.imdb}\n`;
  if (meta.duration)         msg += `⏱️ *Duration:* ${meta.duration}\n`;
  if (meta.genres.length)    msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;
  if (meta.directors.length) msg += `🎥 *Director:* ${meta.directors.join(", ")}\n`;
  if (meta.subBy)            msg += `📝 *Sub By:* ${meta.subBy}\n`;

  const validLinks = meta.links.filter(l => parseSizeMB(l.size) <= MAX_MB);

  if (!validLinks.length) {
    msg += `\n⚠️ *All qualities over 2GB — Can't send via WhatsApp.*\n\nAvailable:\n`;
    meta.links.forEach(l => { msg += `• ${normalizeQuality(l.quality || l.label)}  ${l.size}\n`; });
    try {
      if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
      else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
    return;
  }

  msg += `\n*📥 Quality Select (under 2GB):*\n`;
  validLinks.forEach((l, i) => {
    msg += `*${i + 1}.* ${normalizeQuality(l.quality || l.label)}  —  ${l.size}\n`;
  });
  msg += `\n*Reply a number*`;

  pendingQuality[sender] = { title, thumb: meta.thumb, links: validLinks, timestamp: Date.now() };

  try {
    if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
    else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
  } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
});

// ── Step 3: quality → resolve → send document ────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const { title, links } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen  = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality} (${chosen.size}) — Getting direct link..*`);

  let directUrl;
  try       { directUrl = await resolveZtLink(chosen.ztUrl); }
  catch (e) { return reply(`*❌ Resolve error:* ${e.message}`); }

  if (!directUrl) {
    return maliya.sendMessage(from, {
      text: `*❌ Can't get direct link.*\nTry manually:\n${chosen.ztUrl}`,
    }, { quoted: mek });
  }

  // Telegram
  if (directUrl.includes("t.me") || directUrl.includes("telegram.me")) {
    return maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*\n*Quality:* ${quality}  |  *Size:* ${chosen.size}\n\n` +
        `📲 *Telegram Download:*\n${directUrl}\n\nEnjoy! 🍿`,
    }, { quoted: mek });
  }

  reply(`*⬇️ Sending the film.. (${chosen.size})*\nPlease wait.. 🙏`);

  const fileName = `${title} [${quality}] [CineSubz].mp4`
    .replace(/[^\w\s.\-\[\]()]/gi, "").trim();

  try {
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype : "video/mp4",
      fileName,
      caption:
        `*🎬 ${title}*\n` +
        `*📊 Quality:* ${quality}\n` +
        `*💾 Size:* ${chosen.size}\n\n` +
        `*Enjoy! 🍿*\n_Sinhala subtitles සමඟ_`,
    }, { quoted: mek });
  } catch (err) {
    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${chosen.size}\n\n` +
        `⚠️ Document send failed.\n📥 Direct link:\n${directUrl}`,
    }, { quoted: mek });
  }
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch)  if (now - pendingSearch[s].timestamp  > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
