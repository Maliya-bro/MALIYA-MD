const { cmd } = require("../command");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

const tempDir = path.join(__dirname, "../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

cmd({
  pattern: "wanted",
  desc: "Create Wanted Poster",
  category: "fun",
  react: "🤠",
  filename: __filename,
},
async (conn, mek, m, { from, reply }) => {
  try {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage) {
      return reply("📸 Image ekakata reply karala `.wanted` danna.");
    }

    // download image
    const buffer = await conn.downloadMediaMessage(m.quoted);
    const userImg = await loadImage(buffer);

    // canvas
    const canvas = createCanvas(600, 800);
    const ctx = canvas.getContext("2d");

    // background
    ctx.fillStyle = "#f5deb3";
    ctx.fillRect(0, 0, 600, 800);

    // title
    ctx.fillStyle = "#000";
    ctx.font = "bold 60px serif";
    ctx.fillText("WANTED", 180, 80);

    // user image
    ctx.drawImage(userImg, 100, 150, 400, 400);

    // reward text
    ctx.font = "bold 40px serif";
    ctx.fillText("$5,000 REWARD!", 130, 600);

    ctx.font = "20px serif";
    ctx.fillText("Notify nearest law enforcement", 150, 650);

    // save
    const filePath = path.join(tempDir, `wanted_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    out.on("finish", async () => {
      await conn.sendMessage(from, { image: { url: filePath } }, { quoted: mek });
      fs.unlinkSync(filePath);
    });

  } catch (e) {
    console.log(e);
    reply("❌ Wanted poster create error");
  }
});
