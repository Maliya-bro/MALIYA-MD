const { cmd, commands } = require('../command');

cmd({
    pattern: "fake",
    alias: ["spoof", "hack", "fakemsg"],
    desc: "Create a fake reply from someone.",
    category: "fun",
    react: "🎭",
    filename: __filename
},
async (bot, mek, m, { from, q, reply, quoted }) => {
    try {
        if (!q) return reply("භාවිතය: .fake [Text] | [Target User Number]");
        let [text, target] = q.split('|');
        if (!target) return reply("කරුණාකර අංකය ලබා දෙන්න.");

        let targetJid = target.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        // බොරු රිප්ලයි එකක් සකස් කිරීම
        const fakeMek = {
            key: { fromMe: false, participant: targetJid, remoteJid: from },
            message: { conversation: text.trim() }
        };

        return await bot.sendMessage(from, { text: "ඔන්න එයා කිව්ව එක!" }, { quoted: fakeMek });
    } catch (e) {
        console.log(e);
        reply("වැරැද්දක් සිදු විය.");
    }
});
