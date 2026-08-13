/**
 * Sinhalasub.lk Movie Downloader Plugin for MALIYA-MD / DANUWA-MD
 * ────────────────────────────────────────────────────────────────────────
 * Required Packages:
 * npm install axios puppeteer
 */

const { cmd } = require("../command");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

const pendingSearch = {};
const pendingQuality = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeQuality(text) {
  if (!text) return null;
  text = text.toUpperCase();
  if (/1080|FHD/.test(text)) return "1080p";
  if (/720|HD/.test(text)) return "720p";
  if (/480|SD/.test(text)) return "480p";
  return text;
}

function getDirectPixeldrainUrl(url) {
  if (!url) return null;
  const match = url.match(/pixeldrain\.com\/u\/(\w+)/);
  if (!match) return null;
  return `https://pixeldrain.com/api/file/${match[1]}?download`;
}

// ─── Scrapers ─────────────────────────────────────────────────────────────────

async function searchMovies(query) {
  const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}&post_type=movies`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
  const results = await page.$$eval(".display-item .item-box", boxes =>
    boxes.slice(0, 10).map((box, index) => {
      const a = box.querySelector("a");
      const img = box.querySelector(".thumb");
      const lang = box.querySelector(".item-desc-giha .language")?.textContent || "";
      const quality = box.querySelector(".item-desc-giha .quality")?.textContent || "";
      const qty = box.querySelector(".item-desc-giha .qty")?.textContent || "";
      return {
        id: index + 1,
        title: a?.title?.trim() || "",
        movieUrl: a?.href || "",
        thumb: img?.src || "",
        language: lang.trim(),
        quality: quality.trim(),
        qty: qty.trim(),
      };
    }).filter(m => m.title && m.movieUrl)
  );

  await browser.close();
  return results;
}

async function getMovieMetadata(url) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  const metadata = await page.evaluate(() => {
    const getText = el => el?.textContent.trim() || "";
    const getList = selector => Array.from(document.querySelectorAll(selector)).map(el => el.textContent.trim());
    const title = getText(document.querySelector(".info-details .details-title h3"));
    let language = "", directors = [], stars = [];

    document.querySelectorAll(".info-col p").forEach(p => {
      const strong = p.querySelector("strong");
      if (!strong) return;
      const txt = strong.textContent.trim();
      if (txt.includes("Language:")) language = strong.nextSibling?.textContent?.trim() || "";
      if (txt.includes("Director:")) directors = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
      if (txt.includes("Stars:")) stars = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
    });

    const duration = getText(document.querySelector(".info-details .data-views[itemprop='duration']"));
    const imdb = getText(document.querySelector(".info-details .data-imdb"))?.replace("IMDb:", "").trim();
    const genres = getList(".details-genre a");
    const thumbnail = document.querySelector(".splash-bg img")?.src || "";

    return { title, language, duration, imdb, genres, directors, stars, thumbnail };
  });

  await browser.close();
  return metadata;
}

async function getPixeldrainLinks(movieUrl) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 30000 });
  const linksData = await page.$$eval(".link-pixeldrain tbody tr", rows =>
    rows.map(row => {
      const a = row.querySelector(".link-opt a");
      const quality = row.querySelector(".quality")?.textContent.trim() || "";
      const size = row.querySelector("td:nth-child(3) span")?.textContent.trim() || "";
      return { pageLink: a?.href || "", quality, size };
    })
  );

  const directLinks = [];
  for (const l of linksData) {
    try {
      const subPage = await browser.newPage();
      await subPage.goto(l.pageLink, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 10000));
      
      const finalUrl = await subPage.$eval(".wait-done a[href]", el => el.href).catch(() => null);
      if (finalUrl) {
        let sizeMB = 0;
        const sizeText = l.size.toUpperCase();
        if (sizeText.includes("GB")) sizeMB = parseFloat(sizeText) * 1024;
        else if (sizeText.includes("MB")) sizeMB = parseFloat(sizeText);

        if (sizeMB <= 2048) {
          directLinks.push({ link: finalUrl, quality: normalizeQuality(l.quality), size: l.size });
        }
      }
      await subPage.close();
    } catch (e) { continue; }
  }

  await browser.close();
  return directLinks;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

// Step 1: Movie Search
cmd({
  pattern: "movie",
  alias: ["sinhalasub", "films", "cinema"],
  react: "🎬",
  desc: "Search and send movies from Sinhalasub.lk",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply(`*🎬 Movie Search Plugin*\n\nUsage: .movie <movie_name>\nExample: .movie avengers`);

  reply("*🔍 Searching for movies...*");
  
  let searchResults;
  try {
    searchResults = await searchMovies(q);
  } catch (e) {
    return reply(`*❌ Search Error:* ${e.message}`);
  }

  if (!searchResults || !searchResults.length) return reply("*❌ No movies found!*");

  pendingSearch[sender] = { results: searchResults, timestamp: Date.now() };

  let text = "*🎬 Search Results:*\n\n";
  searchResults.forEach((m, i) => {
    text += `*${i + 1}.* ${m.title}\n   📝 Language: ${m.language}\n   📊 Quality: ${m.quality}\n   🎞️ Format: ${m.qty}\n\n`;
  });
  text += `*Reply with movie number (1-${searchResults.length})*`;
  reply(text);
});

// Step 2: Movie Selection
cmd({
  filter: (text, { sender }) => pendingSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingSearch[sender].results.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  delete pendingSearch[sender];

  reply("*⏳ Fetching movie details & download links...*");

  let metadata;
  try {
    metadata = await getMovieMetadata(selected.movieUrl);
  } catch (e) {
    return reply(`*❌ Error fetching details:* ${e.message}`);
  }

  let msg = `*🎬 ${metadata.title}*\n\n`;
  msg += `*📝 Language:* ${metadata.language}\n*⏱️ Duration:* ${metadata.duration}\n*⭐ IMDb:* ${metadata.imdb}\n`;
  msg += `*🎭 Genres:* ${metadata.genres.join(", ")}\n*🎥 Directors:* ${metadata.directors.join(", ")}\n*🌟 Stars:* ${metadata.stars.slice(0, 5).join(", ")}${metadata.stars.length > 5 ? "..." : ""}\n\n`;

  const downloadLinks = await getPixeldrainLinks(selected.movieUrl);
  if (!downloadLinks.length) return reply("*❌ No download links found under 2GB!*");

  pendingQuality[sender] = { movie: { metadata, downloadLinks }, timestamp: Date.now() };

  let qualityMsg = msg + "*📥 Available Qualities (Max 2GB):*\n";
  downloadLinks.forEach((d, i) => qualityMsg += `*${i + 1}.* ${d.quality} - ${d.size}\n`);
  qualityMsg += `\n*Reply with quality number to receive the movie as a document.*`;

  if (metadata.thumbnail) {
    await danuwa.sendMessage(from, { image: { url: metadata.thumbnail }, caption: qualityMsg }, { quoted: mek });
  } else {
    await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
  }
});

// Step 3: Quality Select -> Temp Download -> Send WhatsApp Document
cmd({
  filter: (text, { sender }) => pendingQuality[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingQuality[sender].movie.downloadLinks.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];

  const selectedLink = movie.downloadLinks[index];
  let directUrl = getDirectPixeldrainUrl(selectedLink.link) || selectedLink.link;

  // 🎯 Fix 1: Link එක Relative Path එකක් නං Full Domain එක එකතු කිරීම
  if (directUrl && directUrl.startsWith("/")) {
    directUrl = `https://bot3.sonic-cloud.online${directUrl}`;
  }

  reply(`*⬇️ Downloading movie to server temp storage...*\n📊 *Quality:* ${selectedLink.quality} | 💾 *Size:* ${selectedLink.size}\n\nPlease wait a moment.. 🍿`);

  const cleanFileName = `${movie.metadata.title} - ${selectedLink.quality}.mp4`.replace(/[^\w\s.-]/gi, '').trim();
  const tempFilePath = path.join(os.tmpdir(), `movie_${Date.now()}.mp4`);

  try {
    // 🎯 Fix 2: Axios Stream හරහා Temp File එක Save කිරීම
    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios({
      url: directUrl,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://sinhalasub.lk/"
      }
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    reply(`*📤 Sending document to WhatsApp...* 🚀`);

    // 🎯 Fix 3: Saved Temp File එක WhatsApp Document එකක් විදිහට Send කිරීම
    await danuwa.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${movie.metadata.title}*\n*📊 Quality:* ${selectedLink.quality}\n*💾 Size:* ${selectedLink.size}\n\n*Enjoy your movie! 🍿*\n_Uploaded by MALIYA-MD_`
    }, { quoted: mek });

    await danuwa.sendMessage(from, { react: { text: "🎉", key: m.key } });

  } catch (error) {
    console.error("Send document error:", error);
    reply(`*❌ Failed to send movie:* ${error.message || "Unknown error"}\n\n📥 *Direct Link:*\n${directUrl}`);
  } finally {
    // 🎯 Fix 4: Send වීමෙන් පසු Temp File එක Delete කිරීම
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000; // 10 Minutes TTL
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
