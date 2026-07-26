const { cmd, commands } = require('../command');
const { sendButtons } = require('gifted-btns');
const config = require('../config');

// ------------------ Helper: Uptime ------------------
const formatUptime = (seconds) => {
    const pad = (s) => (s < 10 ? '0' + s : s);
    const days = Math.floor(seconds / (24 * 3600));
    const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days > 0 ? `${days}d ` : ''}${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

cmd({
    pattern: "alive",
    desc: "Check MALIYA-MD bot online or no.",
    react: "🔥",
    category: "main",
    filename: __filename
},
async (bot, mek, m, {
    from, quoted, body, isCmd, command, args, q, isGroup,
    sender, senderNumber, botNumber2, botNumber, pushname,
    isMe, isOwner, groupMetadata, groupName, participants,
    groupAdmins, isBotAdmins, isAdmins, reply
}) => {
    try {
        const uptime = formatUptime(process.uptime());
        const userName = pushname || "User";

        // ------------------ Newsletter forward context (optional) ------------------
        const channelJid = config.NEWSLETTER_JID || '120363418166326365@newsletter';
        const channelName = config.NEWSLETTER_NAME || '🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁';

        // Use MALIYA-MD's configured caption if set, otherwise build a styled fallback
        const aliveCaption = config.ALIVE_MSG || `╭─────── ⭓ ⭓ ⭓  ─────────╮
│          🧿 SYSTEM ONLINE 🧿       │
╰──────────────⟡───────╯
│ 👋 𝗛𝗲𝘆 ${userName},
│ 🍁 *PREFIX:* "."
│ ⚡ *BOT NAME:* ${config.BOT_NAME || '🌀 MALIYA-MD 🌀'}
│ 🧭 *UPTIME:* ${uptime}
│ 🧩 *VERSION:* ${config.VERSION || '1.0.0'}
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 🔥`;

        // ------------------ Buttons ------------------
        const buttons = [
            { id: ".menu", text: "📜 Menu" },
            { id: ".ping", text: "👤 Speed" }
        ];

        // ------------------ Send Image + Buttons (using MALIYA-MD's config.ALIVE_IMG) ------------------
        await sendButtons(bot, from, {
            image: { url: config.ALIVE_IMG },
            text: aliveCaption,
            buttons,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: channelJid,
                    newsletterName: channelName,
                    serverMessageId: -1
                }
            }
        }, { quoted: mek });

    } catch (e) {
        console.log(e);
        reply(`❌ Error: ${e.message || e}`);
    }
});
