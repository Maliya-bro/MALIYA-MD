const { cmd } = require("../command");
const axios = require("axios");

function normalizeUrl(input) {
  let url = String(input || "").trim();

  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

cmd(
  {
    pattern: "ss",
    alias: ["screenshot", "screens", "sitess"],
    desc: "Take a screenshot of any website",
    category: "tools",
    react: "📸",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) {
        return reply("Please provide a website URL.\nExample: .ss https://google.com");
      }

      const cleanUrl = normalizeUrl(q);

      if (!cleanUrl) {
        return reply("Invalid URL. Example: .ss https://google.com");
      }

      await reply("Taking screenshot... ⏳");

      const screenshotUrl =
        `https://image.thum.io/get/width/1200/noanimate/wait/5/` +
        encodeURI(cleanUrl);

      const check = await axios.get(screenshotUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        validateStatus: () => true,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (check.status !== 200 || !check.data) {
        console.log("SCREENSHOT STATUS:", check.status);
        return reply("Failed to capture screenshot. The website may be blocked or unavailable.");
      }

      const buffer = Buffer.from(check.data);

      if (!buffer.length) {
        return reply("Failed to capture screenshot. Empty response received.");
      }

      await bot.sendMessage(
        from,
        {
          image: buffer,
          caption: `*MALIYA-MD SCREENSHOT SERVICE*\n\n🔗 *URL:* ${cleanUrl}`,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("SCREENSHOT ERROR:", e?.message || e);
      return reply("An error occurred while taking the screenshot. Please try again.");
    }
  }
);
