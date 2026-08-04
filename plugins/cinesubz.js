/**
 * 🎬 Subz.lk Sinhala Subtitle & Auto-Torrent to Document Downloader
 * ─────────────────────────────────────────────────────────────
 * Packages: subz.lk , webtorrent
 * Command: .subz <movie name>
 */

const { cmd } = require("../command");
const SubzLK = require("subz.lk");
const fs = require("fs");
const path = require("path");

// Memory storage for search responses
const pendingSubzSessions = {};

// ─── 🔍 1. SEARCH COMMAND ──────────────────────────────────────────
cmd({
  pattern: "subz",
  alias: ["subtl", "film"],
  react: "🎬",
  desc: "Search movies on subz.lk and get Subtitle + Video Document",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Usage: .subz <movie name>*\n\n_Example: .subz Jurassic World_");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await SubzLK.search(q);

    if (!results || results.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ "${q}" සඳහා කිසිදු චිත්‍රපටයක් subz.lk හි හමුවූයේ නැත.*`);
    }

    const topResults = results.slice(0, 10);

    let text = `*🎬 SUBZ.LK SINHALA SUBTITLE & MOVIE SEARCH*\n${"─".repeat(30)}\n\n`;
    topResults.forEach((r, i) => {
      text += `*${i + 1}.* ${r.title}\n📁 Category: ${r.category || 'Movie'}\n\n`;
    });
    text += `*📌 Note:* Reply with the number (1-${topResults.length}) to get Subtitle & Video File.`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // Store Session Memory
    pendingSubzSessions[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

  } catch (err) {
    console.error("❌ Subz Search Error:", err);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Error:* ${err.message}`);
  }
});

// ─── 💬 2. REPLY SELECTION HANDLER ──────────────────────────────────
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
  delete pendingSubzSessions[sender]; // clear session

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

  try {
    // 1. Details fetch කිරීම
    const details = await SubzLK.getMovie(selected.url);

    let caption = `*🎬 ${details.title}*\n${"─".repeat(30)}\n`;
    if (details.author) caption += `✍️ *Author:* ${details.author}\n`;
    caption += `\n📥 *Downloading Subtitle & Converting Torrent Video to Document...*\n`;

    if (details.image) {
      await maliya.sendMessage(from, { image: { url: details.image }, caption: caption }, { quoted: mek });
    } else {
      await maliya.sendMessage(from, { text: caption }, { quoted: mek });
    }

    // 2. Subtitle Zip File එක Direct Document ලෙස යැවීම
    if (details.downloads?.subtitle) {
      await maliya.sendMessage(from, {
        document: { url: details.downloads.subtitle },
        mimetype: "application/zip",
        fileName: `${details.title}_Sinhala_Sub.zip`,
        caption: `📄 *Sinhala Subtitle File*`
      }, { quoted: mek });
    }

    // 3. Torrent Video File Extraction (720p / 1080p Web/Bluray)
    const torrents = details.downloads?.torrents || [];
    if (torrents.length === 0) {
      return reply("⚠️ *මෙම චිත්‍රපටය සඳහා Torrent Links නොමැත. Subtitle File එක පමණක් ලබාදී ඇත.*");
    }

    // 720p හෝ පළමු Torrent එක තෝරාගැනීම
    const selectedTorrent = torrents.find(t => t.quality.includes("720p")) || torrents[0];

    reply(`⏳ *Downloading Torrent Video (${selectedTorrent.quality} - ${selectedTorrent.size})...*\n_මේ සඳහා සර්වර් එකේ speed එක අනුව සුළු වේලාවක් ගතවේ._`);

    // Dynamic WebTorrent Import
    const WebTorrent = (await import("webtorrent")).default;
    const client = new WebTorrent();

    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    client.add(selectedTorrent.url, { path: tempDir }, (torrent) => {
      // Largest file (Video file) සොයාගැනීම
      const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi'));

      if (!file) {
        client.destroy();
        return reply("❌ Torrent එක ඇතුලෙන් Video file එක සොයාගත නොහැකි විය.");
      }

      const filePath = path.join(tempDir, file.path);

      torrent.on('done', async () => {
        try {
          const stats = fs.statSync(filePath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

          await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });

          // WhatsApp එකට Document ලෙස Video එක Send කිරීම
          await maliya.sendMessage(from, {
            document: { url: filePath },
            mimetype: file.name.endsWith('.mp4') ? "video/mp4" : "video/x-matroska",
            fileName: file.name,
            caption: `*🎬 ${details.title}*\n⚙️ *Quality:* ${selectedTorrent.quality}\n📦 *Size:* ${fileSizeMB} MB\n\n_Delivered by MALIYA-MD_`
          }, { quoted: mek });

          // Cleanup file and client
          client.destroy(() => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          });

          await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

        } catch (err) {
          console.error("❌ Send File Error:", err);
          client.destroy();
        }
      });
    });

  } catch (err) {
    console.error("❌ Details Error:", err);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${err.message}`);
  }
});

// Auto Session Cleanup
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingSubzSessions) if (now - pendingSubzSessions[s].timestamp > ttl) delete pendingSubzSessions[s];
}, 60000);
