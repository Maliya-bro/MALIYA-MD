/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Search + Metadata : cinesubz-scraper (by VajiraOfficial)
 * Server-Link Resolve: my-cloudflare-scraper (Playwright, bypasses Cloudflare
 *                       challenge on the intermediate server page and reads
 *                       the real file URL out of its `download()` script)
 * Selection matching : filter-based (reliable — works whether or not the
 *                       user quote-replies, unlike strict stanzaId matching)
 * Flow: .film <name> -> reply number (select) -> reply number (quality) -> download
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require("cinesubz-scraper");
const { scrapePage } = require("my-cloudflare-scraper");

// Session tracking
const pendingSearch = {};
const pendingQuality = {};

// Helper: clean up messy titles from search results
function cleanTitle(t = "") {
  return t
    .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
    .replace(/sinhala subtitles?.*/i, "")
    .replace(/සිංහල.*/i, "")
    .replace(/\|.*/i, "")
    .replace(/[-–]\s*$/, "")
    .trim();
}

// ─── 💬 1. MAIN FILM SEARCH COMMAND ──────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["movie", "cinema", "cine"],
  react: "🎬",
  desc: "Search movies from CineSubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await searchCineSubz(q);
    if (!results || !results.length) return reply(`*❌ No results found for "${q}"*`);

    let text = `*🎬 MALIYA-MD Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}.* ${cleanTitle(r.title)} ${r.rating ? `[⭐ ${r.rating}]` : ""}\n`;
    });
    text += `\n*📌 Note:* Reply with the number to select.`;

    const sent = await maliya.sendMessage(from, { text }, { quoted: mek });

    pendingSearch[sender] = {
      results,
      messageId: sent?.key?.id || null,
      timestamp: Date.now(),
    };

  } catch (e) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
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
  const selectedMovie = session.results[index];
  delete pendingSearch[sender];

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    const metadata = await scrapeCineSubz(selectedMovie.url);
    if (!metadata.downloadLinks || !metadata.downloadLinks.length) {
      return reply("*❌ Download links no longer available.*");
    }

    let msg = `*🎬 ${metadata.title || selectedMovie.title}*\n${"─".repeat(32)}\n`;
    if (metadata.imdb_rate) msg += `⭐ *IMDb:* ${metadata.imdb_rate}\n`;
    if (metadata.duration) msg += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.genre) msg += `🎭 *Genre:* ${metadata.genre}\n\n`;

    msg += `*📥 Quality Select:*\n`;
    metadata.downloadLinks.forEach((l, i) => {
      msg += `*${i + 1}.* ${l.quality}\n`;
    });
    msg += `\n*📌 Note:* Reply with the quality number to download.`;

    const sentQualityMsg = await maliya.sendMessage(from, { text: msg }, { quoted: mek });

    pendingQuality[sender] = {
      title: metadata.title || selectedMovie.title,
      links: metadata.downloadLinks,
      messageId: sentQualityMsg?.key?.id || null,
      timestamp: Date.now(),
    };

  } catch (e) {
    return reply(`*❌ Metadata Error:* ${e.message}`);
  }
});

// ─── 💬 3. QUALITY / DOWNLOAD HANDLER ───────────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingQuality[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingQuality[sender].links.length;
  },
  filename: __filename,
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingQuality[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const chosenLink = session.links[index];
  delete pendingQuality[sender];

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });
  reply(`*⏳ Bypassing Cloudflare & resolving direct link...*`);

  const cleanFileName = `${session.title} [${chosenLink.quality}].mp4`
    .replace(/[^\w\s.\-\[\]()]/gi, "")
    .trim();
  const tempFilePath = path.join(__dirname, cleanFileName);

  try {
    // CineSubz's own server links look like:
    //   https://bot3.sonic-cloud.online/serverX/.../Name-[CineSubz.co]-480p?ext=mp4
    // — the extension is in a ?ext= query param, NOT the path, so a plain
    // .mp4/.mkv path-suffix check misses these. Detect them separately and
    // resolve with cinesubz-scraper's own decryptor (per its README), which
    // knows this exact URL shape and returns { title, size, telegram }.
    const isSonicCloudLink = /bot\d*\.sonic-cloud\.online/i.test(chosenLink.directUrl);
    const isPlainDirectFile = /\.(mp4|mkv|avi|mov)(\?.*)?$/i.test(chosenLink.directUrl);

    let finalDownloadUrl = null;
    let telegramLink = null;
    let sizeInfo = chosenLink.size || null;

    if (isSonicCloudLink) {
      const decrypted = await scrapeCineSubzServerLink(chosenLink.directUrl);

      if (!decrypted) {
        return reply(
          `*❌ Could not decrypt the server link.*\n\n🔗 Try manually:\n${chosenLink.directUrl}`
        );
      }

      if (decrypted.size) sizeInfo = decrypted.size;

      // The package's dl example shows this returns a Telegram link, not a
      // raw file URL — there's no separate "directUrl" field in its output.
      if (decrypted.telegram) telegramLink = decrypted.telegram;
      if (decrypted.directUrl) finalDownloadUrl = decrypted.directUrl;

      if (!finalDownloadUrl && !telegramLink) {
        return reply(
          `*❌ Decryption returned no usable link.*\n\n🔗 Try manually:\n${chosenLink.directUrl}`
        );
      }

      // If we only got a Telegram link, we can't stream/upload it directly —
      // hand it to the user instead of trying (and failing) to axios-download it.
      if (!finalDownloadUrl && telegramLink) {
        return reply(
          `*📲 Telegram Stream Link:*\n${telegramLink}\n*(Size: ${sizeInfo || "Unknown"})*\n\n_This title is only available via Telegram — open the link above to get it._`
        );
      }

    } else if (isPlainDirectFile) {
      // Already a genuine direct file link — nothing to resolve.
      finalDownloadUrl = chosenLink.directUrl;

    } else {
      // Some other kind of intermediate/landing page — fall back to the
      // Cloudflare-aware resolver.
      const resolved = await scrapePage(chosenLink.directUrl, { timeout: 60000 });

      if (!resolved || !resolved.directUrl) {
        return reply(
          `*❌ Could not resolve the direct link (page structure may have changed).*\n\n🔗 Try manually:\n${chosenLink.directUrl}`
        );
      }

      finalDownloadUrl = resolved.directUrl;
      if (resolved.size && resolved.size !== "N/A") sizeInfo = resolved.size;
    }

    reply(`*⏳ Downloading movie...*`);

    // File Download Stream
    const response = await axios({
      method: "get",
      url: finalDownloadUrl,
      responseType: "stream",
      timeout: 120000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Referer: "https://cinesubz.lk/",
        Accept: "*/*",
      },
    });

    // Guard against error pages disguised as 200 OK responses
    const contentType = (response.headers["content-type"] || "").toLowerCase();
    const contentLength = parseInt(response.headers["content-length"] || "0");

    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      return reply(
        `*❌ Server rejected direct download (blocked/expired link).*\n*Content-Type:* ${contentType}\n\n🔗 Try manually:\n${finalDownloadUrl}`
      );
    }
    if (contentLength > 0 && contentLength < 100 * 1024) {
      return reply(
        `*❌ File too small (${(contentLength / 1024).toFixed(1)}KB) — likely an error page.*\n\n🔗 Try manually:\n${finalDownloadUrl}`
      );
    }

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    await new Promise((res, rej) => {
      writer.on("finish", res);
      writer.on("error", rej);
    });

    // Post-download size sanity check
    const stats = fs.statSync(tempFilePath);
    if (stats.size < 100 * 1024) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return reply(
        `*❌ Downloaded file too small (${(stats.size / 1024).toFixed(1)}KB) — likely an error page, not the movie.*\n\n🔗 Try manually:\n${finalDownloadUrl}`
      );
    }

    reply(`*⬆️ Uploading movie file to WhatsApp...*`);

    await maliya.sendMessage(
      from,
      {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName: cleanFileName,
        caption: `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n*💾 Size:* ${sizeInfo || "N/A"}\n\n_Delivered by MALIYA-MD_`,
      },
      { quoted: mek }
    );

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

  } catch (err) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.log("❌ CineSubz Download Error:", err.message);
    console.log("❌ Stack:", err.stack);
    reply(
      `*⚠️ Direct Upload Failed.*\n*Reason:* ${err.message}\n\n🔗 Download Link:\n${chosenLink.directUrl}`
    );
  }
});

// Session expiry — 5 minutes
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);

module.exports = { pendingSearch, pendingQuality };
