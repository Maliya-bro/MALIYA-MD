const { cmd, replyHandlers } = require("../command");
const cheerio = require("cheerio");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { Storage } = require('megajs');

puppeteer.use(StealthPlugin());

// Memory Leak වැළැක්වීමට Map භාවිතය
const pendingSearch = new Map();
const pendingQuality = new Map();

// --- CREDENTIALS (හීනියට Password එක මාරු කරලා මෙතනට දාන්න) ---
const MEGA_EMAIL = "sithmikavihara801@gmail.com";
const MEGA_PASSWORD = "@@@iron. spider*man";

/**
 * MALIYA-MD BROWSER ENGINE (With Global Stability)
 */
async function getBypassedContent(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 8000)); 
        return await page.content();
    } catch (e) {
        console.error("MALIYA-MD BROWSER ERROR:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

// 1. FILM SEARCH COMMAND
cmd({
    pattern: "film",
    alias: ["movie", "cinesubz"],
    react: "🎬",
    category: "download",
    filename: __filename
}, async (sock, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply("Please provide a movie name.");
    reply("🔎 *MALIYA-MD DATABASE IS SEARCHING...*");
    
    try {
        const searchUrl = `https://cinesubz.lk/?s=${encodeURIComponent(q)}`;
        const html = await getBypassedContent(searchUrl);
        if (!html) return reply("❌ Security Bypass Failed.");

        const $ = cheerio.load(html);
        const results = [];
        $('.display-item').each((i, el) => {
            if (i < 5) {
                const title = $(el).find('h2 a').text().trim() || $(el).find('a').attr('title');
                const link = $(el).find('a').attr('href');
                const img = $(el).find('img').attr('src');
                if(link) results.push({ title, link, img });
            }
        });

        if (results.length === 0) return reply("❌ No results found.");

        pendingSearch.set(sender, { results, timestamp: Date.now() });
        
        let msg = `🎬 *MALIYA-MD MOVIE SEARCH RESULTS*\n\n`;
        results.forEach((res, i) => msg += `*${i+1}.* ${res.title}\n`);
        msg += `\n📥 *Reply with number to see quality.*`;

        const thumb = results[0].img || "https://i.ibb.co/video-placeholder.png";
        await sock.sendMessage(from, { image: { url: thumb }, caption: msg }, { quoted: mek });
    } catch (e) { reply("❌ ERROR: " + e.message); }
});

// 2. HANDLER: MOVIE SELECTION -> QUALITY LIST
replyHandlers.push({
    filter: (body, { sender }) => pendingSearch.has(sender) && !isNaN(body),
    function: async (sock, mek, m, { from, body, sender, reply }) => {
        const userData = pendingSearch.get(sender);
        const selected = userData.results[parseInt(body) - 1];
        if (!selected) return;
        pendingSearch.delete(sender); 
        
        reply(`⏳ *EXTRACTING LINKS:* ${selected.title}`);
        
        try {
            const html = await getBypassedContent(selected.link);
            const $ = cheerio.load(html);
            let downloadLinks = [];
            
            $('a[href*="zt-links"]').each((i, el) => {
                const url = $(el).attr('href');
                const parentText = $(el).closest('tr, div').text();
                const quality = parentText.match(/1080p|720p|480p/)?.[0] || 'Unknown';
                const sizeMatch = parentText.match(/(\d+(\.\d+)?)\s*(GB|MB)/i);
                
                if (sizeMatch) {
                    const sizeVal = parseFloat(sizeMatch[1]);
                    const unit = sizeMatch[3].toUpperCase();
                    let sizeGB = unit === 'MB' ? sizeVal / 1024 : sizeVal;
                    
                    if (sizeGB <= 2.0) { 
                        downloadLinks.push({ url, quality, size: sizeMatch[0] });
                    }
                }
            });

            if (downloadLinks.length === 0) return reply("❌ Qualities under 2GB not found.");
            
            pendingQuality.set(sender, { title: selected.title, links: downloadLinks, timestamp: Date.now() });
            
            let qMsg = `🎬 *SELECT QUALITY - MALIYA-MD*\n\n`;
            downloadLinks.forEach((l, i) => qMsg += `*${i+1}.* ${l.quality} (${l.size})\n`);
            reply(qMsg + `\n📥 *Reply with number to start MEGA process.*`);
        } catch (e) { reply("❌ LINK ERROR: " + e.message); }
    }
});

// 3. HANDLER: QUALITY -> MEGA UPLOAD -> WHATSAPP
replyHandlers.push({
    filter: (body, { sender }) => pendingQuality.has(sender) && !isNaN(body),
    function: async (sock, mek, m, { from, body, sender, reply }) => {
        const userData = pendingQuality.get(sender);
        const selected = userData.links[parseInt(body) - 1];
        if (!selected) return;
        pendingQuality.delete(sender);

        reply("🚀 *MALIYA-MD PROCESSING...*\nBypassing & Uploading to MEGA...");

        try {
            const finalHtml = await getBypassedContent(selected.url);
            const directLink = finalHtml?.match(/https?:\/\/(bot\d|sonic-cloud|cloud)[^\s"']+/)?.[0];
            if (!directLink) throw new Error("Could not find final download link.");

            const storage = await new Storage({ email: MEGA_EMAIL, password: MEGA_PASSWORD }).ready;
            
            const response = await axios({
                method: 'get',
                url: directLink,
                responseType: 'stream',
                headers: {
                    'Referer': 'https://cinesubz.lk/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*'
                }
            });

            const totalSize = Number(response.headers['content-length']);
            if (isNaN(totalSize)) throw new Error("Site did not provide file size (Content-Length).");

            const fileName = `${userData.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
            
            const file = await storage.upload({
                name: fileName,
                size: totalSize,
                allowUploadBuffering: true
            }, response.data).complete;
            
            reply("☁️ *UPLOADED TO MEGA!* Now sending to WhatsApp...");

            const fileBuffer = await file.downloadBuffer();
            
            await sock.sendMessage(from, {
                document: fileBuffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: `🎬 *${userData.title}*\n\n*Quality:* ${selected.quality}\n*Size:* ${selected.size}\n\n*MALIYA-MD DATABASE*`
            }, { quoted: mek });

            await file.delete();
            reply("✅ *SUCCESS!* File sent and MALIYA-MD Storage cleaned.");

        } catch (e) {
            console.error(e);
            reply("❌ PROCESS ERROR: " + e.message);
        }
    }
});

// Stale Data Cleanup (විනාඩි 10ක් යනකම් රිප්ලයි නොකළොත් දත්ත මැකී යයි)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of pendingSearch) if (now - val.timestamp > 600000) pendingSearch.delete(key);
    for (const [key, val] of pendingQuality) if (now - val.timestamp > 600000) pendingQuality.delete(key);
}, 600000);
