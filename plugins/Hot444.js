const { cmd } = require('../command');
const { xhamsterSearch, xhamsterDownload } = require('@soyaxell09/zenbot-scraper');
const axios = require('axios');

// ===== STORAGE & SETTINGS =====
const xhamSessions = new Map();
const xhamCooldown = new Map();

const SESSION_TIMEOUT = 5 * 60 * 1000; // විනාඩි 5
const COOLDOWN_TIME = 4000; // තත්පර 4
const VIDEO_LIMIT_MB = 40; // වීඩියෝ ලෝඩ් ලිමිට්

// ===== UTIL =====
const sanitize = (t) =>
    t.replace(/[\\/:*?"<>|]/g, "").substring(0, 30) || "xHamster_Video";

// ===== MAIN COMMAND =====
cmd({
    pattern: "xham",
    alias: ["xhamster"],
    desc: "xHamster NSFW Search & Downloader",
    category: "owner",
    react: "🐹",
    filename: __filename
},
async (bot, mek, m, { from, q, sender, isOwner, reply }) => {

    if (!isOwner) return;

    if (!q) {
        return reply(`🔞 *xHAMSTER SYSTEM*\n\n*Usage:*\n.xham [name] -> (සෙවුම් කිරීමට)\n.xham [link] -> (ඍජුව ඩවුන්ලෝඩ් කිරීමට)\n\n*Reply within 5 minutes.*`);
    }

    // Cooldown Check
    const now = Date.now();
    if (xhamCooldown.get(sender) && now - xhamCooldown.get(sender) < COOLDOWN_TIME) {
        return reply("⏳ Slow down bro...");
    }
    xhamCooldown.set(sender, now);

    try {
        const input = q.trim();

        // 1. Direct Link මාදිලිය
        if (/^https?:\/\//.test(input)) {
            if (!/xhamster/i.test(input)) return reply("❌ This is not a valid xHamster link!");
            await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });
            return await handleXhamDownload(bot, from, input, mek, reply);
        }

        // 2. Search මාදිලිය
        reply(`🔎 Searching xHamster for "${input}"...`);
        let data = await xhamsterSearch(input).catch(() => null);

        if (!data || !data.length) return reply("❌ No results found on xHamster.");

        // Data Structure ආරක්ෂණය
        const results = data.slice(0, 5).map(v => {
            let rawLink = v.link || v.url || v.id;
            if (rawLink && !rawLink.startsWith('http')) {
                rawLink = `https://xhamster.com/videos/${rawLink}`;
            }
            return {
                title: v.title || "No title",
                link: rawLink
            };
        }).filter(v => v.link);

        if (!results.length) return reply("❌ Failed to parse valid links from results.");

        // Session එක ගබඩා කිරීම
        const key = `${from}_${sender}`;
        xhamSessions.set(key, { results, time: Date.now() });

        let txt = `🐹 *xHAMSTER SEARCH RESULTS*\n\n`;
        results.forEach((v, i) => { txt += `*${i + 1}.* ${v.title}\n`; });
        txt += `\n*Reply 1-5 within 5 min to download*`;

        return bot.sendMessage(from, { text: txt }, { quoted: mek });

    } catch (e) {
        reply("❌ System error occurred during search.");
    }
});

// ===== REPLY HANDLER =====
cmd({ on: "body" }, async (bot, mek, m, { body, sender, from, isOwner }) => {
    if (!isOwner) return;

    const input = body.trim();
    if (!/^\d+$/.test(input)) return;
    if (!m.quoted) return;

    const key = `${from}_${sender}`;
    const session = xhamSessions.get(key);

    if (!session || (Date.now() - session.time > SESSION_TIMEOUT)) {
        if (session) xhamSessions.delete(key);
        return;
    }

    const num = parseInt(input);
    if (num < 1 || num > session.results.length) return;

    const selected = session.results[num - 1];
    xhamSessions.delete(key);

    await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });
    await handleXhamDownload(bot, from, selected.link, mek);
});

// ===== DOWNLOAD CORE =====
async function handleXhamDownload(bot, from, url, mek, reply) {
    try {
        const data = await xhamsterDownload(url);
        if (!data || !data.files) return reply ? reply("❌ Failed to fetch video files.") : null;

        // MP4 ලින්ක් එක වෙන් කරගැනීම
        const video = data.files.high || data.files.low || (data.files.HLS && !data.files.HLS.includes(".m3u8") ? data.files.HLS : null);
        if (!video) return reply ? reply("❌ No downloadable MP4 stream found.") : null;

        // Size පරීක්ෂාව
        let size = 0;
        try {
            const res = await axios.head(video, { timeout: 5000 });
            size = (res.headers['content-length'] || 0) / (1024 * 1024);
        } catch { size = 0; }

        const title = sanitize(data.title || "xHamster Video");
        const cap = `✅ *xHamster Downloaded*\n\n🎬 ${title}\n⚖️ ${size ? size.toFixed(2) + "MB" : "Unknown"}`;

        const docParams = {
            document: { url: video },
            fileName: `${title}.mp4`,
            mimetype: 'video/mp4',
            caption: cap
        };

        // සීමාව ඉක්මවයි නම් Document ලෙස යැවීම
        if (size > VIDEO_LIMIT_MB || size === 0) {
            return bot.sendMessage(from, docParams, { quoted: mek });
        }

        // වීඩියෝ එකක් ලෙස යැවීමට උත්සාහ කිරීම (Fallback සහිතව)
        try {
            return await bot.sendMessage(from, {
                video: { url: video },
                caption: cap,
                mimetype: 'video/mp4'
            }, { quoted: mek });
        } catch {
            return bot.sendMessage(from, docParams, { quoted: mek });
        }
    } catch (e) {
        if (reply) reply("❌ Download process failed.");
    }
}

// Session Cleanup Interval
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of xhamSessions) {
        if (now - v.time > SESSION_TIMEOUT) xhamSessions.delete(k);
    }
}, 60000);
