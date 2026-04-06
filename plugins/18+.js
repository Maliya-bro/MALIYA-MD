const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');

cmd({
    pattern: "xham",
    alias: ["xh", "xsearch", "xxx", "hot", "sex"],
    desc: "Search or download videos from xHamster.",
    category: "download",
    react: "🔞",
    filename: __filename
},
async (bot, mek, m, { from, q, reply, isOwner }) => {
    if (!isOwner) return reply("මෙය ආරක්ෂක හේතූන් මත Owner Only ලෙස සකසා ඇත!");
    if (!q) return reply("කරුණාකර වීඩියෝ ලින්ක් එකක් හෝ සර්ච් කිරීමට නමක් ලබා දෙන්න.");

    try {
        // 1. කෙලින්ම ලින්ක් එකක් ලබා දී ඇත්නම් (Direct Download)
        if (q.includes("xhamster.com")) {
            reply("වීඩියෝව සකසමින් පවතී... ⏳");
            const { data } = await axios.get(q);
            const $ = cheerio.load(data);
            let videoUrl = $('video').find('source').attr('src') || $('meta[property="og:video"]').attr('content');

            if (!videoUrl) return reply("වීඩියෝ ලින්ක් එක සොයාගත නොහැකි විය.");

            const head = await axios.head(videoUrl);
            const sizeInMB = (head.headers['content-length'] || 0) / (1024 * 1024);

            let caption = `✅ *MALIYA-MD X-FETCH*\n⚖️ *Size:* ${sizeInMB.toFixed(2)} MB\n🔗 *Link:* ${q}`;

            if (sizeInMB > 100) {
                return await bot.sendMessage(from, { document: { url: videoUrl }, mimetype: 'video/mp4', fileName: 'Maliya_X.mp4', caption }, { quoted: mek });
            } else {
                return await bot.sendMessage(from, { video: { url: videoUrl }, caption, mimetype: 'video/mp4' }, { quoted: mek });
            }
        } 

        // 2. සර්ච් මාදිලිය (Search Mode - Top 5 Results)
        else {
            reply(`🔎 xHamster හි "${q}" සොයමින් පවතී...`);
            const searchUrl = `https://xhamster.com/search/${encodeURIComponent(q)}`;
            const { data } = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
            const $ = cheerio.load(data);
            
            let results = [];
            $('.video-thumb').each((i, el) => {
                if (i < 5) { // මුල් ප්‍රතිඵල 5 පමණක් ගැනීම
                    let title = $(el).find('.video-thumb__name').text().trim();
                    let link = $(el).find('a.video-thumb__image-container').attr('href');
                    if (title && link) results.push({ title, link });
                }
            });

            if (results.length === 0) return reply("කිසිදු ප්‍රතිඵලයක් හමු නොවීය.");

            let listMsg = `🔞 *MALIYA-MD X-SEARCH*\n\nQuery: _${q}_\n\n`;
            results.map((res, index) => {
                listMsg += `*${index + 1}.* ${res.title}\n🔗 ${res.link}\n\n`;
            });
            listMsg += `> කරුණාකර අංකය (1-5) පමණක් Reply කර ඩවුන්ලෝඩ් කරන්න.`;

            const sentMsg = await bot.sendMessage(from, { text: listMsg }, { quoted: mek });

            // 3. අංකය Reply කරන එක අල්ලගන්නා Logic එක
            bot.ev.on('messages.upsert', async (chatUpdate) => {
                const msg = chatUpdate.messages[0];
                if (!msg.message || !msg.message.extendedTextMessage) return;
                
                const selectedText = msg.message.extendedTextMessage.text;
                const isReplyToSearch = msg.message.extendedTextMessage.contextInfo.stanzaId === sentMsg.key.id;

                if (isReplyToSearch && !isNaN(selectedText)) {
                    let num = parseInt(selectedText);
                    if (num > 0 && num <= results.length) {
                        let selectedUrl = results[num - 1].link;
                        // මෙහිදී නැවත එම ලින්ක් එකම .xham විධානයට යොමු කෙරේ
                        await bot.sendMessage(from, { text: `.xham ${selectedUrl}` });
                    }
                }
            });
        }
    } catch (e) {
        console.log(e);
        reply("වැරැද්දක් සිදු විය. සර්වර් එකේ ගැටලුවක් විය හැක.");
    }
});
