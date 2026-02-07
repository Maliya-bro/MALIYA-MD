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

      await bot.sendMessage(from, { 
          image: { url: video.thumbnail }, 
          caption: `🎥 *${video.title}*\n\n⏱ *Duration:* ${video.timestamp}\n\n📥 *Downloading... Please wait.*` 
      }, { quoted: mek });

      const videoUrl = video.url;
      let downloadUrl = null;
      let successApi = "";

      // 2. API List (එකක් පස්සේ එකක් Try කරන්න)
      const apis = [
        `https://api.giftedtech.my.id/api/download/ytmp4?url=${encodeURIComponent(videoUrl)}&apikey=gifted`,
        `https://api.guruapi.tech/api/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://api.shizoke.site/api/download/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://widipe.com/download/ytdl?url=${encodeURIComponent(videoUrl)}&type=video`
      ];

      // 3. ලූප් එකක් මගින් API එකින් එක පරීක්ෂා කිරීම
      for (let i = 0; i < apis.length; i++) {
        try {
          console.log(`Trying API ${i + 1}...`);
          const response = await axios.get(apis[i]);
          
          // විවිධ APIs වල දත්ත ලැබෙන ආකාරය වෙනස් නිසා ඒවා පරීක්ෂා කිරීම
          const resData = response.data;
          downloadUrl = resData.result?.download_url || resData.result?.url_video || resData.url || resData.result?.url;

          if (downloadUrl) {
            successApi = `API ${i + 1}`;
            break; // Link එක හමු වූ සැනින් Loop එක නතර කරන්න
          }
        } catch (err) {
          console.log(`API ${i + 1} failed, moving to next...`);
          continue; // ඊළඟ API එකට යන්න
        }
      }

      // 4. වීඩියෝව යැවීම
      if (downloadUrl) {
        await bot.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            mimetype: "video/mp4",
            caption: `*${video.title}*\n\nFetched by: ${successApi}\n\n> MALIYA-MD ❤️`,
          },
          { quoted: mek }
        );
      } else {
        reply("❌ ක්ෂණික දෝෂයක්! ලබාදුන් සියලුම APIs දැනට කාර්යබහුලයි. කරුණාකර පසුව උත්සාහ කරන්න.");
      }

    } catch (e) {
      console.log(e);
      reply("❌ Error: " + e.message);
    }
  }
);
