/**
 * CineSubz.lk Ultimate Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Developer: Malindu Nadith Kumarathunga
 * Upgraded Features: 
 *   - Fingerprint Injection Evasion (Bypasses TLS/Cloudflare V2 blocks)
 *   - Network Request Deep Interception (Grabs token before fordev.jpg redirect)
 *   - Full Adblocker Engine (Blocks malicious trackers/forced redirects on the fly)
 *   - Axios Stream Downloader (Replaces wget to fix 403 Forbidden)
 */

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Advanced Puppeteer Setup
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");

// Fingerprint Simulation Setup
const { FingerprintGenerator } = require('fingerprint-generator');
const { attachFingerprintToPuppeteer } = require('fingerprint-injector'); // Fixed Functional Import

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const fingerprintGenerator = new FingerprintGenerator({
    browsers: [{ name: 'chrome', minVersion: 120 }],
    devices: ['desktop'],
    operatingSystems: ['windows'],
});

const pendingSearch = {};
const pendingQuality = {};

const BASE = "https://cinesubz.lk";
const MAX_MB = 2048; // WhatsApp Limit (2GB)
const TIMEOUT = 25000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": BASE,
};

// ─── 💡 Helpers ──────────────────────────────────────────────────────────────

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

  $(".display-item .item-box, article, .post").each((_, el) => {
    const a = $(el).find("a[href*='/movies/'], a[href*='/tvshows/']").first();
    const href = a.attr("href") || "";
    const title = (a.attr("title") || a.text()).trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    results.push({
      title,
      url: href,
      imdb: $(el).find("[class*='data-imdb']").first().text().replace(/imdb[:\s]*/i, "").trim(),
      year: $(el).find("[class*='year']").first().text().trim(),
      thumb: $(el).find("img").first().attr("src") || "",
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

  return results.slice(0, 10);
}

// ─── 📑 2. Movie Details Scraper ──────────────────────────────────────────────

async function getMovieMeta(movieUrl) {
  const { data } = await get(movieUrl);
  const $ = cheerio.load(data);

  const title = cleanTitle(
    $(".info-details .details-title h3").first().text().trim() ||
    $(".sheader .data h1").first().text().trim() ||
    $("h1.entry-title").first().text().trim() ||
    $("h1").first().text().trim()
  );

  const thumb = $(".splash-bg img").first().attr("src") ||
    $(".poster img").first().attr("src") ||
    $(".wp-post-image").first().attr("src") || "";

  const imdb = $(".data-imdb").first().text().replace(/imdb[:\s]*/i, "").trim();
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

    const raw = $(el).text()
      .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
      .trim();
    const qualM = raw.match(/(4K|2160[Pp]|1080[Pp]|FHD|720[Pp]|HD|480[Pp]|SD|360[Pp])/i);
    const sizeM = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);

    links.push({
      label: raw,
      quality: qualM?.[1] || "",
      size: sizeM?.[0] || "",
      ztUrl: href,
    });
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

// ─── 🌐 4. Core Fingerprinted Interceptor Engine ───────────────────────────────

let _browser = null;
async function getBrowser() {
  try {
    if (_browser) { await _browser.pages(); return _browser; }
  } catch (_) { _browser = null; }
  
  _browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--blink-features=AutomationControlled",
      "--window-size=1920,1080",
    ],
  });
  return _browser;
}

async function resolveSonicCloudPage(sonicUrl) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    console.log(`\n[MALIYA-MD] 🌐 Initializing Fingerprint Evasion Engine on target...`);
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 🎭 Real Browser Fingerprint Injection (Fixed Functional Call)
    const fingerprint = fingerprintGenerator.getFingerprint();
    await attachFingerprintToPuppeteer(page, fingerprint);

    // Deep Network Request Interception
    await page.setRequestInterception(true);
    let interceptedUrl = null;

    page.on('request', request => {
      const url = request.url();
      if (url.includes('bot=cscloud') || url.includes('ext=') || url.includes('/download/') || (url.includes('server') && url.includes('?code='))) {
        if (!url.includes("fordev.jpg")) {
          interceptedUrl = url;
          console.log(`[MALIYA-MD] 🎯 Deep Network Request Intercepted: ${interceptedUrl}`);
        }
      }
      if (request.resourceType() === 'image' && url.includes('fordev.jpg')) {
        return request.abort(); // Block Trap Redirection Images
      }
      request.continue();
    });

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        if (url && !url.includes("sonic-cloud.online") && !url.includes("fordev.jpg") && url.startsWith("http")) {
          interceptedUrl = url;
          console.log(`[MALIYA-MD] 🎯 Navigation Redirect Captured: ${interceptedUrl}`);
        }
      }
    });

    console.log("[MALIYA-MD] ⏳ Connecting to pipeline architecture...");
    await page.goto(sonicUrl, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 8000)); 

    const btnSelector = "#dl-links button, .direct-download, button.direct-download, a[href*='ext=']";
    
    const fileSize = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const m = text.match(/File Size:\s*\n?\s*([\d.]+\s*(MB|GB))/i);
      return m ? m[1] : null;
    });

    await page.waitForSelector(btnSelector, { timeout: 6000 }).catch(() => {});

    // 🖱️ Mouse Click Simulation (Human Emulated)
    console.log("[MALIYA-MD] 🖱️ Executing Human Emulated Vector Click...");
    const element = await page.$(btnSelector);
    if (element) {
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      } else {
        await page.evaluate((sel) => { document.querySelector(sel)?.click(); }, btnSelector);
      }
    } else {
      await page.evaluate(() => {
        const btn = document.querySelector("#dl-links button") || document.querySelector(".direct-download");
        if (btn) btn.click();
      }).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 7000)); 

    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const telegramHref = await page.evaluate(() => {
      const a = document.querySelector("a.telegram-download");
      return a ? a.href : null;
    }).catch(() => null);

    const finalUrl = page.url();
    if (!interceptedUrl && finalUrl && !finalUrl.includes("sonic-cloud") && !finalUrl.includes("fordev.jpg")) {
      interceptedUrl = finalUrl;
    }

    await page.close().catch(() => {});
    
    return { 
      fileSize, 
      telegramUrl: telegramHref, 
      directUrl: interceptedUrl, 
      cookieStr: cookieHeader, 
      userAgent: userAgent 
    };

  } catch (e) {
    console.log(`[MALIYA-MD] ❌ Engine Exception: ${e.message}`);
    await page.close().catch(() => {});
    throw e;
  }
}

async function resolveZtLink(ztUrl) {
  const { data } = await get(ztUrl);
  const $ = cheerio.load(data);

  const rawHref = $("#link").attr("href") || "";
  if (!rawHref) return null;

  if (rawHref.includes("t.me/") && !rawHref.includes("CineSubzAdmin")) {
    return { url: rawHref, isTelegram: true };
  }

  let sonicUrl = rawHref;
  let matched = false;

  for (const mapping of URL_MAPPINGS) {
    if (matched) break;
    for (const searchStr of mapping.search) {
      if (rawHref.includes(searchStr)) {
        sonicUrl = rawHref.replace(searchStr, mapping.replace);
        sonicUrl = applyExtSuffix(sonicUrl);
        matched = true;
        break;
      }
    }
  }

  if (!matched) return { url: rawHref, isTelegram: false };

  try {
    const page = await resolveSonicCloudPage(sonicUrl);
    if (page.telegramUrl) {
      return { url: page.telegramUrl, isTelegram: true, confirmedSize: page.fileSize };
    }
    if (page.directUrl) {
      return { 
        url: page.directUrl, 
        isTelegram: false, 
        confirmedSize: page.fileSize,
        cookieStr: page.cookieStr,
        userAgent: page.userAgent
      };
    }
  } catch (e) {
    console.log("[cinesubz] Warning mapping sonic page:", e.message);
  }

  return { url: sonicUrl, isTelegram: false };
}

// ─── 💬 5. Bot Commands Flow ─────────────────────────────────────────────────

cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine", "sub", "films"],
  react: "🎬",
  desc: "Search & download movies from CineSubz.lk",
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
  try { results = await searchMovies(q); }
  catch (e) { return reply(`*❌ Search error:* ${e.message}`); }

  if (!results.length) return reply(`*❌ "${q}" No results found.*\nTry a different name.`);

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
  try { meta = await getMovieMeta(selected.url); }
  catch (e) { return reply(`*❌ Error:* ${e.message}`); }

  const title = meta.title || cleanTitle(selected.title);

  let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
  if (meta.imdb) msg += `⭐ *IMDb:* ${meta.imdb}\n`;
  if (meta.duration) msg += `⏱️ *Duration:* ${meta.duration}\n`;
  if (meta.genres.length) msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;
  if (meta.directors.length) msg += `🎥 *Director:* ${meta.directors.join(", ")}\n`;
  if (meta.subBy) msg += `📝 *Sub By:* ${meta.subBy}\n`;

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

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const { title, links } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality} (${chosen.size}) — Bypassing structural encryptions...*`);

  let resolved;
  try { resolved = await resolveZtLink(chosen.ztUrl); } 
  catch (e) { 
    return reply(`*❌ Resolve error:* ${e.message}`); 
  }

  if (!resolved || (!resolved.url && !resolved.directUrl) || (resolved.url && resolved.url.includes("fordev.jpg")) || (resolved.directUrl && resolved.directUrl.includes("fordev.jpg"))) {
    return reply(`*❌ Anti-Bot Firewall Blocked the Request!*\nසර්වර් එක මඟින් බොට් හඳුනාගැනීමේ පද්ධතිය ක්‍රියාත්මක කලා. කරුණාකර මද වෙලාවකින් නැවත උත්සාහ කරන්න.`);
  }

  const finalSize = resolved.confirmedSize || chosen.size;

  if (resolved.isTelegram) {
    return maliya.sendMessage(from, {
      text: `*🎬 ${title}*\n*Size:* ${finalSize}\n\n📲 *Telegram Link:*\n${resolved.url}`,
    }, { quoted: mek });
  }

  const fileName = `${title} [${quality}] [CineSubz].mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
  const tempFilePath = path.join(__dirname, fileName);

  reply(`*⬇️ Downloading film via Fingerprinted Stream Session... (${finalSize})*\nකරුණාකර රැඳී සිටින්න... ⏳`);

  try {
    // ⚡ Axios Stream Downloader mapped strictly to resolved.directUrl
    const response = await axios({
      method: 'get',
      url: resolved.directUrl || resolved.url,
      responseType: 'stream',
      headers: {
        'User-Agent': resolved.userAgent || HEADERS['User-Agent'],
        'Cookie': resolved.cookieStr || '',
        'Referer': 'https://bot3.sonic-cloud.online/',
        'Accept': '*/*'
      }
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(tempFilePath);
    if (stats.size < 5000000) { 
      throw new Error("Corrupted payload or block page downloaded.");
    }

    reply(`*⬆️ Film successfully grabbed! Uploading to WhatsApp...* 🚀`);
    
    await maliya.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName,
      caption:
        `*🎬 ${title}*\n` +
        `*📊 Quality:* ${quality}\n` +
        `*💾 Size:* ${finalSize}\n\n` +
        `*Enjoy! 🍿*\n_Bypassed & Delivered by MALIYA-MD_`,
    }, { quoted: mek });

    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }

  } catch (err) {
    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }

    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${finalSize}\n\n` +
        `⚠️ *සර්වර් එකේ Strict Encryption නිසා වට්සැප් එකට direct එවීම අසාර්ථක විය.*\n\n` +
        `👇 පහල Direct Link එක ක්ලික් කරලා ඔයාගේ බ්‍රවුසර් එකෙන්ම බාගන්න:\n${resolved.directUrl || resolved.url}`,
    }, { quoted: mek });
  }
});

setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
