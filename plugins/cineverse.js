const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Context Info (Channel Details) ─────────────
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬ𝗜𝗬Ａ-〽️Ｄ 🍁";

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

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
  }).join("");
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
    text: `┏━━━━━━━━━━━━\n┃ ❌ *𝐄𝐑𝐑𝐎𝐑*\n┗━━━━━━━━━━━━━\n🚫 _${text}_`,
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
}, async (sock, mek, m, { from, q }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `┏━━━━━━━━━━━━━\n┃ 🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n┗━━━━━━━━━━━━━━\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv alien romulus\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchCineverse(q.trim());

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}" on CineVerse LK.`);
    }

    pendingCvSearch[from] = {
      step: 1,
      results,
      createdAt: Date.now(),
      isProcessing: false,
    };

    let text = `┏━━━━━━━━━━━━\n`;
    text += `┃ 🎬 *𝐂𝐕 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    text += `┗━━━━━━━━━━━━━━\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? `(${item.year})` : "";
      
      text += `*[ ${numStr} ]* ➔ *${item.title}* ${year}\n`;
      text += ` ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += ` ╰ 💿 ${item.quality || "HD"} | ✍️ ${item.subtitleAuthor || "CineVerse"}\n\n`;
    });
    text += `> 👇 *Reply with a Number to Download...*`;

    const poster = results[0].posterImage || results[0].image || results[0].poster || "https://i.ibb.co/3m1bXvt/cineverse.jpg";
    
    const imgMsg = await sock.sendMessage(from, { 
        image: { url: poster }, 
        caption: `> 🎬 *${results[0].title}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`, 
        contextInfo: channelContextInfo() 
    }, { quoted: mek });

    await sock.sendMessage(from, { 
        text: text, 
        contextInfo: channelContextInfo() 
    }, { quoted: imgMsg });

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
  filter: (text, { from }) => !!pendingCvSearch[from],
  function: async (sock, mek, m, { body, from }) => {
    const session = pendingCvSearch[from];
    if (!session || session.isProcessing) return;

    const input = String(body).trim();

    if (session.step === 1) {
      const num = parseInt(input, 10);
      if (isNaN(num) || num < 1 || num > session.results.length) return;

      session.isProcessing = true;
      const selected = session.results[num - 1];

      if (!selected.isSeries) {
          const dlUrl = selected.directLink;
          if (!dlUrl || dlUrl === '#') {
              session.isProcessing = false;
              delete pendingCvSearch[from];
              return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
          }
          await executeDownload(sock, mek, from, dlUrl, `${selected.title} (${selected.year || "HD"})`);
          delete pendingCvSearch[from];
      } 
      else {
          session.step = 2;
          session.selectedSeries = selected;
          session.isProcessing = false;

          let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
          
          let sText = `┏━━━━━━━━━━━━\n`;
          sText += `┃ 📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n`;
          sText += `┗━━━━━━━━━━━━\n`;
          sText += `🎬 *Series:* ${selected.title}\n`;
          sText += `🗂️ *Seasons:* ${availableSeasons || "N/A"}\n\n`;
          sText += `> 👇 *Reply with Season & Episode Number:*\n`;
          sText += `> 💡 *Example:* \`1 2\` (Season 1, Ep 2)`;

          await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
      }
    } 
    else if (session.step === 2) {
      const parts = input.split(/\s+/);
      if (parts.length < 2) {
          return await sendErrorMsg(sock, from, mek, "Invalid format! Example: 1 2");
      }

      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);
      
      if (isNaN(s) || isNaN(e)) return await sendErrorMsg(sock, from, mek, "Please provide valid numbers.");

      session.isProcessing = true;
      const series = session.selectedSeries;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
          session.isProcessing = false;
          delete pendingCvSearch[from];
          return await sendErrorMsg(sock, from, mek, `Link not found for S${s} E${e}.`);
      }

      const fS = s < 10 ? '0'+s : s;
      const fE = e < 10 ? '0'+e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;

      await executeDownload(sock, mek, from, epData.d, epTitle);
      delete pendingCvSearch[from];
    }
  },
});

// ==========================================
// 4. Core Download Execution Function
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
        
        let finalCaption = `┏━━━━━━━━━━━━━\n`;
        finalCaption += ` ┃ ✅ *𝐅𝐈𝐋𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
        finalCaption += ` ┗━━━━━━━━━━━━━\n`;
        finalCaption += `🎬 *Title:* ${titleName}\n`;
        finalCaption += `📦 *Size:* ${sizeMB.toFixed(2)} MB\n\n`;
        finalCaption += `> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

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

        let fallbackMsg = `┏━━━━━━━━━━━\n`;
        fallbackMsg += `┃ ⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄*\n`;
        fallbackMsg += `┗━━━━━━━━━━━\n`;
        fallbackMsg += `🎬 *Title:* ${titleName}\n`;
        fallbackMsg += `ℹ️ _File might exceed WhatsApp limits._\n\n`;
        fallbackMsg += `🔗 *Direct Download Link:*\n${url}`;
        
        await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
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
}, 300000);
