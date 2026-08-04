/**
 * CineSubz.lk Ultimate Scraper Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Search + Metadata : cinesubz-scraper (by VajiraOfficial)
 * Selection matching : filter-based (reliable — works whether or not the
 *                       user quote-replies, unlike strict stanzaId matching)
 * Flow: .film <name> -> reply number (select) -> reply number (quality)
 *       -> bot sends the CineSubz page link for manual download
 *
 * NOTE: Auto-download via cinesubz-scraper's server-link decryption
 * (scrapeCineSubzServerLink) was removed — CineSubz's bot3.sonic-cloud.online
 * file servers are currently returning "Invalid server" errors across every
 * title (confirmed by opening a resolved link directly in a browser), so the
 * decrypted links the package returns are not reliably usable. Until that's
 * fixed upstream, the bot points the user to the CineSubz page instead of
 * silently failing on a dead auto-download.
 */

const { cmd } = require("../command");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");

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
    msg += `\n*📌 Note:* Reply with the quality number.`;

    const sentQualityMsg = await maliya.sendMessage(from, { text: msg }, { quoted: mek });

    pendingQuality[sender] = {
      title: metadata.title || selectedMovie.title,
      pageUrl: selectedMovie.url,
      links: metadata.downloadLinks,
      messageId: sentQualityMsg?.key?.id || null,
      timestamp: Date.now(),
    };

  } catch (e) {
    return reply(`*❌ Metadata Error:* ${e.message}`);
  }
});

// ─── 💬 3. QUALITY SELECTION HANDLER — sends the CineSubz page link ────────
// The bot3.sonic-cloud.online server links that cinesubz-scraper resolves
// are frequently stale/broken on CineSubz's backend (server IDs get
// decommissioned), returning an "Invalid server" page instead of the file —
// this happens across every title, not just specific ones. Rather than
// silently failing on auto-download, we send the user directly to the
// CineSubz movie page so they can grab the current working download link
// themselves in a browser.
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

  await maliya.sendMessage(from, { react: { text: "🔗", key: mek.key } });

  reply(
    `*🎬 ${session.title}*\n*📊 Quality:* ${chosenLink.quality}\n${"─".repeat(28)}\n\n` +
    `*⚠️ CineSubz's auto-download server links are currently unreliable ` +
    `("Invalid server" errors), so downloads are manual for now:*\n\n` +
    `1️⃣ Open this page:\n${session.pageUrl}\n\n` +
    `2️⃣ Scroll to the *${chosenLink.quality}* download section\n` +
    `3️⃣ Tap the working download/Telegram link shown there\n\n` +
    `_This avoids sending you dead server links that don't work._`
  );
});

// Session expiry — 5 minutes
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 60000);

module.exports = { pendingSearch, pendingQuality };
