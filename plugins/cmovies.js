const { cmd } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");

const pendingSearch = {};
const pendingQuality = {};
const pendingTargetSelection = {};

// ── Storage for Target Groups (shared with csend) ─────────────
const STORE_PATH = path.join(__dirname, "csong_targets.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { groups: [] };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8") || '{"groups":[]}');
  } catch {
    return { groups: [] };
  }
}

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

// ── Helper Functions ─────────────
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

function makePendingKey(sender, from) {
    return `${from || ""}::${(sender || "").split(":")[0]}`;
}

async function getGroupName(bot, jid) {
  try {
    const meta = await bot.groupMetadata(jid);
    return meta?.subject || jid;
  } catch {
    return jid;
  }
}

function sanitizeFileName(name = "movie") {
    return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "movie";
}

// ── Auto-Server Hopper & Decryption Function ─────────────
async function getCineSubzLinks(originalUrl) {
    let baseServerMatch = originalUrl.match(/server(\d+)/);
    let serversToTry = [];
    if (baseServerMatch) serversToTry.push(baseServerMatch[1]);
    
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].forEach(s => {
        if (!serversToTry.includes(s)) serversToTry.push(s);
    });

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
            continue; 
        }
    }
    return { error: `File not found on any server.` };
}

// ==========================================
// Movie Sender Command (.cmovie / .cfilm)
// ==========================================
cmd({
    pattern: "cmovie",
    alias: ["cfilm", "cfilms"],
    react: "🔍",
    desc: "Search and send movies to target groups",
    category: "download",
    filename: __filename
}, async (danuwa, mek, m, { from, q, sender }) => {
    const store = readStore();
    const groups = store.groups || [];

    if (!groups.length) {
        await danuwa.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await danuwa.sendMessage(from, { 
            text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _No target groups saved. Use .ctarget inside a group first._\n╰──────────────⮞`, 
            contextInfo: channelContext 
        }, { quoted: mek });
    }

    if (!q) {
        return await danuwa.sendMessage(from, { 
            text: `╭─[ 🎬 *MOVIE SENDER* ]\n│\n├ 📌 *Usage:* \`.cmovie <movie_name>\`\n├ 💡 *Example:* \`.cmovie avengers\`\n╰──────────────⮞`, 
            contextInfo: channelContext 
        }, { quoted: mek });
    }

    try {
        const results = await searchCineSubz(q.trim());

        if (!results || results.length === 0) {
            await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
            return await danuwa.sendMessage(from, { 
                text: `╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _${q}_\n╰──────────────⮞`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        const topResults = results.slice(0, 10);
        const k = makePendingKey(sender, from);
        pendingSearch[k] = { results: topResults, timestamp: Date.now() };

        let text = `╭─[ 🎬 *𝗠𝗢𝗩𝗜𝗘 𝗦𝗘𝗔𝗥𝗖𝗛* ]\n│\n`;
        text += `├ 🔎 *Search:* ${toSmallCaps(q)}\n`;
        text += `├ 📊 *Results:* ${topResults.length}\n`;
        text += `├ 👇 *Reply with a Number:*\n│\n`;

        topResults.forEach((item, index) => {
            const numStr = String(index + 1).padStart(2, "0");
            text += `├ 📱 *[ ${numStr} ]* 🎥 ${toSmallCaps(item.title)}\n`;
        });

        text += `│\n╰──────────────⮞`;
        
        await danuwa.sendMessage(from, { 
            image: { url: SEARCH_IMAGE }, 
            caption: text,
            contextInfo: channelContext
        }, { quoted: mek });

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("Movie Search Error:", error.message);
        await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
    }
});


// ==========================================
// Movie Selection Listener (Number Reply)
// ==========================================
cmd({
    filter: (text, { sender, from }) => {
        const k = makePendingKey(sender, from);
        if (!text || !pendingSearch[k]) return false;
        const num = parseInt(String(text).trim(), 10);
        if (isNaN(num)) return false;
        if (num < 1 || num > pendingSearch[k].results.length) return false;
        return true;
    }
}, async (danuwa, mek, m, { body, sender, from }) => {
    const k = makePendingKey(sender, from);
    await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingSearch[k].results[index];
    delete pendingSearch[k];

    try {
        const movieInfo = await scrapeCineSubz(selected.url);

        if (!movieInfo || !movieInfo.downloadLinks || movieInfo.downloadLinks.length === 0) {
            await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
            return await danuwa.sendMessage(from, { 
                text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _No download links available!_\n╰──────────────⮞`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        const downloadLinks = movieInfo.downloadLinks.filter(d => {
            const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
            if (match) {
                const size = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                if (unit === 'GB') return size < 2.0;
                else if (unit === 'MB') return true;
            }
            return true;
        });

        if (downloadLinks.length === 0) {
            await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
            return await danuwa.sendMessage(from, { 
                text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _No links under 2GB available!_\n╰──────────────⮞`, 
                contextInfo: channelContext 
            }, { quoted: mek });
        }

        pendingQuality[k] = { movie: { metadata: movieInfo, downloadLinks }, timestamp: Date.now() };

        let qualityMsg = `╭─[ 📥 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n`;
        qualityMsg += `├ 🎬 *${toSmallCaps(movieInfo.title)}*\n`;
        if (movieInfo.imdb_rate) qualityMsg += `├ ⭐ *IMDb:* ${movieInfo.imdb_rate}\n`;
        if (movieInfo.duration) qualityMsg += `├ ⏳ *Duration:* ${movieInfo.duration}\n`;
        qualityMsg += `├ 👇 *Reply with Quality Number:*\n│\n`;

        downloadLinks.forEach((d, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            qualityMsg += `├ 📱 *[ ${numStr} ]* 📊 ${d.quality}\n`;
        });

        qualityMsg += `│\n╰──────────────⮞`;

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

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("Fetch Details Error:", error.message);
        await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
    }
});


// ==========================================
// Quality Selection & Target Group Send
// ==========================================
cmd({
    filter: (text, { sender, from }) => {
        const k = makePendingKey(sender, from);
        if (!text || !pendingQuality[k]) return false;
        const num = parseInt(String(text).trim(), 10);
        if (isNaN(num)) return false;
        if (num < 1 || num > pendingQuality[k].movie.downloadLinks.length) return false;
        return true;
    }
}, async (danuwa, mek, m, { body, sender, from }) => {
    const k = makePendingKey(sender, from);
    const index = parseInt(body.trim()) - 1;
    const { movie } = pendingQuality[k];
    delete pendingQuality[k];

    const selectedLink = movie.downloadLinks[index];
    const store = readStore();
    const groups = store.groups || [];

    if (groups.length === 1) {
        await sendMovieToGroup(danuwa, mek, m, from, groups[0], selectedLink, movie);
    } else {
        pendingTargetSelection[k] = {
            selectedLink,
            movie,
            groups,
            originalMek: m,
            timestamp: Date.now()
        };

        const names = await Promise.all(groups.map((g) => getGroupName(danuwa, g)));
        let groupMsg = `╭─[ 🎯 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗧𝗔𝗥𝗚𝗘𝗧 𝗚𝗥𝗢𝗨𝗣* ]\n│\n`;
        names.forEach((n, i) => {
            groupMsg += `├ 📱 *[ ${String(i + 1).padStart(2, "0")} ]* 👥 ${n}\n`;
        });
        groupMsg += `│\n╰──────────────⮞`;

        await danuwa.sendMessage(from, { text: groupMsg, contextInfo: channelContext }, { quoted: mek });
    }
});


// ==========================================
// Group Selection Listener (If multiple targets)
// ==========================================
cmd({
    filter: (text, { sender, from }) => {
        const k = makePendingKey(sender, from);
        if (!text || !pendingTargetSelection[k]) return false;
        const num = parseInt(String(text).trim(), 10);
        if (isNaN(num)) return false;
        if (num < 1 || num > pendingTargetSelection[k].groups.length) return false;
        return true;
    }
}, async (danuwa, mek, m, { body, sender, from }) => {
    const k = makePendingKey(sender, from);
    const num = parseInt(body.trim(), 10);
    const session = pendingTargetSelection[k];
    delete pendingTargetSelection[k];

    const targetGroup = session.groups[num - 1];
    await sendMovieToGroup(danuwa, session.originalMek, m, from, targetGroup, session.selectedLink, session.movie);
});


// ==========================================
// Core Sender Function
// ==========================================
async function sendMovieToGroup(danuwa, originalMek, m, from, targetJid, selectedLink, movie) {
    await danuwa.sendMessage(from, { react: { text: "⬇️", key: m.key } });
    let targetServerLink = selectedLink.directUrl;

    try {
        targetServerLink = targetServerLink.replace(/^https:\/\/[^\/]+/, 'https://drive.csplayer2.space');
        targetServerLink = targetServerLink.replace(/(server\d+\/)\d+:\//, '$1');
        if (targetServerLink.endsWith('.mp4') && !targetServerLink.includes('?ext=')) {
            targetServerLink = targetServerLink.replace('.mp4', '?ext=mp4');
        }

        const finalResult = await getCineSubzLinks(targetServerLink);

        if (!finalResult.success) {
            await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
            return await danuwa.sendMessage(from, { 
                text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Link Extract Fail: ${finalResult.error}_\n╰──────────────⮞`,
                contextInfo: channelContext
            }, { quoted: originalMek });
        }

        const allLinks = finalResult.links;
        const skylineLinks = allLinks.filter(link => link.includes('skylines'));
        const pixeldrainLinks = allLinks.filter(link => link.includes('pixeldrain'));

        let directDownloadUrl = skylineLinks[0] || pixeldrainLinks[0] || allLinks[0];

        // Group නම File Name එකට දැමීම
        const targetName = await getGroupName(danuwa, targetJid);
        const cleanTitle = sanitizeFileName(movie.metadata.title);
        const finalFileName = `${targetName}_${cleanTitle}.mp4`;

        let captionText = `🎬 *${movie.metadata.title}*\n\n📊 *Quality:* ${selectedLink.quality}\n\n`;
        if (skylineLinks.length > 0) captionText += `🌟 *Direct Link:* ${skylineLinks[0]}\n\n`;
        if (pixeldrainLinks.length > 0) captionText += `⚡ *Pixeldrain:* ${pixeldrainLinks[0]}\n\n`;
        captionText += `🍿 *Enjoy Your Movie!*`;

        await danuwa.sendMessage(from, { react: { text: "⬆️", key: m.key } });

        if (directDownloadUrl) {
            await danuwa.sendMessage(targetJid, {
                document: { url: directDownloadUrl },
                mimetype: "video/mp4",
                fileName: finalFileName,
                caption: captionText,
                contextInfo: channelContext
            });
            
            await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
            await danuwa.sendMessage(from, { text: `╭─[ ✅ *𝗦𝗨𝗖𝗖𝗘𝗦𝗦* ]\n│\n├ 📌 _Movie sent to: *${targetName}*_ \n╰──────────────⮞`, contextInfo: channelContext }, { quoted: originalMek });
        } else {
            await danuwa.sendMessage(targetJid, { 
                text: captionText,
                contextInfo: channelContext
            });
            await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
        }

    } catch (error) {
        console.error("Send Error:", error.message);
        await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
        await sendErrorMsg(danuwa, from, originalMek, `Failed to send movie: ${error.message}`);
    }
}

async function sendErrorMsg(sock, from, mek, text) {
    await sock.sendMessage(from, { 
        text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
        contextInfo: channelContext
    }, { quoted: mek });
}

// Auto Cleanup for Expired Sessions (10 mins)
setInterval(() => {
    const now = Date.now();
    const timeout = 10 * 60 * 1000;
    for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
    for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
    for (const s in pendingTargetSelection) if (now - pendingTargetSelection[s].timestamp > timeout) delete pendingTargetSelection[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
