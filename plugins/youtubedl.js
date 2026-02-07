const { cmd } = require("../command");
const yts = require("yt-search");
const axios = require("axios");

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

      // 1. YouTube Search
      reply("🔍 Searching YouTube...");
      const search = await yts(q);
      const video = search.videos[0];
      if (!video) return reply("❌ වීඩියෝව සොයාගත නොහැකි විය.");

      const infoMsg = `
🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
👀 *Views:* ${video.views.toLocaleString()}

📥 *Downloading via API...*
      `;

      await bot.sendMessage(from, { image: { url: video.thumbnail }, caption: infoMsg }, { quoted: mek });

      // 2. API එක හරහා Download Link එක ලබා ගැනීම
      // මම මෙතන පහසු API එකක් පාවිච්චි කරනවා (මෙය වැඩ නොකළොත් ඉහත ලැයිස්තුවේ වෙනත් එකක් උත්සාහ කරන්න)
      const apiUrl = `https://api.dandrv.me/download/ytmp4?url=${encodeURIComponent(video.url)}`;
      const response = await axios.get(apiUrl);
      const data = response.data;

      if (!data.success || !data.result.download_url) {
        return reply("❌ වීඩියෝව ලබා ගැනීමට නොහැකි විය. පසුව උත්සාහ කරන්න.");
      }

      const downloadUrl = data.result.download_url;

      // 3. වීඩියෝ එක WhatsApp වෙත යැවීම
      await bot.sendMessage(
        from,
        {
          video: { url: downloadUrl },
          mimetype: "video/mp4",
          caption: `*${video.title}*\n\n> MALIYA-MD ❤️`,
        },
        { quoted: mek }
      );

    } catch (e) {
      console.log(e);
      reply("❌ Error: " + (e.response?.data?.message || e.message));
    }
  }
);
