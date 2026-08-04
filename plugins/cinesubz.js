/**
 * 🎬 LK21 Downloader with Domain Auto-Fixer
 * ─────────────────────────────────────────────────────────────
 * Fixes: tv12, tv14, tv18... domain variations automatically
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");

let lk21dl;

cmd({
  pattern: "lk21",
  alias: ["lk21dl", "layarkaca"],
  react: "🎬",
  desc: "Download movies from LK21 with auto-domain fix",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, reply }) => {
  if (!q || !q.startsWith("http")) {
    return reply("*🎬 Usage: .lk21 <LK21 Movie URL>*\n\n_Example: .lk21 https://tv12.lk21official.cc/amazing-spider-man-2-2014_");
  }

  await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
  reply("*🎬 Normalizing LK21 Domain & Fetching Streams...*");

  let outputPath = "";

  try {
    if (!lk21dl) {
      const module = await import("@rindev/lk21dl-core");
      lk21dl = module.default || module;
    }

    // 💡 MAIN FIX: tv12.lk21official.cc වැනි ඕනෑම Domain එකක් Standard LK21 Format එකට සකස් කිරීම
    let cleanUrl = q.trim();

    // extract movie slug (e.g. "amazing-spider-man-2-2014")
    const slug = cleanUrl.split('/').filter(Boolean).pop();

    // Standard domains array (Package එකට සපෝට් කරන main domains)
    const targetDomains = [
      `https://lk21.online/${slug}`,
      `https://layarkaca21.onl/${slug}`,
      cleanUrl // original
    ];

    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `LK21_${Date.now()}.mp4`;
    outputPath = path.join(tempDir, fileName);

    let success = false;
    let lastError = "";

    // 🔄 Domain Fallback Loop: 404 නොවෙන Domain එක හම්බවෙනකම් Try කරයි
    for (const testUrl of targetDomains) {
      try {
        console.log("Trying LK21 URL:", testUrl);
        await lk21dl(testUrl, outputPath);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          success = true;
          break;
        }
      } catch (err) {
        lastError = err.message || err;
        console.log(`Failed for ${testUrl}: ${lastError}`);
      }
    }

    if (!success || !fs.existsSync(outputPath)) {
      throw new Error(lastError || "Failed to download stream from all mirror domains.");
    }

    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });

    await maliya.sendMessage(from, {
      document: { url: outputPath },
      mimetype: "video/mp4",
      fileName: `${slug}.mp4`,
      caption: `*🎬 LK21 Movie Downloader*\n📦 *Size:* ${fileSizeMB} MB\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ LK21 Final Error:", error);

    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.message || error}\n\n_Tip: tv12.lk21official.cc වැනි Mirror Domains වල Stream බ්ලොක් කර ඇති විට Direct LK21 Online URL එකක් පාවිච්චි කරන්න._`);
  }
});
