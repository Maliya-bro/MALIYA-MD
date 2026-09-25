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

// 1. ප්‍රධාන Menu එක: Asitha-MD විලාසයේ ButtonV2 මඟින් යැවීම
cmd(
  {
    pattern: "menu",
    alias: ["panel", "mainmenu"],
    desc: "Main menu with ButtonV2 buttons",
    category: "main",
    react: "📜",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const uptime = formatUptime(process.uptime());
      const mem = process.memoryUsage();
      const usedMB = (mem.rss / 1024 / 1024).toFixed(1);
      const totalMB = (os.totalmem() / 1024 / 1024).toFixed(0);

      const menuText =
        "🎀 *Ξ MALIYA-MD BOT SYSTEM Ξ*\n\n" +
        "👤 *Developer:* Malindu Nadith\n" +
        `⏱️ *Uptime:* ${uptime}\n` +
        `🧠 *RAM:* ${usedMB} MB / ${totalMB} MB\n\n` +
        "> පහත ඇති *📑 List Menu* බටන් එක ඔබන්න.";

      const { ButtonV2 } = await import("@vanzxy/baileys");

      // පෙනුමෙන් Asitha-MD ආකාරයේ වෙනම බටන්ස්
      await new ButtonV2(conn)
        .setBody(menuText)
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
        .setThumbnail("https://i.ibb.co/4pDNDk1/avatar.png")
        .addButton("📑 List Menu", ".open_native_list")
        .addButton("🏓 Ping Speed", ".ping")
        .addButton("👤 Owner Info", ".owner")
        .send(m.chat, { quoted: mek });

    } catch (e) {
      console.log("MENU ERROR:", e);
      await reply("❌ Menu error: " + (e?.message || e));
    }
  }
);

// 2. Button එක එබූ සැනින් NativeFlow Single Select List එක ඉදිරිපත් කිරීම
cmd(
  {
    pattern: "open_native_list",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const { Button } = await import("@vanzxy/baileys");

      // මෙහිදී NativeFlow Selection Menu එක සෘජුවම ඉදිරිපත් කෙරේ
      const nativeList = new Button(conn)
        .setBody("පහත බොත්තම ඔබා ඔබට අවශ්‍ය කාණ්ඩය තෝරන්න:")
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
        .addSelection("📑 Click Here to Select Category")
        .makeSection("📂 DOWNLOAD COMMANDS", "HOT")
        .makeRow("🎵", "Song Downloader", "Download MP3 audio tracks", ".song")
        .makeRow("🎬", "Video Downloader", "Download MP4 video clips", ".video")
        .makeRow("📦", "Sticker Maker", "Convert image to sticker", ".sticker")
        .makeSection("⚙️ SYSTEM COMMANDS", "FAST")
        .makeRow("🏓", "Speed Test", "Check bot latency", ".ping")
        .makeRow("👤", "Owner Info", "Contact bot creator", ".owner");

      await nativeList.send(m.chat, { quoted: mek });

    } catch (e) {
      console.log("NATIVE LIST TRIGGER ERROR:", e);
      await reply("❌ List open error: " + (e?.message || e));
    }
  }
);
