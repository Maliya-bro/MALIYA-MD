const { cmd } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");

const pendingSearch = {};
const pendingQuality = {};

// ── Context Info (Forwarded & Channel Details) ─────────────
const channelContext = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: "120363427174988449@newsletter",
        newsletterName: "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁",
        serverMessageId: -1,
    }
};

const SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

// ── 100% Universal Small Caps Font Converter ─────────────
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

// ── Auto-Server Hopper & Decryption Function ─────────────
async function getCineSubzLinks(originalUrl) {
    let baseServerMatch = originalUrl.match(/server(\d+)/);
    let serversToTry = [];
    if (baseServerMatch) serversToTry.push(baseServerMatch[1]);
    
    ['1', '4', '7', '11'].forEach(s => {
        if (!serversToTry.includes(s)) serversToTry.push(s);
    });

    let lastError = null;

    for (let serverNum of serversToTry) {
        let movieUrl = originalUrl;
        if (baseServerMatch) movieUrl = movieUrl.replace(/server\d+/, `server${serverNum}`);
        
        try {
            const parsedUrl = new URL(movieUrl);
            const domain = parsedUrl.origin;
            const currentPath = parsedUrl.pathname + parsedUrl.search;
            
            const agent = new https.Agent({ 
                rejectUnauthorized: false,
                keepAlive: true,
                secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
            });

            const baseHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };

            const initialRes = await axios.get(movieUrl, { httpsAgent: agent, headers: baseHeaders });
            let cookieHeader = '';
            if (initialRes.headers['set-cookie']) {
                cookieHeader = initialRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            }

            let html = initialRes.data;
            let realPageUrl = movieUrl;
            let payloads = html.match(/[0-9a-fA-F]{200,}/g) || [];

            if (payloads.length === 0) {
                const apiUrl = `${domain}/api/download-data${currentPath}`;
                const apiResponse = await axios.get(apiUrl, {
                    httpsAgent: agent,
                    headers: { ...baseHeaders, 'Accept': 'application/json', 'Referer': movieUrl, 'Cookie': cookieHeader }
                });

                if (apiResponse.headers['set-cookie']) {
                    cookieHeader = apiResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                }

                if (!apiResponse.data || !apiResponse.data.redirect) throw new Error('API Session Error');

                realPageUrl = apiResponse.data.redirect;
                if (!realPageUrl.startsWith('http')) realPageUrl = domain + realPageUrl;

                const pageResponse = await axios.get(realPageUrl, {
                    httpsAgent: agent,
                    headers: { ...baseHeaders, 'Referer': movieUrl, 'Cookie': cookieHeader }
                });

                html = pageResponse.data;
                payloads = html.match(/[0-9a-fA-F]{200,}/g) || [];
            }

            if (payloads.length === 0) throw new Error('No Payloads');

            const allStrings = [...html.matchAll(/(["'])(.*?)\1/g)].map(m => m[2]);
            const uniqueStrings = [...new Set(allStrings)];
            const results = [];

            for (let hexPayload of payloads) {
                try {
                    const payloadBytes = Buffer.from(hexPayload, 'hex');
                    const dlResponse = await axios.post(realPageUrl, payloadBytes, {
                        httpsAgent: agent,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Referer': realPageUrl,
                            'Cookie': cookieHeader,
                            'User-Agent': baseHeaders['User-Agent']
                        },
                        responseType: 'arraybuffer'
                    });

                    const binaryString = dlResponse.data.toString('utf8');
                    const aesStringMatch = binaryString.match(/U2FsdGVkX1[a-zA-Z0-9+/=]+/);

                    if (aesStringMatch) {
                        const encryptedUrl = aesStringMatch[0];
                        for (let key of uniqueStrings) {
                            try {
                                const decryptedBytes = CryptoJS.AES.decrypt(encryptedUrl, key);
                                const decodedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);
                                if (decodedStr) {
                                    const finalUrl = Buffer.from(decodedStr, 'base64').toString('utf8');
                                    if (finalUrl.startsWith('http')) {
                                        results.push(finalUrl);
                                        break; 
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {}
            }

            const finalLinks = [...new Set(results)];
            if (finalLinks.length > 0) return { success: true, links: finalLinks };
            
            throw new Error('Links decrypt fail');

        } catch (error) {
            lastError = error.message;
            continue; 
        }
    }
    return { error: `File not found on any server.` };
}

// ==========================================
// 1. Search Command
// ==========================================
cmd({
    pattern: "cinesubz",
    alias: ["cinesub", "cs", "cssearch", "film", "movie"],
    react: "🎬",
    desc: "Search and send movies from Cinesubz.co",
    category: "download",
    filename: __filename
}, async (danuwa, mek, m, { from, q, sender }) => {
    if (!q) {
        return await danuwa.sendMessage(from, { 
            text: `🎬 *ᴄɪɴᴇsᴜʙᴢ ᴍᴏᴠɪᴇ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* \`.cinesubz <movie_name>\`\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`.cinesubz avengers\``, 
            contextInfo: channelContext 
        }, { quoted: mek });
    }

    await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });

    try {
        const results = await searchCineSubz(q.trim());

        if (!results || results.length === 0) {
            return await danuwa.sendMessage(from, { 
                text: `❌ *ɴᴏ ᴍᴏᴠɪᴇs ғᴏᴜɴᴅ ᴏɴ ᴄɪɴᴇsᴜʙᴢ ғᴏʀ:* ${q}`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        const topResults = results.slice(0, 10);
        pendingSearch[sender] = { results: topResults, timestamp: Date.now() };

        let text = `╭─〔 🎬 *ᴄɪɴᴇsᴜʙᴢ sᴇᴀʀᴄʜ* 〕─\n│\n│ 🔎 *sᴇᴀʀᴄʜ:* ${toSmallCaps(q)}\n│ 📊 *ʀᴇsᴜʟᴛs:* ${topResults.length}\n│\n╰───────────────► ❥\n\n`;

        topResults.forEach((item, index) => {
            const numStr = String(index + 1).padStart(2, "0");
            text += `*[ ${numStr} ]* 🎥 *${toSmallCaps(item.title)}*\n`;
        });

        text += `\n────────────────\n📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴍᴏᴠɪᴇ ɴᴜᴍʙᴇʀ (1-${topResults.length})*`;
        
        await danuwa.sendMessage(from, { 
            image: { url: SEARCH_IMAGE }, 
            caption: text,
            contextInfo: channelContext
        }, { quoted: mek });

    } catch (error) {
        console.error("Cinesubz Search Error:", error.message);
        await danuwa.sendMessage(from, { 
            text: `❌ *ᴇʀʀᴏʀ sᴇᴀʀᴄʜɪɴɢ ᴍᴏᴠɪᴇs. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.*`, 
            contextInfo: channelContext 
        }, { quoted: mek });
    }
});


// ==========================================
// 2. Movie Selection Listener (Number Reply)
// ==========================================
cmd({
    filter: (text, { sender }) => {
        if (!text || !pendingSearch[sender]) return false;
        const num = parseInt(String(text).trim(), 10);
        if (isNaN(num)) return false;
        if (num < 1 || num > pendingSearch[sender].results.length) return false;
        return true;
    }
}, async (danuwa, mek, m, { body, sender, from }) => {
    await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingSearch[sender].results[index];
    delete pendingSearch[sender];

    try {
        const movieInfo = await scrapeCineSubz(selected.url);

        if (!movieInfo || !movieInfo.downloadLinks || movieInfo.downloadLinks.length === 0) {
            return await danuwa.sendMessage(from, { 
                text: `❌ *ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs ᴀᴠᴀɪʟᴀʙʟᴇ ғᴏʀ ᴛʜɪs ᴍᴏᴠɪᴇ!*`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        // 🔥 2GB වලට වඩා අඩු ලින්ක්ස් විතරක් ෆිල්ටර් කිරීම 🔥
        const downloadLinks = movieInfo.downloadLinks.filter(d => {
            const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
            if (match) {
                const size = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                
                if (unit === 'GB') {
                    return size < 2.0; // 2GB ට අඩු ඒවා විතරයි (උදා: 1.4 GB පාස්, 2.3 GB ෆේල්)
                } else if (unit === 'MB') {
                    return true; // MB නම් කොහොමත් 2GB (2048MB) ට අඩුයි
                }
            }
            return true; // Size එකක් ගහලා නැත්නම් ඒකත් පෙන්නනවා (කෝකටත්)
        });

        if (downloadLinks.length === 0) {
            return await danuwa.sendMessage(from, { 
                text: `❌ *2GB ᴡᴀʟᴀᴛᴀ ᴡᴀᴅᴀ ᴀᴅᴜ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs ᴍᴜᴋᴜᴛʜ ɴᴀʜᴀ!*`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        pendingQuality[sender] = { movie: { metadata: movieInfo, downloadLinks }, timestamp: Date.now() };

        let qualityMsg = `╭〔📥 *ᴀᴠᴀɪʟᴀʙʟᴇ ǫᴜᴀʟɪᴛɪᴇs〕─\n│\n│ 🎬 *${toSmallCaps(movieInfo.title)}*\n`;
        if (movieInfo.imdb_rate) qualityMsg += `│ ⭐ *ɪᴍʙᴅ:* ${movieInfo.imdb_rate}\n`;
        if (movieInfo.duration) qualityMsg += `│ ⏳ *ᴅᴜʀᴀᴛɪᴏɴ:* ${movieInfo.duration}\n`;
        qualityMsg += `│\n╰───────────────► ❥\n\n`;

        downloadLinks.forEach((d, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            qualityMsg += `*[ ${numStr} ]* 📊 *${d.quality}*\n`;
        });

        qualityMsg += `\n───────────────\n📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ǫᴜᴀʟɪᴛʏ ɴᴜᴍʙᴇʀ (1-${downloadLinks.length}) ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ.*`;

        if (movieInfo.poster) {
            await danuwa.sendMessage(from, { 
                image: { url: movieInfo.poster }, 
                caption: qualityMsg,
                contextInfo: channelContext
            }, { quoted: mek });
        } else {
            await danuwa.sendMessage(from, { 
                text: qualityMsg,
                contextInfo: channelContext
            }, { quoted: mek });
        }

    } catch (error) {
        console.error("Fetch Movie Details Error:", error.message);
        await danuwa.sendMessage(from, { 
            text: `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs.*`, 
            contextInfo: channelContext 
        }, { quoted: mek });
    }
});


// ==========================================
// 3. Quality Selection & Document Send
// ==========================================
cmd({
    filter: (text, { sender }) => {
        if (!text || !pendingQuality[sender]) return false;
        const num = parseInt(String(text).trim(), 10);
        if (isNaN(num)) return false;
        if (num < 1 || num > pendingQuality[sender].movie.downloadLinks.length) return false;
        return true;
    }
}, async (danuwa, mek, m, { body, sender, from }) => {
    
    // React විතරයි! කිසිම Text එකක් යවන්නේ නෑ.
    await danuwa.sendMessage(from, { react: { text: "⬆️", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const { movie } = pendingQuality[sender];
    delete pendingQuality[sender];

    const selectedLink = movie.downloadLinks[index];
    let targetServerLink = selectedLink.directUrl;

    try {
        // 🔥 URL FIXER
        targetServerLink = targetServerLink.replace(/^https:\/\/[^\/]+/, 'https://drive.csplayer2.space');
        targetServerLink = targetServerLink.replace(/(server\d+\/)\d+:\//, '$1');
        if (targetServerLink.endsWith('.mp4') && !targetServerLink.includes('?ext=')) {
            targetServerLink = targetServerLink.replace('.mp4', '?ext=mp4');
        }

        const finalResult = await getCineSubzLinks(targetServerLink);

        if (!finalResult.success) {
            return await danuwa.sendMessage(from, { 
                text: `❌ *Error Extracting Link:* ${finalResult.error}`,
                contextInfo: channelContext
            }, { quoted: mek });
        }

        const allLinks = finalResult.links;
        const skylineLinks = allLinks.filter(link => link.includes('skylines'));
        const pixeldrainLinks = allLinks.filter(link => link.includes('pixeldrain'));
        const telegramLinks = allLinks.filter(link => link.includes('telegram'));

        let directDownloadUrl = null;
        if (skylineLinks.length > 0) directDownloadUrl = skylineLinks[0];
        else if (pixeldrainLinks.length > 0) directDownloadUrl = pixeldrainLinks[0];

        const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);
        
        let captionText = `🎬 *${toSmallCaps(movie.metadata.title)}*\n\n📊 *ǫᴜᴀʟɪᴛʏ:* ${selectedLink.quality}\n\n`;
        
        if (skylineLinks.length > 0) captionText += `🌟 *Skylines Direct:* ${skylineLinks[0]}\n\n`;
        if (pixeldrainLinks.length > 0) captionText += `⚡ *Pixeldrain:* ${pixeldrainLinks[0]}\n\n`;
        if (telegramLinks.length > 0) captionText += `✈️ *Telegram:* ${telegramLinks[0]}\n\n`;
        
        captionText += `🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴍᴏᴠɪᴇ!*\n👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

        if (directDownloadUrl) {
            await danuwa.sendMessage(from, {
                document: { url: directDownloadUrl },
                mimetype: "video/mp4",
                fileName: `MALIYA-MD ${cleanTitle}.mp4`,
                caption: captionText,
                contextInfo: channelContext
            }, { quoted: mek });
            
            await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
        } else {
            await danuwa.sendMessage(from, { 
                text: captionText,
                contextInfo: channelContext
            }, { quoted: mek });
            
            await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
        }

    } catch (error) {
        console.error("Download Extraction Error:", error.message);
        await danuwa.sendMessage(from, { 
            text: `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴏᴠɪᴇ:* ${error.message}`,
            contextInfo: channelContext
        }, { quoted: mek });
    }
});

// Auto Cleanup for Expired Sessions (10 mins)
setInterval(() => {
    const now = Date.now();
    const timeout = 10 * 60 * 1000;
    for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
    for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
