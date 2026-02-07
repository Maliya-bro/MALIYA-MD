const { cmd } = require("../command");
const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
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
        if (!q) return reply("🎬 කරුණාකර නමක් ලබා දෙන්න.");

        const search = await yts(q);
        const video = search.videos[0];
        if (!video) return reply("❌ වීඩියෝව හමු වුණේ නැහැ.");

        reply("📥 Downloading with Cookies...");

        const filePath = `./${Date.now()}.mp4`;

        // GitHub එකට දාපු Cookies පාවිච්චි කිරීම
        const options = {
            filter: "buffer",
            quality: "highestvideo",
        };

        if (process.env.YT_COOKIES) {
            // Cookies ටික JSON එකක් විදිහට අරන් ytdl එකට දෙනවා
            options.requestOptions = {
                headers: {
                    cookie: JSON.parse(process.env.YT_COOKIES)
                        .map(c => `${c.name}=${c.value}`)
                        .join('; ')
                }
            };
        }

        const stream = ytdl(video.url, options).pipe(fs.createWriteStream(filePath));

        stream.on('finish', async () => {
            await bot.sendMessage(from, { 
                video: fs.readFileSync(filePath), 
                caption: `*${video.title}*\n\n> MALIYA-MD ❤️`,
                mimetype: 'video/mp4' 
            }, { quoted: mek });
            fs.unlinkSync(filePath); // File එක Delete කිරීම
        });

    } catch (e) {
        console.log(e);
        reply("❌ Error: " + e.message);
    }
});
