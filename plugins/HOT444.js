const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, readFile, rm } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

const execFileAsync = promisify(execFile);
const pendingXhamSearch = {};
const SESSION_TIMEOUT = 5 * 60 * 1000; // විනාඩි 5යි
const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function secsToTime(s) {
    if (!s) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

// 100ක් වෙනකම් Results Scrape කරන විදිහට වෙනස් කර ඇත
async function xhamsterSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) { // Pages 5ක් දක්වා Scraping සිදුකරයි
        const url = page === 1 
            ? `https://xhamster.com/search/${encodeURIComponent(query)}` 
            : `https://xhamster.com/search/${encodeURIComponent(query)}?page=${page}`;

        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': UA },
                timeout: 12000
            });
            const $ = cheerio.load(data);
            
            $('[class*="video-thumb"]').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a.thumb-image-container').first();
                const img = $(el).find('img').first();
                const title = anchor.attr('aria-label') || $(el).find('[class*="name"]').first().text().trim();
                const href = anchor.attr('href') || '';
                const thumb = img.attr('src') || img.attr('srcset')?.split(' ')[0] || '';
                const duration = $(el).find('time').first().attr('datetime') || '';
                const views = $(el).find('[class*="views"]').first().text().trim();
                if (title && href) {
                    allResults.push({ title, url: href, thumb, duration, views });
                }
            });
            page++;
        } catch (err) {
            break;
        }
    }
    return allResults;
}

async function xhamsterDownloadBuffer(url, quality = '720p') {
    const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA },
        timeout: 12000
    });
    const $ = cheerio.load(data);
    const scripts = $('script').map((_, el) => $(el).html()).get();
    let title = null, thumb = null, duration = null, views = null;
    for (const s of scripts) {
        if (!s || !s.includes('"title"') || !s.includes('"duration"')) continue;
        try {
            const match = s.match(/"title":"([^"]+)","thumbUrl":"([^"]+)","duration":(\d+),"views":(\d+)/);
            if (match) {
                title = match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
                thumb = match[2].replace(/\\\//g, '/');
                duration = secsToTime(parseInt(match[3]));
                views = parseInt(match[4]);
                break;
            }
        } catch {}
    }
    if (!title) title = $('meta[property="og:title"]').attr('content') || null;
    if (!thumb) thumb = $('meta[property="og:image"]').attr('content') || null;
    
    const mp4Matches = [...new Set(data.match(/https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g) || [])];
    const masterUrl = mp4Matches.find(u => u.includes('480p') || u.includes('hls4'));
    if (!masterUrl) throw new Error('No video stream found.');
    
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const { data: m3u8 } = await axios.get(masterUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://xhamster.com/' },
        timeout: 10000
    });
    
    const lines = m3u8.split('\n');
    let streamUrl = null;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const qualMatch = lines[i + 1]?.trim().match(/(\d+p)/);
            const q = qualMatch ? qualMatch[1] : null;
            if (q === quality || (!streamUrl && q)) {
                const next = lines[i + 1]?.trim();
                streamUrl = next.startsWith('http') ? next : baseUrl + next;
                if (q === quality) break;
            }
        }
    }
    if (!streamUrl) throw new Error('Requested quality stream not found.');
    
    const tmpDir = await mkdtemp(join(tmpdir(), 'xhdl-'));
    const outPath = join(tmpDir, 'video.mp4');
    try {
        await execFileAsync('ffmpeg', [
            '-v', 'quiet',
            '-y',
            '-user_agent', UA,
            '-headers', 'Referer: https://xhamster.com/\r\n',
            '-i', streamUrl,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '26',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            outPath
        ], { timeout: 180000 });

        const buffer = await readFile(outPath);
        return { title, thumb, duration, views, buffer, quality };
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

// 10 බැගින් Result Text එක හදන Helper Function එක
function generateResultText(results, startIndex = 0) {
    const endIndex = Math.min(startIndex + 10, results.length);
    let text = `*🐹 xHAMSTER RESULTS (${startIndex + 1} - ${endIndex} of ${results.length}):*\n\n`;
    
    for (let i = startIndex; i < endIndex; i++) {
        const v = results[i];
        text += `*${i + 1}.* ${v.title.slice(0, 50)} ${v.duration ? `(${v.duration})` : ''}\n`;
    }
    
    text += `\n📌 *Reply with video number to download.*`;
    if (endIndex < results.length && endIndex <= 90) {
        text += `\n➡️ *Reply with "${endIndex + 1}" to see next 10 results.*`;
    }
    return text;
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "xhamster",
    alias: ["xham", "hamster"],
    desc: "Search and download videos from xHamster",
    category: "download",
    react: "🐹",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply(`*🐹 xHamster Downloader*\n\nUsage: .xhamster [search_term]\nExample: .xhamster hot`);

    reply("*🔍 Searching xHamster for videos...*");

    try {
        const results = await xhamsterSearch(q.trim(), 100);

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*❌ No results found on xHamster for "${q}".*`);
        }

        // Search Data එක Save කරගැනීම
        pendingXhamSearch[sender] = { 
            results, 
            timestamp: Date.now() 
        };

        // මුල් 10 පෙන්වීම (Index 0 සිට 9 දක්වා)
        reply(generateResultText(results, 0));

    } catch (error) {
        console.error("xHamster Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Error occurred while searching xHamster!*`);
    }
});

// ===== 2. NUMBER REPLY & NEXT PAGE LISTENER =====
cmd({
    filter: (text, { sender }) => pendingXhamSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingXhamSearch[sender].results.length
}, async (bot, mek, m, { body, sender, reply, from }) => {

    const num = parseInt(body.trim());
    const session = pendingXhamSearch[sender];

    // Check if the user entered 11, 21, 31, 41 ... 91 to load NEXT page
    if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
        session.timestamp = Date.now(); // Reset timeout on page change
        return reply(generateResultText(session.results, num - 1));
    }

    // වීඩියෝවක් තෝරාගත් විට:
    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    const selected = session.results[num - 1];
    delete pendingXhamSearch[sender]; // Download එක පටන් ගත් පසු Session එක clear කරයි

    reply(`*⚙️ Processing video #${num}, please wait...*`);

    try {
        const videoData = await xhamsterDownloadBuffer(selected.url, '720p');

        if (!videoData || !videoData.buffer) {
            return reply(`*❌ Could not process video stream.*`);
        }

        const sizeMB = videoData.buffer.length / (1024 * 1024);
        const title = videoData.title || selected.title || "xHamster Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        const captionText = `*🐹 ${title}*\n*📊 Quality:* ${videoData.quality || '720p'}\n*⏱️ Duration:* ${videoData.duration || selected.duration || 'N/A'}\n*💾 Size:* ${sizeMB.toFixed(2)} MB\n\n*Enjoy your video! 🍿*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: videoData.buffer,
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText + `\n\n_📄 File is larger than 60MB, sent as document._`
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: videoData.buffer,
                mimetype: "video/mp4",
                fileName: `${cleanTitle}.mp4`,
                caption: captionText
            }, { quoted: mek });
        }

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("xHamster Download Error Details:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Download process failed:* ${e.message || "Unknown Error"}`);
    }
});

// Auto Cleanup (විනාඩි 5 Timeout)
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXhamSearch) {
        if (now - pendingXhamSearch[s].timestamp > SESSION_TIMEOUT) {
            delete pendingXhamSearch[s];
        }
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingXhamSearch };
