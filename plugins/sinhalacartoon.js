const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');

// State Management
const pendingCartoonSearch = {};
const pendingCartoonSelection = {};
const lastProcessedMsg = {}; // Loop Protection State

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Channel Forwarding Meta Data
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

function getChannelContext() {
    return {
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: CHANNEL_JID,
                newsletterName: CHANNEL_NAME,
                serverMessageId: -1,
            },
        }
    };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function keyFor(sender, from) {
    return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function toSmallCaps(str = "") {
    const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
    return String(str)
        .split("")
        .map((char) => {
            const idx = normal.indexOf(char);
            return idx !== -1 ? small[idx] : char;
        })
        .join("");
}

function clearUserSession(k) {
    delete pendingCartoonSearch[k];
    delete pendingCartoonSelection[k];
}

// 1. Search Results Scraper
async function getSearchResults(searchTerm) {
    const url = `https://sinhalacartoons.com/?s=${encodeURIComponent(searchTerm)}`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(data);
    const results = [];

    $('.post, article, .search-result, .movie-item, .post-item').each((i, el) => {
        const link = $(el).find('a[href*="sinhalacartoons.com"]').first();
        const href = link.attr('href');
        const title = link.text().trim() || $(el).find('h2, h3').text().trim();
        
        if (href && title && 
            href.startsWith('https://sinhalacartoons.com/') && 
            !href.includes('/category/') && 
            !href.includes('/tag/') && 
            !href.includes('/page/') && 
            !href.includes('/author/') &&
            !href.includes('/about-us/') &&
            !href.includes('/contact-us/') &&
            !href.includes('/dmca-policy/') &&
            href !== 'https://sinhalacartoons.com' &&
            title.length > 5) {
            
            if (!results.find(r => r.href === href)) {
                results.push({ title, href });
            }
        }
    });

    if (results.length === 0) {
        const contentArea = $('#content, .main-content, .site-content');
        contentArea.find('a[href*="sinhalacartoons.com"]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            const parent = $(el).closest('div, article, li');
            const parentText = parent.text().trim();
            
            if (href && text && 
                href.startsWith('https://sinhalacartoons.com/') && 
                !href.includes('/category/') && 
                !href.includes('/tag/') && 
                !href.includes('/page/') &&
                !href.includes('/about-us/') &&
                !href.includes('/contact-us/') &&
                !href.includes('/dmca-policy/') &&
                href !== 'https://sinhalacartoons.com' &&
                text.length > 5 &&
                parentText.length > 20) {
                
                if (!results.find(r => r.href === href)) {
                    results.push({ title: text, href });
                }
            }
        });
    }

    return results.slice(0, 15);
}

// 2. Fetch Detailed Cartoon Information
async function getMovieDetails(moviePageUrl) {
    const { data } = await axios.get(moviePageUrl, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(data);

    const details = {
        poster: '',
        title: '',
        director: 'N/A',
        year: 'N/A',
        rating: 'N/A',
        quality: 'N/A',
        description: 'N/A',
        isSeries: false
    };

    details.poster = $('.info-poster img').attr('src') || '';
    details.title = $('h1.movie-title').text().trim() || $('title').text().trim();

    const descDiv = $('h2.cast-header:contains("Description")').next('div');
    if (descDiv.length) {
        details.description = descDiv.text().trim().replace(/\s+/g, ' ').substring(0, 300) + '...';
    } else {
        const firstP = $('.main-content p').first();
        if (firstP.length) {
            details.description = firstP.text().trim().replace(/\s+/g, ' ').substring(0, 300) + '...';
        }
    }

    $('.details-list li').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('Director:')) {
            details.director = text.replace('Director:', '').trim();
        } else if (text.includes('Release Year:')) {
            details.year = text.replace('Release Year:', '').trim();
        } else if (text.includes('IMDb Rating:')) {
            details.rating = text.replace('IMDb Rating:', '').trim();
        } else if (text.includes('Quality:')) {
            details.quality = text.replace('Quality:', '').trim();
        }
    });

    if ($('#episode-section').length > 0 || $('.episode-row').length > 0) {
        details.isSeries = true;
    }

    return details;
}

// 3. Extract "Bulk Download" Page Link
async function getDownloadPageUrl(moviePageUrl) {
    const { data } = await axios.get(moviePageUrl, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(data);
    
    let downloadLink = $('a.dl-card[href*="bulk="]').attr('href');
    if (!downloadLink) {
        downloadLink = $('a[href*="bulk="]').attr('href');
    }
    return downloadLink;
}

// 4. Extract Episode Links from Download Page
async function getEpisodeLinksFromDownloadPage(downloadPageUrl) {
    const { data } = await axios.get(downloadPageUrl, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(data);
    
    const episodeLinks = [];
    
    $('a.dl-card-landing.force-download-btn').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).find('.dl-text-l strong').text().trim() || `Episode ${i + 1}`;
        
        if (href && href.includes('dl.sinhalacartoons.com')) {
            episodeLinks.push({
                title: text,
                url: href
            });
        }
    });
    
    return episodeLinks;
}

function generateResultText(results) {
    let text = `╭━〔 🎬 *sɪɴʜᴀʟᴀ ᴄᴀʀᴛᴏᴏɴ sᴇᴀʀᴄʜ* 〕━╮\n┃\n`;
    text += `┃ 📊 *TOTAL RESULTS:* ${results.length}\n┃\n`;
    text += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;

    results.forEach((v, idx) => {
        const numStr = String(idx + 1).padStart(2, "0");
        const cleanTitle = v.title.replace(/\s+/g, ' ').trim();
        text += `*[ ${numStr} ]* 🎥 *${toSmallCaps(cleanTitle.slice(0, 45))}*\n`;
    });

    text += `\n───────────────\n`;
    text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴛᴏ sᴇʟᴇᴄᴛ*\n\n`;
    text += `⚙️ Made with ❤️ by\n╭───────────────⬣\n🔥 𝙈𝘼𝙇𝙄𝙉🇩🇺 𝙉𝘼𝘿🇮𝙏𝙃 🔥\n╰───────────────⬣`;
    return text;
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "sinhalacartoon",
    alias: ["scartoon", "sc", "cartoon"],
    desc: "Search and download cartoons from SinhalaCartoons.com",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
        return reply(`🎬 *sɪɴʜᴀʟᴀ ᴄᴀʀᴛᴏᴏɴ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* \`.scartoon [cartoon name]\`\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`.scartoon kung fu panda\``);
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

    try {
        const results = await getSearchResults(q.trim());

        if (!results || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`❌ *ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
        }

        const k = keyFor(sender, from);
        clearUserSession(k);

        pendingCartoonSearch[k] = { 
            results, 
            timestamp: Date.now() 
        };

        const channelMeta = getChannelContext();
        await bot.sendMessage(from, { 
            text: generateResultText(results),
            ...channelMeta
        }, { quoted: mek });

    } catch (error) {
        console.error("SinhalaCartoon Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ!*`);
    }
});

// ===== 2. STRICT REPLY HANDLER =====
const cartoonReplyHandler = {
    filter: (text, { sender, from, key }) => {
        // Ignore messages sent by bot itself
        if (key && key.fromMe) return false;
        if (!text) return false;

        const k = keyFor(sender, from);
        const hasPendingSession = Boolean(pendingCartoonSearch[k]) || Boolean(pendingCartoonSelection[k]);
        
        // Strict check: Only respond if user typed numbers/all AND has an active session
        const cleanText = text.trim().toLowerCase();
        const isValidInput = /^[\d\s,]+$/.test(cleanText) || cleanText === 'all';

        return hasPendingSession && isValidInput;
    },
    function: async (bot, mek, m, { body, sender, reply, from }) => {
        const input = body ? body.trim() : "";
        if (!input) return;

        const k = keyFor(sender, from);

        // Loop protection
        const now = Date.now();
        const lastMsg = lastProcessedMsg[k];
        if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
            return;
        }
        lastProcessedMsg[k] = { text: input, time: now };

        // --- STEP A: CARTOON SELECTION FROM SEARCH ---
        if (pendingCartoonSearch[k]) {
            const num = parseInt(input);
            const session = pendingCartoonSearch[k];

            if (isNaN(num) || num <= 0 || num > session.results.length) {
                return reply(`❌ *ɪɴᴠᴀʟɪᴅ sᴇʟᴇᴄᴛɪᴏɴ! ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ ᴀ ᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ (1 - ${session.results.length}).*`);
            }

            const selectedMovie = session.results[num - 1];
            delete pendingCartoonSearch[k]; // Clear search session

            await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

            try {
                // Fetch Details and Download Links
                const details = await getMovieDetails(selectedMovie.href);
                const downloadPageUrl = await getDownloadPageUrl(selectedMovie.href);

                if (!downloadPageUrl) {
                    return reply(`❌ *ᴄᴏᴜʟᴅ ɴᴏᴛ ғɪɴᴅ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋ ғᴏʀ ᴛʜɪs ᴄᴀʀᴛᴏᴏɴ!*`);
                }

                const items = await getEpisodeLinksFromDownloadPage(downloadPageUrl);

                if (!items || items.length === 0) {
                    return reply(`❌ *ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs ғᴏᴜɴᴅ!*`);
                }

                const channelMeta = getChannelContext();

                // Store in selection pending state
                pendingCartoonSelection[k] = {
                    details,
                    items,
                    timestamp: Date.now()
                };

                let captionText = `╭━〔 🎬 *${toSmallCaps(details.title || selectedMovie.title)}* 〕━╮\n┃\n`;
                captionText += `┃ 📅 *RELEASE YEAR:* ${details.year}\n`;
                captionText += `┃ ⭐ *IMDB RATING:* ${details.rating}\n`;
                captionText += `┃ 🎥 *QUALITY:* ${details.quality}\n`;
                captionText += `┃ 🎬 *DIRECTOR:* ${details.director}\n`;
                captionText += `┃ 📺 *TYPE:* ${details.isSeries ? 'TV Series' : 'Movie'}\n┃\n`;
                captionText += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;
                captionText += `📖 *DESCRIPTION:*\n_${details.description}_\n\n`;
                captionText += `───────────────────\n`;
                captionText += `📥 *ᴀᴠᴀɪʟᴀʙʟᴇ ᴇᴘɪsᴏᴅᴇs / ᴅᴏᴡɴʟᴏᴀᴅs:* ${items.length}\n\n`;

                captionText += `*[ 01 ]* 📦 *GET ALL EPISODES*\n`;
                items.forEach((item, idx) => {
                    const numStr = String(idx + 2).padStart(2, "0");
                    captionText += `*[ ${numStr} ]* 📌 ${item.title}\n`;
                });

                captionText += `\n───────────────────\n`;
                captionText += `📌 *Reply with "01" or "all" to download ALL episodes.*\n`;
                captionText += `📌 *Or reply with numbers (e.g. "2,3,5" or "4") to download specific episodes.*\n\n`;
                captionText += `⚙️ Made with ❤️ by\n╭───────────────⬣\n🔥 𝙈𝘼𝙇𝙄𝙉🇩🇺 𝙉𝘼𝘿🇮𝙏🇭 🔥\n╰───────────────⬣`;

                if (details.poster) {
                    await bot.sendMessage(from, {
                        image: { url: details.poster },
                        caption: captionText,
                        ...channelMeta
                    }, { quoted: mek });
                } else {
                    await bot.sendMessage(from, {
                        text: captionText,
                        ...channelMeta
                    }, { quoted: mek });
                }

            } catch (err) {
                console.error("SinhalaCartoon Details Error:", err);
                await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
                reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴄᴀʀᴛᴏᴏɴ ᴅᴇᴛᴀɪʟs!*`);
            }
            return;
        }

        // --- STEP B: MULTI-EPISODE SELECTION & DOCUMENT UPLOAD ---
        if (pendingCartoonSelection[k]) {
            const { details, items } = pendingCartoonSelection[k];

            let selectedIndices = [];
            const lowerInput = input.toLowerCase();

            if (lowerInput === "01" || lowerInput === "1" || lowerInput === "all") {
                selectedIndices = items.map((_, idx) => idx);
            } else {
                const numbers = input.split(/[\s,]+/).map(n => parseInt(n)).filter(n => !isNaN(n));
                
                numbers.forEach(num => {
                    if (num === 1) {
                        items.forEach((_, idx) => selectedIndices.push(idx));
                    } else if (num >= 2 && num <= items.length + 1) {
                        selectedIndices.push(num - 2);
                    }
                });
            }

            selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);

            if (selectedIndices.length === 0) {
                return reply(`❌ *ɪɴᴠᴀʟɪᴅ sᴇʟᴇᴄᴛɪᴏɴ! ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠᴀʟɪᴅ ᴇᴘɪsᴏᴅᴇ ɴᴜᴍʙᴇʀs.*`);
            }

            delete pendingCartoonSelection[k]; // Clear user session from memory

            await reply(`🚀 *sᴛᴀʀᴛɪɴɢ ʙᴀᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ:* Sending ${selectedIndices.length} Item(s) as Document Files...`);

            const channelMeta = getChannelContext();

            // Process selected episodes sequentially
            for (let i = 0; i < selectedIndices.length; i++) {
                const epIndex = selectedIndices[i];
                let selectedItem = items[epIndex];

                try {
                    await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

                    let cleanTitle = (details.title || "Cartoon").replace(/[^\w\s.-]/gi, "").substring(0, 40);
                    let cleanSubTitle = (selectedItem.title || "").replace(/[^\w\s.-]/gi, "").substring(0, 20);

                    await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Uploading ${selectedItem.title}...*`);

                    // Stream Document Directly via R2 URL
                    await bot.sendMessage(from, {
                        document: { url: selectedItem.url },
                        mimetype: "video/mp4",
                        fileName: `MALIYA-MD ${cleanTitle} - ${cleanSubTitle}.mp4`,
                        caption: `🎬 *${toSmallCaps(details.title)}*\n📌 *${selectedItem.title}*\n\n📊 *ǫᴜᴀʟɪᴛʏ:* ${details.quality}\n⭐ *ʀᴀᴛɪɴɢ:* ${details.rating}\n\n🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴄᴀʀᴛᴏᴏɴ!*\n\n👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`,
                        ...channelMeta
                    }, { quoted: mek });

                    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

                    // Memory Cleanup for finished item
                    selectedItem = null;
                    cleanTitle = null;
                    cleanSubTitle = null;

                    if (global.gc) {
                        global.gc();
                    }

                    await delay(4000);

                } catch (error) {
                    console.error(`SinhalaCartoon Ep Send Error:`, error);
                    await reply(`❌ *Failed to send episode: ${error.message || "Unknown error"}*`);
                }
            }

            await reply(`🎉 *All Selected Downloads Completed Successfully!*`);
        }
    }
};

// Register reply handler
if (Array.isArray(replyHandlers)) {
    replyHandlers.push(cartoonReplyHandler);
}

// Auto Cleanup Interval
setInterval(() => {
    const now = Date.now();
    for (const s in pendingCartoonSearch) {
        if (now - pendingCartoonSearch[s].timestamp > SESSION_TIMEOUT) delete pendingCartoonSearch[s];
    }
    for (const s in pendingCartoonSelection) {
        if (now - pendingCartoonSelection[s].timestamp > SESSION_TIMEOUT) delete pendingCartoonSelection[s];
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingCartoonSearch, pendingCartoonSelection };
