const { cmd } = require("../command");

cmd(
  {
    pattern: "menu",
    alias: ["listmenu", "panel"],
    desc: "Open interactive bot menu with list button",
    category: "main",
    react: "📜",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      // 1. luna-lib සහ Baileys ලබා ගැනීම
      const lunaModule = await import("@ryuu-reinzz/luna-lib");
      const luna = lunaModule.default || lunaModule;
      const baileys = await import("@whiskeysockets/baileys");

      if (!conn.messageBuilder) {
        luna.addProperty(conn, baileys);
      }

      const menuText = 
        "👋 *HELLO DEVELOPER!*\n\n" +
        "Welcome to *MALIYA-MD* Interactive Control Panel.\n" +
        "Click the *List Menu* button below to explore all commands.";

      // 2. Button Builder එක හරහා List Menu එකක් සෑදීම
      await conn.messageBuilder(m.chat, { quoted: mek })
        .setType("Button")
        .setTitle("MALIYA-MD BOT SYSTEM")
        .setBody(menuText)
        .setFooter("© 2026 MALIYA-MD BOT")
        .setImage("https://i.ibb.co/4pDNDk1/avatar.png") // Image Header එක
        
        // 🔥 මේක තමයි ක්ලික් කරපු ගමන් List එකක් Open වෙන Button එක:
        .addSelection("📑 Click for List Menu")
        .makeSection("📂 DOWNLOAD COMMANDS", "HOT")
        .makeRow("🎵", "Song Downloader", "Download MP3 audio tracks", ".song")
        .makeRow("🎬", "Video Downloader", "Download MP4 video clips", ".video")
        .makeRow("📦", "Sticker Maker", "Convert photo to sticker", ".sticker")
        
        .makeSection("⚙️ SYSTEM COMMANDS", "FAST")
        .makeRow("🏓", "Speed Test", "Check bot response latency", ".ping")
        .makeRow("👤", "Owner Info", "Contact bot creator", ".owner")

        // යටින් සාමාන්‍ය Quick Reply Buttons දාන්න ඕන නම් ඒවාත් මේ විදිහටම එකතු කරන්න පුළුවන්:
        .addReply("🏓 Ping", ".ping")
        .addReply("👤 Owner", ".owner")
        
        .send();

    } catch (e) {
      console.log("LIST MENU ERROR:", e);
      await reply("❌ Menu error: " + (e?.message || e));
    }
  }
);
