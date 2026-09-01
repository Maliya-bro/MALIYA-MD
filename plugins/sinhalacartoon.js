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
    let text = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡𝗦 ]─╮*\n│\n`;
    text += `├─ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${results.length}\n│\n`;
    text += `├─ *👇 Reply with a Number:* 👇\n│\n`;

    results.forEach((v, idx) => {
        const numStr = String(idx + 1).padStart(2, "0");
        const cleanTitle = v.title.replace(/\s+/g, ' ').trim();
        text += `├─ 📱 *[ ${numStr} ]* 🎬 *${toSmallCaps(cleanTitle.slice(0, 40))}*\n`;
    });

    text += `│\n╰──────────────────╯\n\n`;
    text += `📌 *Reply with the number to select cartoon*`;
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
        return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘 ]──╮*\n│\n├─ 📌 *Usage:* .scartoon [cartoon name]\n├─ 💡 *Example:* .scartoon kung fu panda\n╰────────────────────╯`);
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("*╭──[ 🔍 𝗦𝗘𝗔𝗥𝗖𝗛𝗜𝗡𝗚 ]──╮*\n│\n├─ 🎬 *Searching SinhalaCartoons...*\n├─ ⚡ _Please wait a moment..._\n╰───────────────────╯");

    try {
        const results = await getSearchResults(q.trim());

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*╭───[ 😞 𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦 ]───╮*\n│\n├─ 🎬 *Query:* _${q}_\n╰────────────────────╯`);
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
        reply(`*╭──[ ❌ 𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥 ]──╮*\n│\n├─ 🚫 _Error occurred while searching cartoons!_\n╰───────────────────╯`);
    }
});

// ===== 2. NUMBER & EPISODE REPLY HANDLER =====
const cartoonReplyHandler = {
    filter: (text, { sender, from }) => {
        if (!text) return false;
        const k = keyFor(sender, from);
        
        const cleanInput = text.trim().toLowerCase();
        const isNumberOrList = /^(\d+|all|\d+(\s*,\s*\d+)*)$/.test(cleanInput);

        if (!isNumberOrList) return false;

        return Boolean(pendingCartoonSearch[k] || pendingCartoonSelection[k]);
    },
    function: async (bot, mek, m, { body, sender, reply, from }) => {
        const input = body ? body.trim() : "";
        if (!input) return;

        const k = keyFor(sender, from);

        // LOOP PROTECTION SYSTEM
        const now = Date.now();
        const lastMsg = lastProcessedMsg[k];
        if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
            return;
        }
        lastProcessedMsg[k] = { text: input, time: now };

        // --- STEP 1: CARTOON SELECTION FROM SEARCH ---
        if (pendingCartoonSearch[k]) {
            const num = parseInt(input, 10);
            const session = pendingCartoonSearch[k];

            if (isNaN(num) || num <= 0 || num > session.results.length) {
                return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 🎯 *Range:* 1 - ${session.results.length}\n╰────────────────────╯`);
            }

            const selectedMovie = session.results[num - 1];
            delete pendingCartoonSearch[k]; // Clear search state

            await reply(`*╭─[ ⏳ 𝗙𝗘𝗧𝗖𝗛𝗜𝗡𝗚 𝗘𝗣𝗜𝗦𝗢𝗗𝗘𝗦 ]─╮*\n│\n├─ 🎬 *Parsing cartoon details...*\n├─ ⚡ _Please wait a moment..._\n╰───────────────────╯`);

            try {
                // Fetch Details and Download Links
                const details = await getMovieDetails(selectedMovie.href);
                const downloadPageUrl = await getDownloadPageUrl(selectedMovie.href);

                if (!downloadPageUrl) {
                    return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Could not find download page!_\n╰──────────────────╯`);
                }

                const items = await getEpisodeLinksFromDownloadPage(downloadPageUrl);

                if (!items || items.length === 0) {
                    return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _No download episodes found!_\n╰───────────────────╯`);
                }

                // Store in Selection Pending State
                pendingCartoonSelection[k] = {
                    details,
                    items,
                    timestamp: Date.now()
                };

                const channelMeta = getChannelContext();

                let captionText = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n`;
                captionText += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(details.title || selectedMovie.title)}\n`;
                captionText += `├─ 📅 *𝗬𝗲𝗮𝗿:* ${details.year}\n`;
                captionText += `├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n`;
                captionText += `├─ 🎥 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n`;
                captionText += `├─ 📺 *𝗧𝘆𝗽𝗲:* ${details.isSeries ? 'TV Series' : 'Movie'}\n│\n`;
                captionText += `├─ 📥 *𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗘𝗽𝗶𝘀𝗼𝗱𝗲𝘀:* ${items.length}\n│\n`;
                captionText += `├─ *👇 Reply to Select Download:* 👇\n│\n`;
                captionText += `├─ 📱 *[ 01 ]* 📦 Download ALL Episodes\n`;

                items.forEach((item, idx) => {
                    const numStr = String(idx + 2).padStart(2, "0");
                    captionText += `├─ 📱 *[ ${numStr} ]* 📌 ${item.title}\n`;
                });

                captionText += `│\n╰──────────────────╯\n\n`;
                captionText += `💡 *Reply "01" or "all" for ALL episodes.*\n`;
                captionText += `💡 *Or reply with numbers (e.g., "2,3,5") for specific episodes.*`;

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
                reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Failed to fetch cartoon details!_\n╰───────────────────╯`);
            }
            return;
        }

        // --- STEP 2: MULTI-EPISODE SELECTION & DOWNLOAD (FIXED INDEX MATCHING) ---
        if (pendingCartoonSelection[k]) {
            const { details, items } = pendingCartoonSelection[k];

            let selectedIndices = [];
            const lowerInput = input.toLowerCase();

            if (lowerInput === "01" || lowerInput === "1" || lowerInput === "all") {
                // Select All Episodes (Array indices 0 to end)
                selectedIndices = items.map((_, idx) => idx);
            } else {
                // Parse numbers like "2,3,5,7"
                const numbers = input.split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
                
                numbers.forEach(num => {
                    // Option 01 or 1 means ALL
                    if (num === 1) {
                        items.forEach((_, idx) => selectedIndices.push(idx));
                    } 
                    // Option 02 maps to Array Index 0 (Episode 1)
                    // Option 03 maps to Array Index 1 (Episode 2) ...
                    else if (num >= 2 && num <= items.length + 1) {
                        selectedIndices.push(num - 2);
                    }
                });
            }

            // Remove duplicates and sort numerically
            selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);

            if (selectedIndices.length === 0) {
                return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗦𝗘𝗟𝗘𝗖𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 📌 *Valid Range:* 01 - ${String(items.length + 1).padStart(2, '0')}\n╰──────────────────╯`);
            }

            delete pendingCartoonSelection[k]; // Clear selection state

            await reply(`*╭──[ ⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗜𝗡𝗚 ]──╮*\n│\n├─ 🚀 *Starting Batch Download...*\n├─ 📦 *Selected Items:* ${selectedIndices.length}\n╰───────────────────╯`);

            const channelMeta = getChannelContext();

            // Process selected episodes sequentially
            for (let i = 0; i < selectedIndices.length; i++) {
                const epIndex = selectedIndices[i];
                const selectedItem = items[epIndex];

                try {
                    await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

                    const cleanTitle = (details.title || "Cartoon").replace(/[^\w\s.-]/gi, "").substring(0, 40);
                    const cleanSubTitle = (selectedItem.title || "").replace(/[^\w\s.-]/gi, "").substring(0, 20);

                    await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Uploading ${selectedItem.title}...*`);

                    // Direct Stream Send
                    await bot.sendMessage(from, {
                        document: { url: selectedItem.url },
                        mimetype: "video/mp4",
                        fileName: `MALIYA-MD ${cleanTitle} - ${cleanSubTitle}.mp4`,
                        caption: `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(details.title)}\n├─ 📌 *𝗘𝗽𝗶𝘀𝗼𝗱𝗲:* ${selectedItem.title}\n├─ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n│\n╰──────────────────╯\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
                        ...channelMeta
                    }, { quoted: mek });

                    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                    await delay(3000);

                } catch (error) {
                    console.error(`SinhalaCartoon Ep Send Error (${selectedItem.title}):`, error);
                    await reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _Failed to send ${selectedItem.title}_\n╰─────────────────╯`);
                }
            }

            await reply(`*╭───[ ✅ 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 ]───╮*\n│\n├─ 🎉 *All Selected Downloads Completed!*\n╰─────────────────╯`);
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
