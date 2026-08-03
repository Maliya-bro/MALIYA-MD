/**
 * 🕷️ xHamster Live Search & Downloader Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────────────────
 * Engine: xhamster-scraper NPM Package (By VajiraOfficial)
 * Flow: .xhamster <query> -> Reply Number -> Choose Quality -> Download
 */

const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { xhamsterSearch, xhamsterDownload } = require('xhamster-scraper');

// Session tracking සඳහා Objects
const pendingXSearch = {};
const pendingXDownload = {};

// ─── 🔍 1. XHAMSTER SEARCH COMMAND ───────────────────────────────────
cmd({
  pattern: "sex",
  alias: ["xh", "xsearch", "xxx", "hot", "pornhub", "ph"],
  react: "🕷️",
  desc: "Search videos from xHamster and download",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🕷️ Usage: .xxx <search query>*\n\n_Example: .xhamster funny cat_");

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    // පැකේජ් එකෙන් රිසල්ට්ස් 10ක් සර්ච් කරලා ගන්නවා
    const items = await xhamsterSearch(q, 10);

    if (!items || items.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ No results found for "${q}"*`);
    }

    let text = `*🕷️ MALIYA-MD xHamster Search: "${q}"*\n${"─".repeat(28)}\n\n`;
    items.forEach((r, i) => {
      text += `*${i + 1}.* ${r.title}\n⏱️ _Duration: ${r.duration || 'N/A'}_ | 👀 _Views: ${r.views || 'N/A'}_\n\n`;
    });
    text += `*📌 Note:* Reply with the number to select the video.`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // සෙෂන් එක සේව් කර ගැනීම (Search Stage)
    pendingXSearch[sender] = {
      results: items,
      messageId: sentMsg?.key?.id || null,
      stage: "SELECT_VIDEO",
      timestamp: Date.now()
    };

  } catch (e) {
    console.error("❌ XHamster Search Error:", e.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`*❌ Search Error:* ${e.message}`);
  }
});

// ─── 💬 2. REPLY HANDLER (STAGE 1: VIDEO SELECT & STAGE 2: QUALITY SELECT) ──
cmd({
  filter: (text, { sender }) => {
    // යූසර්ට සෙෂන් එකක් තියෙනවාද කියලා බලනවා
    return pendingXSearch[sender] || pendingXDownload[sender];
  },
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  
  // === STAGE 1: වීඩියෝ අංකය තෝරාගැනීම ===
  if (pendingXSearch[sender] && pendingXSearch[sender].stage === "SELECT_VIDEO") {
    const session = pendingXSearch[sender];
    const index = parseInt(body.trim()) - 1;

    if (isNaN(index) || index < 0 || index >= session.results.length) return;

    const selectedVideo = session.results[index];
    delete pendingXSearch[sender]; // පැරණි සෙෂන් එක අයින් කරනවා

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    try {
      // වීඩියෝ එකේ මෙටාඩේටා සහ ඩවුන්ලෝඩ් ලින්ක්ස් ගන්නවා
      const metadata = await xhamsterDownload(selectedVideo.url);
      
      if (!metadata || !metadata.download || Object.keys(metadata.download).length === 0) {
        return reply(`*❌ Failed to extract download links for this video.*`);
      }

      // තියෙන ക്വാwalities (720p, 480p, 360p වගේ) ලිස්ට් එකක් ගන්නවා
      const qualities = Object.keys(metadata.download);
      
      let qText = `*🎬 Title:* ${metadata.title || selectedVideo.title}\n`;
      qText += `⏱️ *Duration:* ${metadata.duration || 'N/A'}\n\n`;
      qText += `*👇 Reply with the number to select Quality:*\n`;
      
      qualities.forEach((q, i) => {
        qText += `*${i + 1}.* ${q} (${metadata.download[q].format || 'mp4'})\n`;
      });

      const sentQMsg = await reply(qText);

      // ඊලඟ ස්ටේජ් එකට සෙෂන් එක සේව් කරනවා
      pendingXDownload[sender] = {
        title: metadata.title || selectedVideo.title,
        downloadOptions: metadata.download,
        qualitiesList: qualities,
        messageId: sentQMsg?.key?.id || null,
        timestamp: Date.now()
      };

    } catch (err) {
      reply(`*⚠️ Error fetching video details:* ${err.message}`);
    }
    return;
  }

  // === STAGE 2: ക്വാality එක තෝරාගෙන ඩවුන්ලෝඩ් කිරීම ===
  if (pendingXDownload[sender]) {
    const dlSession = pendingXDownload[sender];
    const qIndex = parseInt(body.trim()) - 1;

    if (isNaN(qIndex) || qIndex < 0 || qIndex >= dlSession.qualitiesList.length) return;

    const selectedQuality = dlSession.qualitiesList[qIndex];
    const downloadUrl = dlSession.downloadOptions[selectedQuality].url;
    const videoTitle = dlSession.title;

    delete pendingXDownload[sender]; // සෙෂන් එක ක්ලියර් කරනවා

    await maliya.sendMessage(from, { react: { text: "📥", key: mek.key } });
    reply(`*🚀 Uploading ${selectedQuality} to WhatsApp... Please wait!*`);

    let tempFilePath;

    try {
      const safeTitle = videoTitle.replace(/[^\w\s.\-\[\]()]/gi, "").trim() || "xVideo";
      const cleanFileName = `${safeTitle}_${selectedQuality}.mp4`;
      tempFilePath = path.join(__dirname, cleanFileName);

      // වීඩියෝ එක සර්වර් එකට ඩවුන්ලෝඩ් කරගැනීම
      const response = await axios({
        method: 'get',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 0,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
        }
      });

      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((res, rej) => {
        writer.on('finish', res);
        writer.on('error', rej);
      });

      // WhatsApp එකට Document එකක් විදිහට සෙන්ඩ් කිරීම
      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName: cleanFileName,
        caption: `*🎬 ${videoTitle}*\n⚙️ *Quality:* ${selectedQuality}\n\n_Delivered by MALIYA-MD_`
      }, { quoted: mek });

      // Temporary ෆයිල් එක ඩිලීට් කිරීම
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (error) {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reply(`*❌ Download Failed:* ${error.message}`);
    }
  }
});

// සෙෂන්ස් ඔටෝ ක්ලියර් කරන Interval එක (විනාඩි 5න්)
setInterval(() => {
  const now = Date.now(), ttl = 5 * 60 * 1000;
  for (const s in pendingXSearch) if (now - pendingXSearch[s].timestamp > ttl) delete pendingXSearch[s];
  for (const d in pendingXDownload) if (now - pendingXDownload[d].timestamp > ttl) delete pendingXDownload[d];
}, 60000);
