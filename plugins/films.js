cat > /mnt/user-data/outputs/cinesubz.js << 'ENDOFFILE'
const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch  = {};
const pendingQuality = {};

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function launchBrowser() {
  return puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
}

function cleanTitle(t = "") {
  return t
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

// Google Drive file ID → direct download URL
function gdriveDirectUrl(url = "") {
  const m = url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/);
  if (m) return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&authuser=0`;
  return url;
}

// ══════════════════════════════════════════════════════════════════
//  SITE DEFINITIONS
// ══════════════════════════════════════════════════════════════════

const SITES = {

  // ── 1. CineSubz ──────────────────────────────────────────────────
  cinesubz: {
    name: "CineSubz",
    emoji: "🎬",

    async search(query) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(`https://cinesubz.net/?s=${encodeURIComponent(query)}`, { waitUntil: "networkidle2", timeout: 25000 });
        const results = await page.$$eval("article, .item-box, .post", items =>
          items.slice(0, 6).map((el, i) => {
            const a = el.querySelector("a[href*='/movies/']") || el.querySelector("a[href*='/tvshows/']");
            return {
              title: a?.title?.trim() || a?.textContent?.trim() || "",
              url:   a?.href || "",
              thumb: el.querySelector("img")?.src || "",
              imdb:  el.querySelector("[class*='imdb']")?.textContent?.trim() || "",
              year:  el.querySelector("[class*='year']")?.textContent?.trim() || "",
              site:  "cinesubz",
            };
          }).filter(r => r.title && r.url && (r.url.includes("/movies/") || r.url.includes("/tvshows/")))
        );
        return results;
      } catch (_) { return []; }
      finally { await browser.close(); }
    },

    async getLinks(movieUrl) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 25000 });
        return await page.evaluate(() => {
          const g  = sel => document.querySelector(sel)?.textContent?.trim() || "";
          const title    = g("h1") || g(".details-title h3") || document.title.split("–")[0].trim();
          const thumb    = document.querySelector(".splash-bg img, .poster img, article img")?.src || "";
          const imdb     = g(".data-imdb, [class*='imdb']").replace(/imdb[:\s]*/i, "").trim();
          const duration = g("[itemprop='duration'], .duration");
          const genres   = Array.from(document.querySelectorAll(".details-genre a")).map(a => a.textContent.trim()).slice(0, 4);
          const links    = Array.from(document.querySelectorAll("a[href*='/zt-links/']")).map(a => {
            const raw   = a.textContent.replace(/Direct & Telegram.*/gi, "").trim();
            const qualM = raw.match(/(4K|2160p|1080p|FHD|720p|HD|480p|SD|360p)/i);
            const sizeM = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);
            return { label: raw, quality: qualM?.[1] || "", size: sizeM?.[0] || "", rawUrl: a.href, type: "zt" };
          });
          return { title, thumb, imdb, duration, genres, links };
        });
      } catch (_) { return null; }
      finally { await browser.close(); }
    },

    async resolveLink(link) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(link.rawUrl, { waitUntil: "networkidle2", timeout: 20000 });
        const url = await page.evaluate(() =>
          document.querySelector("a[href*='.mp4']")?.href ||
          document.querySelector("a[href*='pixeldrain'], a[href*='t.me']")?.href || null
        );
        return url;
      } catch (_) { return null; }
      finally { await browser.close(); }
    },
  },

  // ── 2. SinhalaSub ────────────────────────────────────────────────
  sinhalasub: {
    name: "SinhalaSub",
    emoji: "🎥",

    async search(query) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(`https://sinhalasub.lk/?s=${encodeURIComponent(query)}&post_type=movies`, { waitUntil: "networkidle2", timeout: 25000 });
        const results = await page.$$eval(".display-item .item-box", boxes =>
          boxes.slice(0, 6).map(box => {
            const a    = box.querySelector("a");
            const qual = box.querySelector(".quality")?.textContent?.trim() || "";
            const qty  = box.querySelector(".qty")?.textContent?.trim() || "";
            return {
              title: a?.title?.trim() || "",
              url:   a?.href || "",
              thumb: box.querySelector(".thumb")?.src || "",
              imdb:  "",
              year:  "",
              quality: qual,
              qty,
              site: "sinhalasub",
            };
          }).filter(r => r.title && r.url)
        );
        return results;
      } catch (_) { return []; }
      finally { await browser.close(); }
    },

    async getLinks(movieUrl) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 25000 });
        return await page.evaluate(() => {
          const g  = sel => document.querySelector(sel)?.textContent?.trim() || "";
          const title    = g(".info-details .details-title h3") || g("h1");
          const thumb    = document.querySelector(".splash-bg img")?.src || "";
          const imdb     = g(".data-imdb").replace(/imdb[:\s]*/i, "").trim();
          const duration = g("[itemprop='duration']");
          const genres   = Array.from(document.querySelectorAll(".details-genre a")).map(a => a.textContent.trim()).slice(0, 4);
          const links    = Array.from(document.querySelectorAll(".link-pixeldrain tbody tr")).map(row => {
            const a    = row.querySelector(".link-opt a");
            const qual = row.querySelector(".quality")?.textContent?.trim() || "";
            const size = row.querySelector("td:nth-child(3) span")?.textContent?.trim() || "";
            return { label: `${qual} ${size}`.trim(), quality: qual, size, rawUrl: a?.href || "", type: "pixeldrain_page" };
          }).filter(l => l.rawUrl);
          return { title, thumb, imdb, duration, genres, links };
        });
      } catch (_) { return null; }
      finally { await browser.close(); }
    },

    async resolveLink(link) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(link.rawUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise(r => setTimeout(r, 12000));
        const url = await page.$eval(".wait-done a[href^='https://pixeldrain.com/']", el => el.href).catch(() => null);
        if (url) {
          const m = url.match(/pixeldrain\.com\/u\/(\w+)/);
          if (m) return `https://pixeldrain.com/api/file/${m[1]}?download`;
        }
        return null;
      } catch (_) { return null; }
      finally { await browser.close(); }
    },
  },

  // ── 3. MovieSubLK ────────────────────────────────────────────────
  moviesublk: {
    name: "MovieSubLK",
    emoji: "🍿",

    async search(query) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(`https://www.moviesublk.com/?s=${encodeURIComponent(query)}`, { waitUntil: "networkidle2", timeout: 25000 });
        const results = await page.$$eval("article, .post, .item", items =>
          items.slice(0, 6).map(el => {
            const a = el.querySelector("a[href*='moviesublk.com']");
            return {
              title: a?.title?.trim() || el.querySelector("h2, h3")?.textContent?.trim() || "",
              url:   a?.href || "",
              thumb: el.querySelector("img")?.src || "",
              imdb:  "",
              year:  "",
              site:  "moviesublk",
            };
          }).filter(r => r.title && r.url && r.url.includes("moviesublk.com") && !r.url.endsWith("/"))
        );
        return results;
      } catch (_) { return []; }
      finally { await browser.close(); }
    },

    async getLinks(movieUrl) {
      const browser = await launchBrowser();
      const page    = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124");
      try {
        await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 25000 });
        return await page.evaluate(() => {
          const g     = sel => document.querySelector(sel)?.textContent?.trim() || "";
          const title = g("h1, h2, .post-title");
          const thumb = document.querySelector(".post img, article img")?.src || "";
          // G-Drive, Telegram, Sinhala Sub buttons
          const links = Array.from(document.querySelectorAll("a[href]")).filter(a => {
            const h = a.href.toLowerCase();
            const t = a.textContent.toLowerCase();
            return h.includes("drive.google") || h.includes("drive.usercontent") ||
                   h.includes("t.me") || h.includes("telegram") ||
                   t.includes("g-drive") || t.includes("gdrive") || t.includes("google drive") ||
                   t.includes("telegram");
          }).map(a => {
            const t    = a.textContent.trim();
            const h    = a.href;
            const qual = t.match(/(4K|1080p?|720p?|480p?|360p?)/i)?.[1] || "";
            const size = t.match(/(\d+\.?\d*)\s*(GB|MB)/i)?.[0] || "";
            let type   = "direct";
            if (h.includes("drive.google") || h.includes("drive.usercontent")) type = "gdrive";
            if (h.includes("t.me") || h.includes("telegram")) type = "telegram";
            return { label: t || "Download", quality: qual, size, rawUrl: h, type };
          });
          return { title, thumb, imdb: "", duration: "", genres: [], links };
        });
      } catch (_) { return null; }
      finally { await browser.close(); }
    },

    async resolveLink(link) {
      if (link.type === "gdrive") return gdriveDirectUrl(link.rawUrl);
      if (link.type === "telegram") return link.rawUrl;
      return link.rawUrl;
    },
  },
};

// ══════════════════════════════════════════════════════════════════
//  MULTI-SITE SEARCH  → best 4 results merged
// ══════════════════════════════════════════════════════════════════

async function multiSearch(query) {
  // Run all site searches in parallel
  const allResults = await Promise.allSettled(
    Object.entries(SITES).map(([key, site]) =>
      site.search(query).then(r => r.map(x => ({ ...x, site: key, siteName: site.name, siteEmoji: site.emoji })))
    )
  );

  // Flatten, deduplicate by clean title, take best 4
  const seen = new Set();
  const merged = [];

  for (const res of allResults) {
    if (res.status !== "fulfilled") continue;
    for (const item of res.value) {
      const key = cleanTitle(item.title).toLowerCase().replace(/\s+/g, "");
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
      if (merged.length >= 4) break;
    }
    if (merged.length >= 4) break;
  }

  return merged.slice(0, 4);
}

// ══════════════════════════════════════════════════════════════════
//  DOWNLOAD LINKS  → try primary site, fallback to others
// ══════════════════════════════════════════════════════════════════

async function getLinksWithFallback(selected) {
  const primaryKey  = selected.site;
  const siteOrder   = [primaryKey, ...Object.keys(SITES).filter(k => k !== primaryKey)];

  for (const key of siteOrder) {
    const site = SITES[key];
    try {
      // For fallback sites, search again to find the film URL on that site
      let url = selected.url;
      if (key !== primaryKey) {
        const fallbackResults = await site.search(cleanTitle(selected.title));
        if (!fallbackResults.length) continue;
        url = fallbackResults[0].url;
      }

      const meta = await site.getLinks(url);
      if (meta && meta.links && meta.links.length > 0) {
        return { meta, siteKey: key, site };
      }
    } catch (_) { continue; }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
//  RESOLVE DIRECT URL  → try primary, fallback sites
// ══════════════════════════════════════════════════════════════════

async function resolveWithFallback(chosen, siteKey, title) {
  // Try primary site link
  try {
    const url = await SITES[siteKey].resolveLink(chosen);
    if (url) return url;
  } catch (_) {}

  // Fallback: try same link type on other sites
  for (const [key, site] of Object.entries(SITES)) {
    if (key === siteKey) continue;
    try {
      const results = await site.search(title);
      if (!results.length) continue;
      const meta = await site.getLinks(results[0].url);
      if (!meta?.links?.length) continue;
      // Pick best quality match
      const match = meta.links.find(l => normalizeQuality(l.quality) === normalizeQuality(chosen.quality)) || meta.links[0];
      const url = await site.resolveLink(match);
      if (url) return url;
    } catch (_) { continue; }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
//  BOT COMMAND
// ══════════════════════════════════════════════════════════════════

cmd({
  pattern: "movie",
  alias: ["film", "cinema", "cinesubz", "sinhalasub", "moviesublk"],
  react: "🎬",
  desc: "Search movies from CineSubz + SinhalaSub + MovieSubLK",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply(`*🎬 Movie Search*\n\nUsage: *movie <name>*\nExample: *movie avatar*\n\nCineSubz + SinhalaSub + MovieSubLK — best 4 results! 🍿`);

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  reply("*🔍 Sites 3ක් හොයනවා...*\n_(CineSubz + SinhalaSub + MovieSubLK)_");

  let results;
  try { results = await multiSearch(q); }
  catch (e) { return reply(`*❌ Search error:* ${e.message}`); }

  if (!results.length) return reply(`*❌ "${q}" ගැන results නැහැ.*\nවෙනත් නමකින් try කරන්න.`);

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let text = `*🎬 "${q}" — Best Results:*\n${"─".repeat(30)}\n`;
  results.forEach((r, i) => {
    const t = cleanTitle(r.title);
    text += `*${i + 1}.* ${t}`;
    if (r.year) text += ` (${r.year})`;
    if (r.imdb) text += `  ⭐${r.imdb}`;
    text += `  ${r.siteEmoji}_${r.siteName}_\n`;
  });
  text += `\n*Number reply කරන්න (1-${results.length})*`;
  reply(text);
});

// ── Step 2: Movie selected ────────────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingSearch[sender] && /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingSearch[sender].results.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const selected = pendingSearch[sender].results[+body.trim() - 1];
  delete pendingSearch[sender];

  reply(`*⏳ Download links ගන්නවා...*\n_(${SITES[selected.site]?.name || selected.site} → fallback ready)_`);

  const result = await getLinksWithFallback(selected);

  if (!result) {
    return reply(`*❌ ${cleanTitle(selected.title)}* — Download links හොයාගන්න බැරිවුණා.\nකෙලින්ම site එකට යන්න: ${selected.url}`);
  }

  const { meta, siteKey, site } = result;
  const title = cleanTitle(meta.title || selected.title);

  let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
  msg += `📌 *Source:* ${site.emoji} ${site.name}\n`;
  if (meta.imdb)           msg += `⭐ *IMDb:* ${meta.imdb}\n`;
  if (meta.duration)       msg += `⏱ *Duration:* ${meta.duration}\n`;
  if (meta.genres?.length) msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;

  // 2GB යට links
  const validLinks = meta.links.filter(l => parseSizeMB(l.size) <= 2048);

  if (!validLinks.length) {
    msg += `\n⚠️ *2GB over — WhatsApp send කරන්න බෑ.*\nAvailable:\n`;
    meta.links.forEach(l => { msg += `• ${normalizeQuality(l.quality || l.label)}  ${l.size}\n`; });
    try {
      if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
      else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
    return;
  }

  msg += `\n*📥 Quality Select කරන්න:*\n`;
  validLinks.forEach((l, i) => {
    const q = normalizeQuality(l.quality || l.label);
    msg += `*${i + 1}.* ${q}${l.size ? `  —  ${l.size}` : ""}\n`;
  });
  msg += `\n*Number reply කරන්න*`;

  pendingQuality[sender] = { title, thumb: meta.thumb, links: validLinks, siteKey, timestamp: Date.now() };

  try {
    if (meta.thumb) await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
    else await maliya.sendMessage(from, { text: msg }, { quoted: mek });
  } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
});

// ── Step 3: Quality selected → resolve → send ────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] && /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const { title, links, siteKey } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen  = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality}${chosen.size ? ` (${chosen.size})` : ""} — Direct link ගන්නවා...*`);

  const directUrl = await resolveWithFallback(chosen, siteKey, title);

  if (!directUrl) {
    return maliya.sendMessage(from, {
      text: `*❌ Direct link ගන්න බැරිවුණා.*\nManually download කරන්න:\n${chosen.rawUrl}`,
    }, { quoted: mek });
  }

  // Telegram link
  if (directUrl.includes("t.me") || directUrl.includes("telegram.me")) {
    return maliya.sendMessage(from, {
      text: `*🎬 ${title}*\n*Quality:* ${quality}${chosen.size ? `  |  *Size:* ${chosen.size}` : ""}\n\n📲 *Telegram Download:*\n${directUrl}\n\nEnjoy! 🍿`,
    }, { quoted: mek });
  }

  // Document send
  reply(`*⬇️ Film send කරනවා...*\nකෙටි වෙලාවක් ඉන්න 🙏`);

  const fileName = `${title} [${quality}] [SinhalaSub].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();

  try {
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype: "video/mp4",
      fileName,
      caption:
        `*🎬 ${title}*\n` +
        `*📊 Quality:* ${quality}\n` +
        `${chosen.size ? `*💾 Size:* ${chosen.size}\n` : ""}` +
        `\n*Enjoy! 🍿*\n_Sinhala subtitles සමඟ_`,
    }, { quoted: mek });
  } catch (err) {
    await maliya.sendMessage(from, {
      text: `*🎬 ${title}*  [${quality}]${chosen.size ? `  ${chosen.size}` : ""}\n\nDocument send වුණේ නැහැ.\nDirect link:\n${directUrl}`,
    }, { quoted: mek });
  }
});

// ── Cleanup ───────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch)  if (now - pendingSearch[s].timestamp  > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
ENDOFFILE
echo "Done!"
