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

      // 1. Phone එකේ පේන Thumbnail එක
      const imgUrl = "https://i.ibb.co/4pDNDk1/avatar.png"; 
      const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
      const thumbBuffer = Buffer.from(response.data, "binary");

      // 2. Asitha-MD Legacy Hydrated Template Message Payload
      const templateMessagePayload = {
        viewOnceMessage: {
          message: {
            templateMessage: {
              hydratedTemplate: {
                locationMessage: {
                  degreesLatitude: 0,
                  degreesLongitude: 0,
                  jpegThumbnail: thumbBuffer,
                },
                hydratedContentText: text,
                hydratedFooterText: "© MALIYA-MD BOT SYSTEM",
                hydratedButtons: [
                  {
                    quickReplyButton: {
                      displayText: "📜 Main Menu",
                      id: ".menu",
                    },
                    index: 1,
                  },
                  {
                    quickReplyButton: {
                      displayText: "👤 Owner Info",
                      id: ".owner",
                    },
                    index: 2,
                  },
                  {
                    quickReplyButton: {
                      displayText: "📊 System Info",
                      id: ".systeminfo",
                    },
                    index: 3,
                  },
                ],
              },
            },
          },
        },
      };

      // 3. conn.relayMessage හරහා යැවීම
      await conn.relayMessage(m.chat, templateMessagePayload, {
        messageId: mek.key.id,
      });

      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

    } catch (e) {
      console.log("PING ASITHA STYLE ERROR:", e);
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
