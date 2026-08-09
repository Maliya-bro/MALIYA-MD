const { cmd, commands } = require('../command');
const config = require('../config');
const axios = require('axios');
const cheerio = require('cheerio');

cmd({
    pattern: "sinhalalyrics",
    alias: ["silyrics", "gee", "sinhalasong", "lyrics", "ly", "lyr", "lir", "karoke", "lirics", "vn"],
    desc: "Get Sinhala song lyrics from sinhalasonglyrics.com",
    react: "🎵",
    category: "search",
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
            return reply(`🎵 *Sinhala Song Lyrics*\n\nHow to use:\n*.sinhalalyrics <song name>*\n\nExample:\n*.sinhalalyrics wasanthaye sitha*\n*.gee yali hamuwenakan*\n*.silyrics sobana*\n\nSupport: Sinhala & English song names`);
        }

        await bot.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // Search query
        const searchQuery = encodeURIComponent(q);
        const searchUrl = `https://sinhalasonglyrics.com/?s=${searchQuery}`;
        
        const searchRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(searchRes.data);
        
        // Get first article link
        const firstArticle = $('article h2 a').first();
        const lyricsUrl = firstArticle.attr('href');
        const songTitle = firstArticle.text().trim();
        
        if (!lyricsUrl) {
            return reply(`❌ No lyrics found for "${q}".\n\nTry a different song name or check spelling.`);
        }
        
        // Fetch lyrics page
        const lyricsRes = await axios.get(lyricsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $$ = cheerio.load(lyricsRes.data);
        
        // Extract lyrics
        let lyrics = '';
        
        $$('.entry-content p').each((i, elem) => {
            const text = $$(elem).text().trim();
            if (text && !text.includes('Song Lyrics') && !text.includes('Verse') && text.length > 20) {
                lyrics += text + '\n\n';
            }
        });
        
        if (!lyrics) {
            $$('div[class*="lyrics"], pre, .song-lyrics, .post-content p').each((i, elem) => {
                const text = $$(elem).text().trim();
                if (text && text.length > 30) {
                    lyrics += text + '\n\n';
                }
            });
        }
        
        if (!lyrics) {
            return reply('❌ Could not extract lyrics. The website structure may have changed.');
        }
        
        // Clean up lyrics
        lyrics = lyrics
            .replace(/\[.*?\]/g, '')
            .replace(/Chorus:/gi, '\n📢 *Chorus:*\n')
            .replace(/Verse \d:/gi, '\n🎤 *Verse $&:*\n')
            .replace(/Bridge:/gi, '\n🌉 *Bridge:*\n')
            .replace(/Outro:/gi, '\n🎬 *Outro:*\n')
            .replace(/(Sinhala Song Lyrics|Song Lyrics|Lyrics)/gi, '')
            .trim();
        
        // Get song image
        let imageUrl = '';
        $$('meta[property="og:image"]').each((i, elem) => {
            imageUrl = $$(elem).attr('content');
        });
        
        // Prepare caption
        const caption = `🎵 *${songTitle}*\n\n📝 *Lyrics:*\n\n${lyrics.substring(0, 3800)}\n\n🔗 *Source:* ${lyricsUrl}\n\n#SinhalaLyrics #MALIYA_MD`;
        
        if (imageUrl && imageUrl !== '') {
            await bot.sendMessage(from, {
                image: { url: imageUrl },
                caption: caption
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, { text: caption }, { quoted: mek });
        }
        
        await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
        
    } catch (e) {
        console.log(e);
        reply(`❌ Error fetching lyrics\n\n${e.message || e}`);
    }
});
