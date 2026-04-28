const { cmd } = require('../command');
const {
    xnxxSearch, xnxxDownload,
    phSearch, phDownload,
    xvideosSearch, xvideosDownload,
    xhamsterSearch, xhamsterDownload
} = require('@soyaxell09/zenbot-scraper');
const axios = require('axios');

// ===== STORAGE =====
const sessions = new Map();
const cooldown = new Map();

// ===== SETTINGS =====
const SESSION_TIMEOUT = 5 * 60 * 1000;
const COOLDOWN_TIME = 4000; // 4 sec
const VIDEO_LIMIT_MB = 40;

// ===== UTIL =====
const sanitize = (t) =>
    t.replace(/[\\/:*?"<>|]/g, "").substring(0, 30) || "Video";

// Site detection improved
const getSite = (q) => {
    if (/xnxx/i.test(q)) return "xnxx";
    if (/pornhub|ph/i.test(q)) return "ph";
    if (/xvideos|xv/i.test(q)) return "xv";
    if (/xhamster|xham/i.test(q)) return "xham";
    return "xnxx"; // Default
};

const getDownloader = (site) => {
    const list = { xnxx: xnxxDownload, ph: phDownload, xv: xvideosDownload, xham: xhamsterDownload };
    return list[site] || xnxxDownload;
};

const getSearch = (site) => {
    const list = { xnxx: xnxxSearch, ph: phSearch, xv: xvideosSearch, xham: xhamsterSearch };
    return list[site] || xnxxSearch;
};

// ===== COMMAND =====
cmd({
    pattern: "xxx",
    desc: "ULTRA NSFW System",
    category: "owner",
    react: "🔥",
    filename: __filename
},
async (bot, mek, m, { from, q, sender, isOwner, reply }) => {

    if (!isOwner) return;

    if (!q) {
        return reply(`🔥 *ULTRA XXX SYSTEM*

*Usage:*
.xxx [name] -> (Searches XNXX)
.xxx [site] [name] -> (e.g: .xxx ph girl)
.xxx [link] -> (Direct Download)

*Supported:* xnxx, ph, xv, xham`);
    }

    const now = Date.now();
    if (cooldown.get(sender) && now - cooldown.get(sender) < COOLDOWN_TIME) {
        return reply("⏳ Slow down bro...");
    }
    cooldown.set(sender, now);

    try {
        // ===== DIRECT LINK =====
        if (/^https?:\/\//.test(q.trim())) {
            const site = getSite(q);
            await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });
            return await download(bot, from, q.trim(), site, mek, reply);
        }

        // ===== SEARCH LOGIC =====
        const args = q.split(" ");
        let site = "xnxx";
        let query = q;

        // Check if first word is a site name (e.g. .xxx ph school)
        if (["xnxx", "ph", "pornhub", "xv", "xvideos", "xham", "xhamster"].includes(args[0].toLowerCase())) {
            site = getSite(args[0]);
            query = args.slice(1).join(" ");
        }

        if (!query) return reply("❌ Please provide a search term.");

        const searchFunc = getSearch(site);
        reply(`🔎 Searching ${site.toUpperCase()} for "${query}"...`);

        let data = await searchFunc(query).catch(() => null);

        if (!data || !data.length) return reply(`❌ No results found on ${site.toUpperCase()}.`);

        const results = data.slice(0, 5).map(v => ({
            title: v.title || "No title",
            link: v.link || v.url
        })).filter(v => v.link);

        if (!results.length) return reply("❌ No valid links found.");

        const key = `${from}_${sender}`;
        sessions.set(key, { results, site, time: Date.now() });

        let txt = `🔞 *${site.toUpperCase()} RESULTS*\n\n`;
        results.forEach((v, i) => { txt += `*${i + 1}.* ${v.title}\n`; });
        txt += `\n*Reply 1-5 within 5 min*`;

        return bot.sendMessage(from, { text: txt }, { quoted: mek });

    } catch (e) {
        reply("❌ System error occurred.");
    }
});

// ===== REPLY HANDLER =====
cmd({ on: "body" }, async (bot, mek, m, { body, sender, from, isOwner }) => {
    if (!isOwner) return;

    const input = body.trim();
    if (!/^\d+$/.test(input)) return;

    // Must be a reply to the bot's list
    if (!m.quoted) return;

    const key = `${from}_${sender}`;
    const session = sessions.get(key);

    if (!session || (Date.now() - session.time > SESSION_TIMEOUT)) {
        if (session) sessions.delete(key);
        return;
    }

    const num = parseInt(input);
    if (num < 1 || num > session.results.length) return;

    const selected = session.results[num - 1];
    sessions.delete(key);

    await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });
    await download(bot, from, selected.link, session.site, mek);
});

// ===== DOWNLOAD FUNCTION =====
async function download(bot, from, url, site, mek, reply) {
    try {
        const func = getDownloader(site);
        const data = await func(url);

        if (!data || !data.files) return reply ? reply("❌ Failed to fetch video.") : null;

        const video = data.files.high || data.files.low || (data.files.HLS && !data.files.HLS.includes(".m3u8") ? data.files.HLS : null);
        if (!video) return reply ? reply("❌ No MP4 found.") : null;

        let size = 0;
        try {
            const res = await axios.head(video, { timeout: 5000 });
            size = (res.headers['content-length'] || 0) / (1024 * 1024);
        } catch { size = 0; }

        const title = sanitize(data.title || "Video");
        const cap = `✅ *Downloaded*\n\n🎬 ${title}\n⚖️ ${size ? size.toFixed(2) + "MB" : "Unknown"}`;

        const docParams = {
            document: { url: video },
            fileName: `${title}.mp4`,
            mimetype: 'video/mp4',
            caption: cap
        };

        if (size > VIDEO_LIMIT_MB || size === 0) {
            return bot.sendMessage(from, docParams, { quoted: mek });
        }

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
        if (reply) reply("❌ Download failed.");
    }
}

// Cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of sessions) {
        if (now - v.time > SESSION_TIMEOUT) sessions.delete(k);
    }
}, 60000);
