const { cmd } = require("../command");
const yts = require("yt-search");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

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
      const search = await yts(q);
      const video = search.videos[0];
      if (!video) return reply("❌ වීඩියෝව සොයාගත නොහැකි විය.");

      const infoMsg = `🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
👀 *Views:* ${video.views.toLocaleString()}

📥 *Downloading...*
> MALIYA-MD ❤️`;

      await bot.sendMessage(from, { image: { url: video.thumbnail }, caption: infoMsg }, { quoted: mek });

      // 2. ෆයිල් එක සේව් කරන තැන සහ Cookies සකස් කිරීම
      const filePath = path.join(__dirname, `../${Date.now()}.mp4`);
      const cookiePath = path.join(__dirname, `../cookies.txt`);

      // GitHub Secret එකේ තියෙන Cookies ටික cookies.txt එකට ලියනවා
      if (process.env.YT_COOKIES) {
        fs.writeFileSync(cookiePath, process.env.YT_COOKIES);
      }

      // 3. yt-dlp Command එක (YouTube Block නොවී ඉතා වේගයෙන් download කරයි)
      // මෙහිදී --cookies-from-browser වෙනුවට අපි export කරපු cookies.txt පාවිච්චි කරනවා
      let command = `yt-dlp "${video.url}" -o "${filePath}" -f "best[ext=mp4]"`;
      
      if (fs.existsSync(cookiePath)) {
        command += ` --cookies "${cookiePath}"`;
      }

      exec(command, async (error, stdout, stderr) => {
        if (error) {
          console.log("Download Error:", stderr);
          if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
          return reply("❌ YouTube Download Error එකක් ආවා. කරුණාකර Cookies update වී ඇත්දැයි බලන්න.");
        }

        // 4. වීඩියෝව සාර්ථකව Download වූ පසු යැවීම
        await bot.sendMessage(
          from,
          {
            video: fs.readFileSync(filePath),
            mimetype: "video/mp4",
            caption: `*${video.title}*\n\n> MALIYA-MD ❤️`,
          },
          { quoted: mek }
        );

        // වැඩ අවසන් වූ පසු temp files මකා දැමීම
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
      });

    } catch (e) {
      console.log(e);
      reply("❌ පද්ධතියේ දෝෂයක්: " + e.message);
    }
  }
);
