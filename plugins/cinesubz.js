/**
 * CineSubz.lk Ultimate Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: Puppeteer Real Browser v1.4.4 (Anti-Detection Mode)
 * Platform: Optimized for Railway (Docker + Xvfb Environment)
 */

const { cmd } = require("../command");
const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { connect } = require("puppeteer-real-browser");

// ⚡ Axios Auto-Retry Configuration
axiosRetry(axios, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
    }
});

const pendingSearch = {};
const pendingQuality = {};

const BASE = "https://cinesubz.net";
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
  console.log(`[MALIYA-MD] 🔍 Searching database for query: "${query}"`);
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

  console.log(`[MALIYA-MD] 📦 Found ${results.length} movie results.`);
  return results.slice(0, 15);
}

// ─── 📑 2. Movie Details Scraper ──────────────────────────────────────────────

async function getMovieMeta(movieUrl) {
  console.log(`[MALIYA-MD] 📑 Fetching movie metadata from: ${movieUrl}`);
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
    $(".wp-post-image, .thumbnail img").first().attr("src") || "";

  const imdb = $(".data-imdb, .imdbValue, .meta .imdb").first().text().replace(/imdb[:\s]*/i, "").trim();
  const duration = $("[itemprop='duration']").first().text().trim() ||
    $(".runtime").first().text().trim();

  const genres = [];
  $(".details-genre a, .sgeneros a, .genres a").each((_, el) => {
    const g = $(el).text().trim();
    if (g && genres.length < 6) genres.push(g);
  });

  const directors = [];
  $(".info-col a[href*='/director/'], .director a").each((_, el) => {
    const d = $(el).text().trim();
    if (d && !directors.includes(d)) directors.push(d);
  });

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

      links.push({
        label: raw || "Download",
        quality: qualM?.[1] || "",
        size: sizeM?.[0] || "Unknown Size",
        ztUrl: href,
      });
    }
  });

  console.log(`[MALIYA-MD] 🔗 Scraped Movie: "${title}" | Links found: ${links.length}`);
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

// ─── 🌐 4. Puppeteer Real Browser Engine ───────────────────────────────────────

async function resolveSonicCloudPage(sonicUrl) {
  let browser, page;

  try {
    console.log(`\n[MALIYA-MD] 🌐 Launching Puppeteer Real Browser (Anti-Detection Mode)...`);
    
    // ⚡ Railway Docker + Xvfb පරිසරය සඳහා Real Browser එක සම්බන්ධ කිරීම
    const setup = await connect({
      headless: false, // Xvfb Virtual Screen එක තියෙන නිසා false දීම තමා උපරිම ස්ටේබල් වැඩ කරන්නේ!
      turnstile: true, // Cloudflare Turnstile Captchas ඔටෝ බයිපාස් කිරීමට
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      connectOption: {
        defaultViewport: null
      }
    });

    browser = setup.browser;
    page = setup.page;

    await page.setRequestInterception(true);
    let interceptedUrl = null;

    // 🎯 [Network Interceptor] API එක සහ ඩවුන්ලෝඩ් ස්ට්‍රීම් එක Hook කිරීම
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/download-data/') || url.includes('bot=cscloud') || url.includes('ext=') || url.includes('?code=')) {
        if (!url.includes("fordev.jpg")) {
          interceptedUrl = url;
          console.log(`[MALIYA-MD] 🎯 [Main Interceptor] Hooked URL: ${interceptedUrl}`);
        }
      }
      if (request.resourceType() === 'image' && url.includes('fordev.jpg')) {
        return request.abort(); 
      }
      request.continue();
    });

    console.log(`[MALIYA-MD] ⏳ Navigating to target portal: ${sonicUrl}`);
    await page.goto(sonicUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
    
    // ටෝකන්ස් සහ ස්ක්‍රිප්ට්ස් රන් වීමට තත්පර 4ක් රැඳී සිටීම
    console.log("[MALIYA-MD] ⏳ Holding pipeline open for 4000ms to allow DOM execution...");
    await new Promise(r => setTimeout(r, 4000)); 

    // API එක මුලින්ම අහුවුනා නම් UI Click Engine එක ස්කිප් කර කෙලින්ම සෙශන් එක පියවයි
    if (interceptedUrl) {
      console.log("[MALIYA-MD] ⚡ Target URL captured early via network stream. Skipping UI clicks.");
      return await finalizeRealSession(browser, page, interceptedUrl);
    }

    // 🕵️‍♂️ [DOM Scraper Fallback] බටන් එකක් නැතත් DOM එක ඇතුලේ සැඟවුනු ඩිරෙක්ට් ලින්ක් සෙවීම
    console.log("[MALIYA-MD] 🕵️‍♂️ Scanning DOM for hidden direct download anchors...");
    const extractedHref = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll("a"));
      const found = allLinks.find(a => a.href.includes("ext=") || a.href.includes("download") || a.href.includes("code=") || a.href.includes("/api/"));
      return found ? found.href : null;
    });

    if (extractedHref) {
      console.log(`[MALIYA-MD] 🔗 Found raw link in DOM: ${extractedHref}`);
      interceptedUrl = extractedHref;
      return await finalizeRealSession(browser, page, interceptedUrl);
    }

    // 🖱️ [Smart RealClick Engine] මනුස්සයෙක් වගේ මවුස් එක ගෙනිහින් ක්ලික් කිරීම සිමියුලේට් කිරීම
    console.log("[MALIYA-MD] 🖱️ Executing Humanized Real Click Engine...");
    const targetSelectors = ["#dl-links button", ".direct-download", "button", "a.btn", "[onclick]"];
    
    let clicked = false;
    for (const sel of targetSelectors) {
      const el = await page.$(sel);
      if (el) {
        await page.realClick(sel); 
        console.log(`[MALIYA-MD] 💥 RealClick executed on selector: ${sel}`);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log("[MALIYA-MD] 📡 Click Response: No element found to click in DOM");
    }

    await new Promise(r => setTimeout(r, 3000));
    return await finalizeRealSession(browser, page, interceptedUrl);

  } catch (e) {
    console.log(`[MALIYA-MD] ❌ Real Browser Exception: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

async function finalizeRealSession(browser, page, interceptedUrl) {
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const finalUrl = page.url();

  if (!interceptedUrl && finalUrl && !finalUrl.includes("fordev.jpg")) {
    interceptedUrl = finalUrl;
  }

  console.log(`[MALIYA-MD] 🔒 Closing session. Final Direct Link: ${interceptedUrl}`);
  await browser.close().catch(() => {});
  
  return { 
    fileSize: null, 
    directUrl: interceptedUrl, 
    cookieStr: cookieHeader, 
    userAgent: userAgent 
  };
}

async function resolveZtLink(ztUrl) {
  console.log(`[MALIYA-MD] 🔗 Processing Zone-T Tunnel Link: ${ztUrl}`);
  const { data } = await get(ztUrl);
  const $ = cheerio.load(data);

  const rawHref = $("#link").attr("href") || "";
  if (!rawHref) {
    console.log("[MALIYA-MD] ❌ Critical: Form download link not found in DOM.");
    return null;
  }

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
        console.log(`[MALIYA-MD] 🗺️ Mapping Match! Remapped Cloud Portal URL: ${sonicUrl}`);
        break;
      }
    }
  }

  try {
    const page = await resolveSonicCloudPage(sonicUrl);
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
    console.log("[MALIYA-MD] ⚠️ Exception caught mapping sonic architecture page:", e.message);
  }

  return { url: sonicUrl, isTelegram: false };
}

// ─── 💬 5. Bot Commands Flow ─────────────────────────────────────────────────

cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine", "sub", "films"],
  react: "🎬",
  desc: "Search & download movies from CineSubz.net",
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

  reply(`*⬇️ Downloading film via Native Cloud Injector Engine... (${finalSize})*\nකරුණාකර රැඳී සිටින්න... ⏳`);

  try {
    const downloadUrl = resolved.directUrl || resolved.url;
    const userAgent = resolved.userAgent || HEADERS['User-Agent'];
    const cookieStr = resolved.cookieStr || '';

    console.log(`\n[MALIYA-MD] 🚀 NATIVE GRAB PIPELINE ACTIVATED`);
    console.log(`[MALIYA-MD] 🎯 Target End-Point CDN: ${downloadUrl}`);

    // 🚀 Linux Native Wget Engine Setup
    const wgetCommand = `wget --tries=3 --timeout=60 --no-check-certificate \
      --user-agent="${userAgent}" \
      --header="Cookie: ${cookieStr}" \
      --header="Referer: https://bot3.sonic-cloud.online/" \
      --header="Accept: */*" \
      -O "${tempFilePath}" "${downloadUrl}"`;

    console.log(`[MALIYA-MD] ⚡ Spawning Native Process Engine via ChildExec...`);
    
    await new Promise((resolve, reject) => {
      exec(wgetCommand, (error, stdout, stderr) => {
        console.log(`[MALIYA-MD] 📈 Wget Session Feed:\n${stderr || stdout}`);
        if (error) {
          console.error(`[MALIYA-MD] Wget Native Pipeline Crash Error: ${error.message}`);
          return reject(new Error("Native pipeline download failed."));
        }
        resolve();
      });
    });

    const stats = fs.statSync(tempFilePath);
    console.log(`[MALIYA-MD] 📁 Local file size verified: ${(stats.size / (1024*1024)).toFixed(2)} MB`);
    
    if (stats.size < 5000000) { 
      throw new Error("Corrupted payload or unauthorized session drop.");
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
        `*Enjoy! 🍿*\n_Secured & Delivered by MALIYA-MD_`,
    }, { quoted: mek });

    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }

  } catch (err) {
    console.log(`[MALIYA-MD] 🚨 Native Pipeline Failure Intercepted: ${err.message}`);
    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }

    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${finalSize}\n\n` +
        `⚠️ *සර්වර් එකේ Strict API Security එක නිසා වට්සැප් එකට direct එවීම අසාර්ථක විය.*\n\n` +
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
