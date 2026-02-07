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

      const infoMsg = `🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
👀 *Views:* ${video.views.toLocaleString()}

📥 *Downloading via 2026 Secure Servers...*
> MALIYA-MD ❤️`;

      await bot.sendMessage(from, { image: { url: video.thumbnail }, caption: infoMsg }, { quoted: mek });

      const videoUrl = video.url;
      let downloadUrl = null;
      let successApi = "";

   // 2. වඩාත් ස්ථාවර Global API ලැයිස්තුව (2026 Feb Active)
      const apis = [
        `https://api.darkyz.my.id/api/download/ytdl?url=${encodeURIComponent(videoUrl)}&type=mp4`,
        `https://api.widipe.com/download/ytdl?url=${encodeURIComponent(videoUrl)}&type=video`,
        `https://api.botcahx.eu.org/api/dowloader/ytpv2?url=${encodeURIComponent(videoUrl)}&apikey=neyo`,
        `https://api.tioxy.my.id/api/download/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://sk-fast-rest-api.vercel.app/api/ytdl?url=${encodeURIComponent(videoUrl)}&type=video`
      ];

      for (let i = 0; i < apis.length; i++) {
        try {
          console.log(`Trying API ${i + 1}...`);
          const response = await axios.get(apis[i], { timeout: 25000 });
          const resData = response.data;

          // මේ APIs වල Response එක එන විදිහට මේක හදලා තියෙන්නේ
          downloadUrl = resData.result?.url || 
                        resData.result?.download || 
                        resData.data?.url || 
                        resData.url;

          if (downloadUrl && downloadUrl.startsWith('http')) {
            successApi = `Server ${i + 1}`;
            break;
          }
        } catch (err) {
          console.log(`API ${i + 1} Error: ${err.message}`);
          continue;
        }
      }

      // 4. වීඩියෝව WhatsApp වෙත යැවීම
      if (downloadUrl) {
        await bot.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            mimetype: "video/mp4",
            caption: `*${video.title}*\n\n✅ Downloaded by ${successApi}\n\n> MALIYA-MD ❤️`,
          },
          { quoted: mek }
        );
      } else {
        reply("❌ ක්ෂණික දෝෂයක්! සර්වර් පහම මේ වෙලාවේ කාර්යබහුලයි. කරුණාකර විනාඩි කිහිපයකින් නැවත උත්සාහ කරන්න.");
      }

    } catch (e) {
      console.log(e);
      reply("❌ පද්ධතියේ දෝෂයක් ඇති විය: " + e.message);
    }
  }
);
