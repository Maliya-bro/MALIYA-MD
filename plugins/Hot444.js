const { cmd, commands } = require('../command');
const config = require('../config');
const axios = require('axios');
const cheerio = require('cheerio');

// Search Sessions Storage & Settings
const xvSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // විනාඩි 5යි
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ===== 1. MAIN COMMAND (SEARCH) =====
cmd({
    pattern: "xvideos",
    alias: ["xv", "xxx", "sex", "hot"],
    desc: "Search and download videos from Xvideos.",
    react: "⌛",
    category: "download",
    filename: __filename
},
async (bot, mek, m, { from, q, sender, reply }) => {
    try {
        if (!q) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Please provide a search term.\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }
        
        if (q.length > 150) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Search term is too long (Keep it under 150 chars).\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        // Search Results ලබා ගැනීම
        const searchRes = await axios.get(`https://www.xvideos.com/?k=${encodeURIComponent(q.trim())}&sort=new`, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 15000
        });

        const $s = cheerio.load(searchRes.data);
        let results = [];

        // පළමු ප්‍රතිඵල 5 වෙන් කර ගැනීම
        $s('.mozaique div.thumb-block').each((i, el) => {
            if (results.length >= 5) return;

            const title = $s(el).find('.title a').attr('title') || $s(el).find('.title a').text().trim();
            const href = $s(el).find('.title a').attr('href');

            if (title && href && href.startsWith('/video')) {
                results.push({
                    title: title,
                    url: `https://www.xvideos.com${href}`
                });
            }
        });

        if (!results.length) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Couldn't find anything for "${q}".\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        // Session එක Store කිරීම
        const key = `${from}_${sender}`;
        xvSessions.set(key, { results, time: Date.now() });

        await bot.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});

        // Results List එක සැකසීම
        let txt = `╭─❏ 「 XVIDEOS SEARCH 」\n│\n`;
        results.forEach((v, i) => {
            txt += `│ *${i + 1}.* ${v.title.slice(0, 60)}\n`;
        });
        txt += `│\n├─ Reply 1-5 within 5 minutes to download\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`;

        return await bot.sendMessage(from, { text: txt }, { quoted: mek });

    } catch (error) {
        console.log(error);
        await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`╭─❏ 「 ERROR 」\n│ Something went wrong!\n│ ${error.message?.slice(0, 60)}\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
    }
});

// ===== 2. REPLY HANDLER (NUMBER LISTENER) =====
cmd({ on: "body" }, async (bot, mek, m, { body, sender, from, reply }) => {
    const input = body.trim();
    if (!/^[1-5]$/.test(input)) return; // 1 සිට 5 දක්වා අංක විතරක් පරීක්ෂා කරයි
    if (!m.quoted) return;

    const key = `${from}_${sender}`;
    const session = xvSessions.get(key);

    if (!session || (Date.now() - session.time > SESSION_TIMEOUT)) {
        if (session) xvSessions.delete(key);
        return;
    }

    const index = parseInt(input) - 1;
    const selected = session.results[index];

    xvSessions.delete(key); // Session එක අයින් කරනවා

    await bot.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

    try {
        const videoRes = await axios.get(selected.url, {
            headers: { 'User-Agent': UA },
            timeout: 15000
        });

        const html = videoRes.data;
        
        // වීඩියෝ ඩවුන්ලෝඩ් ලින්ක්ස් සහ විස්තර ලබා ගැනීම
        const highUrl = /html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlHigh\(`([^`]+)`\)/.exec(html)?.[1];
        const lowUrl = /html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlLow\(`([^`]+)`\)/.exec(html)?.[1];
        const thumb = /html5player\.setThumbUrl169\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setThumbUrl169\(`([^`]+)`\)/.exec(html)?.[1];

        const mp4Url = highUrl || lowUrl;

        if (!mp4Url) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Video found but MP4 link could not be extracted.\n╰───────────────\n> ©𝐏𝐨𝐰𝐞 visual 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        const cleanTitle = selected.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);

        // File Size එක පරීක්ෂා කිරීම (MB වලින්)
        let sizeMB = 0;
        try {
            const headRes = await axios.head(mp4Url, { timeout: 5000 });
            const bytes = headRes.headers['content-length'] || 0;
            sizeMB = bytes / (1024 * 1024);
        } catch {
            sizeMB = 0;
        }

        const captionText = `╭─❏ 「 XVIDEOS 」\n│ *Title:* ${selected.title.slice(0, 80)}\n│ *Size:* ${sizeMB ? sizeMB.toFixed(2) + ' MB' : 'Unknown'}\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`;

        await bot.sendMessage(from, { react: { text: '📥', key: mek.key } }).catch(() => {});

        // ===== 60MB+ නම් DOCUMENT එකක් ලෙස යැවීම =====
        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: { url: mp4Url },
                mimetype: 'video/mp4',
                fileName: `${cleanTitle}.mp4`,
                caption: captionText + `\n\n_📄 File is larger than 60MB, sent as document._`
            }, { quoted: mek });
        } else {
            // ===== 60MB අඩු නම් NORMAL VIDEO එකක් ලෙස යැවීම =====
            await bot.sendMessage(from, {
                video: { url: mp4Url },
                mimetype: 'video/mp4',
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

        await bot.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});

    } catch (e) {
        console.log(e);
        await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`╭─❏ 「 ERROR 」\n│ Failed to download video.\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
    }
});

// Session Cleanup Interval (මතකය පිරිසිදු කිරීමට)
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of xvSessions) {
        if (now - v.time > SESSION_TIMEOUT) xvSessions.delete(k);
    }
}, 60000);
