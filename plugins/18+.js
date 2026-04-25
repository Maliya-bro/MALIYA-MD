const { cmd } = require('../command');
const { xnxxSearch, xnxxDownload } = require('xnxx-scraper');
const axios = require('axios');

// Pending Sessions Storage
const pendingXNXX = {};

// Safety Warning Message
const warningMsg = "\n\n⚠️ *WARNING:* This content violates *WhatsApp Policies*. Using this may lead to your *account being banned*. Please use it *discreetly* and at your own risk.⚠️ *අවවාදයයි:* මේක *whatsapp නීති උල්ලංගනය* කරන බැවින් ඔබගේ *account එක ban වීමට* බොහෝ ඉඩකඩක් පවතී .... *ප්‍රවේශමෙන්* භාවිතා කරන්න";

cmd({
    pattern: "xxx",
    alias: ["hot", "porn", "sex"],
    desc: "Search and download xxx videos .",
    category: "download",
    react: "🔞",
    filename: __filename
},
async (bot, mek, m, { from, q, reply, sender, isOwner }) => {
    if (!isOwner) return reply("This command is restricted to the *Bot Owner* only!");
    if (!q) return reply(`🎬 *MALIYA-MD XXX SYSTEM*\n\nUsage: .xxx [video name or link]${warningMsg}`);

    try {
        // 1. Direct Link Handling
        if (q.includes("xnxx.com")) {
            return await downloadXNXXVideo(bot, from, q, mek, reply);
        } 

        // 2. Search Mode
        reply("🔎 Searching on XXX... Please wait. ⏳");
        const data = await xnxxSearch(q);
        
        if (!data.status || data.result.length === 0) return reply("❌ No results found for your query.");

        let results = data.result.slice(0, 5); // Get top 5 results
        pendingXNXX[sender] = { results, timestamp: Date.now() };

        let listMsg = `🔞 *MALIYA-MD XXX SEARCH*\n\n🔍 *Query:* ${q}\n\n`;
        results.forEach((res, index) => {
            listMsg += `*${index + 1}.* ${res.title}\nℹ️ ${res.info}\n\n`;
        });
        listMsg += `*Reply with the number (1-5) to download.*${warningMsg}`;

        return await bot.sendMessage(from, { text: listMsg }, { quoted: mek });

    } catch (e) {
        console.error(e);
        reply("⚠️ A server error occurred. Please try again later.");
    }
});

// Number Reply Handler
cmd({
    on: "body"
}, async (bot, mek, m, { body, sender, reply, from }) => {
    if (pendingXNXX[sender] && !isNaN(body) && parseInt(body) > 0 && parseInt(body) <= pendingXNXX[sender].results.length) {
        
        const index = parseInt(body.trim()) - 1;
        const selected = pendingXNXX[sender].results[index];
        
        delete pendingXNXX[sender]; // Clear session

        await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });
        await downloadXNXXVideo(bot, from, selected.link, mek, reply);
    }
});

// Video Downloader Function
async function downloadXNXXVideo(bot, from, url, mek, reply) {
    try {
        const data = await xnxxDownload(url);
        if (!data.status) return reply("❌ Could not retrieve the download link.");

        // Priority: High quality, then Low quality
        let videoUrl = data.result.files.high || data.result.files.low;
        let title = data.result.title;

        // Check File Size
        const head = await axios.head(videoUrl);
        const sizeInMB = (head.headers['content-length'] || 0) / (1024 * 1024);

        let caption = `✅ *MALIYA-MD XXX FETCH*\n\n🎬 *Title:* ${title}\n⚖️ *Size:* ${sizeInMB.toFixed(2)} MB${warningMsg}`;

        if (sizeInMB > 100) {
            reply(`⚖️ Size: ${sizeInMB.toFixed(2)}MB. Sending as a *Document* to avoid quality loss...`);
            return await bot.sendMessage(from, { 
                document: { url: videoUrl }, 
                mimetype: 'video/mp4', 
                fileName: `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}.mp4`, 
                caption 
            }, { quoted: mek });
        } else {
            return await bot.sendMessage(from, { 
                video: { url: videoUrl }, 
                caption, 
                mimetype: 'video/mp4' 
            }, { quoted: mek });
        }
    } catch (e) {
        console.error(e);
        reply("❌ Download failed. The link might be expired or restricted.");
    }
}

// Memory Cleanup: Delete sessions older than 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXNXX) {
        if (now - pendingXNXX[s].timestamp > 10 * 60 * 1000) delete pendingXNXX[s];
    }
}, 5 * 60 * 1000);
