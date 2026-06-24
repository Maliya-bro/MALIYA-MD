const { cmd, commands } = require('../command');
const config = require('../config');
const axios = require('axios');
const cheerio = require('cheerio');

cmd({
    pattern: "xvideos",
    alias: ["xv", "xxx", "hot", "18+"],
    desc: "Search and download videos from Xvideos.",
    react: "⌛",
    category: "download",
    filename: __filename
},
async (bot, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup,
    sender, senderNumber, botNumber2, botNumber, pushname,
    isMe, isOwner, groupMetadata, groupName, participants,
    groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        if (!q) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Please provide a search term.\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }
        
        if (q.length > 150) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Search term is too long (Keep it under 150 chars).\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

        const searchRes = await axios.get(`https://www.xvideos.com/?k=${encodeURIComponent(q.trim())}&sort=new`, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 15000
        });

        const $s = cheerio.load(searchRes.data);
        let firstHref = null;
        
        $s('.mozaique div.thumb a, div.thumb-block a').each((i, el) => {
            const href = $s(el).attr('href');
            if (!firstHref && href && href.startsWith('/video')) {
                firstHref = href;
            }
        });

        if (!firstHref) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Couldn't find anything for "${q}".\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        const videoUrl = `https://www.xvideos.com${firstHref}`;
        const videoRes = await axios.get(videoUrl, {
            headers: { 'User-Agent': UA },
            timeout: 15000
        });

        const html = videoRes.data;
        
        const highUrl = /html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlHigh\(`([^`]+)`\)/.exec(html)?.[1];
        const lowUrl = /html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoUrlLow\(`([^`]+)`\)/.exec(html)?.[1];
        const thumb = /html5player\.setThumbUrl169\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setThumbUrl169\(`([^`]+)`\)/.exec(html)?.[1];
        const videoTitle = /html5player\.setVideoTitle\('([^']+)'\)/.exec(html)?.[1] || /html5player\.setVideoTitle\(`([^`]+)`\)/.exec(html)?.[1] || 'Untitled';

        const mp4Url = highUrl || lowUrl;
        
        if (!mp4Url) {
            await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
            return reply(`╭─❏ 「 XVIDEOS 」\n│ Video found but MP4 link could not be extracted.\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
        }

        const cleanTitle = videoTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);

        await bot.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});

        // නවීකරණය කරන ලද ලස්සන කැප්ෂන් එක (Caption)
        const videoCaption = `✨ *𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃 𝐗𝐕𝐈𝐃𝐄𝐎𝐒 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑* ✨\n\n` +
                             `📝 *Title:* ${videoTitle.slice(0, 80)}\n` +
                             `🔗 *Url:* ${videoUrl}\n\n` +
                             `⚠️ *𝐃𝐈𝐒𝐂𝐋𝐀𝐈𝐌𝐄𝐑 / අවවාදයයි:* \n` +
                             `_මෙය 18+ වීඩියෝවක් නිසා ඔබේ WhatsApp ගිණුම තහනම් වීමේ (Ban) යම් අවදානමක් ඇත. එබැවින් මෙම වීඩියෝ සමූහ (Groups) තුළ භාවිත කිරීමෙන් වලකින්න._\n\n` +
                             `> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`;

        // වීඩියෝව යැවීම
        await bot.sendMessage(from, {
            video: { url: mp4Url },
            mimetype: 'video/mp4',
            fileName: `${cleanTitle}.mp4`,
            caption: videoCaption,
            contextInfo: {
                externalAdReply: {
                    title: videoTitle.length > 80 ? videoTitle.substring(0, 77) + '...' : videoTitle,
                    body: '⚠️ 18+ Content Downloader',
                    thumbnailUrl: thumb || '',
                    sourceUrl: videoUrl,
                    mediaType: 2,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: mek });

    } catch (error) {
        console.log(error);
        await bot.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`╭─❏ 「 ERROR 」\n│ Something went wrong!\n│ ${error.message?.slice(0, 60)}\n╰───────────────\n> ©𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃`);
    }
});
