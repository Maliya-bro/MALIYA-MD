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

      // ButtonV2 message eka
      const { ButtonV2 } = await import("@vanzxy/baileys");

      await new ButtonV2(conn)
        .setBody(text)
        .setFooter("© MALIYA-MD BOT SYSTEM")
        .setThumbnail("https://i.ibb.co/4pDNDk1/avatar.png")
        .addButton("📜 Main Menu", ".menu")
        .addButton("👤 Owner Info", ".owner")
        .addButton("📊 System Info", ".systeminfo")
        .send(m.chat, { quoted: mek });

      await conn.sendMessage(m.chat, { react: { text: "🏓", key: mek.key } });

      // ---- List popup eka (SS 3 wage) ----
      const listSections = [
        {
          title: "Categories",
          rows: [
            { title: "🛠️ Settings", description: "Open bot settings menu", rowId: ".settings" },
            { title: "⬇️ Download Commands", description: "Show download command list", rowId: ".listdl" },
            { title: "🎬 Movie Commands", description: "Show movie command list", rowId: ".listmovie" },
            { title: "🔍 Search Commands", description: "Show search command list", rowId: ".listsearch" },
            { title: "📰 News Commands", description: "Show news command list", rowId: ".listnews" },
            { title: "🔞 NSFW Commands", description: "Show NSFW command list", rowId: ".listnsfw" },
            { title: "🤖 AI Commands", description: "Show AI command list", rowId: ".listai" },
          ],
        },
      ];

      await conn.sendMessage(
        m.chat,
        {
          text: "Ξ *Select a Command List:* Ξ",
          footer: "© MALIYA-MD BOT SYSTEM",
          title: "Click Here!",
          buttonText: "Select",
          sections: listSections,
        },
        { quoted: mek }
      );

    } catch (e) {
      console.log("PING ERROR:", e);
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
