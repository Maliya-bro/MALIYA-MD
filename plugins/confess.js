const { cmd, commands } = require('../command');

cmd({
    pattern: "confess",
    desc: "Send an anonymous message.",
    alias: ["shut", "shutup"],
    category: "fun",
    react: "🤫",
    filename: __filename
},
async (bot, mek, m, { from, q, reply }) => {
    try {
        let [number, msg] = q.split('|');
        if (!number || !msg) return reply("භාවිතා කරන ක්‍රමය: .confess අංකය | මැසේජ් එක");

        let jid = number.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        let content = `🔔 *MALIYA-MD CONFESSION*\n\nඔයාට රහසිගත පණිවිඩයක් ලැබුණා:\n\n💬 "${msg.trim()}"`;

        await bot.sendMessage(jid, { text: content });
        reply("✅ පණිවිඩය සාර්ථකව යවන ලදී!");
    } catch (e) {
        console.log(e);
        reply("යැවීමට නොහැකි විය. අංකය පරීක්ෂා කරන්න.");
    }
});
