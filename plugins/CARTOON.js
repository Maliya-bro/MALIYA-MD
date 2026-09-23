const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp'); // Thumbnail එක හදන්න Sharp එකතු කර ඇත

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
const DEFAULT_SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

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
    let f = from;
    if (!f) f = "";
    return `${f}`; 
}

function toSmallCaps(str) {
    let s = str;
    if (!s) s = "";
    const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
    return String(s)
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

// 📱 WhatsApp Mobile එකට හරියටම සපෝට් කරන Thumbnail Generator එක
async function getThumbnailBuffer(url) {
    let tryUrl = url;
    if (!tryUrl) {
        tryUrl = DEFAULT_SEARCH_IMAGE;
    }
    
    try {
        const res = await axios.get(tryUrl, {
            responseType: "arraybuffer",
            timeout: 8000,
            headers: { 'User-Agent': UA }
        });
        
        const buffer = await sharp(Buffer.from(res.data))
            .resize(200, 200, { fit: 'cover' }) 
            .jpeg({ quality: 50 }) 
            .toBuffer();
            
        return buffer;
    } catch (e) {
        if (tryUrl !== DEFAULT_SEARCH_IMAGE) {
            try {
                const res2 = await axios.get(DEFAULT_SEARCH_IMAGE, { 
                    responseType: "arraybuffer", 
                    timeout: 8000 
                });
                
                const buffer2 = await sharp(Buffer.from(res2.data))
                    .resize(200, 200, { fit: 'cover' })
                    .jpeg({ quality: 50 })
                    .toBuffer();
                return buffer2;
            } catch (e2) {
                return null;
            }
        }
        return null;
    }
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
        
        let title = link.text().trim();
        if (!title) {
            title = $(el).find('h2, h3').text().trim();
        }
        
        if (href) {
            if (title) {
                if (href.startsWith('https://sinhalacartoons.com/') && 
                    !href.includes('/category/') && 
                    !href.includes('/tag/') && 
                    !href.includes('/page/') && 
                    !href.includes('/author/') &&
                    !href.includes('/about-us/') && 
                    !href.includes('/contact-us/') &&
                    !href.includes('/dmca-policy/') &&
                    href !== 'https://sinhalacartoons.com' && 
                    title.length > 5) {
                    
                    let exists = false;
                    for (let r of results) {
                        if (r.href === href) exists = true;
                    }
                    if (!exists) {
                        results.push({ title, href });
                    }
                }
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
            
            if (href) {
                if (text) {
                    if (href.startsWith('https://sinhalacartoons.com/') && 
                        !href.includes('/category/') && 
                        !href.includes('/tag/') && 
                        !href.includes('/page/') &&
                        !href.includes('/about-us/') &&
                        !href.includes('/contact-us/') &&
                        !href.includes('/dmca-policy/') &&
                        href !== 'https://sinhalacartoons.com' &&
                        text.length > 5 &&
                        parentText.length > 20) {
                        
                        let exists = false;
                        for (let r of results) {
                            if (r.href === href) exists = true;
                        }
                        if (!exists) {
                            results.push({ title: text, href });
                        }
                    }
                }
            }
        });
    }

    return results.slice(0, 15);
}

// 2. Final Direct Link Extractor
async function getFinalDownloadLink(landingUrl) {
    if (!landingUrl) return null;
    try {
        const cleanUrl = landingUrl.replace(/&#038;/g, '&').replace(/&amp;/g, '&');
        const { data } = await axios.get(cleanUrl, { 
            headers: { 
                'User-Agent': UA,
                'Referer': 'https://sinhalacartoons.com/' 
            } 
        });
        const $ = cheerio.load(data);
        
        let actualDlLink = $('a.dl-card-landing.force-download-btn').attr('href');
        if (!actualDlLink) {
            actualDlLink = $('a.force-download-btn').attr('href');
        }
        
        if (actualDlLink) {
            return actualDlLink;
        }

        const urlObj = new URL(cleanUrl, 'https://sinhalacartoons.com');
        const scData = urlObj.searchParams.get('sc_data');
        if (scData) {
            const decodedStr = Buffer.from(scData, 'base64').toString('utf-8');
            const parsedObj = JSON.parse(decodedStr);
            if (parsedObj.direct) {
                return parsedObj.direct;
            }
        }
    } catch(e) {
        console.error("Link Extraction Error:", e.message);
    }
    return null;
}

// 3. Details Fetcher
async function getMovieAndEpisodes(moviePageUrl) {
    const { data } = await axios.get(moviePageUrl, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(data);

    let pageTitle = $('h1.movie-title').text().trim();
    if (!pageTitle) {
        pageTitle = $('title').text().trim();
    }

    let poster = $('.info-poster img').attr('src');
    if (!poster) poster = '';

    const details = {
        title: pageTitle,
        poster: poster,
        year: 'N/A',
        rating: 'N/A',
        quality: 'N/A',
        isSeries: false
    };

    $('.details-list li').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('Release Year:')) details.year = text.replace('Release Year:', '').trim();
        if (text.includes('IMDb Rating:')) details.rating = text.replace('IMDb Rating:', '').trim();
        if (text.includes('Quality:')) details.quality = text.replace('Quality:', '').trim();
    });

    const items = [];

    if ($('.episode-row').length > 0) {
        details.isSeries = true;
        
        $('.episode-row').each((i, el) => {
            let landingUrl = $(el).find('a.sc-download-links-btn').attr('href');
            if (!landingUrl) {
                landingUrl = $(el).attr('data-download-url');
            }

            let epTitle = $(el).find('.ep-title').text().trim();
            if (!epTitle) {
                epTitle = `Episode ${i + 1}`;
            }
            
            if (landingUrl) {
                items.push({ title: epTitle, landingUrl: landingUrl });
            }
        });

    } else {
        details.isSeries = false;
        let landingUrl = $('a.sc-download-links-btn').attr('href');
        if (!landingUrl) {
            landingUrl = $('a[href*="sc_data="]').attr('href');
        }
        
        if (landingUrl) {
            items.push({ title: "Full Movie", landingUrl: landingUrl });
        }
    }

    return { details, items };
}

function generateResultText(results) {
    let text = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡𝗦 ]─╮*\n│\n`;
    text += `├─ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${results.length}\n│\n`;
    text += `├─ *👇 Reply with a Number:* 👇\n│\n`;

    results.forEach((v, idx) => {
        let numStr = String(idx + 1);
        if (numStr.length === 1) numStr = "0" + numStr;
        let cleanTitle = v.title.replace(/\s+/g, ' ').trim();
        text += `├─ 📱 *[ ${numStr} ]* 🎬 *${toSmallCaps(cleanTitle.slice(0, 40))}*\n`;
    });

    text += `│\n╰──────────────────╯\n\n`;
    text += `📌 *Reply with the number to select cartoon*`;
    return text;
}

// ===== MAIN SEARCH COMMAND =====
cmd({
    pattern: "sinhalacartoon",
    alias: ["scartoon", "sc", "cartoon", "cartoons"],
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

        if (results.length === 0) {
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

// ===== NUMBER & EPISODE REPLY HANDLER =====
const cartoonReplyHandler = {
    filter: (text, { sender, from }) => {
        if (!text) return false;
        const k = keyFor(sender, from);
        
        const cleanInput = text.trim().toLowerCase();
        const isNumberOrList = /^(\d+|all|\d+(\s*,\s*\d+)*)$/.test(cleanInput);

        if (!isNumberOrList) return false;

        if (pendingCartoonSearch[k]) return true;
        if (pendingCartoonSelection[k]) return true;
        return false;
    },
    function: async (bot, mek, m, { body, sender, reply, from }) => {
        let input = body;
        if (!input) input = "";
        input = input.trim();
        if (!input) return;

        const k = keyFor(sender, from);

        // LOOP PROTECTION SYSTEM
        const now = Date.now();
        const lastMsg = lastProcessedMsg[k];
        if (lastMsg) {
            if (lastMsg.text === input) {
                if ((now - lastMsg.time) < LOOP_COOLDOWN) {
                    return;
                }
            }
        }
        lastProcessedMsg[k] = { text: input, time: now };

        // --- STEP 1: CARTOON SELECTION FROM SEARCH ---
        if (pendingCartoonSearch[k]) {
            const num = parseInt(input, 10);
            const session = pendingCartoonSearch[k];

            if (isNaN(num)) return;
            if (num <= 0) return;
            if (num > session.results.length) {
                return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 🎯 *Range:* 1 - ${session.results.length}\n╰────────────────────╯`);
            }

            const selectedMovie = session.results[num - 1];
            delete pendingCartoonSearch[k];

            await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

            try {
                const { details, items } = await getMovieAndEpisodes(selectedMovie.href);

                if (items.length === 0) {
                    return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _No download options available!_\n╰───────────────────╯`);
                }

                pendingCartoonSelection[k] = {
                    details,
                    items,
                    timestamp: Date.now()
                };

                const channelMeta = getChannelContext();
                let dispTitle = details.title;
                if (!dispTitle) dispTitle = selectedMovie.title;

                let captionText = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n`;
                captionText += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(dispTitle)}\n`;
                captionText += `├─ 📅 *𝗬𝗲𝗮𝗿:* ${details.year}\n`;
                captionText += `├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n`;
                captionText += `├─ 🎥 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n`;
                
                let typeName = 'Movie';
                if (details.isSeries) typeName = 'TV Series';
                captionText += `├─ 📺 *𝗧𝘆𝗽𝗲:* ${typeName}\n│\n`;
                
                if (details.isSeries) {
                    captionText += `├─ 📥 *𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗘𝗽𝗶𝘀𝗼𝗱𝗲𝘀:* ${items.length}\n│\n`;
                    captionText += `├─ *👇 Reply to Select Download:* 👇\n│\n`;
                    captionText += `├─ 📱 *[ 01 ]* 📦 Download ALL Episodes\n`;

                    items.forEach((item, idx) => {
                        let numStr = String(idx + 2);
                        if (numStr.length === 1) numStr = "0" + numStr;
                        captionText += `├─ 📱 *[ ${numStr} ]* 📌 ${item.title}\n`;
                    });

                    captionText += `│\n╰──────────────────╯\n\n`;
                    captionText += `💡 *Reply "01" or "all" for ALL episodes.*\n`;
                    captionText += `💡 *Or reply with numbers (e.g., "2,3,5") for specific episodes.*`;
                } else {
                    captionText += `├─ *👇 Reply to Select Download:* 👇\n│\n`;
                    captionText += `├─ 📱 *[ 01 ]* 📌 Download Movie\n`;
                    captionText += `│\n╰──────────────────╯\n\n`;
                    captionText += `💡 *Reply "1" or "01" to download.*`;
                }

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

        // --- STEP 2: MULTI-EPISODE SELECTION & DOWNLOAD (ONE BY ONE) ---
        if (pendingCartoonSelection[k]) {
            const { details, items } = pendingCartoonSelection[k];

            let selectedIndices = [];
            const lowerInput = input.toLowerCase();

            if (details.isSeries) {
                if (lowerInput === "01") {
                    selectedIndices = items.map((_, idx) => idx);
                } else if (lowerInput === "1") {
                    selectedIndices = items.map((_, idx) => idx);
                } else if (lowerInput === "all") {
                    selectedIndices = items.map((_, idx) => idx);
                } else {
                    const numbers = input.split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
                    
                    numbers.forEach(num => {
                        if (num === 1) {
                            items.forEach((_, idx) => selectedIndices.push(idx));
                        } else if (num >= 2) {
                            if (num <= items.length + 1) {
                                selectedIndices.push(num - 2);
                            }
                        }
                    });
                }
            } else {
                if (lowerInput === "01") {
                    selectedIndices = [0];
                } else if (lowerInput === "1") {
                    selectedIndices = [0];
                }
            }

            selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);

            if (selectedIndices.length === 0) {
                return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗦𝗘𝗟𝗘𝗖𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 📌 *Please select a valid option.*\n╰──────────────────╯`);
            }

            delete pendingCartoonSelection[k];

            await reply(`*╭──[ ⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗜𝗡𝗚 ]──╮*\n│\n├─ 🚀 *Starting Download...*\n├─ 📦 *Selected Items:* ${selectedIndices.length}\n╰───────────────────╯`);

            const channelMeta = getChannelContext();

            // 🟢 Thumbnail එක අරගන්නවා
            const thumbBuffer = await getThumbnailBuffer(details.poster);

            for (let i = 0; i < selectedIndices.length; i++) {
                const epIndex = selectedIndices[i];
                const selectedItem = items[epIndex];

                try {
                    await bot.sendMessage(from, { react: { text: "📥", key: m.key } });
                    await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Fetching & Uploading ${selectedItem.title}...*`);

                    const finalDirectLink = await getFinalDownloadLink(selectedItem.landingUrl);
                    
                    if (!finalDirectLink) {
                        await reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _Failed to extract link for ${selectedItem.title}_\n╰─────────────────╯`);
                        continue;
                    }

                    let rawTitle = details.title;
                    if (!rawTitle) rawTitle = "Cartoon";
                    
                    let rawItemTitle = selectedItem.title;
                    if (!rawItemTitle) rawItemTitle = "";

                    const cleanTitle = rawTitle.replace(/[^\w\s.-]/gi, "").substring(0, 40);
                    const cleanSubTitle = rawItemTitle.replace(/[^\w\s.-]/gi, "").substring(0, 20);
                    
                    let finalFileName = `MALIYA-MD ${cleanTitle}.mp4`;
                    if (details.isSeries) {
                        finalFileName = `MALIYA-MD ${cleanTitle} - ${cleanSubTitle}.mp4`;
                    }

                    // 🟢 Document Payload එක සකස් කිරීම
                    const docPayload = {
                        document: { url: finalDirectLink },
                        mimetype: "video/mp4",
                        fileName: finalFileName,
                        caption: `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(details.title)}\n├─ 📌 *𝗜𝘁𝗲𝗺:* ${selectedItem.title}\n├─ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n│\n╰──────────────────╯\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
                        ...channelMeta
                    };

                    // Thumbnail එක ඇතුළත් කිරීම
                    if (thumbBuffer) {
                        docPayload.jpegThumbnail = thumbBuffer;
                    }

                    await bot.sendMessage(from, docPayload, { quoted: mek });
                    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                    await delay(3000); 

                } catch (error) {
                    console.error(`SinhalaCartoon File Send Error (${selectedItem.title}):`, error);
                    await reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _Failed to send ${selectedItem.title}_\n╰─────────────────╯`);
                }
            }

            await reply(`*╭───[ ✅ 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 ]───╮*\n│\n├─ 🎉 *All Selected Downloads Completed!*\n╰─────────────────╯`);
        }
    }
};

if (Array.isArray(replyHandlers)) {
    replyHandlers.push(cartoonReplyHandler);
}

setInterval(() => {
    const now = Date.now();
    for (const s in pendingCartoonSearch) {
        if (now - pendingCartoonSearch[s].timestamp > SESSION_TIMEOUT) {
            delete pendingCartoonSearch[s];
        }
    }
    for (const s in pendingCartoonSelection) {
        if (now - pendingCartoonSelection[s].timestamp > SESSION_TIMEOUT) {
            delete pendingCartoonSelection[s];
        }
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) {
            delete lastProcessedMsg[s];
        }
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingCartoonSearch, pendingCartoonSelection };
