const { cmd } = require("../command");

cmd(
  {
    pattern: "testbtn",
    alias: ["nativeflow", "btncheck"],
    react: "🚀",
    desc: "Test Native Flow buttons using @vanzxy/baileys",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, pushname }) => {
    try {
      // @vanzxy/baileys එකෙන් Button builder එක dynamically load කරගැනීම
      const { Button } = await import("@vanzxy/baileys");

      const userName = pushname || m?.pushName || "User";

      // Button instance එකක් හදලා Native Flow buttons add කිරීම
      const flowMessage = new Button(sock)
        .setTitle("🚀 Native Flow Test Panel")
        .setBody(`👋 Hey *${userName}*,\n\nNative Flow buttons WhatsApp mobile app එකේ render වෙන විදිහ පහතින් බලන්න.`)
        .setFooter("🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁")
        // 1. Quick Reply Button
        .addReply("📜 Menu", ".menu")
        .addReply("👤 Owner", ".owner")
        // 2. Direct URL Link Button
        .addUrl("🌐 GitHub", "https://github.com")
        // 3. Direct Phone Call Button
        .addCall("📞 Call", "94712345678");

      // Chat එකට send කිරීම (Channel forwarding contextInfo සම්පූර්ණයෙන්ම ඉවත් කර ඇත)
      await flowMessage.send(from, { quoted: mek });

    } catch (err) {
      console.log("TESTBTN ERROR:", err);
      reply(`❌ Button Error: ${err.message}`);
    }
  }
);
