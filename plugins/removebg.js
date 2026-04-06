const { cmd } = require("../command");
const axios = require("axios");
const FormData = require("form-data");

cmd(
  {
    pattern: "rbg",
    alias: ["removebg", "nobg"],
    desc: "Remove image background without API keys",
    category: "tools",
    react: "✂️",
    filename: __filename,
  },
  async (bot, mek, m, { from, quoted, reply }) => {
    try {
      const q = quoted || m.quoted || null;

      if (!q) {
        return reply("Reply to an image message.");
      }

      const mime =
        q.mimetype ||
        q.msg?.mimetype ||
        q.message?.imageMessage?.mimetype ||
        "";

      if (!mime || !mime.startsWith("image/")) {
        return reply("Reply to an image message.");
      }

      await reply("Removing background... ⏳");

      let buffer;

      if (typeof q.download === "function") {
        buffer = await q.download();
      } else if (typeof bot.downloadMediaMessage === "function") {
        buffer = await bot.downloadMediaMessage(q);
      } else {
        return reply("Media download method not supported in this bot version.");
      }

      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reply("Failed to download the image.");
      }

      const formData = new FormData();
      formData.append("image", buffer, {
        filename: "maliya.png",
        contentType: "image/png",
      });

      const response = await axios.post(
        "https://api.creartai.com/v1/remove-bg",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Accept: "image/png, image/*, application/octet-stream",
            "User-Agent": "Mozilla/5.0",
          },
          responseType: "arraybuffer",
          timeout: 30000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        }
      );

      if (response.status !== 200) {
        console.log("RBG API STATUS:", response.status);
        console.log(
          "RBG API RESPONSE:",
          Buffer.isBuffer(response.data)
            ? response.data.toString("utf8").slice(0, 500)
            : response.data
        );
        return reply(`Background removal failed. Server returned ${response.status}.`);
      }

      const finalBuffer = Buffer.from(response.data);

      if (!finalBuffer || !finalBuffer.length) {
        return reply("Empty response received from background remover.");
      }

      await bot.sendMessage(
        from,
        {
          image: finalBuffer,
          mimetype: "image/png",
          caption:
            "✅ *MALIYA-MD BG REMOVER*\n\nBackground removed successfully.\n\n> Powered by MALIYA-MD",
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("RBG ERROR:", e?.response?.status || e?.message || e);
      if (e?.response?.data) {
        try {
          console.log(
            "RBG ERROR BODY:",
            Buffer.isBuffer(e.response.data)
              ? e.response.data.toString("utf8").slice(0, 500)
              : e.response.data
          );
        } catch {}
      }
      return reply("An error occurred while removing the background. Please try again.");
    }
  }
);
