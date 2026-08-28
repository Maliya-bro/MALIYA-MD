const { cmd } = require("../command");
const config = require("../config");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { getCustomImage } = require("../lib/botSettings");

// ── Default images ────────────────────────────────────────────
const DEFAULT_ALIVE_IMG =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_j34rhwj34rhwj34r.png?raw=true";

const formatUptime = (seconds) => {
  const pad = (s) => (s < 10 ? "0" + s : s);
  const days = Math.floor(seconds / (24 * 3600));
  const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days > 0 ? `${days}d ` : ""}${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

cmd(
  {
    pattern: "alive",
    react: "🔥",
    desc: "Check if bot is online",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, sessionId, sender, pushname }) => {
    try {
      const uptime = formatUptime(process.uptime());
      const platform = os.platform();
      const userName = pushname || m?.pushName || "User";

      // ── Get custom image (if any) ──────────────────────────
      let aliveImg = DEFAULT_ALIVE_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "alive");
          if (custom && custom.data) {
            aliveImg = custom.data;
          }
        } catch (e) {
          console.log("⚠️ Failed to load custom alive image:", e.message);
        }
      }

      const channelJid = "120363427174988449@newsletter";
      const channelName = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

      const aliveCaption = `
╭━〔 🧿 SYSTEM ONLINE 🧿 〕━╮
┃
┃ 👋 Hey ${userName}
┃
┃ 🍁 *PREFIX:* .
┃ ⚡ *BOT NAME:* ${config.BOT_NAME || "🌀 MALIYA-MD 🌀"}
┃ 🧭 *UPTIME:* ${uptime}
┃ 🔋 *PLATFORM:* ${platform}
┃ 🧩 *VERSION:* ${config.VERSION || "2.3.1"}
┃
╰━━━━━━━━━━━━━━━╯

⚙️ Made with ❤️ by
╭───────────────⬣
🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥
╰───────────────⬣`;

      await sock.sendMessage(
        from,
        {
          image: { url: aliveImg },
          caption: aliveCaption,
          buttons: [
            { buttonId: ".menu", buttonText: { displayText: "📜 Menu" }, type: 1 },
            { buttonId: ".owner", buttonText: { displayText: "👤 Owner" }, type: 1 },
          ],
          headerType: 4,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: channelJid,
              newsletterName: channelName,
              serverMessageId: -1,
            },
          },
        },
        { quoted: mek }
      );
    } catch (err) {
      console.log("ALIVE ERROR:", err);
      reply(`❌ Alive Error: ${err.message}`);
    }
  }
);
