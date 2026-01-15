const { cmd } = require("../command");

cmd({
    pattern: "vv",
    alias: ["viewonce", "retrieve"],
    desc: "Convert view once media to normal media",
    category: "tools",
    react: "🔓",
    filename: __filename
},
async (bot, mek, m, { from, reply, quoted }) => {
    try {
        // Check if the replied message is a View Once message
        const isQuotedViewOnce = m.quoted ? (m.quoted.message?.viewOnceMessageV2 || m.quoted.message?.viewOnceMessage || m.quoted.message?.viewOnceMessageV2Extension) : false;

        if (!m.quoted || !isQuotedViewOnce) {
            return reply("❌ Please reply to a *View Once* photo or video.");
        }

        // Extract the media content
        let viewOnceContent = m.quoted.message.viewOnceMessageV2?.message || m.quoted.message.viewOnceMessage?.message || m.quoted.message.viewOnceMessageV2Extension?.message;
        let type = Object.keys(viewOnceContent)[0];
        
        // Download the media buffer
        let buffer = await m.quoted.download();

        const caption = `*🔓 View Once Unlocked By MALIYA-MD*\n\n*Type:* ${type === 'imageMessage' ? 'Image 📸' : 'Video 🎥'}\n*Sender:* @${m.quoted.sender.split('@')[0]}`;

        if (type === 'imageMessage') {
            await bot.sendMessage(from, { image: buffer, caption: caption, mentions: [m.quoted.sender] }, { quoted: mek });
        } else if (type === 'videoMessage') {
            await bot.sendMessage(from, { video: buffer, caption: caption, mentions: [m.quoted.sender] }, { quoted: mek });
        }

    } catch (e) {
        console.error("VV ERROR:", e);
        reply("❌ Error retrieving media. It might have been deleted or the bot lacks permission.");
    }
});
