const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');

// සෙෂන් එක මතක තබා ගැනීමට (Pending Sessions)
const pendingXHam = {};

cmd({
    pattern: "xham",
    alias: ["xh", "xsearch"],
    desc: "Search or download videos from xHamster with Number Reply.",
    category: "download",
    react: "🔞",
    filename: __filename
},
async (bot, mek, m, { from, q, reply, sender, isOwner }) => {
    if (!isOwner) return reply("මෙය ආරක්ෂක හේතූන් මත Owner Only ලෙස සකසා ඇත!මේක *whatsapp නීති උල්ලංගනය* කරන බැවින් ඔබගේ *account එක ban වීමට* බොහෝ ඉඩකඩක් පවතී .... *ප්‍රවේශමෙන්* භාවිතා කරන්න ");
    if (!q) return reply("🎬 *MALIYA-MD X-SYSTEM*\n\nභාවිතය: .xham [නම හෝ ලින්ක් එක]\nඋදා: .xham hot මේක *whatsapp නීති උල්ලංගනය* කරන බැවින් ඔබගේ *account එක ban වීමට* බොහෝ ඉඩකඩක් පවතී .... *ප්‍රවේශමෙන්* භාවිතා කරන්න");

    try {
        // 1. කෙලින්ම ලින්ක් එකක් ලබා දී ඇත්නම්
        if (q.includes("xhamster.com")) {
            return await downloadXVideo(bot, from, q, mek, reply);
        } 

        // 2. සර්ච් මාදිලිය (Search Mode)
        reply(`🔎 xHamster හි "${q}" සොයමින් පවතී...මේක *whatsapp නීති උල්ලංගනය* කරන බැවින් ඔබගේ *account එක ban වීමට* බොහෝ ඉඩකඩක් පවතී .... *ප්‍රවේශමෙන්* භාවිතා කරන්න`);
        const searchUrl = `https://xhamster.com/search/${encodeURIComponent(q)}`;
        const { data } = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const $ = cheerio.load(data);
        
        let results = [];
        $('.video-thumb').each((i, el) => {
            if (i < 5) {
                let title = $(el).find('.video-thumb__name').text().trim();
                let link = $(el).find('a.video-thumb__image-container').attr('href');
                if (title && link) results.push({ title, link });
            }
        });

        if (results.length === 0) return reply("❌ කිසිදු ප්‍රතිඵලයක් හමු නොවීය.");

        // සෙෂන් එක සේව් කරගැනීම
        pendingXHam[sender] = { results, timestamp: Date.now() };

        let listMsg = `🔞 *MALIYA-MD X-SEARCH*\n\n🔍 *Query:* ${q}\n\n`;
        results.forEach((res, index) => {
            listMsg += `*${index + 1}.* ${res.title}\n`;
        });
        listMsg += `\n*Reply with the number (1-5) to download.*`;

        return await bot.sendMessage(from, { text: listMsg }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply("⚠️ සර්වර් එකේ ගැටලුවක්. නැවත උත්සාහ කරන්න.");
    }
});

// අංකය Reply කරන එක Handle කරන කොටස
cmd({
    on: "body"
}, async (bot, mek, m, { body, sender, reply, from }) => {
    // සෙෂන් එකක් තියෙනවද සහ එවපු මැසේජ් එක අංකයක්ද කියා බැලීම
    if (pendingXHam[sender] && !isNaN(body) && parseInt(body) > 0 && parseInt(body) <= pendingXHam[sender].results.length) {
        
        const index = parseInt(body.trim()) - 1;
        const selected = pendingXHam[sender].results[index];
        
        // එක පාරක් පාවිච්චි කළ පසු සෙෂන් එක මකා දැමීම
        delete pendingXHam[sender];

        await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });
        await downloadXVideo(bot, from, selected.link, mek, reply);
    }
});

// වීඩියෝව Download කර යවන Function එක
async function downloadXVideo(bot, from, url, mek, reply) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        let videoUrl = $('video').find('source').attr('src') || $('meta[property="og:video"]').attr('content');

        if (!videoUrl) return reply("❌ වීඩියෝ ලින්ක් එක සොයාගත නොහැකි විය.");

        const head = await axios.head(videoUrl);
        const sizeInMB = (head.headers['content-length'] || 0) / (1024 * 1024);

        let caption = `✅ *MALIYA-MD X-FETCH*\n\n⚖️ *Size:* ${sizeInMB.toFixed(2)} MB\n🔗 *Source:* xHamster\n\n> Powered by MALIYA-MD`;

        if (sizeInMB > 100) {
            reply(`⚖️ Size: ${sizeInMB.toFixed(2)}MB. ලොකු ෆයිල් එකක් නිසා Document ලෙස එවමින් පවතී...`);
            return await bot.sendMessage(from, { 
                document: { url: videoUrl }, 
                mimetype: 'video/mp4', 
                fileName: 'Maliya_X_Premium.mp4', 
                caption 
            }, { quoted: mek });
        } else {
            return await bot.sendMessage(from, { 
                video: { url: videoUrl }, 
                caption, 
                mimetype: 'video/mp4' 
            }, { quoted: mek });
        }
    } catch (e) {
        reply("❌ වීඩියෝව ලබා ගැනීමට නොහැකි විය.");
    }
}

// විනාඩි 10කට පසු සෙෂන් මකා දැමීම (RAM එක ඉතිරි කර ගැනීමට)
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXHam) {
        if (now - pendingXHam[s].timestamp > 10 * 60 * 1000) delete pendingXHam[s];
    }
}, 5 * 60 * 1000);
