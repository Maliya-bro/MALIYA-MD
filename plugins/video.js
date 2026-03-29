const { cmd } = require("../command");
const DY_SCRAP = require('@dark-yasiya/scrap');
const dy_scrap = new DY_SCRAP();

// Progress Bar Generator
function generateProgressBar(duration) {
    const totalBars = 10;
    const bar = "─".repeat(totalBars);
    return `*00:00* ${bar}○ *${duration}*`;
}

cmd({
    pattern: "video",
    alias: ["ytmp4", "vdl"],
    react: "🎥",
    category: "download",
    filename: __filename,
},
async (bot, mek, m, { from, q, reply }) => {
    try {
        if (!q) return reply("🎥 Please provide a YouTube link or video name.");
        
        reply("🔍 Searching Video...");

        // 1. YouTube එකේ Search කිරීම
        const search = await dy_scrap.ytsearch(q);
        const video = search.results[0];

        if (!video) return reply("❌ No results found.");

        const duration = video.timestamp || "0:00";
        const progressBar = generateProgressBar(duration);

        // 2. Thumbnail එක සමඟ විස්තර යැවීම (ඔයාගේ Song එකේ Style එකටම)
        await bot.sendMessage(from, {
            image: { url: video.thumbnail },
            caption: `
🎥 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${duration}
👀 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}

${progressBar}

🍀 *MALIYA-MD VIDEO DOWNLOADER* 🍀
> QUALITY: 360P STABLE 🎬
            `
        }, { quoted: mek });

        // 3. වීඩියෝ එක Download කිරීම (360p quality එක පාවිච්චි කර ඇත)
        const data = await dy_scrap.ytmp4(video.url, 360);

        if (!data.status || !data.result.download.url) {
            return reply("❌ Failed to fetch video download link.");
        }

        // 4. වීඩියෝ එක File එකක් විදිහට යැවීම
        await bot.sendMessage(from, {
            video: { url: data.result.download.url },
            mimetype: "video/mp4",
            caption: `✅ *${video.title}*\n\n*MALIYA-MD ❤️*`
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply("❌ Error while downloading video: " + e.message);
    }
});
