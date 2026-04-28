const { cmd } = require('../command');
const { xnxxSearch, xnxxDownload } = require('xnxx-scraper');
const axios = require('axios');

// Pending Sessions Storage
const pendingXNXX = {};

// Safety Warning Message
const warningMsg = "\n\n⚠️ Use at your own risk.";

// ================= MAIN COMMAND =================
cmd({
    pattern: "xxx",
    alias: ["hot", "porn", "sex"],
    desc: "Search and download xxx videos",
    category: "download",
    react: "🔞",
    filename: __filename
},
async (bot, mek, m, { from, q, reply, sender, isOwner }) => {

    if (!isOwner) return reply("❌ Owner only command!");

    if (!q) {
        return reply(`🎬 *MALIYA-MD XXX SYSTEM*\n\nUsage: .xxx [name/link]${warningMsg}`);
    }

    try {

        // ===== DIRECT LINK =====
        if (q.includes("xnxx.com")) {
            return await downloadXNXXVideo(bot, from, q, mek, reply);
        }

        // ===== SEARCH =====
        reply("🔎 Searching... ⏳");

        let data;
        try {
            data = await xnxxSearch(q);
        } catch (err) {
            console.log("Search error:", err);
            return reply("❌ Search failed (site blocked / API error)");
        }

        if (!data || !data.result || data.result.length === 0) {
            return reply("❌ No results found.");
        }

        const results = data.result.slice(0, 5);

        pendingXNXX[sender] = {
            results,
            timestamp: Date.now()
        };

        let listMsg = `🔞 *SEARCH RESULTS*\n\n🔍 ${q}\n\n`;

        results.forEach((v, i) => {
            listMsg += `*${i + 1}.* ${v.title}\n${v.info}\n\n`;
        });

        listMsg += `Reply with number (1-5)${warningMsg}`;

        await bot.sendMessage(from, { text: listMsg }, { quoted: mek });

    } catch (e) {
        console.log("Main error:", e);
        reply("⚠️ Server error. Try again later.");
    }
});

// ================= NUMBER REPLY =================
cmd({
    on: "body"
},
async (bot, mek, m, { body, sender, reply, from }) => {

    if (!pendingXNXX[sender]) return;

    if (isNaN(body)) return;

    const num = parseInt(body);

    if (num < 1 || num > pendingXNXX[sender].results.length) return;

    const selected = pendingXNXX[sender].results[num - 1];

    delete pendingXNXX[sender];

    await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

    await downloadXNXXVideo(bot, from, selected.link, mek, reply);
});

// ================= DOWNLOAD FUNCTION =================
async function downloadXNXXVideo(bot, from, url, mek, reply) {
    try {

        let data;

        try {
            data = await xnxxDownload(url);
        } catch (err) {
            console.log("Download error:", err);
            return reply("❌ Failed to fetch video (site blocked)");
        }

        if (!data || !data.result) {
            return reply("❌ Invalid response from server.");
        }

        let videoUrl = data.result.files.high || data.result.files.low;
        let title = data.result.title || "video";

        if (!videoUrl) return reply("❌ No video link found.");

        // ===== FILE SIZE CHECK =====
        let sizeInMB = 0;

        try {
            const head = await axios.head(videoUrl);
            sizeInMB = (head.headers['content-length'] || 0) / (1024 * 1024);
        } catch {
            console.log("Size check failed");
        }

        let caption = `✅ *DOWNLOAD SUCCESS*\n\n🎬 ${title}\n⚖️ ${sizeInMB.toFixed(2)} MB${warningMsg}`;

        // ===== SEND =====
        if (sizeInMB > 100) {
            return await bot.sendMessage(from, {
                document: { url: videoUrl },
                mimetype: 'video/mp4',
                fileName: `${title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}.mp4`,
                caption
            }, { quoted: mek });
        } else {
            return await bot.sendMessage(from, {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption
            }, { quoted: mek });
        }

    } catch (e) {
        console.log("Final error:", e);
        reply("❌ Download failed.");
    }
}

// ================= CLEANUP =================
setInterval(() => {
    const now = Date.now();

    for (const s in pendingXNXX) {
        if (now - pendingXNXX[s].timestamp > 10 * 60 * 1000) {
            delete pendingXNXX[s];
        }
    }

}, 5 * 60 * 1000);
