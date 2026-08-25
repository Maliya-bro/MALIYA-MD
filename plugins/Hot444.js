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
const pendingPhSearch = {};
const pendingPhOption = {};
const pendingPhCustomTime = {};
const lastProcessedMsg = {}; // Loop Protection State

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000; // 3 Seconds Cooldown for Loop Prevention
const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

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

function parseDuration(iso) {
    if (!iso) return null;
    const match = iso.match(/PT(\d+)H(\d+)M(\d+)S/);
    if (!match) return iso;
    const h = parseInt(match[1]), m = parseInt(match[2]), s = parseInt(match[3]);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function extractMediaDefinitions(s) {
    const start = s.indexOf('mediaDefinitions');
    if (start === -1) return null;
    const arrStart = s.indexOf('[', start);
    if (arrStart === -1) return null;
    let depth = 0, end = -1;
    for (let i = arrStart; i < s.length; i++) {
        if (s[i] === '[') depth++;
        else if (s[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    try { return JSON.parse(s.slice(arrStart, end + 1).replace(/\\\//g, '/')); }
    catch { return null; }
}

function clearUserSession(sender) {
    delete pendingPhSearch[sender];
    delete pendingPhOption[sender];
    delete pendingPhCustomTime[sender];
}

async function phSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) {
        const url = page === 1 
            ? `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}` 
            : `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}&page=${page}`;

        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 12000
            });
            const $ = cheerio.load(data);
            
            $('li[data-video-vkey]').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a.imageLink').first();
                const img = $(el).find('img.videoThumb').first();
                const href = anchor.attr('href') || '';
                const title = $(el).find('.title a').first().text().trim();
                const duration = $(el).find('.duration').first().text().trim();
                if (title && href) {
                    allResults.push({
                        title,
                        url: href.startsWith('http') ? href : `https://www.pornhub.com${href}`,
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

async function phDownloadBuffer(url, timeOptions = {}) {
    const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 12000
    });
    const $ = cheerio.load(data);
    const scripts = $('script').map((_, el) => $(el).html()).get();
    let mediaDefinitions = null;
    for (const s of scripts) {
        if (!s || !s.includes('mediaDefinitions')) continue;
        mediaDefinitions = extractMediaDefinitions(s);
        if (mediaDefinitions) break;
    }
    if (!mediaDefinitions) throw new Error('No video stream definitions found.');
    
    const hlss = mediaDefinitions
        .filter(d => d.format === 'hls' && d.videoUrl && d.quality)
        .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    if (!hlss.length) throw new Error('No HLS video stream found.');

    const hlsItem = hlss.find(d => d.quality === '720') || hlss.find(d => d.quality === '480') || hlss[0];

    const jsonLd = $('script[type="application/ld+json"]').first().html();
    let title = null, thumb = null, duration = null;
    if (jsonLd) {
        try {
            const parsed = JSON.parse(jsonLd);
            title = parsed.name || null;
            thumb = parsed.thumbnailUrl || null;
            duration = parseDuration(parsed.duration);
        } catch {}
    }
    if (!title) title = $('h1.title span').text().trim() || $('h1').first().text().trim() || 'Pornhub Video';

    const tmpDir = await mkdtemp(join(tmpdir(), 'phdl-'));
    const outPath = join(tmpDir, 'video.mp4');

    const ffmpegArgs = [
        '-v', 'quiet',
        '-y',
        '-user_agent', UA,
        '-headers', 'Referer: https://www.pornhub.com/\r\n',
        '-i', hlsItem.videoUrl
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

        return { title, thumb, duration, buffer, quality: `${hlsItem.quality}p` };
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

    text += `\n───────────────\n`;
    text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*\n`;
    if (endIndex < results.length && endIndex <= 90) {
        text += `➡️ *ʀᴇᴘʟʏ ᴡɪᴛʜ "${endIndex + 1}" ᴛᴏ sᴇᴇ ɴᴇxᴛ 10 ʀᴇsᴜʟᴛs*`;
    }
    return text;
}

async function processDownload(bot, mek, m, reply, from, selected, timeOptions = {}, customMsg = "") {
    await reply(`⚙️ *ᴘʀᴏᴄᴇssɪɴɢ sᴛʀᴇᴀᴍ & ʀᴇɴᴅᴇʀɪɴɢ ᴠɪᴅᴇᴏ...*\n\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*`);

    try {
        const videoData = await phDownloadBuffer(selected.url, timeOptions);

        if (!videoData || !videoData.buffer || videoData.buffer.length < 5000) {
            return reply(`❌ *ᴄᴏᴜʟᴅ ɴᴏᴛ ᴘʀᴏᴄᴇss ᴠɪᴅᴇᴏ sᴛʀᴇᴀᴍ ᴏʀ ɪɴᴠᴀʟɪᴅ sᴇɢᴍᴇɴᴛ ʀᴀɴɢᴇ!*`);
        }

        const sizeMB = videoData.buffer.length / (1024 * 1024);
        const title = videoData.title || selected.title || "Pornhub Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        let captionText = `🎬 *${toSmallCaps(title)}*\n\n📊 *ǫᴜᴀʟɪᴛʏ:* ${videoData.quality || '720p'}\n⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${videoData.duration || selected.duration || 'N/A'}\n💾 *sɪᴢᴇ:* ${sizeMB.toFixed(2)} MB`;
        if (customMsg) captionText += `\n✂️ *ᴄᴜsᴛᴏᴍ ʀᴀɴɢᴇ:* ${customMsg}`;
        captionText += `\n\n🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴠɪᴅᴇᴏ!*\n\n👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        const fileName = `MALIYA-MD ${cleanTitle}.mp4`;

        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: videoData.buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText + `\n\n_📄 Video size is ${sizeMB.toFixed(1)}MB (>60MB limit), sent as document format._`
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: videoData.buffer,
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
    pattern: "xxx",
    alias: ["pornhub", "phub", "hot", "ph"],
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

        clearUserSession(sender);

        pendingPhSearch[sender] = { 
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

// ===== 2. NUMBER & TIME REPLY LISTENER =====
cmd({
    filter: (text, { sender, key }) => {
        if (!sender || (key && key.fromMe)) return false; // Prevent Bot Self-Loop
        return Boolean(pendingPhSearch[sender] || pendingPhOption[sender] || pendingPhCustomTime[sender]);
    }
}, async (bot, mek, m, { body, sender, reply, from }) => {
    const input = body ? body.trim() : "";
    if (!input) return;

    // === LOOP PROTECTION SYSTEM ===
    const now = Date.now();
    const lastMsg = lastProcessedMsg[sender];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
        console.warn(`[LOOP PREVENTED] Ignored duplicate input '${input}' from ${sender}`);
        return;
    }
    lastProcessedMsg[sender] = { text: input, time: now };

    // 1. Custom Time Handling (e.g. 5:10)
    if (pendingPhCustomTime[sender]) {
        if (!input.includes(':')) {
            return reply(`❌ *ɪɴᴠᴀʟɪᴅ ᴛɪᴍᴇ ғᴏʀᴍᴀᴛ!*\n\n📌 *ᴘʟᴇᴀsᴇ sᴇɴᴅ ɪɴ StartMinute:EndMinute ғᴏʀᴍᴀᴛ.*\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`5:10\` _(From 5th minute to 10th minute)_`);
        }

        const selected = pendingPhCustomTime[sender].selected;
        const parts = input.split(':').map(n => parseInt(n.trim()));
        
        let startMin = parts[0];
        let endMin = parts[1];

        if (isNaN(startMin) || isNaN(endMin) || startMin < 0 || endMin <= startMin) {
            return reply(`❌ *ɪɴᴠᴀʟɪᴅ ᴛɪᴍᴇ ᴠᴀʟᴜᴇs!*\n\n📌 *sᴛᴀʀᴛ ᴍɪɴᴜᴛᴇ ᴍᴜsᴛ ʙᴇ sᴍᴀʟʟᴇʀ ᴛʜᴀɴ ᴇɴᴅ ᴍɪɴᴜᴛᴇ.*\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`5:10\` _(From 5th minute to 10th minute)_`);
        }

        delete pendingPhCustomTime[sender];

        const startTimeInSec = startMin * 60;
        const durationInSec = (endMin - startMin) * 60;

        await bot.sendMessage(from, { react: { text: "✂️", key: m.key } });
        return processDownload(bot, mek, m, reply, from, selected, { startTimeInSec, durationInSec }, `${startMin} Min to ${endMin} Min`);
    }

    // 2. Option 1 or 2 Handling
    if (pendingPhOption[sender]) {
        if (input !== '1' && input !== '2') return;

        const selected = pendingPhOption[sender].selected;
        delete pendingPhOption[sender];

        if (input === '1') {
            await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
            return processDownload(bot, mek, m, reply, from, selected, {});
        } 
        
        if (input === '2') {
            pendingPhCustomTime[sender] = { selected, timestamp: Date.now() };
            return reply(`✂️ *ᴄᴜsᴛᴏᴍ ᴛɪᴍᴇ ᴅᴏᴡɴʟᴏᴀᴅ (ɪɴ ᴍɪɴᴜᴛᴇs)*\n\n📌 *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴡɪᴛʜ sᴛᴀʀᴛ ᴍɪɴᴜᴛᴇ ᴀɴᴅ ᴇɴᴅ ᴍɪɴᴜᴛᴇ:*\n\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`5:10\`\n_(This will download from **5th minute** to **10th minute**)_`);
        }
    }

    // 3. Search Result Number Selection
    if (pendingPhSearch[sender]) {
        const num = parseInt(input);
        if (isNaN(num)) return;

        const session = pendingPhSearch[sender];
        if (num <= 0 || num > session.results.length) return;

        if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
            session.timestamp = Date.now();
            return reply(generateResultText(session.results, num - 1));
        }

        const selected = session.results[num - 1];
        delete pendingPhSearch[sender];

        pendingPhOption[sender] = { selected, timestamp: Date.now() };

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
});

// Auto Cleanup & Loop Reset Interval
setInterval(() => {
    const now = Date.now();
    for (const s in pendingPhSearch) {
        if (now - pendingPhSearch[s].timestamp > SESSION_TIMEOUT) delete pendingPhSearch[s];
    }
    for (const s in pendingPhOption) {
        if (now - pendingPhOption[s].timestamp > SESSION_TIMEOUT) delete pendingPhOption[s];
    }
    for (const s in pendingPhCustomTime) {
        if (now - pendingPhCustomTime[s].timestamp > SESSION_TIMEOUT) delete pendingPhCustomTime[s];
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingPhSearch };
