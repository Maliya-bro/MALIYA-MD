/**
 * LK21 Movie Download Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Download engine : lk21dl-core  (npm install lk21dl-core)
 *                    Requires FFmpeg installed on the SYSTEM (not just npm)
 *                    for HLS/M3U8 titles — see FAQ in the package README.
 *
 *                    API shape (per README): lk21dl(url, outputPath?)
 *                    returns Promise<Readable> — a stream of the video
 *                    data, NOT a saved file path. We pipe it to disk
 *                    ourselves and wait for the write to finish before
 *                    treating the download as complete.
 *
 * Search           : puppeteer (the package only takes a movie page URL —
 *                    no search function in its README — so search is
 *                    implemented here separately, same pattern used for
 *                    the Sinhalasub/Films365 plugins).
 *
 * Flow: .lk21 <name> -> reply number (select) -> reply "y" -> bot downloads
 *       + sends the file as a WhatsApp document.
 *
 * NOTE ON SELECTORS: LK21 has many mirror domains and the search markup
 * below is a best-effort guess at a typical WordPress/movie-theme results
 * page. If search comes back empty, inspect the live search results page
 * in a browser (F12 → Inspect a result card) and update SEARCH_SELECTORS
 * below to match. The movie-page URL format itself (per the package's own
 * examples) looks like: https://tv.lk21official.us/movie-name-slug
 */

const { cmd } = require("../command");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const lk21dl = require("lk21dl-core");

const pendingSearch = {};
const pendingDownload = {};

// Update this to whichever LK21 mirror is currently reachable from your
// server — mirrors rotate/get taken down periodically.
const LK21_BASE = "https://tv.lk21official.us";

// Best-guess selectors for the search results page — update if search
// returns nothing (see NOTE above).
const SEARCH_SELECTORS = {
  resultCard: "article, .movie-item, .search-item, .box",
  titleLink: "a[href]",
};

// ─── Puppeteer-based search ─────────────────────────────────────────────────
async function searchLK21(query) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const searchUrl = `${LK21_BASE}/?s=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    const results = await page.$$eval(
      SEARCH_SELECTORS.resultCard,
      (cards, titleLinkSelector) =>
        cards
          .map((card, i) => {
            const a = card.querySelector(titleLinkSelector);
            if (!a) return null;
            const img = card.querySelector("img");
            return {
              id: i + 1,
              title: (a.getAttribute("title") || a.textContent || img?.alt || "").trim(),
              url: a.href,
              thumb: img?.src || "",
            };
          })
          .filter((r) => r && r.title && r.url),
      SEARCH_SELECTORS.titleLink
    );

    // De-dupe by URL, drop obvious non-movie links, cap to 10
    const seen = new Set();
    const deduped = [];
    for (const r of results) {
      if (seen.has(r.url) || r.url === LK21_BASE || r.url === `${LK21_BASE}/`) continue;
      seen.add(r.url);
      r.id = deduped.length + 1;
      deduped.push(r);
      if (deduped.length >= 10) break;
    }
    return deduped;
  } finally {
    await browser.close();
  }
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
        `_If this keeps happening even for popular titles, the search page ` +
        `markup may have changed — this plugin needs its selectors updated._`
      );
    }

    let text = `*🎬 LK21 Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r) => { text += `*${r.id}.* ${r.title}\n`; });
    text += `\n*📌 Reply with the number to select.*`;

    pendingSearch[sender] = { results, timestamp: Date.now() };
    await maliya.sendMessage(from, { text }, { quoted: mek });

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    console.log("[lk21] search error:", e.message);
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. SELECTION HANDLER (filter-based) ─────────────────────────────────
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
    `_(HLS titles are re-encoded via FFmpeg and can take several minutes — 2181 segments isn't unusual for a 2hr movie.)_`
  );
});

// ─── 💬 3. DOWNLOAD CONFIRMATION HANDLER ────────────────────────────────────
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
  reply(`*⏳ Resolving iframe → bypassing Cloudflare → downloading...*\nThis can take a few minutes for HLS titles — please wait. 🙏`);

  const cleanFileName = `${session.title}.mp4`.replace(/[^\w\s.\-\[\]()]/gi, "").trim();
  const outputPath = path.join(__dirname, cleanFileName);

  try {
    // lk21dl(url, outputPath) resolves with a Readable STREAM (per its
    // README), not a saved file — we own writing it to disk and must wait
    // for the write to actually finish before touching the file.
    const videoStream = await lk21dl(session.url, outputPath);

    if (!videoStream || typeof videoStream.pipe !== "function") {
      return reply(`*❌ Download did not return a valid stream.*\n\n🔗 Try manually:\n${session.url}`);
    }

    const writer = fs.createWriteStream(outputPath);
    videoStream.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      videoStream.on("error", reject);
    });

    if (!fs.existsSync(outputPath)) {
      return reply(`*❌ Download did not produce a file.*\n\n🔗 Try manually:\n${session.url}`);
    }

    const stats = fs.statSync(outputPath);
    if (stats.size < 100 * 1024) {
      fs.unlinkSync(outputPath);
      return reply(`*❌ Downloaded file too small (${(stats.size / 1024).toFixed(1)}KB) — likely failed.*\n\n🔗 Try manually:\n${session.url}`);
    }

    reply(`*⬆️ Uploading movie file to WhatsApp...*`);

    await maliya.sendMessage(from, {
      document: { url: outputPath },
      mimetype: "video/mp4",
      fileName: cleanFileName,
      caption: `*🎬 ${session.title}*\n\n_Delivered by MALIYA-MD_`,
    }, { quoted: mek });

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  } catch (err) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    console.log("[lk21] download error:", err.message);
    console.log("[lk21] stack:", err.stack);

    // The package's own error-handling table names these specific failure
    // modes — surface them plainly instead of a generic message.
    let hint = "";
    if (/iframe/i.test(err.message)) hint = "\n_Page structure may have changed, or the URL is stale._";
    else if (/video url/i.test(err.message)) hint = "\n_Player may need manual interaction — try opening the link in a browser._";
    else if (/ffmpeg/i.test(err.message)) hint = "\n_Check that FFmpeg is installed on the server (`ffmpeg -version`)._";

    reply(
      `*⚠️ Download Failed.*\n*Reason:* ${err.message}${hint}\n\n🔗 Try manually:\n${session.url}`
    );
  }
});

// Session expiry — 10 minutes (downloads can be slow, give more headroom
// than the quick-lookup plugins)
setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingDownload) if (now - pendingDownload[s].timestamp > ttl) delete pendingDownload[s];
}, 60000);

module.exports = { pendingSearch, pendingDownload };
