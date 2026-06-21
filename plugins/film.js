/**
 * CineSubz.lk Movie Download Plugin for MALIYA-MD
 * npm install axios cheerio
 */

const { cmd } = require("../command");
const axios   = require("axios");
const cheerio = require("cheerio");
const https   = require("https");
const http    = require("http");

const pendingSearch  = {};
const pendingQuality = {};

const BASE    = "https://cinesubz.net";
const MAX_MB  = 2048;
const TIMEOUT = 20_000;

const HEADERS = {
  "User-Agent"      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept"          : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language" : "en-US,en;q=0.9",
  "Accept-Encoding" : "gzip, deflate, br",
  "Referer"         : BASE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(url, extra = {}) {
  return axios.get(url, {
    headers: { ...HEADERS, ...extra },
    timeout: TIMEOUT,
    maxRedirects: 15,
  });
}

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

// ─── Follow redirect manually (for fake google.com URLs) ─────────────────────
// google.com/server11/... is a custom server that redirects to the real CDN.
// axios follows redirects but loses the final URL sometimes.
// We use Node's built-in http/https to manually follow and capture final URL.

function followRedirect(url, referer, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    function request(currentUrl) {
      if (redirectCount >= maxRedirects) return reject(new Error("Too many redirects"));

      const parsed   = new URL(currentUrl);
      const lib      = parsed.protocol === "https:" ? https : http;
      const options  = {
        hostname: parsed.hostname,
        path    : parsed.pathname + parsed.search,
        method  : "HEAD",
        headers : {
          "User-Agent": HEADERS["User-Agent"],
          "Referer"   : referer,
          "Range"     : "bytes=0-1",
        },
        timeout: 15000,
      };

      const req = lib.request(options, (res) => {
        const location = res.headers["location"];
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && location) {
          redirectCount++;
          const nextUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
          request(nextUrl);
        } else {
          resolve(currentUrl); // final URL after redirects
        }
      });

      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
      req.end();
    }

    request(url);
  });
}

// ─── 1. Search ────────────────────────────────────────────────────────────────

async function searchMovies(query) {
  const { data } = await get(`${BASE}/?s=${encodeURIComponent(query)}`);
  const $        = cheerio.load(data);
  const results  = [];
  const seen     = new Set();

  $(".display-item .item-box, article, .post").each((_, el) => {
    const a     = $(el).find("a[href*='/movies/'], a[href*='/tvshows/']").first();
    const href  = a.attr("href") || "";
    const title = (a.attr("title") || a.text()).trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    results.push({
      title,
      url  : href,
      imdb : $(el).find("[class*='data-imdb']").first().text().replace(/imdb[:\s]*/i,"").trim(),
      year : $(el).find("[class*='year']").first().text().trim(),
      thumb: $(el).find("img").first().attr("src") || "",
    });
  });

  if (!results.length) {
    $("a[href*='/movies/'], a[href*='/tvshows/']").each((_, el) => {
      const href  = $(el).attr("href") || "";
      const title = ($(el).attr("title") || $(el).text()).trim();
      if (!href || !title || seen.has(href) || href === BASE) return;
      seen.add(href);
      results.push({ title, url: href, imdb: "", year: "", thumb: "" });
    });
  }

  return results.slice(0, 10);
}

// ─── 2. Movie page ────────────────────────────────────────────────────────────

async function getMovieMeta(movieUrl) {
  const { data } = await get(movieUrl);
  const $        = cheerio.load(data);

  // Title — specific selector to avoid "Direct & Telegram..." text
  const title = cleanTitle(
    $(".info-details .details-title h3").first().text().trim() ||
    $(".sheader .data h1").first().text().trim() ||
    $("h1.entry-title").first().text().trim() ||
    $(".details-title h3").first().text().trim() ||
    $("h1").first().text().trim()
  );

  const thumb = $(".splash-bg img").first().attr("src") ||
                $(".poster img").first().attr("src") ||
                $(".wp-post-image").first().attr("src") || "";

  // IMDb — only from specific element
  const imdb = $(".data-imdb").first().text().replace(/imdb[:\s]*/i,"").trim();

  const duration = $("[itemprop='duration']").first().text().trim() ||
                   $(".runtime").first().text().trim();

  // Genres — ONLY from .details-genre (not nav menu)
  const genres = [];
  $(".details-genre a, .sgeneros a").each((_, el) => {
    const g = $(el).text().trim();
    if (g && genres.length < 6) genres.push(g);
  });

  // Directors
  const directors = [];
  $(".info-col a[href*='/director/'], a[href*='director']").each((_, el) => {
    const d = $(el).text().trim();
    if (d && !directors.includes(d)) directors.push(d);
  });

  const subBy = (data.match(/Subtitle By[:\s]*([^\n<]+)/i) || [])[1]?.trim() || "";

  // Download links — /zt-links/ and /api- both
  const links    = [];
  const linkSeen = new Set();

  $("a[href*='/zt-links/'], a[href*='/api-']").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href || linkSeen.has(href)) return;
    linkSeen.add(href);

    const raw   = $(el).text()
      .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
      .trim();
    const qualM = raw.match(/(4K|2160[Pp]|1080[Pp]|FHD|720[Pp]|HD|480[Pp]|SD|360[Pp])/i);
    const sizeM = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);

    links.push({
      label  : raw,
      quality: qualM?.[1] || "",
      size   : sizeM?.[0] || "",
      ztUrl  : href,
    });
  });

  return { title, thumb, imdb, duration, genres, directors, subBy, links };
}

// ─── 3. Resolve zt-link → REAL direct .mp4 URL ───────────────────────────────
//
//  zt-link page has "Click Here" <a> with href like:
//    https://google.com/server11/1:/abc.../Film.mp4
//
//  That "google.com/server11" is a FAKE domain — it's a custom redirect server.
//  Real file is on a CDN. We follow the redirect chain manually to get the true URL.

async function resolveZtLink(ztUrl) {
  // Step 1: fetch zt-link page, get raw mp4 URL from "Click Here"
  let rawUrl = null;
  try {
    const { data } = await get(ztUrl);
    const $ = cheerio.load(data);

    $("a").each((_, el) => {
      const h = $(el).attr("href") || "";
      if (h.toLowerCase().includes(".mp4")) { rawUrl = h; return false; }
    });

    if (!rawUrl) {
      $("a").each((_, el) => {
        const h = $(el).attr("href") || "";
        if (h.includes("t.me") || h.includes("pixeldrain") || h.includes("telegram")) {
          rawUrl = h; return false;
        }
      });
    }
  } catch (e) {
    throw new Error(`zt-link fetch failed: ${e.message}`);
  }

  if (!rawUrl) return null;

  // Telegram / pixeldrain → return directly
  if (rawUrl.includes("t.me") || rawUrl.includes("pixeldrain") || rawUrl.includes("telegram.me")) {
    return rawUrl;
  }

  // Step 2: Follow redirect on the fake google.com/server URL
  // to get the REAL CDN URL (CloudFront / S3 / direct server)
  try {
    const realUrl = await followRedirect(rawUrl, ztUrl);
    if (realUrl && realUrl !== rawUrl) return realUrl;
  } catch (_) {}

  // Step 3: Try axios GET with responseType stream to catch final URL
  try {
    const res = await axios.get(rawUrl, {
      headers: {
        ...HEADERS,
        Referer: ztUrl,
        Range  : "bytes=0-1",
      },
      timeout      : TIMEOUT,
      maxRedirects : 15,
      validateStatus: s => s < 500,
      responseType : "stream",
    });

    const finalUrl = res.request?.res?.responseUrl ||
                     res.request?.responseURL       ||
                     res.config?.url                || "";
    res.data.destroy();

    if (finalUrl && finalUrl !== rawUrl) return finalUrl;
  } catch (_) {}

  // Step 4: Return rawUrl as last resort — Baileys might follow it
  return rawUrl;
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
    "Sinhala subtitle සමඟ film/series! 🍿"
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

  reply(`*⏳ ${quality} (${chosen.size}) — Getting Direct Link..*`);

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

  reply(`*⬇️ Sending the film.. (${chosen.size})*\nPlease wait a moment.. 🙏`);

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
    // Document send failed — send direct link as fallback
    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${chosen.size}\n\n` +
        `⚠️ Document send failed.\n` +
        `📥 *Direct Download Link:*\n${directUrl}`,
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
