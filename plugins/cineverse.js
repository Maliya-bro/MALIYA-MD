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

const pendingCineVerse = {};
const lastProcessedMsg = {};

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingCineVerse[k];
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
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ── 1. Search Command ──────────────────────────────────────────
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series from Cineverse",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``,
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

    const k = makePendingKey(sender, from);
    clearUserSession(k);

    pendingCineVerse[k] = {
      results: results,
      timestamp: Date.now(),
      isProcessing: false,
    };

    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    text += `🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐒𝐄𝐀𝐑𝐂𝐇*\n`;
    text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? ` (${item.year})` : "";
      text += `*[ ${numStr} ]* ➔ *${item.title}*${year}\n`;
      text += `   ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += `   ╰ 💽 ${item.quality || "1080p FHD"}\n\n`;
    });

    text += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 👇 *Reply with a number to Download...*`;

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
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("CineVerse Search Error:", e);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

// ── 2. Reply Handler (Instant Details + Direct Download) ─────────
const cvReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingCineVerse[k];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const input = String(body || "").trim();
    if (!input) return;

    const k = makePendingKey(sender, from);
    const pending = pendingCineVerse[k];
    if (!pending || pending.isProcessing) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: input, time: now };

    // ══════════════════════════════════════════════════════════
    // 🎥 MOVIE / SERIES SELECTION
    // ══════════════════════════════════════════════════════════
    if (/^\d+$/.test(input) && pending.results) {
      const choice = parseInt(input, 10);
      if (choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      const selected = pending.results[choice - 1];

      // ─── 🎥 MOVIE DIRECT DOWNLOAD ───
      if (!selected.isSeries) {
        clearUserSession(k);
        await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

        const dlUrl = selected.directLink || selected.downloadLink || selected.link;
        if (!dlUrl || dlUrl === '#') {
          return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
        }

        let detailsMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        detailsMsg += `🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃*\n`;
        detailsMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        detailsMsg += `🎬 *Movie :* ${toSmallCaps(selected.title)}\n`;
        if (selected.imdbRating) detailsMsg += `⭐ *IMDb :* ${selected.imdbRating}\n`;
        if (selected.duration) detailsMsg += `⏳ *Duration :* ${selected.duration}\n`;
        if (selected.year) detailsMsg += `📅 *Year :* ${selected.year}\n`;
        detailsMsg += `💽 *Quality :* ${selected.quality || "1080p FHD"}\n\n`;
        detailsMsg += `⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> ⬇️ *Downloading & Uploading Movie File...*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

        const poster = selected.posterImage || selected.image || selected.poster || DEFAULT_POSTER;

        await sock.sendMessage(from, { 
          image: { url: poster }, 
          caption: detailsMsg, 
          contextInfo: channelContextInfo() 
        }, { quoted: mek });

        // Fast Direct Upload
        await fastSendVideo(sock, mek, from, dlUrl, selected.title, selected.quality || "1080p FHD");

      } else {
        // ─── 📺 TV SERIES HANDLING ───
        pending.isProcessing = false;
        pending.series = selected;
        delete pending.results; 

        let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
        let sText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        sText += `📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n`;
        sText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        sText += `🎬 *Series :* ${toSmallCaps(selected.title)}\n`;
        sText += `🗂️ *Seasons :* ${availableSeasons || "N/A"}\n\n`;
        sText += `⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 👇 *Reply: Season & Episode*\n\n`;
        sText += `> 💡 *Example:* \`1 2\` (Season 1, Episode 2)`;

        const poster = selected.posterImage || selected.image || selected.poster || DEFAULT_POSTER;

        await sock.sendMessage(from, { 
          image: { url: poster }, 
          caption: sText, 
          contextInfo: channelContextInfo() 
        }, { quoted: mek });

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      }
    }

    // ══════════════════════════════════════════════════════════
    // SERIES EPISODE CHOSEN ("1 2")
    // ══════════════════════════════════════════════════════════
    else if (pending.series && /^\d+\s+\d+$/.test(input)) {
      const parts = input.split(/\s+/);
      const s = parseInt(parts[0], 10);
      const e = parseInt(parts[1], 10);

      const series = pending.series;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, `Download link not found for Season ${s}, Episode ${e}.`);
      }

      clearUserSession(k);
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const fS = s < 10 ? '0' + s : s;
      const fE = e < 10 ? '0' + e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;

      // Fast Direct Upload
      await fastSendVideo(sock, mek, from, epData.d, epTitle, series.quality || "1080p FHD");
    }
  }
};

// ── Direct Link Upload (100% Cinesubz Speed Method) ────────────
async function fastSendVideo(sock, mek, from, url, rawTitle, quality) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (rawTitle || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    captionText += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    captionText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    captionText += `🎬 *Movie :* ${toSmallCaps(rawTitle)}\n`;
    captionText += `📊 *Quality :* ${quality}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    // 🔥 This is exactly what Cinesubz uses. Bypass local buffering. 
    // It passes the URL directly to Baileys' internal uploader.
    await sock.sendMessage(from, {
      document: { url: url },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("Cineverse Fast Upload Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to upload video directly. Link might be restricted.`);
  }
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(cvReplyHandler);
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineVerse) {
    if (now - pendingCineVerse[k].timestamp > SESSION_TIMEOUT) delete pendingCineVerse[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);
