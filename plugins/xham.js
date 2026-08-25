const { cmd } = require('../command');
const { xhamsterSearch, xhamsterDownload } = require('xhamster-scraper');
const { exec } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, rm, readFile } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

const execAsync = promisify(exec);
const pendingXhamSearch = {};
const SESSION_TIMEOUT = 5 * 60 * 1000; // විනාඩි 10යි
const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// HLS Stream එක MP4 Buffer එකකට Convert කිරීමේ Function එක
async function getXhamsterBuffer(hlsUrl) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'xham-'));
    const outPath = join(tmpDir, 'video.mp4');
    try {
        await execAsync(
            `ffmpeg -v quiet -y -user_agent "${UA}" -headers "Referer: https://xhamster.com/\r\n" -i "${hlsUrl}" -t 300 -c copy -bsf:a aac_adtstoasc "${outPath}"`,
            { timeout: 120000 }
        );
        const buffer = await readFile(outPath);
        return buffer;
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "xhamster",
    alias: ["xham", "hamster"],
    desc: "Search and download videos from xHamster",
    category: "download",
    react: "🐹",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply(`*🐹 xHamster Downloader*\n\nUsage: .xhamster [search_term]\nExample: .xhamster hot`);

    reply("*🔍 Searching xHamster for videos...*");

    try {
        const results = await xhamsterSearch(q.trim(), 10);

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*❌ No results found on xHamster for "${q}".*`);
        }

        // Pending Storage එකට එකතු කිරීම
        pendingXhamSearch[sender] = { results, timestamp: Date.now() };

        let text = "*🐹 xHAMSTER SEARCH RESULTS:*\n\n";
        results.forEach((v, i) => {
            text += `*${i + 1}.* ${v.title.slice(0, 60)} ${v.duration ? `(${v.duration})` : ''}\n`;
        });
        text += `\n*Reply with video number (1-${results.length})*`;

        reply(text);

    } catch (error) {
        console.error("xHamster Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Error occurred while searching xHamster!*`);
    }
});

// ===== 2. NUMBER REPLY LISTENER =====
cmd({
    filter: (text, { sender }) => pendingXhamSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingXhamSearch[sender].results.length
}, async (bot, mek, m, { body, sender, reply, from }) => {

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingXhamSearch[sender].results[index];
    delete pendingXhamSearch[sender]; // Clean Session

    reply(`*🔗 Fetching media details and converting stream (FFmpeg)...*`);

    try {
        const metadata = await xhamsterDownload(selected.url);

        if (!metadata || !metadata.download) {
            return reply(`*❌ Could not fetch download stream for this video.*`);
        }

        // Qualities අතුරින් තිබෙන හොඳම Quality Link එක තෝරා ගැනීම
        const qualities = Object.keys(metadata.download); // e.g., ["720p", "480p", "360p"]
        if (qualities.length === 0) {
            return reply(`*❌ No streaming links available.*`);
        }

        const bestQualityKey = qualities[0]; // උඩින්ම තියෙන quality එක
        const streamUrl = metadata.download[bestQualityKey].url;

        // FFmpeg මගින් Stream එක Video Buffer එකක් බවට හැරවීම
        const videoBuffer = await getXhamsterBuffer(streamUrl);

        if (!videoBuffer) {
            return reply(`*❌ Failed to render video file.*`);
        }

        const sizeMB = videoBuffer.length / (1024 * 1024);
        const title = metadata.title || selected.title || "xHamster Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        const captionText = `*🐹 ${title}*\n*📊 Quality:* ${bestQualityKey}\n*⏱️ Duration:* ${metadata.duration || selected.duration || 'N/A'}\n*💾 Size:* ${sizeMB.toFixed(2)} MB\n\n*Enjoy your video! 🍿*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        // Size එක 60MB ට වැඩි නම් Document එකක් ලෙස යැවීම
        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: videoBuffer,
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText + `\n\n_📄 File is larger than 60MB, sent as document._`
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: videoBuffer,
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText
            }, { quoted: mek });
        }

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("xHamster Download Error Details:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Download process failed:* ${e.message || "Unknown Error"}`);
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
