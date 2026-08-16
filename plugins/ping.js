const os = require("os");
const { cmd } = require("../command");
const { sendButtons, sendInteractiveMessage } = require("lilgabriel-btns");

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
    desc: "Check bot response time with native buttons",
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

      // Native Flow Interactive Message එකක් ලෙස යැවීම
      await sendInteractiveMessage(conn, m.chat, {
        text: text,
        footer: "MALIYA-MD BOT SYSTEM",
        interactiveButtons: [
          {
            name: "quick_reply",
            buttonParamsJson: {
              display_text: "📜 Main Menu",
              id: ".menu"
            }
          },
          {
            name: "quick_reply",
            buttonParamsJson: {
              display_text: "🔥 Check status",
              id: ".owner"
            }
          },
          {
            name: "single_select",
            buttonParamsJson: {
              title: "📊 System Details",
              sections: [
                {
                  title: "Bot Performance",
                  rows: [
                    { id: ".systeminfo", title: "System Info", description: "View detailed server info" },
                    { id: ".ping", title: "Re-Ping", description: "Test connection again" }
                  ]
                }
              ]
            }
          }
        ]
      }, { quoted: mek });

    } catch (e) {
      await reply("❌ Ping error: " + (e?.message || e));
    }
  }
);
