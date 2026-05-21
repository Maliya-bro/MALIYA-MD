const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function launchBrowser() {
  return puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
}

function cleanTitle(t = "") {
  return t.replace(/sinhala subtitles.*/i, "").replace(/සිංහල.*/i, "").replace(/\|.*/i, "").trim();
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

// ─── 1. Search ────────────────────────────────────────────────────────────────

async function searchCinesubz(query) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");
  await page.goto(`https://cinesubz.net/?s=${encodeURIComponent(query)}`, { waitUntil: "networkidle2", timeout: 30000 });

  const results = await page.$$eval("article, .item-box, .post", items =>
    items.slice(0, 10).map((el, i) => {
      const a = el.querySelector("a[href*='/movies/']") || el.querySelector("a[href*='/tvshows/']");
      return {
        id: i + 1,
        title: a?.title?.trim() || a?.textContent?.trim() || "",
        url: a?.href || "",
        thumb: el.querySelector("img")?.src || "",
        imdb: el.querySelector("[class*='imdb'], .imdb")?.textContent?.trim() || "",
        year: el.querySelector("[class*='year'], .year")?.textContent?.trim() || "",
      };
    }).filter(r => r.title && r.url && (r.url.includes("/movies/") || r.url.includes("/tvshows/")))
  );

  await browser.close();
  return results;
}

// ─── 2. Get movie details + download links ────────────────────────────────────

async function getMovieMeta(movieUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 30000 });

  const meta = await page.evaluate(() => {
    const g = sel => document.querySelector(sel)?.textContent?.trim() || "";
    const title = g("h1") || g(".details-title h3") || g(".entry-title") || document.title.split("–")[0].trim();
    const thumb = document.querySelector(".splash-bg img, .poster img, .wp-post-image, article img")?.src || "";
    const imdb  = g(".data-imdb, [class*='imdb']").replace(/imdb[:\s]*/i, "").trim();
    const duration = g("[itemprop='duration'], .duration, .data-views");
    const genres = Array.from(document.querySelectorAll(".details-genre a, [class*='genre'] a")).map(a => a.textContent.trim()).filter(Boolean).slice(0, 5);
    const directors = Array.from(document.querySelectorAll("a[href*='/director/']")).map(a => a.textContent.trim()).filter(Boolean);
    const subtitleBy = document.body.innerHTML.match(/Subtitle By[:\s]*([^\n<]+)/i)?.[1]?.trim() || "";

    const links = Array.from(document.querySelectorAll("a[href*='/zt-links/']")).map(a => {
      const raw = a.textContent.replace(/Direct & Telegram Download Links/gi, "").trim();
      const qualMatch = raw.match(/(4K|2160p|1080p|FHD|720p|HD|480p|SD|360p)/i);
      const sizeMatch = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);
      return {
        label: raw,
        quality: qualMatch?.[1] || "",
        size: sizeMatch?.[0] || "",
        ztUrl: a.href,
      };
    });

    return { title, thumb, imdb, duration, genres, directors, subtitleBy, links };
  });

  await browser.close();
  return meta;
}

// ─── 3. Resolve zt-link → direct .mp4 URL ────────────────────────────────────

async function resolveZtLink(ztUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");
  let url = null;
  try {
    await page.goto(ztUrl, { waitUntil: "networkidle2", timeout: 20000 });
    url = await page.evaluate(() => {
      return document.querySelector("a[href*='.mp4']")?.href
          || document.querySelector("a[href*='pixeldrain'], a[href*='gofile'], a[href*='t.me']")?.href
          || null;
    });
  } catch (_) {}
  await browser.close();
  return url;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

cmd({
  pattern: "movie",
  alias: ["cinesubz", "film", "cinema"],
  react: "🎬",
  desc: "Search & download movies from CineSubz.lk",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply(`*🎬 CineSubz Movie Search*\n\nUsage: *movie <name>*\nExample: *movie avatar*`);

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  reply("*🔍 CineSubz.lk හොයනවා...*");

  let results;
  try { results = await searchCinesubz(q); }
  catch (e) { return reply(`*❌ Search error:* ${e.message}`); }

  if (!results.length) return reply(`*❌ "${q}" ගැන results නැහැ.*`);

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
  results.forEach(r => {
    text += `*${r.id}.* ${cleanTitle(r.title)}`;
    if (r.year) text += ` (${r.year})`;
    if (r.imdb) text += `  ⭐${r.imdb}`;
    text += "\n";
  });
  text += `\n*Number reply කරන්න (1-${results.length})*`;
  reply(text);
});

// ─── Step 2: Movie select ─────────────────────────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingSearch[sender] && /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingSearch[sender].results.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const selected = pendingSearch[sender].results[+body.trim() - 1];
  delete pendingSearch[sender];

  reply("*⏳ Movie details ගන්නවා...*");

  let meta;
  try { meta = await getMovieMeta(selected.url); }
  catch (e) { return reply(`*❌ Error:* ${e.message}`); }

  const title = cleanTitle(meta.title || selected.title);

  let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
  if (meta.imdb)           msg += `⭐ *IMDb:* ${meta.imdb}\n`;
  if (meta.duration)       msg += `⏱ *Duration:* ${meta.duration}\n`;
  if (meta.genres.length)  msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;
  if (meta.directors.length) msg += `🎥 *Director:* ${meta.directors.join(", ")}\n`;
  if (meta.subtitleBy)     msg += `📝 *Sub By:* ${meta.subtitleBy}\n`;

  // 2GB යට links පමණයි — document send කරන්න
  const validLinks = meta.links.filter(l => parseSizeMB(l.size) <= 2048);

  if (!validLinks.length) {
    msg += `\n⚠️ *WhatsApp document limit (2GB) නිසා send කරන්න බැහැ.*\n`;
    msg += `Available sizes:\n`;
    meta.links.forEach(l => {
      const q = normalizeQuality(l.quality || l.label);
      msg += `• ${q}  —  ${l.size}\n`;
    });
    try {
      if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
      else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
    return;
  }

  msg += `\n*📥 Quality Select කරන්න (2GB යට):*\n`;
  validLinks.forEach((l, i) => {
    const q = normalizeQuality(l.quality || l.label);
    msg += `*${i + 1}.* ${q}  —  ${l.size}\n`;
  });
  msg += `\n*Number reply කරන්න*`;

  pendingQuality[sender] = { title, thumb: meta.thumb, links: validLinks, timestamp: Date.now() };

  try {
    if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
    else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
  } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
});

// ─── Step 3: Quality select → direct send ────────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] && /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const { title, links } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen  = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality} (${chosen.size}) link ගන්නවා...*`);

  let directUrl;
  try { directUrl = await resolveZtLink(chosen.ztUrl); }
  catch (e) { return reply(`*❌ Link error:* ${e.message}`); }

  if (!directUrl) {
    return maliya.sendMessage(from, {
      text: `*❌ Direct link ගන්න බැරිවුණා.*\nManually download කරන්න:\n${chosen.ztUrl}`,
    }, { quoted: mek });
  }

  // Telegram link
  if (directUrl.includes("t.me") || directUrl.includes("telegram")) {
    return maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*\n*Quality:* ${quality}  |  *Size:* ${chosen.size}\n\n` +
        `📲 *Telegram Download Link:*\n${directUrl}\n\nEnjoy! 🍿`,
    }, { quoted: mek });
  }

  // Direct .mp4 → document send
  reply(`*⬇️ ${quality} (${chosen.size}) — Film send කරනවා...*\nකෙටි වෙලාවක් ඉන්න 🙏`);

  const fileName = `${title} [${quality}] [CineSubz].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();

  try {
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype: "video/mp4",
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
        `Document send වුණේ නැහැ.\nDirect link:\n${directUrl}`,
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
