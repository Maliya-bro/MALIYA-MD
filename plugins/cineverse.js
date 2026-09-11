const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Context Info (Channel Details) ─────────────
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 Ｍ𝗔𝗟𝗜𝗬Ａ-〽️Ｄ 🍁";

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1,
    },
  };
}

// ── Security Bypass Headers (CineVerse LK) ─────────────
const DL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Referer": "https://cineverselk.space/",
    "Accept": "application/json, text/plain, */*",
    "Cookie": "cv_auth=true;"
};

// ── Small Caps Font Effect ─────────────
function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
  }).join("");
}

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".mp4") {
  const id = crypto.randomBytes(6).toString("hex");
  return path.join(TEMP_DIR, `${Date.now()}_${id}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

const pendingCvSearch = Object.create(null);

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ==========================================
// 1. Fetch JSON Data & Smart Search
// ==========================================
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
        console.error("CineVerse Search Error:", e.message);
        return [];
    }
}

// ==========================================
// 2. Command Trigger
// ==========================================
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `🎬 *${toSmallCaps("CINEVERSE LK DOWNLOADER")}*\n\n📌 *${toSmallCaps("Usage:")}* \`.cv <movie or series name>\`\n💡 *${toSmallCaps("Example:")}* \`.cv deadpool\` OR \`.cv alien romulus\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchCineverse(q.trim());

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}" on CineVerse LK.`);
    }

    const key = makePendingKey(sender, from);
    pendingCvSearch[key] = {
      step: 1,
      results,
      createdAt: Date.now(),
      isProcessing: false,
    };

    let text = `╭─[ 🎬 *${toSmallCaps("CINEVERSE LK RESULTS")}* ]\n│\n`;
    text += `├ 🔎 *${toSmallCaps("Search:")}* ${toSmallCaps(q)}\n`;
    text += `├ 📊 *${toSmallCaps("Results:")}* ${results.length}\n`;
    text += `├ 👇 *${toSmallCaps("Reply with a Number to Download:")}*\n│\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? `(${item.year})` : "";
      
      text += `├ 📱 *[ ${numStr} ]* ➔ *${toSmallCaps(item.title)}* ${year}\n`;
      text += `│  ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += `│  ╰ 💿 ${toSmallCaps(item.quality || "HD")} | ✍️ ${toSmallCaps(item.subtitleAuthor || "CineVerse")}\n│\n`;
    });
    text += `╰──────────────⮞`;

    const poster = results[0].posterImage || results[0].image || results[0].poster;
    
    if (poster) {
      await sock.sendMessage(from, { image: { url: poster }, caption: text, contextInfo: channelContextInfo() }, { quoted: mek });
    } else {
      await sock.sendMessage(from, { text, contextInfo: channelContextInfo() }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

// ==========================================
// 3. Multi-Step Reply Handler
// ==========================================
replyHandlers.push({
  filter: (text, { sender, from }) => !!pendingCvSearch[makePendingKey(sender, from)],
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = makePendingKey(sender, from);
    const session = pendingCvSearch[key];
    if (!session || session.isProcessing) return;

    const input = String(body).trim();

    // ── STEP 1: Selecting the Movie or Series ──
    if (session.step === 1) {
      const num = parseInt(input, 10);
      if (isNaN(num) || num < 1 || num > session.results.length) return;

      session.isProcessing = true;
      const selected = session.results[num - 1];

      if (!selected.isSeries) {
          const dlUrl = selected.directLink;
          if (!dlUrl || dlUrl === '#') {
              session.isProcessing = false;
              delete pendingCvSearch[key];
              return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
          }
          await executeDownload(sock, mek, from, dlUrl, `${selected.title} (${selected.year || "HD"})`, selected);
          delete pendingCvSearch[key];
      } 
      else {
          session.step = 2;
          session.selectedSeries = selected;
          session.isProcessing = false;

          let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
          
          let sText = `╭─[ 📺 *${toSmallCaps("TV SERIES SELECTED")}* ]\n│\n`;
          sText += `├ 🎬 *${toSmallCaps("Series:")}* ${toSmallCaps(selected.title)}\n`;
          sText += `├ 🗂️ *${toSmallCaps("Available Seasons:")}* ${availableSeasons || "N/A"}\n│\n`;
          sText += `├ 👇 *${toSmallCaps("Reply with Season and Episode Number:")}*\n`;
          sText += `├ 💡 *${toSmallCaps("Example:")}* \`1 2\` (For Season 1, Episode 2)\n│\n`;
          sText += `╰──────────────⮞`;

          await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
      }
    } 
    
    // ── STEP 2: Handling Season & Episode Input ──
    else if (session.step === 2) {
      const parts = input.split(/\s+/);
      if (parts.length < 2) {
          return await sendErrorMsg(sock, from, mek, "Invalid format! Please reply with Season and Episode number separated by space. (Example: 1 2)");
      }

      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);
      
      if (isNaN(s) || isNaN(e)) return await sendErrorMsg(sock, from, mek, "Please provide valid numbers for Season and Episode.");

      session.isProcessing = true;
      const series = session.selectedSeries;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
          session.isProcessing = false;
          delete pendingCvSearch[key];
          return await sendErrorMsg(sock, from, mek, `Download link not found for Season ${s} Episode ${e}.`);
      }

      const fS = s < 10 ? '0'+s : s;
      const fE = e < 10 ? '0'+e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;

      await executeDownload(sock, mek, from, epData.d, epTitle, series);
      delete pendingCvSearch[key];
    }
  },
});

// ==========================================
// 4. Core Download Execution Function
// ==========================================
async function executeDownload(sock, mek, from, url, titleName, meta) {
    let tempFile = makeTempFile(".mp4");
    
    try {
        await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

        // 🔥 IMPORTANT: Passing DL_HEADERS to bypass Hotlink Protection!
        const response = await axios({
            url: url,
            method: "GET",
            responseType: "stream",
            headers: DL_HEADERS, 
            timeout: 120000, 
            maxContentLength: 2000 * 1024 * 1024 // 2GB Limit
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
        const finalCaption = `╭─[ ✅ *${toSmallCaps("DOWNLOADED FROM CINEVERSE")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${toSmallCaps(titleName)}\n├ 📦 *${toSmallCaps("Size:")}* ${sizeMB.toFixed(2)} MB\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        // Send as Document (to avoid compression and preserve quality)
        await sock.sendMessage(from, {
            document: fs.readFileSync(tempFile),
            mimetype: "video/mp4",
            fileName: `${cleanName} (Sinhala Sub).mp4`,
            caption: finalCaption,
            contextInfo: channelContextInfo(),
        }, { quoted: mek });

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (err) {
        console.log("CINEVERSE DOWNLOAD ERROR:", err.message);

        // Fallback: Send Direct Link if file is too large or download fails
        let fallbackMsg = `╭─[ ⚠️ *${toSmallCaps("FILE TOO LARGE OR BLOCKED")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${toSmallCaps(titleName)}\n├ ℹ️ _The file might exceed limits or requires browser access._\n│\n├ 🔗 *${toSmallCaps("Direct Download Link:")}*\n│  ${url}\n│\n╰──────────────⮞`;
        
        await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    } finally {
        safeUnlink(tempFile);
    }
}

// Clean up expired sessions (5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingCvSearch)) {
    if (now - pendingCvSearch[key].createdAt > 5 * 60 * 1000) {
      delete pendingCvSearch[key];
    }
  }
}, 300000);
