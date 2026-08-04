/**
 * LK21 Movie Download Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * - Search uses Puppeteer (with robust fallback selectors)
 * - Download uses lk21dl-core + FFmpeg (system install required)
 *
 * ✅ Fixed: dynamic content waiting, fallback mirrors, multiple selectors
 */

const { cmd } = require("../command");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const lk21dl = require("lk21dl-core");

const pendingSearch = {};
const pendingDownload = {};

// ─── 🎯 PRIMARY MIRROR (update if down) ────────────────────────────────────
const MIRRORS = [
  "https://tv.lk21official.us",
  "https://lk21official.us",
  "https://www.lk21official.us",
  "https://tv.lk21official.org",
  "https://lk21official.org"
];

// ─── 🔍 SEARCH SELECTORS (try multiple) ────────────────────────────────────
const RESULT_SELECTORS = [
  "article",
  ".movie-item",
  ".search-item",
  ".box",
  "div.item",
  "div.result-item",
  "li",
  ".list-movie article",
  ".movie-list article",
  ".post-item"
];

// ─── SEARCH FUNCTION (with fallback mirrors & robust waiting) ─────────────
async function searchLK21(query) {
  let browser;
  let lastError = null;

  for (const baseUrl of MIRRORS) {
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for ANY of the possible result containers
      let found = false;
      for (const sel of RESULT_SELECTORS) {
        try {
          await page.waitForSelector(sel, { timeout: 8000 });
          found = true;
          break;
        } catch (_) {}
      }

      if (!found) {
        // Maybe the page is still loading – try a generic wait
        await page.waitForFunction(
          () => document.querySelectorAll("a[href]").length > 5,
          { timeout: 10000 }
        );
      }

      // Extract results using all selectors combined
      const results = await page.$$eval(
        RESULT_SELECTORS.join(","),
        (elements) =>
          elements
            .map((el) => {
              const a = el.querySelector("a[href]");
              if (!a) return null;
              const img = el.querySelector("img");
              const title =
                a.getAttribute("title") ||
                a.textContent.trim() ||
                img?.alt ||
                "";
              return {
                title: title,
                url: a.href,
                thumb: img?.src || "",
              };
            })
            .filter((r) => r && r.title && r.url)
      );

      // Deduplicate by URL
      const seen = new Set();
      const deduped = [];
      for (const r of results) {
        if (!seen.has(r.url) && r.url !== baseUrl && !r.url.endsWith("/")) {
          seen.add(r.url);
          r.id = deduped.length + 1;
          deduped.push(r);
          if (deduped.length >= 10) break;
        }
      }

      if (deduped.length > 0) {
        return deduped;
      } else {
        // No results on this mirror, try next
        await browser.close();
        continue;
      }
    } catch (err) {
      lastError = err;
      if (browser) await browser.close().catch(() => {});
      continue; // try next mirror
    }
  }

  throw new Error(
    `No results found on any mirror. Last error: ${lastError?.message || "unknown"}`
  );
}

// ─── 💬 1. SEARCH COMMAND ────────────────────────────────────────────────────
cmd({
  pattern: "lk21",
  alias: ["lk21dl"],
  react: "🎬",
  desc: "Search & download movies from LK21",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .lk21 <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await searchLK21(q);
    if (!results.length) {
      return reply(
        `*❌ No results found for "${q}"*\n\n` +
        `_Try a different spelling or use a specific year._`
      );
    }

    let text = `*🎬 LK21 Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r) => { text += `*${r.id}.* ${r.title}\n`; });
    text += `\n*📌 Reply with the number to select.*`;

    pendingSearch[sender] = { results, timestamp: Date.now() };
    await maliya.sendMessage(from, { text }, { quoted: mek });

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    console.error("[lk21] search error:", e.message);
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. SELECTION HANDLER ─────────────────────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingSearch[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingSearch[sender].results.length;
  },
  filename: __filename,
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingSearch[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selected = session.results[index];
  delete pendingSearch[sender];

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  pendingDownload[sender] = {
    title: selected.title,
    url: selected.url,
    timestamp: Date.now(),
  };

  reply(
    `*🎬 ${selected.title}*\n${"─".repeat(28)}\n\n` +
    `*📌 Reply "y" to download and send this movie.*\n` +
    `_(HLS titles are re-encoded via FFmpeg – can take several minutes.)_`
  );
});

// ─── 💬 3. DOWNLOAD CONFIRMATION ────────────────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingDownload[sender]) return false;
    return /^y(es)?$/i.test((text || "").trim());
  },
  filename: __filename,
}, async (maliya, mek, m, { sender, from, reply }) => {
  const session = pendingDownload[sender];
  if (!session) return;
  delete pendingDownload[sender];

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply(`*⏳ Resolving iframe → downloading...*\nThis may take a few minutes – please wait. 🙏`);

  const cleanFileName = `${session.title}.mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
  const outputPath = path.join(__dirname, cleanFileName);

  try {
    const videoStream = await lk21dl(session.url, outputPath);
    if (!videoStream || typeof videoStream.pipe !== "function") {
      return reply(`*❌ Download stream invalid.*\n\n🔗 Try manually:\n${session.url}`);
    }

    const writer = fs.createWriteStream(outputPath);
    videoStream.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      videoStream.on("error", reject);
    });

    if (!fs.existsSync(outputPath)) {
      return reply(`*❌ No file produced.*\n\n🔗 Try manually:\n${session.url}`);
    }

    const stats = fs.statSync(outputPath);
    if (stats.size < 100 * 1024) {
      fs.unlinkSync(outputPath);
      return reply(`*❌ File too small (${(stats.size / 1024).toFixed(1)}KB) – download failed.*\n\n🔗 Try manually:\n${session.url}`);
    }

    reply(`*⬆️ Uploading movie...*`);

    await maliya.sendMessage(from, {
      document: { url: outputPath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${session.title}*\n\n_Delivered by MALIYA-MD_`,
    }, { quoted: mek });

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  } catch (err) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    console.error("[lk21] download error:", err.message);
    let hint = "";
    if (/iframe/i.test(err.message)) hint = "\n_Page structure may have changed._";
    else if (/video url/i.test(err.message)) hint = "\n_Player may need manual interaction._";
    else if (/ffmpeg/i.test(err.message)) hint = "\n_Check FFmpeg is installed (`ffmpeg -version`)._";
    reply(`*⚠️ Download Failed.*\n*Reason:* ${err.message}${hint}\n\n🔗 Try manually:\n${session.url}`);
  }
});

// ─── SESSION EXPIRY (10 min) ────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingDownload) if (now - pendingDownload[s].timestamp > ttl) delete pendingDownload[s];
}, 60000);

module.exports = { pendingSearch, pendingDownload };
