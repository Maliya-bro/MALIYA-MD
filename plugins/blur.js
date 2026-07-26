const { cmd } = require("../command");
const { getRandom } = require("../lib/functions");
const fs = require("fs").promises;
const sharp = require("sharp");

cmd({
  pattern: "blur",
  react: "💫",
  desc: "Apply blur effect to image",
  category: "utilities",
  filename: __filename,
}, async (danuwa, mek, m, { from, quoted, reply }) => {
  try {
    const isQuotedImage = quoted && quoted.type === "imageMessage";
    const isImage = m.type === "imageMessage";
    const imageSource = isQuotedImage ? quoted : isImage ? m : null;

    if (!imageSource) return reply("📷 *Reply to an image to blur it!*");

    const input = getRandom(".jpg");
    const output = getRandom(".jpg");
    const buffer = await imageSource.download();

    await fs.writeFile(input, buffer);
    await sharp(input).blur(10).toFile(output);

    await danuwa.sendMessage(from, {
      image: { url: output },
      caption: `╭─────── ⭓ ⭓ ⭓  ─────────╮
│       💫 𝗕𝗟𝗨𝗥 𝗥𝗘𝗦𝗨𝗟𝗧 💫        │
╰──────────────⟡───────╯
│ ✅ Blur effect applied!
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝘿𝘼𝙉𝙐𝙆𝘼 𝘿𝙄𝙎𝘼𝙉𝘼𝙔𝘼𝙆𝘼 🔥`,
    }, { quoted: mek });

    // 🧹 Clear temp files after 1s
    setTimeout(() => {
      fs.unlink(input).catch(err => console.log("❌ Failed to delete input file:", err.message));
      fs.unlink(output).catch(err => console.log("❌ Failed to delete output file:", err.message));
    }, 1000);

  } catch (err) {
    console.error(err);
    reply("❌ *Error applying blur. Try again later.*");
  }
});
