/**
 * 🎬 LK21 Movie Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Package: @rindev/lk21dl-core
 * Usage: .lk21 <LK21 Movie URL>
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");

// Dynamic Import support for ESM / CommonJS
let lk21dl;
try {
  lk21dl = require("@rindev/lk21dl-core").default || require("@rindev/lk21dl-core");
} catch (e) {
  console.log("⚠️ @rindev/lk21dl-core module loading...");
}

cmd({
  pattern: "lk21",
  alias: ["lk21dl", "layarkaca"],
  react: "🎬",
  desc: "Download movies from LK21 using @rindev/lk21dl-core",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, reply }) => {
  if (!q || !q.startsWith("http")) {
    return reply("*🎬 Usage: .lk21 <LK21 Movie URL>*\n\n_Example: .lk21 https://lk21.xxx/film/example_");
  }

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply("*🎬 Processing LK21 Movie URL... Bypassing Cloudflare & Merging Segments!*");

  let outputPath = "";

  try {
    if (!lk21dl) {
      const module = await import("@rindev/lk21dl-core");
      lk21dl = module.default || module;
    }

    // Dynamic temp file name
    const fileName = `LK21_${Date.now()}.mp4`;
    outputPath = path.join(__dirname, `../temp/${fileName}`);

    // Temp Directory එක නැත්නම් සාදා ගැනීම
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // lk21dl core function එක run කිරීම
    const result = await lk21dl(q, outputPath);

    const targetFile = fs.existsSync(outputPath) ? outputPath : result;

    if (!fs.existsSync(targetFile)) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("*❌ Failed to download movie or output file missing.*");
    }

    // File Details ලබා ගැනීම
    const stats = fs.statSync(targetFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Uploading Movie to WhatsApp...*\n📦 *Size:* ${fileSizeMB} MB`);

    // WhatsApp එකට Document එකක් ලෙස යැවීම
    await maliya.sendMessage(from, {
      document: { url: targetFile },
      mimetype: "video/mp4",
      fileName: `LK21_Movie_${Date.now()}.mp4`,
      caption: `*🎬 LK21 Movie Downloader*\n📦 *Size:* ${fileSizeMB} MB\n\n_Downloaded & Delivered by MALIYA-MD_`
    }, { quoted: mek });

    // Temp File එක Delete කිරීම
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ LK21 Downloader Error:", error);

    // Error එකදීත් Temp File එක Cleanup කිරීම
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.message || error}`);
  }
});
