const { cmd } = require("../command");
const { Client } = require("@gradio/client");
const fetch = require("node-fetch");

// Hugging Face Space URL
const HF_SPACE = "https://briaai-bria-rmbg-1-4.hf.space/--replicas/bkhbq/";

cmd({
  pattern: "removebg",
  react: "🪄",
  desc: "Remove image background",
  category: "image",
  filename: __filename,
}, async (danuwa, mek, m, { from, reply }) => {
  try {
    if (!mek._mediaBuffer || mek._mediaType !== "imageMessage")
      return reply("📸 *Send an image with caption `.removebg`*");

    await reply("🪄 Removing background, please wait...");

    // Convert the media buffer to a Blob (as required by @gradio/client)
    const imageBlob = new Blob([mek._mediaBuffer], { type: "image/png" });

    // Connect to Hugging Face Space
    const app = await Client.connect(HF_SPACE);

    // Predict / remove background
    const result = await app.predict("/predict", [imageBlob]);

    const processedUrl = result?.data?.[0];
    if (!processedUrl || typeof processedUrl !== "string")
      return reply("❌ *Failed to get processed image URL.*");

    // Make sure it's an absolute URL
    const absoluteUrl = processedUrl.startsWith("http")
      ? processedUrl
      : `https://briaai-bria-rmbg-1-4.hf.space${processedUrl}`;

    // Download processed image
    const res = await fetch(absoluteUrl);
    if (!res.ok) return reply("❌ *Failed to download processed image.*");

    const buffer = Buffer.from(await res.arrayBuffer());

    // Send processed image to user
    await danuwa.sendMessage(
      from,
      {
        image: buffer,
        caption: `╭─────── ⭓ ⭓ ⭓  ─────────╮
│    🪄 𝗕𝗔𝗖𝗞𝗚𝗥𝗢𝗨𝗡𝗗 𝗥𝗘𝗠𝗢𝗩𝗘𝗗 🪄    │
╰──────────────⟡───────╯
│ ✨ Background removed successfully!
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥`,
      },
      { quoted: mek }
    );

  } catch (err) {
    console.error("RemoveBG error:", err);
    reply("❌ *Error while removing background.*");
  }
});
