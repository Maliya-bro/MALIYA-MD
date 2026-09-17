const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const DL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "Referer": "https://cineverselk.space/",
  "Accept": "application/json, text/plain, */*",
  "Cookie": "cv_auth=true;"
};

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 🍁";
const DEFAULT_POSTER = "https://i.ibb.co/3m1bXvt/cineverse.jpg";
const DEFAULT_SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

// Sessions & Locks
const pendingCvSearch = {};
const pendingCvSeries = {};
const actionLocks = {};

function makeSessionKey(sender, from) {
  const cleanSender = String(sender || "").split(":")[0];
  return `${from}::${cleanSender}`;
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
    const idx = normal.indexOf(char);
    return idx !== -1 ? small[idx] : char;
  }).join("");
}

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

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation, m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId, m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text, m?.message?.templateButtonReplyMessage?.selectedId,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId, mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text, mek?.message?.templateButtonReplyMessage?.selectedId,
  ];
  for (const item of direct) if (item) texts.push(String(item).trim());
  return [...new Set(texts.filter(Boolean))];
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
    contextInfo: channelContextInfo()
  }, { quoted: mek });
}

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
        text: `╭─[ 🎬 *𝗖𝗜𝗡𝗘𝗩𝗘𝗥𝗦𝗘 𝗗𝗟* ]\n│\n├ 📌 *Usage:* \`.cv <name>\`\n├ 💡 *Example:* \`.cv sonic\`\n╰──────────────⮞`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const cb = Date.now();
    const [mRes, sRes] = await Promise.all([
      axios.get(`https://cineverselk.space/movies.json?v=${cb}`, { headers: DL_HEADERS }).catch(() => null),
      axios.get(`https://cineverselk.space/series.json?v=${cb}`, { headers: DL_HEADERS }).catch(() => null)
    ]);

    const movies = mRes?.data?.data ? mRes.data.data : (Array.isArray(mRes?.data) ? mRes.data : []);
    const series = sRes?.data?.data ? sRes.data.data : (Array.isArray(sRes?.data) ? sRes.data : []);
    const allData = [...movies, ...series];

    const queryWords = q.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
    const results = allData.filter(item => {
      if (!item.title) return false;
      const titleClean = item.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      return queryWords.every(word => titleClean.includes(word));
    }).slice(0, 10);

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}".`);
    }

    const key = makeSessionKey(sender, from);
    delete pendingCvSeries[key];
    pendingCvSearch[key] = {
      results: results,
      timestamp: Date.now()
    };

    let text = `╭─[ 🎬 *𝗖𝗩 𝗦𝗘𝗔𝗥𝗖𝗛 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n`;
    text += `├ 🎯 *Search :* ${q}\n`;
    text += `├ 🍿 *Results :* ${results.length}\n│\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? `(${item.year})` : "";
      text += `├ *[ ${numStr} ]* ➔ *${item.title}* ${year}\n`;
      text += `│   ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += `│   ╰ 💽 ${item.quality || "HD"}\n│\n`;
    });
    text += `╰─[ 👇 *Reply with a Number* ]`;

    let poster = results[0].posterImage || results[0].image || results[0].poster || DEFAULT_POSTER;
    const posterMsg = await sock.sendMessage(from, { 
      image: { url: poster }, 
      caption: `> 🎬 *${results[0].title}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cineverse_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    await sock.sendMessage(from, { 
      image: { url: searchImg }, 
      caption: text,
      contextInfo: channelContextInfo()
    }, { quoted: posterMsg });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("CineVerse Search Error:", e);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makeSessionKey(sender, from);
    return !!(pendingCvSearch[key] || pendingCvSeries[key]);
  },
  
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = makeSessionKey(sender, from);
    const texts = extractTexts(body, mek, m);
    const input = (texts[0] || "").trim();

    if (!input) return;

    if (actionLocks[key]) return;
    actionLocks[key] = true;
    setTimeout(() => { delete actionLocks[key]; }, 5000);

    // MOVIE SELECTION
    if (pendingCvSearch[key] && /^\d+$/.test(input)) {
      const session = pendingCvSearch[key];
      delete pendingCvSearch[key];

      const choice = parseInt(input, 10);
      if (choice < 1 || choice > session.results.length) {
        return await sendErrorMsg(sock, from, mek, `Invalid number. Choose 1-${session.results.length}.`);
      }

      const selected = session.results[choice - 1];

      if (!selected.isSeries) {
        const dlUrl = selected.directLink || selected.downloadLink || selected.link;
        if (!dlUrl || dlUrl === '#') {
          return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
        }
        await sendMovieDocument(sock, mek, from, dlUrl, selected);
      } else {
        pendingCvSeries[key] = { series: selected, timestamp: Date.now() };

        let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
        let sText = `╭─[ 📺 *𝗦𝗘𝗥𝗜𝗘𝗦 𝗦𝗘𝗟𝗘𝗖𝗧𝗘𝗗* ]\n│\n`;
        sText += `├ 🎬 *Series:* ${toSmallCaps(selected.title)}\n`;
        sText += `├ 🗂️ *Seasons:* ${availableSeasons || "N/A"}\n│\n`;
        sText += `╰─[ 👇 *Reply: Season & Episode* ]\n\n`;
        sText += `> 💡 *Example:* \`1 2\` (Season 1, Ep 2)`;

        let poster = selected.posterImage || selected.image || selected.poster;
        if (poster) {
          await sock.sendMessage(from, { image: { url: poster }, caption: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        } else {
          await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        }
      }
    }
    
    // EPISODE SELECTION
    else if (pendingCvSeries[key] && /^\d+\s+\d+$/.test(input)) {
      const session = pendingCvSeries[key];
      delete pendingCvSeries[key];

      const parts = input.split(/\s+/);
      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);
      
      const series = session.series;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
        return await sendErrorMsg(sock, from, mek, `Link not found for S${s} E${e}.`);
      }

      const fS = s < 10 ? '0' + s : s;
      const fE = e < 10 ? '0' + e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;

      const dummyItem = {
        title: epTitle,
        quality: series.quality || "HD",
      };

      await sendMovieDocument(sock, mek, from, epData.d, dummyItem);
    }
    else {
      await sendErrorMsg(sock, from, mek, "Invalid input. Reply with a number.");
    }
  }
});

// 🔥 Direct Streaming Fix for Cineverse headers (403 bypass)
async function sendMovieDocument(sock, mek, from, url, item) {
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    const cleanTitle = (item.title || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `╭─[ ✅ *𝗠𝗢𝗩𝗜𝗘 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗* ]\n│\n`;
    captionText += `├ 🎬 *Title :* ${toSmallCaps(item.title)}\n`;
    captionText += `├ 💽 *Quality :* ${item.quality || "HD"}\n`;
    if (item.imdbRating) captionText += `├ ⭐ *IMDb :* ${item.imdbRating}\n`;
    captionText += `│\n╰──────────────⮞\n\n`;
    captionText += `> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

    // 🚀 Stream URL with proper Cineverse authentication headers
    const res = await axios({
      url: url,
      method: 'GET',
      responseType: 'stream',
      headers: DL_HEADERS,
      timeout: 0
    });

    await sock.sendMessage(from, {
      document: { stream: res.data }, // Streaming prevents RAM crashes
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("Cineverse Send Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to send video. Source link might be broken or expired.`);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCvSearch) {
    if (now - pendingCvSearch[k].timestamp > 10 * 60 * 1000) delete pendingCvSearch[k];
  }
  for (const k in pendingCvSeries) {
    if (now - pendingCvSeries[k].timestamp > 10 * 60 * 1000) delete pendingCvSeries[k];
  }
}, 5 * 60 * 1000);
