const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const DL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "Referer": "https://cineverselk.space/",
  "Accept": "application/json, text/plain, */*",
  "Cookie": "cv_auth=true;"
};

const DEFAULT_POSTER = "https://i.ibb.co/3m1bXvt/cineverse.jpg";
const SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".mp4") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

// 🔥 video.js ආකෘතියට අනුව Key එක සෑදීම
function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

const pendingCvSearch = Object.create(null);

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363427174988449@newsletter",
      newsletterName: "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁",
      serverMessageId: -1,
    },
  };
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
  }, { quoted: mek });
}

async function searchCineverse(query) {
  const cb = Date.now();
  try {
    const [mRes, sRes] = await Promise.all([
      axios.get(`https://cineverselk.space/movies.json?v=${cb}`, { headers: DL_HEADERS }).catch(() => null),
      axios.get(`https://cineverselk.space/series.json?v=${cb}`, { headers: DL_HEADERS }).catch(() => null)
    ]);

    const movies = mRes?.data?.data ? mRes.data.data : (Array.isArray(mRes?.data) ? mRes.data : []);
    const series = sRes?.data?.data ? sRes.data.data : (Array.isArray(sRes?.data) ? sRes.data : []);
    const allData = [...movies, ...series];

    if (allData.length === 0) return [];

    const queryWords = query.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);

    return allData.filter(item => {
      if (!item.title) return false;
      const titleClean = item.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      return queryWords.every(word => titleClean.includes(word));
    }).slice(0, 10);
  } catch (e) {
    return [];
  }
}

// ==========================================
// 1. Command Trigger
// ==========================================
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``,
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchCineverse(q.trim());

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}" on CineVerse LK.`);
    }

    // 🔥 video.js ක්‍රමයට session එක සෑදීම
    const key = makePendingKey(sender, from);
    pendingCvSearch[key] = {
      results,
      step: 1,
      createdAt: Date.now(),
      isProcessing: false,
    };

    let text = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    text += `🎬 *𝐂𝐕 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    text += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? `(${item.year})` : "";
      text += `*[ ${numStr} ]* ➔ *${item.title}* ${year}\n`;
      text += `  ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += `  ╰ 💿 ${item.quality || "HD"} | ✍️ ${item.subtitleAuthor || "CineVerse"}\n\n`;
    });
    text += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n> 👇 *Reply with a number to Download...*`;

    let poster = results[0].posterImage || results[0].image || results[0].poster || DEFAULT_POSTER;

    // 1. Film Poster
    const posterMsg = await sock.sendMessage(from, { 
      image: { url: poster }, 
      caption: `> 🎬 *${results[0].title}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`
    }, { quoted: mek });

    // 2. Movie List
    await sock.sendMessage(from, { 
      image: { url: SEARCH_IMAGE },
      caption: text 
    }, { quoted: posterMsg });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

// ==========================================
// 2. Number Reply Listener (video.js ආකෘතිය)
// ==========================================
replyHandlers.push({
  filter: (_body, { sender, from }) => !!pendingCvSearch[makePendingKey(sender, from)],
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingCvSearch[key];
    if (!pending || pending.isProcessing) return;

    const rawInput = String(body || "").trim();

    if (pending.step === 1) {
      const input = parseInt(rawInput, 10);
      if (isNaN(input) || input < 1 || input > pending.results.length) return;

      const selected = pending.results[input - 1];

      if (!selected.isSeries) {
        pending.isProcessing = true;
        const dlUrl = selected.directLink;
        if (!dlUrl || dlUrl === '#') {
          delete pendingCvSearch[key];
          return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
        }
        delete pendingCvSearch[key];
        await executeDownload(sock, mek, from, dlUrl, `${selected.title} (${selected.year || "HD"})`);
      } else {
        pending.step = 2;
        pending.selectedSeries = selected;
        pending.isProcessing = false;

        let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
        
        let sText = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
        sText += `📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n`;
        sText += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
        sText += `🎬 *Series:* ${selected.title}\n`;
        sText += `🗂️ *Seasons:* ${availableSeasons || "N/A"}\n\n`;
        sText += `> 👇 *Reply with Season & Episode:*\n`;
        sText += `> 💡 *Example:* \`1 2\` (Season 1, Ep 2)\n\n`;
        sText += `⊱━━• ✿ •━━━━━• ✿ •━━⊰`;

        await sock.sendMessage(from, { text: sText }, { quoted: mek });
      }
    } 
    else if (pending.step === 2) {
      const parts = rawInput.split(/\s+/);
      if (parts.length < 2) return;

      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);
      if (isNaN(s) || isNaN(e)) return;

      pending.isProcessing = true;
      const series = pending.selectedSeries;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
        delete pendingCvSearch[key];
        return await sendErrorMsg(sock, from, mek, `Link not found for S${s} E${e}.`);
      }

      const fS = s < 10 ? '0' + s : s;
      const fE = e < 10 ? '0' + e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;

      delete pendingCvSearch[key];
      await executeDownload(sock, mek, from, epData.d, epTitle);
    }
  },
});

// ==========================================
// 3. Download Execution
// ==========================================
async function executeDownload(sock, mek, from, url, titleName) {
  let tempFile = makeTempFile(".mp4");
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    const response = await axios({
      url: url,
      method: "GET",
      responseType: "stream",
      headers: DL_HEADERS, 
      timeout: 180000, 
      maxContentLength: 2000 * 1024 * 1024,
      maxBodyLength: 2000 * 1024 * 1024
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(tempFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB === 0) throw new Error("Downloaded file is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanName = titleName.replace(/[\\/:*?"<>|]/g, "").trim();
    const isLargeDoc = sizeMB > 60;
    
    let caption = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    caption += `✅ *𝐅𝐈𝐋𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    caption += `🎬 *Title:* ${titleName}\n`;
    caption += `📦 *Size:* ${sizeMB.toFixed(2)} MB\n`;
    caption += `📁 *Format:* ${isLargeDoc ? "Document (Raw Stream)" : "Standard MP4"}\n\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    await sock.sendMessage(from, {
      document: fs.readFileSync(tempFile),
      mimetype: isLargeDoc ? "application/octet-stream" : "video/mp4",
      fileName: `${cleanName} (Sinhala Sub).mp4`,
      caption: caption
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (err) {
    let fallbackMsg = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    fallbackMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄*\n`;
    fallbackMsg += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    fallbackMsg += `🎬 *Title:* ${titleName}\n`;
    fallbackMsg += `ℹ️ _File might exceed WhatsApp limits or connection timed out._\n\n`;
    fallbackMsg += `🔗 *Direct Link:*\n${url}\n\n`;
    fallbackMsg += `⊱━━• ✿ •━━━━━• ✿ •━━⊰`;
    
    await sock.sendMessage(from, { text: fallbackMsg }, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
  } finally {
    safeUnlink(tempFile);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingCvSearch)) {
    if (now - pendingCvSearch[key].createdAt > 5 * 60 * 1000) {
      delete pendingCvSearch[key];
    }
  }
}, 30000);
