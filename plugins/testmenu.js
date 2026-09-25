const { cmd } = require("../command");

cmd(
  {
    pattern: "menu",
    alias: ["panel", "mainmenu"],
    desc: "Open Asitha-MD style ButtonV2 menu",
    category: "main",
    react: "📜",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const menuText =
        "🎀 *Ξ MALIYA-MD BOT SYSTEM Ξ*\n\n" +
        "👤 *Developer:* Malindu Nadith\n" +
        "⚡ *Status:* Online\n\n" +
        "> පහළ ඇති *📑 List Menu* බටන් එක ඔබා සම්පූර්ණ Commands List එක ලබාගන්න.";

      // ඔයාගේ එකේ හරියටම වැඩ කරන @vanzxy/baileys ButtonV2 එක පමණක් භාවිතය
      const { ButtonV2 } = await import("@vanzxy/baileys");

      await new ButtonV2(conn)
        .setBody(menuText)
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
        .setThumbnail("https://i.ibb.co/4pDNDk1/avatar.png")
        .addButton("📑 List Menu", ".listmenu")
        .addButton("🏓 Ping Speed", ".ping")
        .addButton("👤 Owner Info", ".owner")
        .send(m.chat, { quoted: mek });

    } catch (e) {
      console.log("MENU BUTTON ERROR:", e);
      await reply("❌ Menu error: " + (e?.message || e));
    }
  }
);
