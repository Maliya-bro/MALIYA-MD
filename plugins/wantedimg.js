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
    // Check for quoted message with image
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage) {
      return reply("📸 Image ekakata reply karala `.wanted` danna.");
    }

    // Download image
    const buffer = await conn.downloadMediaMessage(mek.quoted || quoted);
    const userImg = await loadImage(buffer);

    // Create canvas
    const canvas = createCanvas(600, 800);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#f5deb3";
    ctx.fillRect(0, 0, 600, 800);

    // Border
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 580, 780);

    // Title
    ctx.fillStyle = "#000";
    ctx.font = "bold 60px serif";
    ctx.textAlign = "center";
    ctx.fillText("WANTED", 300, 80);

    // Draw user image (cropped to square)
    const size = Math.min(userImg.width, userImg.height);
    ctx.drawImage(userImg, 
      (userImg.width - size) / 2, (userImg.height - size) / 2, size, size,
      100, 150, 400, 400);

    // Image border
    ctx.strokeRect(100, 150, 400, 400);

    // Reward text
    ctx.font = "bold 40px serif";
    ctx.fillText("$5,000 REWARD!", 300, 620);

    ctx.font = "20px serif";
    ctx.fillText("Notify nearest law enforcement", 300, 680);

    // Save and send
    const filePath = path.join(tempDir, `wanted_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    out.on("finish", async () => {
      await conn.sendMessage(from, { image: { url: filePath } }, { quoted: mek });
      // Delay before deleting
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }, 1000);
    });

  } catch (e) {
    console.log(e);
    reply(`❌ Wanted poster create error: ${e.message}`);
  }
});
