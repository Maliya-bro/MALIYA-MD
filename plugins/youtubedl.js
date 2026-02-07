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

      // 2. 2026 සක්‍රීය API ලැයිස්තුව (එකක් බැරි නම් තව එකක්)
      const apis = [
        `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://bk9.fun/download/youtube?url=${encodeURIComponent(videoUrl)}`,
        `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://api.zenkey.my.id/api/download/ytmp4?url=${encodeURIComponent(videoUrl)}`,
        `https://api.agungnyarto.my.id/api/youtube/mp4?url=${encodeURIComponent(videoUrl)}`
      ];

      // 3. API Loop එක - එකින් එක පරීක්ෂා කිරීම
      for (let i = 0; i < apis.length; i++) {
        try {
          console.log(`Trying API ${i + 1}...`);
          
          // තත්පර 20කට වඩා වැඩි නම් ඊළඟ API එකට මාරු වෙන්න (Timeout)
          const response = await axios.get(apis[i], { timeout: 20000 });
          const resData = response.data;

          // විවිධ API වලින් දත්ත ලැබෙන විදි (Handling response formats)
          downloadUrl = resData.result?.download?.url || 
                        resData.result?.url || 
                        resData.data?.url || 
                        resData.result?.video ||
                        resData.url;

          if (downloadUrl && downloadUrl.startsWith('http')) {
            successApi = `Server ${i + 1}`;
            break; // සාර්ථක නම් Loop එකෙන් ඉවත් වෙන්න
          }
        } catch (err) {
          console.log(`API ${i + 1} Error: ${err.message}`);
          continue; // ඊළඟ එකට යන්න
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
