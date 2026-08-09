const { cmd } = require("../command");
const { getRandom } = require("../lib/functions");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs").promises;
const sharp = require("sharp");
const path = require("path");

cmd({
  pattern: "animelogo",
  react: "👾",
  desc: "Apply anime style effect to an image",
  category: "edit",
  filename: __filename,
}, async (danuwa, mek, m, { from, sender, quoted, reply }) => {
  try {
    const isQuotedImage = quoted && quoted.type === "imageMessage";
    const isImage = m.type === "imageMessage";
    const imageMessage = isQuotedImage ? quoted : isImage ? m : null;

    if (!imageMessage) {
      return reply("🖼️ *Reply to an image or send an image with `.animefy`*");
    }

    const buffer = await downloadMediaMessage(imageMessage, "buffer", {}, danuwa);
    if (!buffer) return reply("❌ *Failed to download image.*");

    const tempFolder = path.join(__dirname, "temp");
    await fs.mkdir(tempFolder, { recursive: true });

    const input = path.join(tempFolder, getRandom(".jpg"));
    const output = path.join(tempFolder, getRandom(".jpg"));

    await fs.writeFile(input, buffer);


    await sharp(input)
      .modulate({ saturation: 2, brightness: 1.2 }) 
      .sharpen() 
      .toFile(output);

    await danuwa.sendMessage(from, {
      image: { url: output },
      caption: `customize the caption for you want`,
    }, { quoted: mek });

    await fs.unlink(input);
    await fs.unlink(output);
  } catch (err) {
    console.error("[Animefy Plugin Error]", err);
  }
});
