const { cmd } = require("../command");
const axios = require("axios");

cmd(
  {
    pattern: "qr",
    alias: ["qrcode", "makeqr"],
    desc: "Generate a QR code for any text or link",
    category: "tools",
    react: "🔳",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) {
        return reply(
          "Please provide text or a URL.\n\nExample:\n.qr https://google.com"
        );
      }

      const text = String(q).trim();

      if (text.length > 2000) {
        return reply("Text is too long. Please use shorter content.");
      }

      await reply("Generating QR code... ⏳");

      const qrUrl =
        "https://chart.googleapis.com/chart?cht=qr&chs=500x500&chl=" +
        encodeURIComponent(text);

      const res = await axios.get(qrUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res.data) {
        console.log("QR STATUS:", res.status);
        return reply("Failed to generate QR code.");
      }

      const buffer = Buffer.from(res.data);

      if (!buffer.length) {
        return reply("Empty response received while generating QR.");
      }

      await bot.sendMessage(
        from,
        {
          image: buffer,
          caption:
            "✅ *MALIYA-MD QR GENERATOR*\n\n" +
            "🔗 *Content:* " +
            text +
            "\n\n> Powered by MALIYA-MD",
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("QR ERROR:", e?.message || e);
      return reply("An error occurred while generating the QR code.");
    }
  }
);
