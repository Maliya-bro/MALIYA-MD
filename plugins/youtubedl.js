const { cmd } = require("../command");
const yts = require("yt-search");
const { exec } = require("child_process");
const fs = require("fs");

cmd({
    pattern: "video",
    alias: ["mp4"],
    react: "🎥",
    category: "download",
    filename: __filename
},
async (bot, mek, m, { from, q, reply }) => {
    try {
        if (!q) return reply("🎬 නමක් ලබා දෙන්න.");

        const search = await yts(q);
        const video = search.videos[0];
        if (!video) return reply("❌ හමු වුණේ නැහැ.");

        reply(`📥 Downloading: ${video.title}`);

        const filePath = `./${Date.now()}.mp4`;
        const cookiePath = `./cookies.txt`;

        // GitHub Secret එකෙන් cookies file එකක් හදාගැනීම
        if (process.env.YT_COOKIES) {
            fs.writeFileSync(cookiePath, process.env.YT_COOKIES);
        }

        // yt-dlp පාවිච්චි කරමින් download කිරීම
        // මේ සඳහා server එකේ yt-dlp තිබිය යුතුය (GitHub runner වල සාමාන්‍යයෙන් ඇත)
        const command = `npx yt-dlp-exec ${video.url} -o ${filePath} -f "best[ext=mp4]" --cookies ${cookiePath}`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.log(stderr);
                return reply("❌ Download Error: YouTube blocked this request.");
            }

            await bot.sendMessage(from, { 
                video: fs.readFileSync(filePath), 
                caption: `*${video.title}*\n\n> MALIYA-MD ❤️`,
                mimetype: 'video/mp4' 
            }, { quoted: mek });

            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
        });

    } catch (e) {
        reply("❌ Error: " + e.message);
    }
});
