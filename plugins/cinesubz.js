/**
 * 🎬 Subz.lk Downloader with Fallback Scraper & WebTorrent
 * ─────────────────────────────────────────────────────────────
 * Fixed: Nexara 500 Error Fix using Direct Axios Fallback
 */

const { cmd } = require("../command");
const SubzLK = require("subz.lk");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const pendingSubzSessions = {};

// 🔍 Direct Axios Search Fallback (500 Error එක ආවොත් වැඩ කරන ක්‍රමය)
async function fallbackSearch(query) {
  const searchUrl = `https://subz.lk/?s=${encodeURIComponent(query)}`;
  const { data } = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const $ = cheerio.load(data);
  const results = [];

  $('article, .post, .type-post').each((i, el) => {
    const title = $(el).find('.entry-title, .post-title, h2, h3').text().trim();
    const url = $(el).find('a').attr('href');
    const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

    if (title && url) {
      results.push({
        title,
        url,
        image: image || '',
        category: 'Movie/TV'
      });
    }
  });

  return results;
}

// ─── 1. COMMAND: SEARCH ──────────────────────────────────────────
cmd({
  pattern: "film",
  alias: ["subz", "subtl"],
  react: "🎬",
  desc: "Search movies on subz.lk",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .film <movie name>*\n\n_Example: .film Spider Man_");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  let results = [];

  // Try 1: SubzLK Package
  try {
    results = await SubzLK.search(q);
  } catch (err) {
    console.log("⚠️ SubzLK Package Failed (500 Error). Trying Fallback Scraper...");
    try {
      results = await fallbackSearch(q);
    } catch (fallbackErr) {
      console.error("❌ Fallback Search Error:", fallbackErr.message);
    }
  }

  if (!results || results.length === 0) {
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ "${q}" සඳහා කිසිදු චිත්‍රපටයක් subz.lk හි හමුවූයේ නැත.*`);
  }

  const topResults = results.slice(0, 10);

  let text = `*🎬 SUBZ.LK MOVIE SEARCH RESULTS*\n${"─".repeat(30)}\n\n`;
  topResults.forEach((r, i) => {
    text += `*${i + 1}.* ${r.title}\n`;
  });
  text += `\n*📌 Reply with the number (1-${topResults.length}) to download Subtitle & Torrent Video.*`;

  const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

  pendingSubzSessions[sender] = {
    results: topResults,
    messageId: sentMsg?.key?.id || null,
    timestamp: Date.now()
  };
});

// ─── 2. REPLY SELECTION HANDLER ──────────────────────────────────
cmd({
  filter: (text, { sender }) => {
    if (!pendingSubzSessions[sender]) return false;
    const n = parseInt((text || "").trim());
    return !isNaN(n) && n > 0 && n <= pendingSubzSessions[sender].results.length;
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  const session = pendingSubzSessions[sender];
  if (!session) return;

  const index = parseInt(body.trim()) - 1;
  const selected = session.results[index];
  delete pendingSubzSessions[sender];

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    const details = await SubzLK.getMovie(selected.url);

    let caption = `*🎬 ${details.title}*\n${"─".repeat(30)}\n`;
    if (details.author) caption += `✍️ *Author:* ${details.author}\n`;
    caption += `\n📥 *Downloading Subtitle & Converting Torrent Video to Document...*\n`;

    if (details.image) {
      await maliya.sendMessage(from, { image: { url: details.image }, caption: caption }, { quoted: mek });
    }

    // Subtitle Download
    if (details.downloads?.subtitle) {
      await maliya.sendMessage(from, {
        document: { url: details.downloads.subtitle },
        mimetype: "application/zip",
        fileName: `${selected.title}_Sinhala_Sub.zip`,
        caption: `📄 *Sinhala Subtitle File*`
      }, { quoted: mek });
    }

    // Torrent Check
    const torrents = details.downloads?.torrents || [];
    if (torrents.length === 0) {
      return reply("⚠️ *මෙම චිත්‍රපටය සඳහා Torrent Links නොමැත. Subtitle File එක පමණක් ලබාදී ඇත.*");
    }

    const selectedTorrent = torrents.find(t => t.quality.includes("720p")) || torrents[0];
    reply(`⏳ *Downloading Torrent Video (${selectedTorrent.quality} - ${selectedTorrent.size})...*`);

    // WebTorrent Download Logic
    const WebTorrent = (await import("webtorrent")).default;
    const client = new WebTorrent();

    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    client.add(selectedTorrent.url, { path: tempDir }, (torrent) => {
      const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi'));

      if (!file) {
        client.destroy();
        return reply("❌ Video file not found in Torrent.");
      }

      const filePath = path.join(tempDir, file.path);

      torrent.on('done', async () => {
        try {
          const stats = fs.statSync(filePath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

          await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });

          await maliya.sendMessage(from, {
            document: { url: filePath },
            mimetype: file.name.endsWith('.mp4') ? "video/mp4" : "video/x-matroska",
            fileName: file.name,
            caption: `*🎬 ${details.title}*\n📦 *Size:* ${fileSizeMB} MB\n\n_Delivered by MALIYA-MD_`
          }, { quoted: mek });

          client.destroy(() => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          });

          await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });
        } catch (err) {
          console.error("❌ Send Error:", err);
          client.destroy();
        }
      });
    });

  } catch (err) {
    console.error("❌ Fetch Details Error:", err);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${err.message}`);
  }
});
