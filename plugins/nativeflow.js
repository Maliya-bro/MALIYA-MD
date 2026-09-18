const { cmd } = require("../command");

cmd(
  {
    pattern: "testbtn",
    alias: ["nativeflow", "webbtn"],
    react: "🚀",
    desc: "Test Web-supported Native Flow buttons using @vanzxy/baileys",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, pushname }) => {
    try {
      // @vanzxy/baileys එකෙන් Button builder load කරගැනීම
      const { Button } = await import("@vanzxy/baileys");

      const userName = pushname || m?.pushName || "User";
      const imgUrl = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_j34rhwj34rhwj34r.png?raw=true";

      // Button instance එකක් create කිරීම
      const flowMessage = new Button(sock)
        // 1. Header එකට image එකක් set කිරීම (Web එකේ buttons load වීමට උපකාරී වේ)
        .setImage(imgUrl)
        .setTitle("XPRO VERCE")
        .setBody(`👋 Hey *${userName}*,\n\nබාගත කිරීමට පහතින් quality එකක් තෝරන්න:`)
        .setFooter("🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁")
        // 2. Web එකේ වැඩ කරන Quick Reply buttons පමණක් add කිරීම
        .addReply("*SD QUALITY*", ".download sd")
        .addReply("*HD QUALITY*", ".download hd")
        .addReply("*Audio file*", ".download mp3");

      // Chat එකට message එක send කිරීම
      await flowMessage.send(from, { quoted: mek });

    } catch (err) {
      console.log("TESTBTN ERROR:", err);
      reply(`❌ Button Error: ${err.message}`);
    }
  }
);
