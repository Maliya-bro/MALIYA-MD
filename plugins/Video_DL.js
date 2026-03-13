const { cmd } = require("../command");
const DY_SCRAP = require("@dark-yasiya/scrap");
const dy_scrap = new DY_SCRAP();

function generateProgressBar(duration = "0:00") {
    const totalBars = 10;
    const bar = "─".repeat(totalBars);
    return `*00:00* ${bar}○ *${duration}*`;
}

function isYouTubeUrl(text = "") {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text.trim());
}

async function tryVideoDownload(url) {
    // normal ytmp4
    try {
        const res1 = await dy_scrap.ytmp4(url, 360);
        console.log("ytmp4 response:", JSON.stringify(res1, null, 2));

        const dl1 = res1?.result?.download?.url;
        if (res1?.status && dl1) {
            return { ok: true, url: dl1, method: "ytmp4" };
        }
    } catch (e) {
        console.log("ytmp4 error:", e.message);
    }

    // fallback ytmp4_v2
    try {
        const res2 = await dy_scrap.ytmp4_v2(url, 360);
        console.log("ytmp4_v2 response:", JSON.stringify(res2, null, 2));

        const dl2 = res2?.result?.download?.url;
        if (res2?.status && dl2) {
            return { ok: true, url: dl2, method: "ytmp4_v2" };
        }
    } catch (e) {
        console.log("ytmp4_v2 error:", e.message);
    }

    return { ok: false, url: null };
}

cmd(
    {
        pattern: "video",
        alias: ["ytmp4", "vdl"],
        react: "🎥",
        category: "download",
        filename: __filename,
    },
    async (bot, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🎥 Please provide a YouTube link or video name.");

            await reply("🔍 Searching Video...");

            let video;
            let videoUrl;

            if (isYouTubeUrl(q)) {
                videoUrl = q.trim();

                // optional metadata fetch through search
                try {
                    const directSearch = await dy_scrap.ytsearch(q.trim());
                    video = directSearch?.results?.[0];
                } catch (e) {
                    console.log("direct ytsearch error:", e.message);
                }

                if (!video) {
                    video = {
                        title: "YouTube Video",
                        thumbnail: null,
                        image: null,
                        timestamp: "0:00",
                        views: 0,
                        ago: "Unknown",
                        author: { name: "Unknown Channel" },
                        url: videoUrl,
                    };
                }
            } else {
                const search = await dy_scrap.ytsearch(q);

                if (!search?.results?.length) {
                    return reply("❌ No results found.");
                }

                video = search.results[0];
                videoUrl = video?.url;
            }

            if (!videoUrl) return reply("❌ Video URL not found.");

            const title = video?.title || "Unknown Title";
            const thumbnail = video?.thumbnail || video?.image || null;
            const duration = video?.timestamp || "0:00";
            const channel = video?.author?.name || "Unknown Channel";
            const views = video?.views ? Number(video.views).toLocaleString() : "Unknown";
            const uploaded = video?.ago || "Unknown";
            const progressBar = generateProgressBar(duration);

            if (thumbnail) {
                await bot.sendMessage(
                    from,
                    {
                        image: { url: thumbnail },
                        caption: `🎥 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}

🍀 *MALIYA-MD VIDEO DOWNLOADER* 🍀
> QUALITY: 360P STABLE 🎬`
                    },
                    { quoted: mek }
                );
            }

            await reply("⬇️ Downloading video...");

            const result = await tryVideoDownload(videoUrl);

            if (!result.ok || !result.url) {
                return reply(
                    "❌ Failed to fetch video download link.\n\n" +
                    "Console log eka balanna.\n" +
                    "Likely scrap backend issue ekak."
                );
            }

            await bot.sendMessage(
                from,
                {
                    video: { url: result.url },
                    mimetype: "video/mp4",
                    caption: `✅ *${title}*\n\n*MALIYA-MD ❤️*\n> Source: ${result.method}`,
                },
                { quoted: mek }
            );

        } catch (e) {
            console.log("VIDEO CMD ERROR:", e);
            return reply("❌ Error while downloading video: " + e.message);
        }
    }
);
