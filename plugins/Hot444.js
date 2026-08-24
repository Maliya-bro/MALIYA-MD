const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, rm, readFile } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

const execAsync = promisify(exec);
const pendingPhSearch = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // විනාඩි 10යි
const UA = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// ===== HELPER FUNCTIONS =====
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

async function phSearch(query, limit = 10) {
  const { data } = await axios.get(`https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 12000
  });
  const $ = cheerio.load(data);
  const results = [];
  $('li[data-video-vkey]').each((_, el) => {
    if (results.length >= limit) return false;
    const anchor = $(el).find('a.imageLink').first();
    const img = $(el).find('img.videoThumb').first();
    const href = anchor.attr('href') || '';
    const title = $(el).find('.title a').first().text().trim();
    const duration = $(el).find('.duration').first().text().trim();
    if (!title || !href) return;
    results.push({
      title,
      url: href.startsWith('http') ? href : `https://www.pornhub.com${href}`,
      thumb: img.attr('src') || '',
      duration
    });
  });
  return results;
}

async function phDownloadBuffer(url) {
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
  try {
    await execAsync(
      `ffmpeg -v quiet -y -user_agent "${UA}" -headers "Referer: https://www.pornhub.com/\r\n" -i "${hlsItem.videoUrl}" -t 300 -c copy -bsf:a aac_adtstoasc "${outPath}"`,
      { timeout: 120000 }
    );
    const buffer = await readFile(outPath);
    return { title, thumb, duration, buffer, quality: `${hlsItem.quality}p` };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "ph",
    alias: ["pornhub", "phub"],
    desc: "Search and download videos from Pornhub",
    category: "download",
    react: "🟧",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply(`*🟧 Pornhub Downloader*\n\nUsage: .ph [search_term]\nExample: .ph hot`);

    reply("*🔍 Searching Pornhub for videos...*");

    try {
        const results = await phSearch(q.trim(), 10);

        if (!results.length) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`*❌ No results found on Pornhub for "${q}".*`);
        }

        pendingPhSearch[sender] = { results, timestamp: Date.now() };

        let text = "*🟧 PORNHUB SEARCH RESULTS:*\n\n";
        results.forEach((v, i) => {
            text += `*${i + 1}.* ${v.title.slice(0, 60)} ${v.duration ? `(${v.duration})` : ''}\n`;
        });
        text += `\n*Reply with video number (1-${results.length})*`;

        reply(text);

    } catch (error) {
        console.error("Pornhub Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Error searching Pornhub!*`);
    }
});

// ===== 2. NUMBER REPLY LISTENER =====
cmd({
    filter: (text, { sender }) => pendingPhSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingPhSearch[sender].results.length
}, async (bot, mek, m, { body, sender, reply, from }) => {

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingPhSearch[sender].results[index];
    delete pendingPhSearch[sender];

    reply(`*⚙️ Processing and converting HLS stream (FFmpeg), please wait...*`);

    try {
        const videoData = await phDownloadBuffer(selected.url);

        if (!videoData || !videoData.buffer) {
            return reply(`*❌ Failed to extract video buffer.*`);
        }

        const sizeMB = videoData.buffer.length / (1024 * 1024);
        const title = videoData.title || selected.title;
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        const captionText = `*🟧 ${title}*\n*📊 Quality:* ${videoData.quality}\n*💾 Size:* ${sizeMB.toFixed(2)} MB\n\n*Enjoy your video! 🍿*`;

        await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

        // 60MB+ නම් Document, නැත්නම් Video
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
        console.error("Pornhub Download Error:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`*❌ Download process failed:* ${e.message || "Unknown Error"}`);
    }
});

// Auto Cleanup
setInterval(() => {
    const now = Date.now();
    for (const s in pendingPhSearch) {
        if (now - pendingPhSearch[s].timestamp > SESSION_TIMEOUT) delete pendingPhSearch[s];
    }
}, 5 * 60 * 1000);

module.exports = { pendingPhSearch };
