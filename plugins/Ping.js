const os = require("os");
const axios = require("axios");
const { cmd } = require("../command");

// Uptime formatter
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
      // 1. ඇත්තම Network Latency එක මැනීම
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

      // 2. Phone එකේ පේන්න ඕන Image එක Buffer එකක් විදිහට ගැනීම (මෙතනට ඔයාගේ Bot Logo URL එක දාන්න)
      const imgUrl = "https://i.ibb.co/4pDNDk1/avatar.png"; 
      const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
      const thumbBuffer = Buffer.from(response.data, "binary");

      // 3. Asitha-MD එකේ වගේ Location Header + Buttons යැවීම
      await conn.sendMessage(
        m.chat,
        {
          location: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            jpegThumbnail: thumbBuffer, // Phone එකේදි Image එකක් විදිහට පෙන්නන්නේ මේකයි
          },
          caption: text,
          footer: "© MALIYA-MD BOT SYSTEM",
          buttons: [
            {
              buttonId: ".menu",
              buttonText: { displayText: "📜 Main Menu" },
              type: 1,
            },
            {
              buttonId: ".owner",
              buttonText: { displayText: "👤 Owner Info" },
              type: 1,
            },
            {
              buttonId: ".systeminfo",
              buttonText: { displayText: "📊 System Info" },
              type: 1,
            },
          ],
          headerType: 6, // 6 කියන්නේ Location Header එකයි
        },
        { quoted: mek }
      );

      // 4. අවසාන Reaction එක
      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

    } catch (e) {
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
