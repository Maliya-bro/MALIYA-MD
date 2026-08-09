const { cmd } = require("../command");
const { getRandom } = require("../lib/functions");
const { downloadMediaMessage } = require("@itsliaaa/baileys");
const fs = require("fs").promises;
const sharp = require("sharp");
const path = require("path");

cmd({
  pattern: "animefy",
  alias: ["anime"],
  react: "👾",
  desc: "Apply anime style effect to an image",
  category: "utilities",
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

    // Apply anime effect (e.g., adjust colors, smooth, sharpen)
    await sharp(input)
      .modulate({ saturation: 2, brightness: 1.2 }) // Increase saturation and brightness for anime effect
      .sharpen() // Sharpen the image for a stylized anime effect
      .toFile(output);

    await danuwa.sendMessage(from, {
      image: { url: output },
      caption: `╭─────── ⭓ ⭓ ⭓  ─────────╮
│      👾 𝗔𝗡𝗜𝗠𝗘𝗙𝗬 𝗥𝗘𝗦𝗨𝗟𝗧 👾       │
╰──────────────⟡───────╯
│ ✅ Anime style effect applied!
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝘿𝘼𝙉𝙐𝙆𝘼 𝘿𝙄𝙎𝘼𝙉𝘼𝙔𝘼𝙆𝘼 🔥`,
    }, { quoted: mek });

    await fs.unlink(input);
    await fs.unlink(output);
  } catch (err) {
    console.error("[Animefy Plugin Error]", err);
    reply("❌ *Error applying anime effect. Try again later.*");
  }
});
