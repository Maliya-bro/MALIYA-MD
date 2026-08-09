const os = require("os");
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
    alias: ["p", "latency"],
    desc: "Check bot response time",
    category: "system",
    react: "🏓",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const start = Date.now();

      // Send a small "checking" message first
      const sent = await conn.sendMessage(m.chat, { text: "🏓 Pinging..." }, { quoted: mek });

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


      // Edit message (if supported) else send new message
      // Baileys doesn't "edit" standard messages reliably, so just send another:
      await conn.sendMessage(m.chat, { text }, { quoted: sent });
    } catch (e) {
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
