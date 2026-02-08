const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { downloadMediaMessage } = require("../lib/msg"); // <- වැදගත්
const { cmd } = require("../command");

cmd({
  pattern: "wanted",
  alias: ["wantededit"],
  react: "📸",
  desc: "Wanted poster edit",
  category: "img_edit",
  use: ".wanted (reply to image)",
  filename: __filename
}, async (conn, mek, m, { reply }) => {
  try {
    const quoted = mek.quoted ? mek.quoted : mek;
    const mime = quoted.mimetype || "";

    if (!mime.startsWith("image/")) {
      return reply("🖼️ Please reply to an image.");
    }

    // Download media using baileys helper
    const buffer = await downloadMediaMessage(quoted, "buffer", {}, { logger: console });
    if (!buffer) return reply("❌ Failed to download image.");

    // Save temp file
    const ext = mime.includes("png") ? ".png" : ".jpg";
    const tempPath = path.join(os.tmpdir(), `wanted_${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, buffer);

    // Upload to Catbox
    const form = new FormData();
    form.append("fileToUpload", fs.createReadStream(tempPath));
    form.append("reqtype", "fileupload");

    const upload = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders()
    });

    fs.unlinkSync(tempPath);

    if (!upload.data) return reply("❌ Upload failed.");

    const imageUrl = upload.data.trim();

    // Wanted API
    const api = `https://api.popcat.xyz/v2/wanted?image=${encodeURIComponent(imageUrl)}`;
    const res = await axios.get(api, { responseType: "arraybuffer" });

    if (!res.data) return reply("❌ API error.");

    await conn.sendMessage(m.chat, {
      image: Buffer.from(res.data),
      caption: "> *Powered by MALINDU*"
    }, { quoted: mek });

  } catch (err) {
    console.log("Wanted Error:", err);
    reply("❌ Error processing image.");
  }
});
