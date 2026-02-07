const { cmd } = require("../command");
const yts = require("yt-search");
const ytDlp = require("yt-dlp-exec");
const fs = require("fs");
const path = require("path");

/* ================= VIDEO DOWNLOADER (2026 STABLE) ================= */

cmd(
  {
    pattern: "video",
    alias: ["mp4", "ytmp4"],
    react: "🎥",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎬 කරුණාකර වීඩියෝවේ නම හෝ YouTube Link එකක් ලබා දෙන්න.");

      reply("🔍 Searching YouTube...");
      const search = await yts(q);
      const video = search.videos[0];

      if (!video) return reply("❌ වීඩියෝව සොයාගත නොහැකි විය.");

      const infoMsg = `
🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
👀 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}

📥 *Downloading MP4...*
      `;

      await bot.sendMessage(from, { image: { url: video.thumbnail }, caption: infoMsg }, { quoted: mek });

      // Temp file path එකක් සාදා ගැනීම
      const filePath = path.join(__dirname, `../${Date.now()}.mp4`);

      // yt-dlp මගින් download කිරීම
      await ytDlp(video.url, {
        output: filePath,
        format: "best[ext=mp4]/best", // හොඳම mp4 quality එක
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:https://www.google.com/',
          'user-agent:googlebot'
        ],
      });

      // වීඩියෝ එක යැවීම
      await bot.sendMessage(
        from,
        {
          video: fs.readFileSync(filePath),
          mimetype: "video/mp4",
          caption: `*${video.title}*\n\n> MALIYA-MD 🧬`,
        },
        { quoted: mek }
      );

      // වැඩේ ඉවර වුනාම file එක delete කිරීම
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

    } catch (e) {
      console.log(e);
      reply("❌ වීඩියෝව Download කිරීමේදී දෝෂයක් ඇති විය: " + e.message);
    }
  }
);
