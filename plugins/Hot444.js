const { cmd } = require("../command");
const { xhamsterSearch, xhamsterDownload } = require("@danonino/starlyn-scraper");
const axios = require("axios");

const pendingXhamSearch = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // විනාඩි 10යි

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "xhamster",
    alias: ["xham", "hamster"],
    desc: "Search and download videos from xHamster",
    category: "download",
    react: "🐹",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply(`*🐹 xHamster Downloader*\n\nUsage: .xhamster [search_term]\nExample: .xhamster model`);

    reply("*🔍 Searching xHamster for videos...*");

    try {
        const searchRes = await xhamsterSearch(q.trim());

        if (!searchRes || !searchRes.length) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*❌ No results found on xHamster for "${q}".*`);
        }

        // ප්‍රතිඵල 10ක් දක්වා සකස් කිරීම
        const results = searchRes.slice(0, 10).map((item) => ({
            title: item.title || "xHamster Video",
            url: item.link || item.url || item.id
        }));

        // Pending Storage එකට එකතු කිරීම
        pendingXhamSearch[sender] = { results, timestamp: Date.now() };

        let text = "*🐹 xHAMSTER SEARCH RESULTS:*\n\n";
        results.forEach((v, i) => {
            text += `*${i + 1}.* ${v.title.slice(0, 60)}\n`;
        });
        text += `\n*Reply with video number (1-${results.length})*`;

        reply(text);

    } catch (error) {
        console.error("xHamster Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Error occurred while searching xHamster!*`);
    }
});

// ===== 2. CUSTOM FILTER NUMBER REPLY LISTENER =====
cmd({
    filter: (text, { sender }) => pendingXhamSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingXhamSearch[sender].results.length
}, async (bot, mek, m, { body, sender, reply, from }) => {

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingXhamSearch[sender].results[index];
    delete pendingXhamSearch[sender]; // Data Cleanup

    reply(`*🔗 Fetching video download links, please wait...*`);

    try {
        const downData = await xhamsterDownload(selected.url);

        if (!downData || (!downData.download && !downData.files && !downData.link)) {
            return reply(`*❌ Could not extract download URL for this video.*`);
        }

        // Scraper එකෙන් එන විවිධ response formats සඳහා URL ලබා ගැනීම
        let videoUrl = null;
        if (typeof downData === 'string') {
            videoUrl = downData;
        } else if (downData.files) {
            videoUrl = downData.files.high || downData.files.low || downData.files.mp4;
        } else {
            videoUrl = downData.download || downData.link || downData.url;
        }

        if (!videoUrl) return reply(`*❌ Downloadable MP4 stream not found.*`);

        const title = downData.title || selected.title || "xHamster Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        // File Size Check (MB)
        let sizeMB = 0;
        try {
            const headRes = await axios.head(videoUrl, { timeout: 5000 });
            const bytes = headRes.headers['content-length'] || 0;
            sizeMB = bytes / (1024 * 1024);
        } catch { 
            sizeMB = 0; 
        }

        const captionText = `*🐹 ${title}*\n*💾 Size:* ${sizeMB ? sizeMB.toFixed(2) + ' MB' : 'Unknown'}\n\n*Enjoy your video! 🍿*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        // 60MB+ නම් Document, නැත්නම් Video ලෙස යැවීම
        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: { url: videoUrl },
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText + `\n\n_📄 File is larger than 60MB, sent as document._`
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: { url: videoUrl },
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText
            }, { quoted: mek });
        }

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("xHamster Download Error:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Download process failed!*`);
    }
});

// Auto Cleanup
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXhamSearch) {
        if (now - pendingXhamSearch[s].timestamp > SESSION_TIMEOUT) delete pendingXhamSearch[s];
    }
}, 5 * 60 * 1000);

module.exports = { pendingXhamSearch };
