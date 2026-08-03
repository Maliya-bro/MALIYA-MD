/**
 * FILMS365.org Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Search: puppeteer (films365.org is a JS-rendered React/Next.js site,
 *         so results can't be scraped with plain axios/cheerio)
 * Metadata + downloadUrl: films365-scraper package (scrapeMovieData)
 * Flow: .f365 <name> -> reply with number (Select) -> reply "y" to confirm download
 *
 * NOTE: films365-scraper only exposes scrapeMovieData(url) — there is no
 * built-in search function in the package, so search is implemented here
 * separately using puppeteer against films365.org's search/explore pages.
 */

const { cmd } = require("../command");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { scrapeMovieData } = require("films365-scraper");

const pendingSearch = {};
const pendingDownload = {};

// ─── Puppeteer-based search (films365.org renders results client-side) ─────
async function searchFilms365(query) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const searchUrl = `https://www.films365.org/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Give client-side rendering a moment to populate results
    await new Promise(r => setTimeout(r, 3000));

    // NOTE: these selectors are best-guess for a typical Next.js movie-card
    // grid. If films365.org changes markup, inspect the page and adjust
    // the selectors below (right-click a movie card -> Inspect).
    const results = await page.$$eval("a[href*='/movie/']", (anchors) =>
      anchors.slice(0, 10).map((a, i) => {
        const img = a.querySelector("img");
        const titleEl = a.querySelector("[class*='title']") || a;
        return {
          id: i + 1,
          title: (titleEl.textContent || img?.alt || "").trim(),
          url: a.href,
          thumb: img?.src || "",
        };
      }).filter(r => r.title && r.url)
    );

    return results;
  } finally {
    await browser.close();
  }
}

// ─── 💬 1. SEARCH COMMAND ────────────────────────────────────────────────────
cmd({
  pattern: "f365",
  alias: ["films365"],
  react: "🎬",
  desc: "Search movies from FILMS365.org",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .f365 <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await searchFilms365(q);
    if (!results.length) return reply(`*❌ No results found for "${q}"*`);

    let text = `*🎬 FILMS365 Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach(r => { text += `*${r.id}.* ${r.title}\n`; });
    text += `\n*📌 Reply with the number to select.*`;

    pendingSearch[sender] = { results, timestamp: Date.now() };
    await maliya.sendMessage(from, { text }, { quoted: mek });

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. SELECTION HANDLER (filter-based, same reliable pattern as cinesubz.js) ──
cmd({
  filter: (text, { sender }) => {
    if (!pendingSearch[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingSearch[sender].results.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingSearch[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selected = session.results[index];
  delete pendingSearch[sender];

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    const metadata = await scrapeMovieData(selected.url);
    if (!metadata || !metadata.downloadUrl) {
      return reply("*❌ No download link found for this title.*");
    }

    let msg = `*🎬 ${metadata.title || selected.title}*\n${"─".repeat(32)}\n`;
    if (metadata.rate) msg += `⭐ *Rating:* ${metadata.rate}\n`;
    if (metadata.duration) msg += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.date) msg += `📅 *Release:* ${metadata.date}\n`;
    if (metadata.desc) msg += `\n📝 ${metadata.desc.slice(0, 300)}${metadata.desc.length > 300 ? "..." : ""}\n`;
    msg += `\n*📌 Reply "y" to download this movie.*`;

    pendingDownload[sender] = {
      title: metadata.title || selected.title,
      downloadUrl: metadata.downloadUrl,
      timestamp: Date.now()
    };

    await maliya.sendMessage(from, { text: msg }, { quoted: mek });

  } catch (e) {
    return reply(`*❌ Metadata Error:* ${e.message}`);
  }
});

// ─── 💬 3. DOWNLOAD CONFIRMATION HANDLER ────────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingDownload[sender]) return false;
    return /^y(es)?$/i.test((text || "").trim());
  },
  filename: __filename
}, async (maliya, mek, m, { sender, from, reply }) => {
  const session = pendingDownload[sender];
  if (!session) return;
  delete pendingDownload[sender];

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });
  reply(`*⏳ Fetching download link...*`);

  const cleanFileName = `${session.title}.mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
  const tempFilePath = path.join(__dirname, cleanFileName);

  try {
    const response = await axios({
      method: 'get',
      url: session.downloadUrl,
      responseType: 'stream',
      timeout: 120000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.films365.org/',
        'Accept': '*/*'
      }
    });

    // Guard against error pages disguised as 200 OK responses
    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const contentLength = parseInt(response.headers['content-length'] || '0');

    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return reply(`*❌ Server rejected direct download (blocked/expired link).*\n\n🔗 Try manually:\n${session.downloadUrl}`);
    }
    if (contentLength > 0 && contentLength < 100 * 1024) {
      return reply(`*❌ File too small (${(contentLength / 1024).toFixed(1)}KB) — likely an error page.*\n\n🔗 Try manually:\n${session.downloadUrl}`);
    }

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

    const stats = fs.statSync(tempFilePath);
    if (stats.size < 100 * 1024) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return reply(`*❌ Downloaded file too small (${(stats.size / 1024).toFixed(1)}KB) — likely an error page.*\n\n🔗 Try manually:\n${session.downloadUrl}`);
    }

    reply(`*⬆️ Uploading movie file to WhatsApp...*`);

    await maliya.sendMessage(from, {
      document: { url: tempFilePath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${session.title}*\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.log("❌ FILMS365 Download Error:", err.message);
    reply(`*⚠️ Direct Upload Failed.*\n*Reason:* ${err.message}\n\n🔗 Download Link:\n${session.downloadUrl}`);
  }
});

// Session expiry — 5 minutes
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingDownload) if (now - pendingDownload[s].timestamp > ttl) delete pendingDownload[s];
}, 60000);

module.exports = { pendingSearch, pendingDownload };
