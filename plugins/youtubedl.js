const { cmd } = require("../command");
const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");

/* ================= VIDEO (MP4) ================= */

cmd(
  {
    pattern: "video",
    alias: ["mp4", "ytmp4", "movie"],
    react: "🎥",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎬 Please send a video name or YouTube link.");

      reply("🔍 Searching YouTube Video...");
      
      // Search logic (ඔයාගේ code එකේ විදිහටම)
      const search = await yts(q);
      const video = search.videos[0];
      if (!video) return reply("❌ No results found.");

      const duration = video.timestamp || "0:00";

      // ===== Video Info Message =====
      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: `
🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${duration}
👀 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}

📥 *Downloading your video... Please wait.*

🍀 *MALIYA-MD VIDEO DOWNLOADER* 🍀
          `,
        },
        { quoted: mek }
      );

      // ===== Download MP4 Logic =====
      const filePath = path.join(__dirname, `${Date.now()}.mp4`);
      
      // High quality (video + audio) download කිරීම
      const stream = ytdl(video.url, {
        filter: "buffer", // සරලව buffer එකක් විදිහට හෝ direct stream එකක් ගන්න පුළුවන්
        quality: "highestvideo",
      }).pipe(fs.createWriteStream(filePath));

      stream.on("finish", async () => {
        // ===== Send Video to WhatsApp =====
        await bot.sendMessage(
          from,
          {
            video: fs.readFileSync(filePath),
            mimetype: "video/mp4",
            caption: `*${video.title}*\n\nDownloaded by MALIYA-MD ❤️`,
          },
          { quoted: mek }
        );

        // Temp file එක delete කිරීම
        fs.unlinkSync(filePath);
      });

    } catch (e) {
      console.log(e);
      reply("❌ Error while downloading video: " + e.message);
    }
  }
);
