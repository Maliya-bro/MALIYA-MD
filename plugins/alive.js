const { cmd } = require("../command");
const { sendButtons } = require("gifted-btns");
const config = require("../config");
const os = require("os");
const fs = require("fs");
const path = require("path");

// ------------------ Helper: Uptime ------------------
const formatUptime = (seconds) => {
  const pad = (s) => (s < 10 ? "0" + s : s);

  const days = Math.floor(seconds / (24 * 3600));
  const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days > 0 ? `${days}d ` : ""}${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};


// ------------------ Alive Plugin ------------------
cmd(
{
    pattern: "alive",
    react: "👀",
    desc: "Check bot status",
    category: "main",
    filename: __filename,
},

async (MALIYA, mek, m, { from, reply }) => {

try {

    const uptime = formatUptime(process.uptime());
    const platform = os.platform();
    const userName = m.pushName || "User";


    const videoPath = path.join(__dirname, "../media/0908.mp4");


    const channelJid = "120363427174988449@newsletter";
    const channelName = "🍁 ＭＡＬＩＹＡ－ 〽️ＭＤ 🍁";


    const aliveCaption = `
╭─────── ⭓ ⭓ ⭓ ─────────╮
│        🧿 SYSTEM ONLINE 🧿
╰──────────────⟡───────╯

👋 Hey ${userName}

🍁 *PREFIX:* .
⚡ *BOT NAME:* ${config.BOT_NAME || "🌀 MALIYA-MD 🌀"}

🧭 *UPTIME:* ${uptime}
🔋 *PLATFORM:* ${platform}
🧩 *VERSION:* ${config.VERSION || "1.0.0"}

╭───────────────⬣
⚙️ Made with ❤️ by
🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥
╰───────────────⬣
`;


    const buttons = [
        {
            id: ".menu",
            text: "📜 Menu"
        },
        {
            id: ".owner",
            text: "👤 Owner"
        }
    ];



    // Send Alive Video (if exists)
    if (fs.existsSync(videoPath)) {

        await MALIYA.sendMessage(
            from,
            {
                video: fs.readFileSync(videoPath),
                mimetype: "video/mp4",
                ptv: true
            },
            {
                quoted: mek
            }
        );

    }



    // Send Alive Message

    await sendButtons(
        MALIYA,
        from,
        {

            text: aliveCaption,

            buttons: buttons,

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


} catch (err) {

    console.log("ALIVE PLUGIN ERROR:", err);

    reply(
        "❌ Alive plugin error\n\n" + err.message
    );

}

});
