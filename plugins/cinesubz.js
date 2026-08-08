/**
 * CineSubz.lk Ultimate Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: Puppeteer Real Browser v1.4.4 + wreq-js v2.3.1 (Rust TLS Bypass)
 * Bugfix: Isolated Command Handlers to prevent global plugin freezes.
 * Platform: Optimized for Railway / Ubuntu Servers
 */

const { cmd } = require("../command");
const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream"); 
const { connect } = require("puppeteer-real-browser");
const { fetch: wreqFetch } = require("wreq-js"); 

// Storage arrays for session tracking
const pendingSearch = {};
const pendingQuality = {};

const BASE = "https://cinesubz.net";
const MAX_MB = 2048; 
const TIMEOUT = 25000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": BASE,
};

// ⚡ Axios Auto-Retry Configuration
axiosRetry(axios, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED'
});

// ─── 💡 Helpers ──────────────────────────────────────────────────────────────
function get(url) {
  return axios.get(url, { headers: HEADERS, timeout: TIMEOUT, maxRedirects: 15 });
}

function cleanTitle(t = "") {
  return t.replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "").replace(/sinhala subtitles?.*/i, "").replace(/සිංහල.*/i, "").replace(/\|.*/i, "").replace(/[-–]\s*$/, "").trim();
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
  if (u.includes("2160") || u.includes("4K")) return "4K";
  if (u.includes("1080") || u.includes("FHD")) return "1080p";
  if (u.includes("720") || u.includes("HD")) return "720p";
  if (u.includes("480") || u.includes("SD")) return "480p";
  if (u.includes("360")) return "360p";
  return t.trim() || "Unknown";
}

// ─── 🔍 1. Search Engine ─────────────────────────────────────────────────────
async function searchMovies(query) {
  const { data } = await get(`${BASE}/?s=${encodeURIComponent(query)}`);
  const $ = cheerio.load(data);
  const results = [], seen = new Set();

  $(".display-item .item-box, article, .post, .result-item").each((_, el) => {
    const a = $(el).find("a[href*='/movies/'], a[href*='/tvshows/'], .title a").first();
    const href = a.attr("href") || "";
    const title = (a.attr("title") || a.text()).trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    results.push({
      title,
      url: href,
      imdb: $(el).find("[class*='data-imdb'], .meta .imdb, .imdb").first().text().replace(/imdb[:\s]*/i, "").trim(),
      year: $(el).find("[class*='year'], .meta .year").first().text().trim(),
      thumb: $(el).find("img, .thumbnail img").first().attr("src") || "",
    });
  });

  if (!results.length) {
    $("a[href*='/movies/'], a[href*='/tvshows/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const title = ($(el).attr("title") || $(el).text()).trim();
      if (!href || !title || seen.has(href) || href === BASE) return;
      seen.add(href);
      results.push({ title, url: href, imdb: "", year: "", thumb: "" });
    });
  }
  return results.slice(0, 15);
}

// ─── 📑 2. Movie Details Scraper ──────────────────────────────────────────────
async function getMovieMeta(movieUrl) {
  const { data } = await get(movieUrl);
  const $ = cheerio.load(data);

  const title = cleanTitle($(".info-details .details-title h3").first().text().trim() || $(".sheader .data h1").first().text().trim() || $("h1.entry-title").first().text().trim() || $("h1").first().text().trim());
  const thumb = $(".splash-bg img").first().attr("src") || $(".poster img").first().attr("src") || $(".wp-post-image, .thumbnail img").first().attr("src") || "";
  const imdb = $(".data-imdb, .imdbValue, .meta .imdb").first().text().replace(/imdb[:\s]*/i, "").trim();
  const duration = $("[itemprop='duration']").first().text().trim() || $(".runtime").first().text().trim();

  const genres = [];
  $(".details-genre a, .sgeneros a, .genres a").each((_, el) => { const g = $(el).text().trim(); if (g && genres.length < 6) genres.push(g); });

  const directors = [];
  $(".info-col a[href*='/director/'], .director a").each((_, el) => { const d = $(el).text().trim(); if (d && !directors.includes(d)) directors.push(d); });

  const subBy = (data.match(/Subtitle By[:\s]*([^\n<]+)/i) || [])[1]?.trim() || "";

  const links = [], linkSeen = new Set();
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href || linkSeen.has(href)) return;

    if (href.includes('/zt-links/') || href.includes('/api-') || href.includes('sonic-cloud') || href.includes('zone-t')) {
      linkSeen.add(href);
      const raw = $(el).text().replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "").trim();
      const qualM = raw.match(/(4K|2160[Pp]|1080[Pp]|FHD|720[Pp]|HD|480[Pp]|SD|360[Pp])/i);
      const sizeM = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);

      links.push({ label: raw || "Download", quality: qualM?.[1] || "", size: sizeM?.[0] || "Unknown Size", ztUrl: href });
    }
  });

  return { title, thumb, imdb, duration, genres, directors, subBy, links };
}

// ─── 🔗 3. Sonic-Cloud URL Mapping ───────────────────────────────────────────
const URL_MAPPINGS = [
  { search: ["https://google.com/server11/1:/", "https://google.com/server12/1:/", "https://google.com/server13/1:/"], replace: "https://bot3.sonic-cloud.online/server1/" },
  { search: ["https://google.com/server21/1:/", "https://google.com/server22/1:/", "https://google.com/server23/1:/"], replace: "https://bot3.sonic-cloud.online/server2/" },
  { search: ["https://google.com/server3/1:/"], replace: "https://bot3.sonic-cloud.online/server3/" },
  { search: ["https://google.com/server4/1:/"], replace: "https://bot3.sonic-cloud.online/server5/" },
  { search: ["https://google.com/server5/1:/"], replace: "https://bot3.sonic-cloud.online/server5/" },
  { search: ["https://google.com/server6/"], replace: "https://bot3.sonic-cloud.online/server6/" },
];

function applyExtSuffix(url) {
  if (url.includes(".mp4?bot=cscloud2bot&code=")) return url.replace(".mp4?bot=cscloud2bot&code=", "?ext=mp4&bot=cscloud2bot&code=");
  if (url.includes(".mp4")) return url.replace(".mp4", "?ext=mp4");
  if (url.includes(".mkv?bot=cscloud2bot&code=")) return url.replace(".mkv?bot=cscloud2bot&code=", "?ext=mkv&bot=cscloud2bot&code=");
  if (url.includes(".mkv")) return url.replace(".mkv", "?ext=mkv");
  if (url.includes(".zip")) return url.replace(".zip", "?ext=zip");
  return url;
}

// ─── 🌐 4. Puppeteer Real Browser Engine ─────────────────────────────────────
async function resolveSonicCloudPage(sonicUrl) {
  let browser, page;
  try {
    const setup = await connect({ headless: false, turnstile: true, args: ["--no-sandbox", "--disable-setuid-sandbox"], connectOption: { defaultViewport: null } });
    browser = setup.browser; page = setup.page;
    let realDownloadLink = null;

    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage) {
          try {
            newPage.on('framenavigated', frame => {
              const url = frame.url();
              if (url && (url.includes('avatarzone') || url.includes('sonic-cloud') || url.includes('.mp4') || url.includes('.mkv'))) realDownloadLink = url;
            });
            await newPage.setRequestInterception(true);
            newPage.on('request', request => {
              const url = request.url();
              if (url.includes('avatarzone') || url.includes('.mp4') || url.includes('.mkv') || url.includes('token=')) realDownloadLink = url;
              request.continue();
            });
          } catch (err) {}
        }
      }
    });

    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.includes('avatarzone') || ((url.includes('server1') || url.includes('server2')) && (url.includes('ext=') || url.includes('token='))) || url.includes('/api/download-data/')) {
        if (url !== sonicUrl && !url.includes("fordev.jpg")) realDownloadLink = url;
      }
      request.continue();
    });

    await page.goto(sonicUrl, { waitUntil: "networkidle2", timeout: 50000 });
    const buttonSelectors = ["a.btn-danger", "button.btn-danger", "a[href*='api/download-data']", "a.btn", ".direct-download"];
    let clicked = false;
    for (const sel of buttonSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { await page.realClick(sel); clicked = true; break; }
      } catch (err) {}
    }

    if (!clicked) {
      try {
        const el = await page.$("xpath///a[contains(text(), 'Direct Download')]");
        if (el) { await el.click(); clicked = true; }
      } catch (e) {}
    }

    for (let i = 0; i < 7; i++) { if (realDownloadLink) break; await new Promise(r => setTimeout(r, 1000)); }

    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const targetUrl = realDownloadLink || page.url();

    await browser.close().catch(() => {});
    return { directUrl: targetUrl, cookieStr: cookieHeader, userAgent: userAgent };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

async function resolveZtLink(ztUrl) {
  const { data } = await get(ztUrl);
  const $ = cheerio.load(data);
  const rawHref = $("#link").attr("href") || "";
  if (!rawHref) return null;
  if (rawHref.includes("t.me/") && !rawHref.includes("CineSubzAdmin")) return { url: rawHref, isTelegram: true };

  let sonicUrl = rawHref;
  for (const mapping of URL_MAPPINGS) {
    let matched = false;
    for (const searchStr of mapping.search) {
      if (rawHref.includes(searchStr)) {
        sonicUrl = rawHref.replace(searchStr, mapping.replace);
        sonicUrl = applyExtSuffix(sonicUrl);
        matched = true; break;
      }
    }
    if (matched) break;
  }

  try {
    const page = await resolveSonicCloudPage(sonicUrl);
    if (page.directUrl) return { url: page.directUrl, isTelegram: false, cookieStr: page.cookieStr, userAgent: page.userAgent };
  } catch (e) {}
  return { url: sonicUrl, isTelegram: false };
}

// ─── 💬 5. MAIN FILM COMMAND ─────────────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine"],
  react: "🎬",
  desc: "Search & download movies from CineSubz.net",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  let results;
  try { results = await searchMovies(q); } catch (e) { return reply(`*❌ Error:* ${e.message}`); }

  if (!results.length) return reply(`*❌ No results found for "${q}"*`);

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
  results.forEach((r, i) => {
    text += `*${i + 1}.* ${cleanTitle(r.title)} ${r.year ? `(${r.year})` : ''}\n`;
  });
  text += `\n*Reply a number (1-${results.length}) to select.*`;
  reply(text);
});

// ─── 💬 6. NATIVE GLOBAL TEXT LISTENER (Prevents Command Freezes) ────────────
// මෙමගින් අනිත් ප්ලගින් වලට බාධා නොකර චැට් එක listen කරයි.
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const input = body?.trim();
  if (!input || isNaN(input)) return; 
  const index = parseInt(input) - 1;

  // Flow A: Movie Selection Handling
  if (pendingSearch[sender]) {
    const session = pendingSearch[sender];
    if (index < 0 || index >= session.results.length) return;
    delete pendingSearch[sender]; // Clear dynamic lock

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    
    let meta;
    try { meta = await getMovieMeta(session.results[index].url); } 
    catch (e) { return reply(`*❌ Error:* ${e.message}`); }

    const title = meta.title || cleanTitle(session.results[index].title);
    let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
    if (meta.imdb) msg += `⭐ *IMDb:* ${meta.imdb}\n`;
    if (meta.duration) msg += `⏱️ *Duration:* ${meta.duration}\n`;
    
    const validLinks = meta.links.filter(l => parseSizeMB(l.size) <= MAX_MB);
    if (!validLinks.length) {
      msg += `\n⚠️ All files exceed 2GB limit.`;
      return reply(msg);
    }

    msg += `\n*📥 Quality Select:*\n`;
    validLinks.forEach((l, i) => { msg += `*${i + 1}.* ${normalizeQuality(l.quality || l.label)} (${l.size})\n`; });
    msg += `\n*Reply a number to download.*`;

    pendingQuality[sender] = { title, thumb: meta.thumb, links: validLinks, timestamp: Date.now() };
    return reply(msg);
  }

  // Flow B: Quality Download Handling
  if (pendingQuality[sender]) {
    const session = pendingQuality[sender];
    if (index < 0 || index >= session.links.length) return;
    delete pendingQuality[sender]; // Unlock instantly

    const chosen = session.links[index];
    const quality = normalizeQuality(chosen.quality || chosen.label);

    reply(`*⏳ Grabbing Direct Stream for ${quality}...*`);
    let resolved = await resolveZtLink(chosen.ztUrl).catch(() => null);

    if (!resolved || (!resolved.url && !resolved.directUrl) || (resolved.url?.includes("fordev.jpg"))) {
      return reply(`*❌ Firewalled! Please try again later.*`);
    }

    if (resolved.isTelegram) {
      return reply(`*📲 Telegram Link:* ${resolved.url}`);
    }

    const fileName = `${session.title} [${quality}].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
    const tempFilePath = path.join(__dirname, fileName);

    try {
      const downloadUrl = resolved.directUrl || resolved.url;
      
      const downloadResponse = await wreqFetch(downloadUrl, {
          browser: 'chrome_142',
          os: 'windows',
          headers: {
              'User-Agent': resolved.userAgent || HEADERS['User-Agent'],
              'Cookie': resolved.cookieStr || '',
              'Referer': 'https://bot3.sonic-cloud.online/',
              'Connection': 'keep-alive'
          }
      });

      if (!downloadResponse.ok) throw new Error(`Status ${downloadResponse.status}`);

      const nodeStream = Readable.fromWeb(downloadResponse.body);
      const writer = fs.createWriteStream(tempFilePath);
      nodeStream.pipe(writer);

      await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName,
        caption: `*🎬 ${session.title}*\n*📊 Quality:* ${quality}\n*💾 Size:* ${chosen.size}\n\n_Delivered by MALIYA-MD_`
      }, { quoted: mek });

      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (err) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reply(`*⚠️ Direct WhatsApp sending failed.*\n\n🔗 Download Link:\n${resolved.directUrl || resolved.url}`);
    }
  }
});

// Cache Cleaner
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);
