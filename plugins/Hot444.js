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
const pendingPhOption = {};
const pendingPhQuality = {};
const pendingPhCustomTime = {};
const lastProcessedMsg = {}; // Loop Protection State

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ===== HELPER FUNCTIONS =====

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
    delete pendingPhSearch[k];
    delete pendingPhOption[k];
    delete pendingPhQuality[k];
    delete pendingPhCustomTime[k];
}

async function phSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) {
        const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}&page=${page}`;

        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 12000
            });
            const $ = cheerio.load(data);
            
            $('li.pcVideoListItem, li.videoBox').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a').first();
                const img = $(el).find('img').first();
                const title = $(el).find('.title a, span.title').first().text().trim() || anchor.attr('title') || '';
                const href = anchor.attr('href') || '';
                const duration = $(el).find('var.duration, .duration').first().text().trim();

                if (title && href && href.includes('viewkey=')) {
                    allResults.push({
                        title,
                        url: href.startsWith('http') ? href : `https://www.pornhub.com${href}`,
                        thumb: img.attr('data-mediumhint') || img.attr('src') || '',
                        duration
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

// Fetch HLS Master Playlist and Parse Available Qualities
async function getPhStreamQualities(url) {
    const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 12000
    });
    
    const $ = cheerio.load(data);
    let masterM3u8Url = null;

    const flashvarsMatch = data.match(/flashvars_\d+\s*=\s*({.*?});/s) || data.match(/var\040media_0\s*=\s*({.*?});/s);
    if (flashvarsMatch) {
        try {
            const flashvars = JSON.parse(flashvarsMatch[1]);
            if (flashvars.mediaDefinitions) {
                const hlsDef = flashvars.mediaDefinitions.find(m => m.format === 'hls' || m.videoUrl?.includes('.m3u8'));
                if (hlsDef) masterM3u8Url = hlsDef.videoUrl;
            }
        } catch {}
    }

    if (!masterM3u8Url) {
        const m3u8Match = data.match(/(https?:\\?\/\\?\/[^"]+\.m3u8[^"]*)/i);
        if (m3u8Match) masterM3u8Url = m3u8Match[1].replace(/\\/g, '');
    }

    if (!masterM3u8Url) throw new Error('No video stream URL found for this Pornhub video.');

    let title = $('h1.inlineFree').first().text().trim() || $('title').text().replace('- Pornhub.com', '').trim() || 'Pornhub Video';
    const duration = $('span.duration').first().text().trim();

    // Fetch the M3U8 Master Playlist content
    const m3u8Res = await axios.get(masterM3u8Url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://www.pornhub.com/' },
        timeout: 10000
    });

    const m3u8Text = m3u8Res.data;
    const lines = m3u8Text.split('\n');
    const qualities = [];

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('RESOLUTION=')) {
            const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
            if (resMatch && lines[i + 1]) {
                const height = resMatch[1] + 'p';
                let streamUrl = lines[i + 1].trim();
                if (!streamUrl.startsWith('http')) {
                    const baseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);
                    streamUrl = baseUrl + streamUrl;
                }
                if (!qualities.some(q => q.quality === height)) {
                    qualities.push({ quality: height, url: streamUrl });
                }
            }
        }
    }

    // Sort qualities descending (e.g. 1080p, 720p, 480p...)
    qualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    // Fallback if playlist structure is basic
    if (qualities.length === 0) {
        qualities.push({ quality: '720p', url: masterM3u8Url });
    }

    return { title, duration, qualities, defaultMasterUrl: masterM3u8Url };
}

async function phDownloadBuffer(streamUrl, timeOptions = {}) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'phdl-'));
    const outPath = join(tmpDir, 'video.mp4');

    const ffmpegArgs = [
        '-v', 'quiet',
        '-y',
        '-user_agent', UA,
        '-headers', 'Referer: https://www.pornhub.com/\r\n',
        '-i', streamUrl
    ];

    if (timeOptions.startTimeInSec !== undefined) {
        ffmpegArgs.push('-ss', String(timeOptions.startTimeInSec));
    }

    if (timeOptions.durationInSec !== undefined) {
        ffmpegArgs.push('-t', String(timeOptions.durationInSec));
    }

    ffmpegArgs.push(
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        outPath
    );

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 180000 });
        const buffer = await readFile(outPath);
        
        if (buffer.length < 5000) {
            throw new Error('Downloaded stream returned empty file.');
        }

        return buffer;
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

function generateResultText(results, startIndex = 0) {
    const endIndex = Math.min(startIndex + 10, results.length);
    let text = `╭〔 🔞 *ᴘᴏʀɴʜᴜʙ sᴇᴀʀᴄʜ* 〕━\n┃\n`;
    text += `┃ 📊 *ʀᴇsᴜʟᴛs:* ${startIndex + 1} - ${endIndex} of ${results.length}\n┃\n`;
    text += `╰━━━───────━► ❥\n\n`;

    for (let i = startIndex; i < endIndex; i++) {
        const v = results[i];
        const numStr = String(i + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(v.title.slice(0, 42))}* ${v.duration ? `_(${v.duration})_` : ''}\n`;
    }

    text += `\n──────────────\n`;
    text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*\n`;
    if (endIndex < results.length && endIndex <= 90) {
        text += `➡️ *ʀᴇᴘʟʏ ᴡɪᴛʜ "${endIndex + 1}" ᴛᴏ sᴇᴇ ɴᴇxᴛ 10 ʀᴇsᴜʟᴛs*`;
    }
    return text;
}

async function processDownload(bot, mek, m, reply, from, targetQuality, selectedInfo, timeOptions = {}, customMsg = "") {
    await reply(`⚙️ *ᴘʀᴏᴄᴇssɪɴɢ sᴛʀᴇᴀᴍ & ʀᴇɴᴅᴇʀɪɴɢ ᴠɪᴅᴇᴏ...*\n\n🎥 *ǫᴜᴀʟɪᴛʏ:* ${targetQuality.quality}\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*`);

    try {
        const buffer = await phDownloadBuffer(targetQuality.url, timeOptions);

        if (!buffer || buffer.length < 5000) {
            return reply(`❌ *ᴄᴏᴜʟᴅ ɴᴏᴛ ᴘʀᴏᴄᴇss ᴠɪᴅᴇᴏ sᴛʀᴇᴀᴍ ᴏʀ ɪɴᴠᴀʟɪᴅ sᴇɢᴍᴇɴᴛ ʀᴀɴɢᴇ!*`);
        }

        const sizeMB = buffer.length / (1024 * 1024);
        const title = selectedInfo.title || "Pornhub Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        let captionText = `🎬 *${toSmallCaps(title)}*\n\n📊 *ǫᴜᴀʟɪᴛʏ:* ${targetQuality.quality}\n⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${selectedInfo.duration || 'N/A'}\n💾 *sɪᴢᴇ:* ${sizeMB.toFixed(2)} MB`;
        if (customMsg) captionText += `\n✂️ *ᴄᴜsᴛᴏᴍ ʀᴀɴɢᴇ:* ${customMsg}`;
        captionText += `\n\n🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴠɪᴅᴇᴏ!*\n\n👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        const fileName = `MALIYA-MD ${cleanTitle} [${targetQuality.quality}].mp4`;

        if (sizeMB > 40) {
            await bot.sendMessage(from, {
                document: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText + `\n\n_📄 Video size is ${sizeMB.toFixed(1)}MB (>40MB limit), sent as document format._`
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
        reply(`❌ *ᴅᴏᴡɴʟᴏᴀᴅ ᴘʀᴏᴄᴇss ғᴀɪʟᴇᴅ:* ${e.message || "Unknown Error"}`);
    }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "ph",
    alias: ["pornhub", "phub"],
    desc: "Search and download videos from Pornhub",
    category: "download",
    react: "🔞",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
        return reply(`🔞 *ᴘᴏʀɴʜᴜʙ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* \`.ph [search_term]\`\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`.ph hot\``);
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴘᴏʀɴʜᴜʙ ғᴏʀ ᴠɪᴅᴇᴏs...*");

    try {
        const results = await phSearch(q.trim(), 100);

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`❌ *ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ ᴏɴ ᴘᴏʀɴʜᴜʙ ғᴏʀ:* _${q}_`);
        }

        const k = keyFor(sender, from);
        clearUserSession(k);

        pendingPhSearch[k] = { 
            results, 
            timestamp: Date.now() 
        };

        await bot.sendMessage(from, { text: generateResultText(results, 0) }, { quoted: mek });

    } catch (error) {
        console.error("Pornhub Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴘᴏʀɴʜᴜʙ!*`);
    }
});

// ===== 2. REPLY HANDLER (Registered to replyHandlers) =====
const phReplyHandler = {
    filter: (text, { sender, from }) => {
        if (!text) return false;
        const k = keyFor(sender, from);

        const isNumber = /^\d+$/.test(text.trim());
        const isTimeFormat = /^\d+:\d+$/.test(text.trim());

        if (!isNumber && !isTimeFormat) return false;

        return Boolean(pendingPhSearch[k] || pendingPhOption[k] || pendingPhQuality[k] || pendingPhCustomTime[k]);
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

        // 1. Custom Time Handling
        if (pendingPhCustomTime[k]) {
            if (!/^\d+:\d+$/.test(input)) {
                clearUserSession(k);
                return reply(`❌ *ɪɴᴠᴀʟɪᴅ ᴛɪᴍᴇ ғᴏʀᴍᴀᴛ!*\n\n📌 *sᴇssɪᴏɴ ᴄᴀɴᴄᴇʟʟᴇᴅ. ᴘʟᴇᴀsᴇ sᴇᴀʀᴄʜ ᴀɢᴀɪɴ.*`);
            }

            const { streamData, targetQuality } = pendingPhCustomTime[k];
            const parts = input.split(':').map(n => parseInt(n.trim()));
            
            let startMin = parts[0];
            let endMin = parts[1];

            if (isNaN(startMin) || isNaN(endMin) || startMin < 0 || endMin <= startMin) {
                clearUserSession(k);
                return reply(`❌ *ɪɴᴠᴀʟɪᴅ ᴛɪᴍᴇ ᴠᴀʟᴜᴇs!*\n\n📌 *sᴛᴀʀᴛ ᴍɪɴᴜᴛᴇ ᴍᴜsᴛ ʙᴇ sᴍᴀʟʟᴇʀ ᴛʜᴀɴ ᴇɴᴅ ᴍɪɴᴜᴛᴇ. sᴇssɪᴏɴ ᴄᴀɴᴄᴇʟʟᴇᴅ.*`);
            }

            delete pendingPhCustomTime[k];

            const startTimeInSec = startMin * 60;
            const durationInSec = (endMin - startMin) * 60;

            await bot.sendMessage(from, { react: { text: "✂️", key: m.key } });
            return processDownload(bot, mek, m, reply, from, targetQuality, streamData, { startTimeInSec, durationInSec }, `${startMin} Min to ${endMin} Min`);
        }

        // 2. Quality Selection Handling
        if (pendingPhQuality[k]) {
            const num = parseInt(input);
            const { streamData, mode } = pendingPhQuality[k];

            if (isNaN(num) || num <= 0 || num > streamData.qualities.length) {
                return reply(`❌ *ɪɴᴠᴀʟɪᴅ ǫᴜᴀʟɪᴛʏ sᴇʟᴇᴄᴛɪᴏɴ! ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ ᴀ ᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ.*`);
            }

            const targetQuality = streamData.qualities[num - 1];
            delete pendingPhQuality[k];

            if (mode === 'full') {
                await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                return processDownload(bot, mek, m, reply, from, targetQuality, streamData, {});
            }

            if (mode === 'custom') {
                pendingPhCustomTime[k] = { streamData, targetQuality, timestamp: Date.now() };
                return reply(`✂️ *ᴄᴜsᴛᴏᴍ ᴛɪᴍᴇ ᴅᴏᴡɴʟᴏᴀᴅ (ɪɴ ᴍɪɴᴜᴛᴇs)*\n\n📌 *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ sᴛᴀʀᴛ ᴍɪɴᴜᴛᴇ ᴀɴᴅ ᴇɴᴅ ᴍɪɴᴜᴛᴇ:*\n\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`5:10\`\n_(This will download from **5th minute** to **10th minute**)_`);
            }
        }

        // 3. Option 1 or 2 Handling (Full Video / Custom Time)
        if (pendingPhOption[k]) {
            if (input !== '1' && input !== '2') return;

            const selected = pendingPhOption[k].selected;
            delete pendingPhOption[k];

            await reply("🔎 *ғᴇᴛᴄʜɪɴɢ ᴀᴠᴀɪʟᴀʙʟᴇ ǫᴜᴀʟɪᴛɪᴇs...*");

            try {
                const streamData = await getPhStreamQualities(selected.url);

                if (!streamData.qualities || streamData.qualities.length === 0) {
                    return reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ǫᴜᴀʟɪᴛʏ ᴏᴘᴛɪᴏɴs ғᴏʀ ᴛʜɪs ᴠɪᴅᴇᴏ!*");
                }

                pendingPhQuality[k] = { 
                    streamData, 
                    mode: input === '1' ? 'full' : 'custom',
                    timestamp: Date.now() 
                };

                let qMsg = `╭〔 🎥 *sᴇʟᴇᴄᴛ ᴠɪᴅᴇᴏ ǫᴜᴀʟɪᴛʏ* 〕━\n┃\n`;
                qMsg += `┃ 📌 *${toSmallCaps(streamData.title.slice(0, 40))}*\n┃\n`;
                qMsg += `╰━━━───────━► ❥\n\n`;

                streamData.qualities.forEach((q, idx) => {
                    const numStr = String(idx + 1).padStart(2, "0");
                    qMsg += `*[ ${numStr} ]* 🎬 *${q.quality}*\n`;
                });

                qMsg += `\n───────────────\n`;
                qMsg += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ǫᴜᴀʟɪᴛʏ ɴᴜᴍʙᴇʀ (ᴇ.ɢ. 1)*`;

                return reply(qMsg);

            } catch (err) {
                console.error("Quality Fetch Error:", err);
                return reply(`❌ *ᴇʀʀᴏʀ ғᴇᴛᴄʜɪɴɢ ǫᴜᴀʟɪᴛɪᴇs:* ${err.message}`);
            }
        }

        // 4. Search Result Number Selection
        if (pendingPhSearch[k]) {
            const num = parseInt(input);
            if (isNaN(num)) return;

            const session = pendingPhSearch[k];
            if (num <= 0 || num > session.results.length) return;

            if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
                session.timestamp = Date.now();
                return reply(generateResultText(session.results, num - 1));
            }

            const selected = session.results[num - 1];
            delete pendingPhSearch[k];

            pendingPhOption[k] = { selected, timestamp: Date.now() };

            let optMsg = `╭〔 🎬 *sᴇʟᴇᴄᴛᴇᴅ ᴠɪᴅᴇᴏ* 〕━\n┃\n`;
            optMsg += `┃ 📌 *${toSmallCaps(selected.title.slice(0, 42))}*\n┃\n`;
            optMsg += `╰━━━───────━► ❥\n\n`;
            optMsg += `📌 *sᴇʟᴇᴄᴛ ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴏᴅᴇ:*\n\n`;
            optMsg += `*[ 01 ]* 🎬 *Full Video Download*\n`;
            optMsg += `*[ 02 ]* ✂️ *Custom Time Range*\n\n`;
            optMsg += `───────────────\n`;
            optMsg += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ 1 ᴏʀ 2*`;

            return reply(optMsg);
        }
    }
};

// Register reply handler
if (Array.isArray(replyHandlers)) {
    replyHandlers.push(phReplyHandler);
}

// Auto Cleanup & Loop Reset Interval
setInterval(() => {
    const now = Date.now();
    for (const s in pendingPhSearch) {
        if (now - pendingPhSearch[s].timestamp > SESSION_TIMEOUT) delete pendingPhSearch[s];
    }
    for (const s in pendingPhOption) {
        if (now - pendingPhOption[s].timestamp > SESSION_TIMEOUT) delete pendingPhOption[s];
    }
    for (const s in pendingPhQuality) {
        if (now - pendingPhQuality[s].timestamp > SESSION_TIMEOUT) delete pendingPhQuality[s];
    }
    for (const s in pendingPhCustomTime) {
        if (now - pendingPhCustomTime[s].timestamp > SESSION_TIMEOUT) delete pendingPhCustomTime[s];
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingPhSearch };
