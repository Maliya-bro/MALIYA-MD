const { cmd } = require('../command')
const yts = require('vreden/youtube_scraper')

// auto progress bar
function generateProgressBar(duration) {
    const totalBars = 10
    const bar = "─".repeat(totalBars)
    return `*00:00* ${bar}○ *${duration}*`
}

cmd({
    pattern: "ytmp4",
    alias: ["video", "mp4", "ytvideo", "ytv"],
    desc: "Download YouTube video as MP4",
    category: "downloader",
    react: "🎬",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply(
                "Please provide a YouTube link or video name.\n\nExample:\n.ytmp4 Shape of You"
            )
        }

        reply("🔍 Searching YouTube...")

        const data = await yts(q)

        if (!data || !data.download || !data.download.mp4) {
            return reply("MP4 download link not found.")
        }

        // Best quality MP4
        const mp4List = data.download.mp4
        const video = mp4List[mp4List.length - 1]

        const duration = data.duration || "0:00"
        const progressBar = generateProgressBar(duration)

        // ===== Thumbnail + details =====
        await conn.sendMessage(
            from,
            {
                image: { url: data.thumbnail },
                caption: `
🎬 *${data.title}*

👤 *Channel:* ${data.author}
⏱ *Duration:* ${duration}
🎞 *Quality:* ${video.quality}

${progressBar}

🍀 *VIDEO READY TO PLAY* 🍀
                `.trim()
            },
            { quoted: mek }
        )

        reply("▶️ downloading video from MALIYA-MD...")

        // ===== Send video =====
        await conn.sendMessage(
            from,
            {
                video: { url: video.url }
            },
            { quoted: mek }
        )

    } catch (err) {
        console.error(err)
        reply("An error occurred while processing your request.")
    }
})
