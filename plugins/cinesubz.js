/**
 * CineSubz.lk Movie Downloader Plugin with Puppeteer Clicker for MALIYA-MD
 * ────────────────────────────────────────────────────────────────────────
 * Required Packages:
 * npm install axios cheerio puppeteer-real-browser
 */

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const { connect } = require("puppeteer-real-browser");
const path = require("path");
const os = require("os");
const fs = require("fs");

const pendingSearch = {};
const pendingQuality = {};

const BASE = "https://cinesubz.lk";
const MAX_MB = 2048;
const TIMEOUT = 20_000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": BASE,
};

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
  if (u.includes("2160") || u.includes("4K")) return "4K";
  if (u.includes("1080") || u.includes("FHD")) return "1080p";
  if (u.includes("720") || u.includes("HD")) return "720p";
  if (u.includes("480") || u.includes("SD")) return "480p";
  if (u.includes("360")) return "360p";
  return t.trim() || "Unknown";
}

// ─── Puppeteer Dynamic Clicker & Stream Extractor (1920x1080) ─────────────────

async function bypassAndGetDirectLink(targetUrl) {
  const customProfileDir = path.join(os.tmpdir(), "puppeteer_real_profile_" + Date.now());
  if (!fs.existsSync(customProfileDir)) {
    fs.mkdirSync(customProfileDir, { recursive: true });
  }

  let capturedDirectLink = null;

  try {
    const { browser, page } = await connect({
      headless: false,
      turnstile: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080" // 🖥️ 1920x1080 Resolution Configuration
      ],
      customConfig: { userDataDir: customProfileDir },
      connectOption: { defaultViewport: { width: 1920, height: 1080 } }
    });

    const processUrl = (url) => {
      if (!url || url === "about:blank" || url.startsWith("data:") || url.startsWith("chrome-extension://")) return;
      if (url.includes("bot3.sonic-cloud.online")) return;

      // Ad Domain / Ad File Extensions Filter
      const isAd = 
        url.includes("doubleclick") || 
        url.includes("googleads") || 
        url.includes("adsterra") || 
        url.includes(".apk") || 
        url.includes(".exe") || 
        url.includes("pop") || 
        url.includes("redirect");

      // Validating Actual Movie Link
      const isRealFilm = 
        url.includes("avatarzone") ||
        (url.includes("token=") && (url.includes(".mp4") || url.includes(".mkv") || url.includes("ext=mp4")));

      if (isRealFilm && !isAd && !capturedDirectLink) {
        capturedDirectLink = url;
        console.log(`\n🎯 REAL FILM DIRECT LINK CAPTURED: ${capturedDirectLink}\n`);
      }
    };

    const setupCDP = async (target) => {
      try {
        if (target.type() === "page") {
          const cdp = await target.createCDPSession();
          await cdp.send("Network.enable");
          await cdp.send("Page.enable");

          await cdp.send("Browser.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: "/tmp"
          });

          cdp.on("Network.requestWillBeSent", (e) => processUrl(e.request.url));
          cdp.on("Network.responseReceived", (e) => processUrl(e.response.url));

          cdp.on("Page.downloadWillBegin", (e) => {
            if (e.url) processUrl(e.url);
          });
        }
      } catch (e) {}
    };

    await setupCDP(page.target());
    browser.on("targetcreated", async (target) => await setupCDP(target));

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));

    // 🎯 1. Dynamic Button Coordinates Detection in 1920x1080 Viewport
    const buttonCoords = await page.evaluate(() => {
      const btn = document.querySelector("a.btn, button.btn, #download-btn, a[href*='download'], .download-button, a.btn-success, a.btn-primary");
      if (btn) {
        const rect = btn.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      }
      return null;
    });

    const targetX = buttonCoords ? buttonCoords.x : 755;
    const startY = buttonCoords ? buttonCoords.y : 270;

    console.log(`[+] Target Button Center -> X: ${targetX} | Y: ${startY}`);

    // 🎯 2. Dynamic Clicking around Button Area with Auto Break
    for (let pass = 1; pass <= 2; pass++) {
      if (capturedDirectLink) break;

      for (let offsetY = -15; offsetY <= 15; offsetY += 5) {
        if (capturedDirectLink) {
          console.log("🛑 Real Movie Link captured! Breaking click loop.");
          break;
        }

        const currentY = startY + offsetY;
        console.log(`[+] Click Attempt (Pass ${pass}) -> X: ${targetX} | Y: ${currentY}`);

        try {
          if (page.realCursor) {
            await page.realCursor.moveTo({ x: targetX, y: currentY });
            await page.realCursor.click();
          } else {
            await page.mouse.move(targetX, currentY, { steps: 3 });
            await page.mouse.click(targetX, currentY);
          }
        } catch (err) {}

        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    await browser.close().catch(() => {});
    return capturedDirectLink;

  } catch (err) {
    console.error("Puppeteer Bypass Error:", err.message);
    return null;
  }
}

// ─── Scraper & Link Resolvers ─────────────────────────────────────────────────

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

const URL_MAPPINGS = [
  { search: ["https://google.com/server11/1:/", "https://google.com/server12/1:/", "https://google.com/server13/1:/"], replace: "https://bot3.sonic-cloud.online/server1/" },
  { search: ["https://google.com/server21/1:/", "https://google.com/server22/1:/", "https://google.com/server23/1:/"], replace: "https://bot3.sonic-cloud.online/server2/" },
  { search: ["https://google.com/server3/1:/"], replace: "https://bot3.sonic-cloud.online/server3/" },
  { search: ["https://google.com/server4/1:/"], replace: "https://bot3.sonic-cloud.online/server4/" },
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

async function resolveZtLink(ztUrl) {
  const { data } = await get(ztUrl);
  const $ = cheerio.load(data);
  const rawHref = $("#link").attr("href") || "";
  if (!rawHref) return null;

  if (rawHref.includes("t.me/") && !rawHref.includes("CineSubzAdmin")) return rawHref;

  let modifiedUrl = rawHref;
  let matched = false;

  for (const mapping of URL_MAPPINGS) {
    if (matched) break;
    for (const searchStr of mapping.search) {
      if (rawHref.includes(searchStr)) {
        modifiedUrl = rawHref.replace(searchStr, mapping.replace);
        modifiedUrl = applyExtSuffix(modifiedUrl);
        matched = true;
        break;
      }
    }
  }

  return modifiedUrl;
}

// ─── Bot Commands ─────────────────────────────────────────────────────────────

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
    "Usage: *film <name>*\nExample: *film Jana Nayagan*\n\n" +
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

// ── Step 3: quality → Puppeteer Bypass → send document via Stream ─────────────

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 && +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  const { title, links } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality} (${chosen.size}) — Resolving download link..*`);

  let bot3Url;
  try { bot3Url = await resolveZtLink(chosen.ztUrl); }
  catch (e) { return reply(`*❌ Resolve error:* ${e.message}`); }

  if (!bot3Url) {
    return reply(`*❌ Can't get page link.*\nTry manually:\n${chosen.ztUrl}`);
  }

  // Telegram Link එකක් නම්
  if (bot3Url.includes("t.me") || bot3Url.includes("telegram.me")) {
    return maliya.sendMessage(from, {
      text: `*🎬 ${title}*\n*Quality:* ${quality}  |  *Size:* ${chosen.size}\n\n📲 *Telegram Link:*\n${bot3Url}`,
    }, { quoted: mek });
  }

  reply(`*🚀 Bypassing protection via Puppeteer Engine...*\n*Wait 10-15 seconds.. 🤖*`);

  const finalDirectUrl = await bypassAndGetDirectLink(bot3Url);
  const targetLinkToSend = finalDirectUrl || bot3Url;

  reply(`*⬇️ Streaming & Sending Film Document to WhatsApp.. (${chosen.size})*\nPlease wait a moment.. 🍿`);

  const fileName = `${title} [${quality}] [CineSubz].mp4`
    .replace(/[^\w\s.\-\[\]()]/gi, "").trim();

  try {
    // 🎯 Browser Headers සමඟ Stream එක Download කර WhatsApp එකට Direct Pipe කිරීම
    const mediaStream = await axios({
      method: "get",
      url: targetLinkToSend,
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "https://cinesubz.lk/",
      },
      timeout: 120000,
    });

    await maliya.sendMessage(from, {
      document: mediaStream.data, // Direct Axios Stream
      mimetype: "video/mp4",
      fileName,
      caption:
        `*🎬 ${title}*\n` +
        `*📊 Quality:* ${quality}\n` +
        `*💾 Size:* ${chosen.size}\n\n` +
        `*Enjoy! 🍿*\n_Uploaded by MALIYA-MD_`,
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "🎉", key: mek.key } });

  } catch (err) {
    console.error("Stream Send Error:", err.message);
    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${chosen.size}\n\n` +
        `⚠️ Document send failed (Stream Connection Reset).\n\n📥 *Direct Link:*\n${targetLinkToSend}`,
    }, { quoted: mek });
  }
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
