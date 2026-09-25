const os = require("os");
const axios = require("axios");
const { cmd } = require("../command");

function formatUptime(seconds) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

cmd(
  {
    pattern: "ping",
    alias: ["speed", "latency"],
    desc: "Check bot response time",
    category: "system",
    react: "🏓",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const start = Date.now();
      await conn.sendMessage(m.chat, { react: { text: "🔄", key: mek.key } });
      const ping = Date.now() - start;

      const uptime = formatUptime(process.uptime());
      const mem = process.memoryUsage();
      const usedMB = (mem.rss / 1024 / 1024).toFixed(1);
      const totalMB = (os.totalmem() / 1024 / 1024).toFixed(0);
      const nodeV = process.version;
      const platform = `${process.platform} ${process.arch}`;

      const text =
        "🚀 *MALIYA-MD SPEED TEST*\n\n" +
        "🏓 *PONG!*\n\n" +
        `📶 *Latency:* ${ping} ms\n` +
        `⏱️ *Uptime:* ${uptime}\n` +
        `🧠 *RAM:* ${usedMB} MB / ${totalMB} MB\n` +
        `🧩 *Node:* ${nodeV}\n` +
        `💻 *Platform:* ${platform}`;

      const imgUrl = "https://i.ibb.co/4pDNDk1/avatar.png"; 
      const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
      const thumbBuffer = Buffer.from(response.data, "binary");

      // Asitha-MD එකේ වගේ Web එකෙයි Phone එකෙයි දෙකේම Text + Buttons පේන්න relayMessage යැවීම
      await conn.relayMessage(
        m.chat,
        {
          interactiveMessage: {
            header: {
              title: "",
              hasMediaAttachment: true,
              locationMessage: {
                degreesLatitude: 0,
                degreesLongitude: 0,
                name: "MALIYA-MD SYSTEM",
                address: "SPEED TEST",
                jpegThumbnail: thumbBuffer,
              },
            },
            body: {
              text: text,
            },
            footer: {
              text: "© MALIYA-MD BOT SYSTEM",
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📜 Main Menu",
                    id: ".menu",
                  }),
                },
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "👤 Owner Info",
                    id: ".owner",
                  }),
                },
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📊 System Info",
                    id: ".systeminfo",
                  }),
                },
              ],
            },
            contextInfo: {
              stanzaId: mek.key.id,
              participant: mek.key.participant || mek.key.remoteJid,
              quotedMessage: mek.message,
            },
          },
        },
        {}
      );

      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

    } catch (e) {
      console.log("PING RELAY WEB FIX ERROR:", e);
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
