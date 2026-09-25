const os = require("os");
const { cmd } = require("../command");

function formatUptime(seconds) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${d}d ${h}h ${m}s ${s}s`;
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

      // 1. luna-lib හි default export හරහා ButtonV2 ලබාගැනීම
      const lunaModule = await import("@ryuu-reinzz/luna-lib");
      const luna = lunaModule.default || lunaModule;
      const ButtonV2 = luna.ButtonV2;

      // 2. ButtonV2 Builder එක හරහා මැසේජ් එක යැවීම
      await new ButtonV2(conn)
        .setTitle("MALIYA-MD SYSTEM")
        .setSubtitle("SPEED TEST")
        .setBody(text)
        .setFooter("© MALIYA-MD BOT SYSTEM")
        .setThumbnail("https://i.ibb.co/4pDNDk1/avatar.png")
        .addButton("📜 Main Menu", ".menu")
        .addButton("👤 Owner Info", ".owner")
        .addButton("📊 System Info", ".systeminfo")
        .send(m.chat, { quoted: mek });

      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

    } catch (e) {
      console.log("PING LUNA-LIB ERROR:", e);
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
