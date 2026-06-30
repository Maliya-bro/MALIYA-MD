/**
 * CineSubz.lk Movie Download Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────
 * npm install axios cheerio puppeteer
 * 
 * Heroku paid plan recommended (RAM + no IP block)
 */

const { cmd }    = require("../command");
const axios      = require("axios");
const cheerio    = require("cheerio");
const puppeteer  = require("puppeteer");

const pendingSearch  = {};
const pendingQuality = {};

const BASE    = "https://cinesubz.net";
const MAX_MB  = 2048;
const TIMEOUT = 30_000;

const HEADERS = {
  "User-Agent"      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept"          : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language" : "en-US,en;q=0.9",
  "Accept-Encoding" : "gzip, deflate, br",
  "Referer"         : BASE,
};

// ─── Browser pool (single reusable instance) ──────────────────────────────────
let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    headless : true,
    args     : [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  });
  return _browser;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(url) {
  return axios.get(url, { headers: HEADERS, timeout: TIMEOUT, maxRedirects: 15 });
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

// ─── 1. Search (axios+cheerio — fast) ────────────────────────────────────────

async function searchMovies(query) {
  const { data } = await get(`${BASE}/?s=${encodeURIComponent(query)}`);
  const $        = cheerio.load(data);
  const results  = [], seen = new Set();

  $(".display-item .item-box, article, .post").each((_, el) => {
    const a     = $(el).find("a[href*='/movies/'], a[href*='/tvshows/']").first();
    const href  = a.attr("href") || "";
    const title = (a.attr("title") || a.text()).trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    results.push({
      title,
      url  : href,
      imdb : $(el).find("[class*='data-imdb']").first().text().replace(/imdb[:\s]*/i, "").trim(),
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

// ─── 2. Movie page (axios+cheerio — fast) ────────────────────────────────────

async function getMovieMeta(movieUrl) {
  const { data } = await get(movieUrl);
  const $        = cheerio.load(data);

  const title = cleanTitle(
    $(".info-details .details-title h3").first().text().trim() ||
    $(".sheader .data h1").first().text().trim() ||
    $("h1.entry-title").first().text().trim() ||
    $("h1").first().text().trim()
  );

  const thumb = $(".splash-bg img").first().attr("src") ||
                $(".poster img").first().attr("src") ||
                $(".wp-post-image").first().attr("src") || "";

  const imdb     = $(".data-imdb").first().text().replace(/imdb[:\s]*/i, "").trim();
  const duration = $("[itemprop='duration']").first().text().trim() ||
                   $(".runtime").first().text().trim();

  const genres = [];
  $(".details-genre a, .sgeneros a").each((_, el) => {
    const g = $(el).text().trim();
    if (g && genres.length < 6) genres.push(g);
  });

  const directors = [];
  $(".info-col a[href*='/director/']").each((_, el) => {
    const d = $(el).text().trim();
    if (d && !directors.includes(d)) directors.push(d);
  });

  const subBy = (data.match(/Subtitle By[:\s]*([^\n<]+)/i) || [])[1]?.trim() || "";

  const links = [], linkSeen = new Set();
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

// ─── 3. Resolve zt-link → REAL .mp4 URL via puppeteer ───────────────────────
//
//  Strategy:
//  - Open zt-link page
//  - Intercept ALL network requests
//  - When "Click Here" is clicked, google.com/server → redirects → real CDN .mp4
//  - Capture that real URL from network intercept
//  - Never download the file — just get the URL

async function resolveZtLink(ztUrl) {
  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setUserAgent(HEADERS["User-Agent"]);
    await page.setExtraHTTPHeaders({ Referer: BASE });

    let realMp4Url = null;

    // Intercept requests — catch real CDN URL (not google.com fake)
    await page.setRequestInterception(true);
    page.on("request", req => {
      const url  = req.url();
      const type = req.resourceType();

      // Block images/css/fonts — speed up
      if (["image", "stylesheet", "font", "media"].includes(type)) {
        req.abort();
        return;
      }

      // Catch real .mp4 URL (not from google.com fake server)
      if (url.includes(".mp4") && !url.includes("google.com/server")) {
        realMp4Url = url;
        req.abort(); // don't actually download
        return;
      }

      req.continue();
    });

    // Also catch redirects via response
    page.on("response", res => {
      const url = res.url();
      if (url.includes(".mp4") && !url.includes("google.com/server")) {
        realMp4Url = url;
      }
    });

    // Load zt-link page
    await page.goto(ztUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    // Get the "Click Here" link href (google.com/server...)
    const clickUrl = await page.$eval("a[href*='.mp4']", el => el.href).catch(() => null);

    // Check for telegram/pixeldrain
    if (!clickUrl) {
      const tgUrl = await page.$eval(
        "a[href*='t.me'], a[href*='pixeldrain']", el => el.href
      ).catch(() => null);
      if (tgUrl) return tgUrl;
      return null;
    }

    // Now navigate to the google.com/server URL — puppeteer will follow redirects
    // The real CDN URL will be captured by request interceptor
    const newPage = await browser.newPage();
    try {
      await newPage.setUserAgent(HEADERS["User-Agent"]);
      await newPage.setRequestInterception(true);

      newPage.on("request", req => {
        const url = req.url();
        if (url.includes(".mp4") && !url.includes("google.com/server")) {
          realMp4Url = url;
          req.abort();
          return;
        }
        if (["image", "stylesheet", "font"].includes(req.resourceType())) {
          req.abort(); return;
        }
        req.continue();
      });

      newPage.on("response", res => {
        const url = res.url();
        if (url.includes(".mp4") && !url.includes("google.com/server")) {
          realMp4Url = url;
        }
      });

      await newPage.goto(clickUrl, {
        waitUntil : "networkidle0",
        timeout   : 20000,
      }).catch(() => {});

      // Final URL after all redirects
      const finalUrl = newPage.url();
      if (finalUrl.includes(".mp4") && !finalUrl.includes("google.com/server")) {
        realMp4Url = finalUrl;
      }

    } finally {
      await newPage.close().catch(() => {});
    }

    return realMp4Url;

  } finally {
    await page.close().catch(() => {});
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

// ── Step 2 ────────────────────────────────────────────────────────────────────

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

// ── Step 3 ────────────────────────────────────────────────────────────────────

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

  reply(`*⏳ ${quality} (${chosen.size}) — Getting real download URL...*`);

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
