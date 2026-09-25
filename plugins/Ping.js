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
    alias: ["speed", "latency"],
    desc: "Check bot response time",
    category: "system",
    react: "🏓",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      // 1. Network Latency මැනීම
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

      // 2. @vanzxy/baileys වල ButtonV2 හරහා Quick Reply Buttons යැවීම
      const { ButtonV2 } = await import("@vanzxy/baileys");

      const msg = new ButtonV2(conn)
        .setImage("https://i.ibb.co/4pDNDk1/avatar.png") // Image එකක් එපා නම් මේ පේළිය අයින් කරන්න
        .setBody(text)
        .setFooter("© MALIYA-MD BOT SYSTEM")
        .addReply("📜 Main Menu", ".menu")
        .addReply("👤 Owner Info", ".owner")
        .addReply("📊 System Info", ".systeminfo");

      await msg.send(m.chat, { quoted: mek });

      // 3. අවසාන Reaction එක
      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

    } catch (e) {
      console.log("PING BUTTONV2 ERROR:", e);
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
