const { cmd } = require("../command");
const { sendButtons } = require("gifted-btns");
const config = require("../config");
const os = require("os");

// ------------------ Helper: Uptime ------------------
const formatUptime = (seconds) => {
    const pad = (s) => (s < 10 ? "0" + s : s);
    const days = Math.floor(seconds / (24 * 3600));
    const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days > 0 ? `${days}d ` : ""}${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

cmd({
    pattern: "alive",
    desc: "Check MALIYA-MD bot online or no.",
    react: "🔥",
    category: "main",
    filename: __filename
},
async (bot, mek, m, {
    from,
    pushname,
    reply
}) => {
    try {

        const uptime = formatUptime(process.uptime());
        const platform = os.platform();
        const userName = pushname || "User";

        // ------------------ Newsletter ------------------
        const channelJid = "120363427174988449@newsletter";
        const channelName = "🍁 MALIYA-MD 🍁";

        // ------------------ Alive Caption ------------------
        const aliveCaption = `╭─────── ⭓ ⭓ ⭓  ─────────╮
│          🧿 SYSTEM ONLINE 🧿       │
╰──────────────⟡───────╯
│ 👋 𝗛𝗲𝘆 ${userName},
│ 🍁 *PREFIX:* "."
│ ⚡ *BOT NAME:* ${config.BOT_NAME || "🌀 MALIYA-MD 🌀"}
│ 🧭 *UPTIME:* ${uptime}
│ 🔋 *PLATFORM:* ${platform}
│ 🧩 *VERSION:* ${config.VERSION || "1.0.0"}
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥`;

        // ------------------ Buttons ------------------
        const buttons = [
            {
                id: ".menu",
                text: "📜 Menu"
            },
            {
                id: ".ping",
                text: "⚡ Speed"
            }
        ];

        // ------------------ Send Alive Message ------------------
        await sendButtons(
            bot,
            from,
            {
                image: {
                    url: config.ALIVE_IMG
                }, // config.js එකේ image URL එක දාන්න

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
            },
            {
                quoted: mek
            }
        );

    } catch (e) {
        console.log(e);
        reply(`❌ Error: ${e.message}`);
    }
});
