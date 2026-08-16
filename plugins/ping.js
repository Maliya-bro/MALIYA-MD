const os = require("os");
const { cmd } = require("../command");
const { generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys");

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
    desc: "Check bot response time with web fix",
    category: "system",
    react: "🏓",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const start = Date.now();
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

      // Native Flow buttons structure
      const buttons = [
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
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "📊 System Details",
            sections: [
              {
                title: "Bot Performance",
                rows: [
                  { id: ".systeminfo", title: "System Info", description: "View detailed server info" },
                  { id: ".ping", title: "Re-Ping", description: "Test connection again" },
                ],
              },
            ],
          }),
        },
      ];

      // Web View-Once Bypass Message Construct
      const msg = generateWAMessageFromContent(
        m.chat,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: text }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: "MALIYA-MD BOT SYSTEM" }),
                header: proto.Message.InteractiveMessage.Header.create({ title: "", hasMediaAttachment: false }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  buttons: buttons,
                }),
              }),
            },
          },
        },
        { quoted: mek }
      );

      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });

    } catch (e) {
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
