const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");

module.exports = {
  pattern: "status",
  alias: ["sts", "stdl", "st", "gets", "stts"],
  desc: "Download WhatsApp Status",
  category: "download",
  react: "👀",
  filename: __filename,
  
  async execute(bot, m, args) {
    try {
      // Check quoted message
      if (!m.quoted) {
        return m.reply("❌ Please reply to an image or video status and use *.status*");
      }

      const msg = m.quoted.message;
      const type = Object.keys(msg)[0];

      if (type !== "imageMessage" && type !== "videoMessage") {
        return m.reply("❌ This is not an image or video status");
      }

      const stream = await downloadContentFromMessage(
        msg[type],
        type.replace("Message", "")
      );

      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const ext = type === "imageMessage" ? "jpg" : "mp4";
      const filePath = path.join(__dirname, `../temp/status.${ext}`);

      fs.writeFileSync(filePath, buffer);

      await bot.sendMessage(
        m.from,
        {
          [type === "imageMessage" ? "image" : "video"]: fs.readFileSync(filePath),
          caption: "✅ Status downloaded successfully"
        },
        { quoted: m }
      );

      fs.unlinkSync(filePath);
    } catch (e) {
      console.error(e);
      m.reply("❌ Failed to download status");
    }
  }
};
