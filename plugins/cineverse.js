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
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_POSTER = "https://i.ibb.co/3m1bXvt/cineverse.jpg";
const DEFAULT_SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingCvSearch = {};
const lastProcessedMsg = {};

// 🔥 100% Bulletproof Key Generator using senderNumber 🔥
function makePendingKey(senderNumber, from) {
  return `${from || ""}::${senderNumber || ""}`;
}

// 🔥 Video.js Style Text Extractor 🔥
function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text
  ];
  for (const item of direct) {
    if (item && typeof item === "string") texts.push(item.trim());
  }
  return [...new Set(texts.filter(Boolean))];
}

function clearUserSession(k) {
  delete pendingCvSearch[k];
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

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo()
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

// ── Search Command ─────────────
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, senderNumber, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchCineverse(q.trim());
    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}" on CineVerse LK.`);
    }

    const k = makePendingKey(senderNumber, from);
    clearUserSession(k);

    pendingCvSearch[k] = {
      results,
      step: 1,
      timestamp: Date.now(),
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
    const posterMsg = await sock.sendMessage(from, { 
      image: { url: poster }, 
      caption: `> 🎬 *${results[0].title}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`,
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
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

// ── Number Reply Handler ─────────────
replyHandlers.push({
  filter: (body, { senderNumber, from }) => !!pendingCvSearch[makePendingKey(senderNumber, from)],
  function: async (sock, mek, m, { body, senderNumber, from }) => {
    const k = makePendingKey(senderNumber, from);
    const pending = pendingCvSearch[k];
    if (!pending || pending.isProcessing) return;

    let input = String(body || "").trim();
    if (!input) {
        const texts = extractTexts(body, mek, m);
        if (pending.step === 1) input = texts.find(t => /^\d+$/.test(t)) || "";
        if (pending.step === 2) input = texts.find(t => /^\d+\s+\d+$/.test(t)) || "";
    }

    if (!input) return;

    const isSingleNum = /^\d+$/.test(input);
    const isSeriesFormat = /^\d+\s+\d+$/.test(input);

    if (pending.step === 1 && !isSingleNum) return;
    if (pending.step === 2 && !isSeriesFormat) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: input, time: now };

    const parts = input.split(/\s+/);
    const choice = parseInt(parts[0], 10);

    if (pending.step === 1) {
      if (choice < 1 || choice > pending.results.length) return;

      const selected = pending.results[choice - 1];

      if (!selected.isSeries) {
        pending.isProcessing = true;
        const dlUrl = selected.directLink;
        clearUserSession(k);

        if (!dlUrl || dlUrl === '#') {
          return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
        }
        await sendMovieDocument(sock, mek, from, dlUrl, selected);
      } else {
        pending.step = 2;
        pending.selectedSeries = selected;
        pending.timestamp = Date.now();

        let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
        
        let sText = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
        sText += `📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n`;
        sText += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
        sText += `🎬 *Series:* ${toSmallCaps(selected.title)}\n`;
        sText += `🗂️ *Seasons:* ${availableSeasons || "N/A"}\n\n`;
        sText += `> 👇 *Reply with Season & Episode:*\n`;
        sText += `> 💡 *Example:* \`1 2\` (Season 1, Ep 2)\n\n`;
        sText += `⊱━━• ✿ •━━━━━• ✿ •━━⊰`;

        let poster = selected.posterImage || selected.image || selected.poster;
        if (poster) {
          await sock.sendMessage(from, { image: { url: poster }, caption: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        } else {
          await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        }
      }
    } 
    else if (pending.step === 2) {
      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);
      
      pending.isProcessing = true;
      const series = pending.selectedSeries;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      clearUserSession(k);

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
  }
});

async function sendMovieDocument(sock, mek, from, url, item) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (item.title || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    captionText += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    captionText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    captionText += `🎬 *Movie :* ${toSmallCaps(item.title)}\n`;
    captionText += `📊 *Quality :* ${item.quality || "HD"}\n`;
    if (item.imdbRating) captionText += `⭐ *IMDb :* ${item.imdbRating}\n`;
    captionText += `\n🌟 *Direct Link :* ${url}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    await sock.sendMessage(from, {
      document: { url: url },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("Cineverse Send Error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to send video stream: ${err.message}`);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCvSearch) {
    if (now - pendingCvSearch[k].timestamp > SESSION_TIMEOUT) delete pendingCvSearch[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);
