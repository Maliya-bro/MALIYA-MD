const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, readFile, rm } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

const execFileAsync = promisify(execFile);

// State Management
const pendingPhSearch = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ===== HELPER FUNCTIONS =====

function keyFor(sender, from) {
    let fromVal = "";
    if (from) {
        fromVal = String(from);
    }

    let senderVal = "";
    if (sender) {
        senderVal = String(sender).split(":")[0];
    }

    return fromVal + "::" + senderVal;
}

function toSmallCaps(str) {
    let text = "";
    if (str) {
        text = String(str);
    }

    const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
    return text
        .split("")
        .map((char) => {
            const idx = normal.indexOf(char);
            if (idx !== -1) {
                return small[idx];
            } else {
                return char;
            }
        })
        .join("");
}

function clearUserSession(k) {
    delete pendingPhSearch[k];
}

// 1. Search Logic
async function phSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) {
        const url = "https://www.pornhub.com/video/search?search=" + encodeURIComponent(query) + "&page=" + page;

        try {
            const { data } = await axios.get(url, {
                headers: { 
                    'User-Agent': UA, 
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': 'hasVisited=1; age_verified=1'
                },
                timeout: 12000
            });
            const $= cheerio.load(data);$('li.pcVideoListItem, li.videoBox').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a').first();
                const img = $(el).find('img').first();
                
                let title = $(el).find('.title a, span.title').first().text().trim();
                if (!title) {
                    title = anchor.attr('title');
                }
                if (!title) {
                    title = '';
                }

                let href = anchor.attr('href');
                if (!href) {
                    href = '';
                }

                const duration = $(el).find('var.duration, .duration').first().text().trim();

                if (title && href && href.includes('viewkey=')) {
                    let fullUrl = '';
                    if (href.startsWith('http')) {
                        fullUrl = href;
                    } else {
                        fullUrl = "https://www.pornhub.com" + href;
                    }

                    let thumb = img.attr('data-mediumhint');
                    if (!thumb) {
                        thumb = img.attr('src');
                    }
                    if (!thumb) {
                        thumb = '';
                    }

                    allResults.push({
                        title: title,
                        url: fullUrl,
                        thumb: thumb,
                        duration: duration
                    });
                }
            });
            page++;
        } catch (err) {
            break;
        }
    }
    return allResults;
}

// 2. Direct Video Stream Extractor & Sub-Playlist Resolver
async function getPhDirectStream(url) {
    const { data } = await axios.get(url, {
        headers: { 
            'User-Agent': UA, 
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'hasVisited=1; age_verified=1'
        },
        timeout: 15000
    });
    
    const $ = cheerio.load(data);
    let masterM3u8Url = null;

    let flashvarsMatch = data.match(/flashvars_\d+\s*=\s*({.+?});/s);
    if (!flashvarsMatch) {
        flashvarsMatch = data.match(/var\s+media_0\s*=\s*({.+?});/s);
    }

    if (flashvarsMatch) {
        try {
            const flashvars = JSON.parse(flashvarsMatch[1]);
            if (flashvars.mediaDefinitions && Array.isArray(flashvars.mediaDefinitions)) {
                const hlsDef = flashvars.mediaDefinitions.find(m => {
                    if (m.format === 'hls' && m.videoUrl) {
                        return true;
                    } else if (m.videoUrl && m.videoUrl.includes('.m3u8')) {
                        return true;
                    } else {
                        return false;
                    }
                });
                if (hlsDef) {
                    masterM3u8Url = hlsDef.videoUrl;
                }
            }
        } catch {}
    }

    if (!masterM3u8Url) {
        const directM3u8 = data.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/i);
        if (directM3u8) {
            masterM3u8Url = directM3u8[0].replace(/\\/g, '');
        }
    }

    if (!masterM3u8Url) {
        throw new Error('Video stream URL could not be extracted (Protected or Deleted).');
    }

    let title = $('h1.inlineFree').first().text().trim();
    if (!title) {
        title = $('title').text().replace('- Pornhub.com', '').trim();
    }
    if (!title) {
        title = 'Pornhub Video';
    }

    const duration = $('span.duration').first().text().trim();

    // Resolve direct playlist inside Master M3U8 to avoid CDN 4XX issues
    let finalStreamUrl = masterM3u8Url;
    try {
        const m3u8Res = await axios.get(masterM3u8Url, {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.pornhub.com/',
                'Origin': 'https://www.pornhub.com'
            },
            timeout: 10000
        });

        const lines = m3u8Res.data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#')) {
                if (line.startsWith('http')) {
                    finalStreamUrl = line;
                } else {
                    const baseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);
                    finalStreamUrl = baseUrl + line;
                }
                break;
            }
        }
    } catch (e) {
        // Fallback to master if sub-playlist resolution fails
        finalStreamUrl = masterM3u8Url;
    }

    return { title: title, duration: duration, streamUrl: finalStreamUrl };
}

// 3. FFMPEG Downloader (Fixed headers & options)
async function phDownloadBuffer(streamUrl) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'phdl-'));
    const outPath = join(tmpDir, 'video.mp4');

    const headersStr = "Referer: https://www.pornhub.com/\r\nOrigin: https://www.pornhub.com\r\nAccept: */*\r\n";

    const ffmpegArgs = [
        '-v', 'error',
        '-y',
        '-user_agent', UA,
        '-headers', headersStr,
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
        '-i', streamUrl,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        outPath
    ];

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 300000 });
        const buffer = await readFile(outPath);
        
        if (buffer.length < 5000) {
            throw new Error('Downloaded stream returned empty file.');
        }

        return buffer;
    } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

function generateResultText(results, startIndex = 0) {
    const endIndex = Math.min(startIndex + 10, results.length);
    let text = "╭〔 🔞 *ᴘᴏʀɴʜᴜʙ sᴇᴀʀᴄʜ* 〕━\n┃\n";
    text += "┃ 📊 *ʀᴇsᴜʟᴛs:* " + (startIndex + 1) + " - " + endIndex + " of " + results.length + "\n┃\n";
    text += "╰━━━───────━► ❥\n\n";

    for (let i = startIndex; i < endIndex; i++) {
        const v = results[i];
        const numStr = String(i + 1).padStart(2, "0");
        let durText = '';
        if (v.duration) {
            durText = " _(" + v.duration + ")_";
        }
        text += "*[ " + numStr + " ]* 🎬 *" + toSmallCaps(v.title.slice(0, 42)) + "*" + durText + "\n";
    }

    text += "\n──────────────\n";
    text += "📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*\n";
    if (endIndex < results.length && endIndex <= 90) {
        text += "➡️ *ʀᴇᴘʟʏ ᴡɪᴛʜ \"" + (endIndex + 1) + "\" ᴛᴏ sᴇᴇ ɴᴇxᴛ 10 ʀᴇsᴜʟᴛs*";
    }
    return text;
}

// 4. Send Downloaded Video
async function processDownload(bot, mek, m, reply, from, streamUrl, title, duration) {
    await reply("⚙️ *ᴘʀᴏᴄᴇssɪɴɢ & ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴠɪᴅᴇᴏ...*\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ, ᴛʜɪs ᴍᴀʏ ᴛᴀᴋᴇ ᴀ ᴍᴏᴍᴇɴᴛ...*");

    try {
        const buffer = await phDownloadBuffer(streamUrl);

        const sizeMB = buffer.length / (1024 * 1024);
        
        let validTitle = title;
        if (!validTitle) {
            validTitle = "Pornhub Video";
        }
        const cleanTitle = validTitle.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        let validDuration = duration;
        if (!validDuration) {
            validDuration = 'N/A';
        }

        let captionText = "🎬 *" + toSmallCaps(validTitle) + "*\n⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* " + validDuration + "\n💾 *sɪᴢᴇ:* " + sizeMB.toFixed(2) + " MB\n\n🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴠɪᴅᴇᴏ!*";

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        const fileName = cleanTitle + ".mp4";

        if (sizeMB > 45) {
            await bot.sendMessage(from, {
                document: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText + "\n\n_📄 Sent as document due to size limit._"
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText
            }, { quoted: mek });
        }

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Pornhub Download Error:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        
        let errorMsg = e.message;
        if (!errorMsg) {
            errorMsg = "Unknown error occurred";
        }
        reply("❌ *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ:* " + errorMsg);
    }
}

// ===== COMMAND REGISTRATION =====
cmd({
    pattern: "ph",
    alias: ["pornhub", "phub"],
    desc: "Search and download videos from Pornhub",
    category: "download",
    react: "🔞",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
        return reply("🔞 *ᴘᴏʀɴʜᴜʙ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* `.ph [search_term]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.ph hot`");
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴘᴏʀɴʜᴜʙ ғᴏʀ ᴠɪᴅᴇᴏs...*");

    try {
        const results = await phSearch(q.trim(), 100);

        let hasNoResults = false;
        if (!results) {
            hasNoResults = true;
        } else if (!Array.isArray(results)) {
            hasNoResults = true;
        } else if (results.length === 0) {
            hasNoResults = true;
        }

        if (hasNoResults) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply("❌ *ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ ᴏɴ ᴘᴏʀɴʜᴜʙ ғᴏʀ:* _" + q + "_");
        }

        const k = keyFor(sender, from);
        clearUserSession(k);

        pendingPhSearch[k] = { 
            results: results, 
            timestamp: Date.now() 
        };

        await bot.sendMessage(from, { text: generateResultText(results, 0) }, { quoted: mek });

    } catch (error) {
        console.error("Pornhub Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴘᴏʀɴʜᴜʙ!*");
    }
});

// ===== REPLY HANDLER =====
const phReplyHandler = {
    filter: (text, { sender, from }) => {
        if (!text) return false;
        const k = keyFor(sender, from);
        if (/^\d+$/.test(text.trim()) && Boolean(pendingPhSearch[k])) {
            return true;
        }
        return false;
    },
    function: async (bot, mek, m, { body, sender, reply, from }) => {
        let input = "";
        if (body) {
            input = body.trim();
        }
        if (!input) return;

        const k = keyFor(sender, from);

        const now = Date.now();
        const lastMsg = lastProcessedMsg[k];
        if (lastMsg) {
            if (lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
                return;
            }
        }
        lastProcessedMsg[k] = { text: input, time: now };

        const num = parseInt(input);
        if (isNaN(num)) return;

        const session = pendingPhSearch[k];
        if (!session) {
            return;
        } else if (num <= 0) {
            return;
        } else if (num > session.results.length) {
            return;
        }

        if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
            session.timestamp = Date.now();
            return reply(generateResultText(session.results, num - 1));
        }

        const selected = session.results[num - 1];
        clearUserSession(k);

        try {
            await reply("🔎 *ғᴇᴛᴄʜɪɴɢ ᴠɪᴅᴇᴏ sᴛʀᴇᴀᴍ...*");
            const { title, duration, streamUrl } = await getPhDirectStream(selected.url);
            
            let finalTitle = title;
            if (!finalTitle) {
                finalTitle = selected.title;
            }

            let finalDuration = duration;
            if (!finalDuration) {
                finalDuration = selected.duration;
            }

            await processDownload(bot, mek, m, reply, from, streamUrl, finalTitle, finalDuration);
        } catch (err) {
            console.error("Direct Download Fetch Error:", err);
            reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ ɪɴɪᴛɪᴀʟɪᴢᴇ ᴅᴏᴡɴʟᴏᴀᴅ:* " + err.message);
        }
    }
};

if (Array.isArray(replyHandlers)) {
    replyHandlers.push(phReplyHandler);
}

// Cleanup expired sessions
setInterval(() => {
    const now = Date.now();
    for (const s in pendingPhSearch) {
        if (now - pendingPhSearch[s].timestamp > SESSION_TIMEOUT) {
            delete pendingPhSearch[s];
        }
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) {
            delete lastProcessedMsg[s];
        }
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingPhSearch };
