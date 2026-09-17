const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const { getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

const API_BASE = "https://api.chamindu.site";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingMovieBox = {};
const lastProcessedMsg = {};

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingMovieBox[k];
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

async function getThumbnailBuffer(url) {
  try {
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ── 1. Search Command ──────────────────────────────────────────
cmd({
  pattern: "moviebox",
  alias: ["mb", "mbsearch"],
  desc: "Direct streaming and subtitle movie downloads",
  category: "download",
  react: "🎥",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐌𝐎𝐕𝐈𝐄𝐁𝐎𝐗 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.mb <name>\`\n💡 *Example:*\n• \`.mb avatar\`\n• \`.mb game of thrones\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const res = await axios.get(`${API_BASE}/api/v1/movie/moviebox/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`);
    const results = res.data.data || res.data.results || [];

    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}".`);
    }

    const topResults = results.slice(0, 15);
    const k = makePendingKey(sender, from);
    clearUserSession(k);

    pendingMovieBox[k] = {
      step: 1,
      results: topResults,
      timestamp: Date.now(),
      isProcessing: false,
    };

    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    text += `🎬 *𝐌𝐎𝐕𝐈𝐄𝐁𝐎𝐗 𝐒𝐄𝐀𝐑𝐂𝐇*\n`;
    text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const typeIcon = (item.type === 'tvshows' || item.type === 'tv') ? '📺' : '🎥';
      text += `*[ ${numStr} ]* ➔ ${typeIcon} *${(item.title || 'Movie').substring(0, 35)}* (${item.year || 'N/A'})\n`;
    });

    text += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 👇 *Reply with a number to Download...*`;

    let searchImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "moviebox_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    await sock.sendMessage(from, { 
      image: { url: searchImg }, 
      caption: text, 
      contextInfo: channelContextInfo() 
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("MovieBox Search Error:", error.message);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to MovieBox server.");
  }
});

// ── 2. Reply Handler ───────────────────────────────────────────
const mbReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingMovieBox[k];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const input = String(body || "").trim();
    if (!input || !/^\d+$/.test(input)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingMovieBox[k];
    if (!pending || pending.isProcessing) return;

    // Loop & Spam Protection
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: input, time: now };

    const choice = parseInt(input, 10);

    // ══════════════════════════════════════════════════════════
    // STEP 1: SELECT MOVIE OR SERIES (From search results)
    // ══════════════════════════════════════════════════════════
    if (pending.step === 1) {
      if (choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const selectedItem = pending.results[choice - 1];
      const isTvShow = selectedItem.type === 'tvshows' || selectedItem.type === 'tv';

      try {
        const detailsRes = await axios.get(`${API_BASE}/api/v1/movie/moviebox/info?q=${encodeURIComponent(selectedItem.link || selectedItem.url)}&api_key=${API_KEY}`);
        const detailsData = detailsRes.data.data || {};
        const posterUrl = detailsData.image || selectedItem.image || DEFAULT_IMAGE;

        if (isTvShow) {
          // ─── 📺 TV SERIES SELECTED ───
          const episodes = detailsData.episodes || detailsData.downloads || [];

          if (episodes.length === 0) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "No episodes available for this series.");
          }

          let tvText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
          tvText += `📺 *𝐓𝐕 𝐒𝐄𝐑𝐈𝐄𝐒 𝐃𝐄𝐓𝐀𝐈𝐋𝐒*\n`;
          tvText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
          tvText += `🎬 *Series :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          tvText += `⭐ *IMDb :* ${detailsData.rating || detailsData.imdb || 'N/A'}\n`;
          tvText += `📅 *Year :* ${detailsData.year || 'N/A'}\n`;
          tvText += `🎞️ *Total Eps :* ${episodes.length}\n\n`;
          
          episodes.slice(0, 30).forEach((ep, idx) => {
            const numStr = String(idx + 1).padStart(2, "0");
            tvText += `*[ ${numStr} ]* ➔ 📺 *${ep.name || ep.title || 'Episode ' + (idx + 1)}*\n`;
          });

          tvText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 👇 *Reply with Episode number to Download...*`;

          await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: tvText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.step = "tv_episode";
          pending.episodes = episodes;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;

        } else {
          // ─── 🎥 MOVIE SELECTED ───
          const validDownloads = detailsData.downloads || [];

          if (validDownloads.length === 0) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "No direct downloads available for this movie.");
          }

          let movieText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
          movieText += `🎬 *𝐌𝐎𝐕𝐈𝐄 𝐃𝐄𝐓𝐀𝐈𝐋𝐒*\n`;
          movieText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
          movieText += `🎬 *Movie :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          movieText += `⭐ *IMDb :* ${detailsData.imdb || detailsData.rating || 'N/A'}\n`;
          movieText += `📅 *Year :* ${detailsData.year || 'N/A'}\n`;
          movieText += `⏳ *Duration :* ${detailsData.duration || 'N/A'}\n\n`;

          validDownloads.forEach((dl, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            movieText += `*[ ${numStr} ]* 📊 *${dl.quality || 'Direct'}* _(${dl.size || 'N/A'})_\n`;
          });

          movieText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 👇 *Reply with quality number to Download...*`;

          await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: movieText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.step = "movie_quality";
          pending.downloads = validDownloads;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;
        }

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (err) {
        console.error("MovieBox Fetch Details Error:", err);
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch media details from server.");
      }
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: MOVIE QUALITY CHOSEN
    // ══════════════════════════════════════════════════════════
    else if (pending.step === "movie_quality") {
      if (choice < 1 || choice > pending.downloads.length) return;

      pending.isProcessing = true;
      const selectedDl = pending.downloads[choice - 1];
      const dlUrl = selectedDl.link || selectedDl.download_link || selectedDl.direct_link;
      
      const title = pending.metadata.title || "Movie";
      const quality = selectedDl.quality || "HD";
      const poster = pending.metadata.image || DEFAULT_IMAGE;

      clearUserSession(k);
      await fastSendVideo(sock, mek, from, dlUrl, title, quality, poster);
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: TV EPISODE CHOSEN
    // ══════════════════════════════════════════════════════════
    else if (pending.step === "tv_episode") {
      if (choice < 1 || choice > pending.episodes.length) return;

      pending.isProcessing = true;
      const selectedEp = pending.episodes[choice - 1];
      const dlUrl = selectedEp.download_link || selectedEp.link || selectedEp.url;
      
      const title = `${pending.metadata.title} - ${selectedEp.name || selectedEp.title || 'EP ' + choice}`;
      const poster = pending.metadata.image || DEFAULT_IMAGE;

      clearUserSession(k);
      await fastSendVideo(sock, mek, from, dlUrl, title, "HD", poster);
    }
  }
};

// ── Direct Fast Document Upload & Thumbnail (MALIYA-MD Style) ──
async function fastSendVideo(sock, mek, from, url, rawTitle, quality, posterUrl) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (rawTitle || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    captionText += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    captionText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    captionText += `🎬 *Title :* ${toSmallCaps(rawTitle)}\n`;
    captionText += `📊 *Quality :* ${quality}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    // Fetch poster buffer for Thumbnail preview
    const thumbBuffer = await getThumbnailBuffer(posterUrl);

    const docPayload = {
      document: { url: url },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle}.mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    };

    // Attach ZANTA-MD style thumbnail if available
    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("MovieBox Fast Upload Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to upload video directly. Server might be restricting access.`);
  }
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(mbReplyHandler);
}

// Session Cleaner
setInterval(() => {
  const now = Date.now();
  for (const k in pendingMovieBox) {
    if (now - pendingMovieBox[k].timestamp > SESSION_TIMEOUT) {
      delete pendingMovieBox[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);
