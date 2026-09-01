const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, readFile, rm } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

const execFileAsync = promisify(execFile);

// State Management
const pendingXhamSearch = {};
const pendingXhamQuality = {}; // Quality selection state
const pendingXhamOption = {};  // Download mode state (Full / Custom)
const pendingXhamCustomTime = {};
const lastProcessedMsg = {}; // Loop Protection State

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ===== HELPER FUNCTIONS =====

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

function clearUserSession(sender) {
    delete pendingXhamSearch[sender];
    delete pendingXhamQuality[sender];
    delete pendingXhamOption[sender];
    delete pendingXhamCustomTime[sender];
}

async function xhamSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) {
        const url = page === 1 
            ? `https://xhamster.com/search/${encodeURIComponent(query)}` 
            : `https://xhamster.com/search/${encodeURIComponent(query)}?page=${page}`;

        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 12000
            });
            const $ = cheerio.load(data);
            
            $('.video-thumb').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a.video-thumb__image-container').first();
                const img = $(el).find('img.thumb-image-container__image').first();
                const href = anchor.attr('href') || '';
                const title = $(el).find('.video-thumb-info__name').first().text().trim() || anchor.attr('title') || '';
                const duration = $(el).find('.video-thumb-views-box__item--duration, [data-role="video-duration"]').first().text().trim();

                if (title && href) {
                    allResults.push({
                        title,
                        url: href.startsWith('http') ? href : `https://xhamster.com${href}`,
                        thumb: img.attr('src') || '',
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

// Extract Video Stream and Parse Available Qualities
async function fetchXhamVideoDetails(url) {
    const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 12000
    });

    const $ = cheerio.load(data);
    let hlsUrl = null;

    const windowStateMatch = data.match(/window\.initials\s*=\s*({.*?});/s);
    if (windowStateMatch) {
        try {
            const initialState = JSON.parse(windowStateMatch[1]);
            const videoModel = initialState.videoModel || initialState.video;
            if (videoModel && videoModel.sources) {
                hlsUrl = videoModel.sources.hls || videoModel.sources.mp4?.h264?.[0]?.url || videoModel.sources.standard?.h264?.[0]?.url;
            }
        } catch {}
    }

    if (!hlsUrl) {
        const m3u8Match = data.match(/(https?:\\?\/\\?\/[^"]+\.m3u8[^"]*)/i);
        if (m3u8Match) hlsUrl = m3u8Match[1].replace(/\\/g, '');
    }

    if (!hlsUrl) throw new Error('No video stream URL found for this video.');

    let title = $('h1').first().text().trim() || 'xHamster Video';
    const duration = $('[data-role="video-duration"]').first().text().trim();

    // Fetch Master Playlist to extract resolutions
    let qualities = [];
    try {
        const m3u8Res = await axios.get(hlsUrl, {
            headers: { 'User-Agent': UA, 'Referer': 'https://xhamster.com/' },
            timeout: 10000
        });
        const lines = m3u8Res.data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
                const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                if (resMatch && lines[i + 1]) {
                    const qualityName = `${resMatch[1]}p`;
                    let streamUrl = lines[i + 1].trim();
                    if (!streamUrl.startsWith('http')) {
                        streamUrl = new URL(streamUrl, hlsUrl).href;
                    }
                    if (!qualities.some(q => q.quality === qualityName)) {
                        qualities.push({ quality: qualityName, url: streamUrl });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Master playlist parse error:", e.message);
    }

    // Default Fallback
    if (qualities.length === 0) {
        qualities.push({ quality: 'Auto / 720p', url: hlsUrl });
    }

    return { title, duration, hlsUrl, qualities };
}

async function xhamDownloadBuffer(streamUrl, timeOptions = {}) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'xhamdl-'));
    const outPath = join(tmpDir, 'video.mp4');

    const ffmpegArgs = [
        '-v', 'quiet',
        '-y',
        '-user_agent', UA,
        '-headers', 'Referer: https://xhamster.com/\r\n',
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
    let text = `*╭───[ 🔞 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗫𝗛𝗔𝗠𝗦𝗧𝗘𝗥 ]───╮*\n│\n`;
    text += `├─ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${startIndex + 1} - ${endIndex} of ${results.length}\n│\n`;
    text += `├─ *👇 Reply with a Number:* 👇\n│\n`;

    for (let i = startIndex; i < endIndex; i++) {
        const v = results[i];
        const numStr = String(i + 1).padStart(2, "0");
        text += `├─ 📱 *[ ${numStr} ]* 🎬 *${toSmallCaps(v.title.slice(0, 36))}* ${v.duration ? `_(${v.duration})_` : ''}\n`;
    }

    text += `│\n╰──────────────────────────────────╯\n\n`;
    if (endIndex < results.length && endIndex <= 90) {
        text += `➡️ *Reply with "${endIndex + 1}" for next 10 results*`;
    }
    return text;
}

async function processDownload(bot, mek, m, reply, from, selected, streamUrl, qualityName, timeOptions = {}, customMsg = "") {
    await reply(`*╭───[ ⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗜𝗡𝗚 ]───╮*\n│\n├─ 🎬 *Downloading Video Stream...*\n├─ 📊 *Quality:* ${qualityName}\n├─ ⚡ _Please wait while processing..._\n╰───────────────────────────╯`);

    try {
        const buffer = await xhamDownloadBuffer(streamUrl, timeOptions);

        if (!buffer || buffer.length < 5000) {
            return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Could not process video stream!_\n╰───────────────────╯`);
        }

        const sizeMB = buffer.length / (1024 * 1024);
        const title = selected.title || "xHamster Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        let captionText = `*╭───[ 🔞 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗫𝗛𝗔𝗠𝗦𝗧𝗘𝗥 ]───╮*\n│\n`;
        captionText += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(title)}\n`;
        captionText += `├─ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${qualityName}\n`;
        captionText += `├─ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* ${selected.duration || 'N/A'}\n`;
        captionText += `├─ 💾 *𝗦𝗶𝘇𝗲:* ${sizeMB.toFixed(2)} MB\n`;
        if (customMsg) captionText += `├─ ✂️ *𝗖𝘂𝘀𝘁𝗼𝗺 𝗥𝗮𝗻𝗴𝗲:* ${customMsg}\n`;
        captionText += `│\n╰──────────────────────────╯\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        const fileName = `MALIYA-MD ${cleanTitle}.mp4`;

        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText + `\n\n_📄 Video size is ${sizeMB.toFixed(1)}MB (>60MB limit), sent as document format._`
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
        console.error("xHamster Download Error:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _${e.message || "Unknown Download Error"}_\n╰───────────────────╯`);
    }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "xham",
    alias: ["xh", "xhamster"],
    desc: "Search and download videos from xHamster",
    category: "download",
    react: "🔞",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
        return reply(`*╭───[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘 ]───╮*\n│\n├─ 📌 *Usage:* .xham [search_term]\n├─ 💡 *Example:* .xham hot\n╰─────────────────────────╯`);
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("*╭───[ 🔍 𝗦𝗘𝗔𝗥𝗖𝗛𝗜𝗡𝗚 ]───╮*\n│\n├─ 🔞 *Searching xHamster...*\n├─ ⚡ _Please wait a moment..._\n╰──────────────────────╯");

    try {
        const results = await xhamSearch(q.trim(), 100);

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*╭───[ 😞 𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦 ]───╮*\n│\n├─ 🎬 *Query:* _${q}_\n╰────────────────────────╯`);
        }

        clearUserSession(sender);

        pendingXhamSearch[sender] = { 
            results, 
            timestamp: Date.now() 
        };

        await bot.sendMessage(from, { text: generateResultText(results, 0) }, { quoted: mek });

    } catch (error) {
        console.error("xHamster Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*╭───[ ❌ 𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Error occurred while searching xHamster!_\n╰─────────────────────────╯`);
    }
});

// ===== 2. NUMBER & TIME REPLY LISTENER =====
cmd({
    filter: (text, { sender, key }) => {
        if (!sender || (key && key.fromMe)) return false;
        
        const isNumber = /^\d+$/.test(text ? text.trim() : "");
        const isTimeFormat = /^\d+:\d+$/.test(text ? text.trim() : "");

        if (!isNumber && !isTimeFormat) return false;

        return Boolean(pendingXhamSearch[sender] || pendingXhamQuality[sender] || pendingXhamOption[sender] || pendingXhamCustomTime[sender]);
    }
}, async (bot, mek, m, { body, sender, reply, from }) => {
    const input = body ? body.trim() : "";
    if (!input) return;

    // LOOP PROTECTION SYSTEM
    const now = Date.now();
    const lastMsg = lastProcessedMsg[sender];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
        return;
    }
    lastProcessedMsg[sender] = { text: input, time: now };

    // 1. Custom Time Handling (Strict min:min format)
    if (pendingXhamCustomTime[sender]) {
        if (!/^\d+:\d+$/.test(input)) {
            clearUserSession(sender);
            return reply(`*╭───[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗙𝗢𝗥𝗠𝗔𝗧 ]───╮*\n│\n├─ 📝 _Session cancelled. Please search again._\n╰───────────────────────────╯`);
        }

        const { selected, streamUrl, qualityName } = pendingXhamCustomTime[sender];
        const parts = input.split(':').map(n => parseInt(n.trim()));
        
        let startMin = parts[0];
        let endMin = parts[1];

        if (isNaN(startMin) || isNaN(endMin) || startMin < 0 || endMin <= startMin) {
            clearUserSession(sender);
            return reply(`*╭───[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗧𝗜𝗠𝗘 ]───╮*\n│\n├─ 📝 _Start time must be less than end time!_\n╰──────────────────────────╯`);
        }

        delete pendingXhamCustomTime[sender];

        const startTimeInSec = startMin * 60;
        const durationInSec = (endMin - startMin) * 60;

        await bot.sendMessage(from, { react: { text: "✂️", key: m.key } });
        return processDownload(bot, mek, m, reply, from, selected, streamUrl, qualityName, { startTimeInSec, durationInSec }, `${startMin} Min to ${endMin} Min`);
    }

    // 2. Download Mode Handling (Full Video vs Custom Time)
    if (pendingXhamOption[sender]) {
        if (input !== '1' && input !== '2') return;

        const { selected, streamUrl, qualityName } = pendingXhamOption[sender];
        delete pendingXhamOption[sender];

        if (input === '1') {
            await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
            return processDownload(bot, mek, m, reply, from, selected, streamUrl, qualityName, {});
        } 
        
        if (input === '2') {
            pendingXhamCustomTime[sender] = { selected, streamUrl, qualityName, timestamp: Date.now() };
            return reply(`*╭───[ ✂️ 𝗖𝗨𝗦𝗧𝗢𝗠 𝗧𝗜𝗠𝗘 ]───╮*\n│\n├─ 📌 *Reply with Start & End minutes:*\n├─ 💡 *Example:* \`5:10\`\n├─ _(Downloads from 5th to 10th min)_\n╰───────────────────────────╯`);
        }
    }

    // 3. Quality Selection Handling
    if (pendingXhamQuality[sender]) {
        const choiceNum = parseInt(input) - 1;
        const { selected, qualities } = pendingXhamQuality[sender];

        if (isNaN(choiceNum) || choiceNum < 0 || choiceNum >= qualities.length) {
            return reply(`*╭───[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡 ]───╮*\n│\n├─ 🎯 *Range:* 1 - ${qualities.length}\n╰───────────────────────────╯`);
        }

        const chosenQuality = qualities[choiceNum];
        delete pendingXhamQuality[sender];

        // Save state for Mode Selection (Full / Custom)
        pendingXhamOption[sender] = {
            selected,
            streamUrl: chosenQuality.url,
            qualityName: chosenQuality.quality,
            timestamp: Date.now()
        };

        let optMsg = `*╭───[ 🎬 𝗦𝗘𝗟𝗘𝗖𝗧𝗘𝗗 𝗩𝗜𝗗𝗘𝗢 ]───╮*\n│\n`;
        optMsg += `├─ 📌 *${toSmallCaps(selected.title.slice(0, 36))}*\n`;
        optMsg += `├─ 📊 *Selected Quality:* ${chosenQuality.quality}\n│\n`;
        optMsg += `├─ *👇 Select Download Mode:* 👇\n│\n`;
        optMsg += `├─ 📱 *[ 01 ]* 🎬 Full Video Download\n`;
        optMsg += `├─ 📱 *[ 02 ]* ✂️ Custom Time Range\n│\n`;
        optMsg += `╰──────────────────────────────────╯`;

        return reply(optMsg);
    }

    // 4. Search Result Selection -> Extract Qualities Step
    if (pendingXhamSearch[sender]) {
        const num = parseInt(input);
        if (isNaN(num)) return;

        const session = pendingXhamSearch[sender];
        if (num <= 0 || num > session.results.length) return;

        if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
            session.timestamp = Date.now();
            return reply(generateResultText(session.results, num - 1));
        }

        const selected = session.results[num - 1];
        delete pendingXhamSearch[sender];

        await reply(`*╭───[ ⏳ 𝗙𝗘𝗧𝗖𝗛𝗜𝗡𝗚 𝗤𝗨𝗔𝗟𝗜𝗧𝗜𝗘𝗦 ]───╮*\n│\n├─ 🔞 *Parsing video stream qualities...*\n├─ ⚡ _Please wait a moment..._\n╰────────────────────────────╯`);

        try {
            const videoDetails = await fetchXhamVideoDetails(selected.url);

            pendingXhamQuality[sender] = {
                selected: { ...selected, title: videoDetails.title || selected.title, duration: videoDetails.duration || selected.duration },
                qualities: videoDetails.qualities,
                timestamp: Date.now()
            };

            let qMsg = `*╭───[ 📊 𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬 ]───╮*\n│\n`;
            qMsg += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(selected.title.slice(0, 36))}\n│\n`;
            qMsg += `├─ *👇 Reply with Quality Number:* 👇\n│\n`;

            videoDetails.qualities.forEach((q, idx) => {
                const numStr = String(idx + 1).padStart(2, "0");
                qMsg += `├─ 📱 *[ ${numStr} ]* 🎬 ${q.quality}\n`;
            });

            qMsg += `│\n╰──────────────────────────────────╯`;

            return reply(qMsg);

        } catch (err) {
            console.error("Quality Extract Error:", err);
            return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Failed to extract stream qualities!_\n╰───────────────────╯`);
        }
    }
});

// Auto Cleanup
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXhamSearch) {
        if (now - pendingXhamSearch[s].timestamp > SESSION_TIMEOUT) delete pendingXhamSearch[s];
    }
    for (const s in pendingXhamQuality) {
        if (now - pendingXhamQuality[s].timestamp > SESSION_TIMEOUT) delete pendingXhamQuality[s];
    }
    for (const s in pendingXhamOption) {
        if (now - pendingXhamOption[s].timestamp > SESSION_TIMEOUT) delete pendingXhamOption[s];
    }
    for (const s in pendingXhamCustomTime) {
        if (now - pendingXhamCustomTime[s].timestamp > SESSION_TIMEOUT) delete pendingXhamCustomTime[s];
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingXhamSearch };
