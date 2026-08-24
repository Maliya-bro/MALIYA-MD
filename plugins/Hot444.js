const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');

const pendingXvSearch = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // විනාඩි 10
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ===== 1. SEARCH COMMAND =====
cmd({
    pattern: "xvideos",
    alias: ["xv", "xxx", "sex", "hot"],
    desc: "Search and download videos from Xvideos.",
    react: "🎬",
    category: "download",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply(`*🎬 Xvideos Downloader*\n\nUsage: .xvideos [search_term]\nExample: .xvideos hot`);
    
    if (q.length > 150) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`*❌ Search term is too long (Keep it under 150 chars).*`);
    }

    reply("*🔍 Searching for videos...*");

    try {
        const searchRes = await axios.get(`https://www.xvideos.com/?k=${encodeURIComponent(q.trim())}&sort=new`, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 15000
        });

        const $s = cheerio.load(searchRes.data);
        let results = [];

        // 10 Search Results සූදානම් කිරීම
        $s('.mozaique div.thumb-block').each((i, el) => {
            if (results.length >= 10) return;

            const title = $s(el).find('.title a').attr('title') || $s(el).find('.title a').text().trim();
            const href = $s(el).find('.title a').attr('href');

            if (title && href && href.startsWith('/video')) {
                results.push({
                    title: title,
                    url: `https://www.xvideos.com${href}`
                });
            }
        });

        if (!results.length) return reply(`*❌ Couldn't find anything for "${q}".*`);

        // Pending Storage එකට එකතු කිරීම
        pendingXvSearch[sender] = { results, timestamp: Date.now() };

        let text = "*🎬 XVIDEOS SEARCH RESULTS:*\n\n";
        results.forEach((v, i) => {
            text += `*${i + 1}.* ${v.title.slice(0, 60)}\n`;
        });
        text += `\n*Reply with video number (1-${results.length})*`;

        reply(text);

    } catch (error) {
        console.error(error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Error searching videos!*`);
    }
});

// ===== 2. NUMBER REPLY LISTENER =====
cmd({
    filter: (text, { sender }) => pendingXvSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingXvSearch[sender].results.length
}, async (bot, mek, m, { body, sender, reply, from }) => {

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingXvSearch[sender].results[index];
    delete pendingXvSearch[sender]; // Data Cleanup

    reply(`*🔗 Fetching video links, please wait...*`);

    try {
        const videoRes = await axios.get(selected.url, {
            headers: { 'User-Agent': UA },
            timeout: 15000
        });

        const html = videoRes.data;
        
        const highUrl = /html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlHigh\(`([^`]+)`\)/.exec(html)?.[1];
        const lowUrl = /html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlLow\(`([^`]+)`\)/.exec(html)?.[1];
        const thumb = /html5player\.setThumbUrl169\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setThumbUrl169\(`([^`]+)`\)/.exec(html)?.[1];

        const mp4Url = highUrl || lowUrl;

        if (!mp4Url) return reply(`*❌ MP4 link could not be extracted.*`);

        const cleanTitle = selected.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);

        // Size Check (MB)
        let sizeMB = 0;
        try {
            const headRes = await axios.head(mp4Url, { timeout: 5000 });
            const bytes = headRes.headers['content-length'] || 0;
            sizeMB = bytes / (1024 * 1024);
        } catch { sizeMB = 0; }

        const captionText = `*🎬 ${selected.title.slice(0, 80)}*\n*💾 Size:* ${sizeMB ? sizeMB.toFixed(2) + ' MB' : 'Unknown'}\n\n*Enjoy your video! 🍿*`;

        await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });

        // 60MB+ නම් Document, නැත්නම් Video
        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: { url: mp4Url },
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText + `\n\n_📄 File is larger than 60MB, sent as document._`
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: { url: mp4Url },
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText,
                contextInfo: {
                    externalAdReply: {
                        title: selected.title.length > 80 ? selected.title.substring(0, 77) + '...' : selected.title,
                        body: 'MALIYA-MD Downloader',
                        thumbnailUrl: thumb || '',
                        sourceUrl: selected.url,
                        mediaType: 2,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: mek });
        }

    } catch (e) {
        console.error(e);
        reply(`*❌ Failed to download video!*`);
    }
});

// Auto Cleanup
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXvSearch) {
        if (now - pendingXvSearch[s].timestamp > SESSION_TIMEOUT) delete pendingXvSearch[s];
    }
}, 5 * 60 * 1000);

module.exports = { pendingXvSearch };
