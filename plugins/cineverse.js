const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const { getCustomImage } = require("../lib/botSettings");

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

const pendingCvSearch = {};
const pendingCvSeries = {};

// 🔥 MULTIPLE KEY PATTERNS — same user හඳුනගන්න 🔥
function buildKeys(sender, from) {
  const raw = String(sender || "");
  const clean = raw.split(":")[0].split("@")[0];
  const fromStr = String(from || "");
  return [
    `${fromStr}::${clean}`,
    `${fromStr}::${raw}`,
    clean,
    raw,
    fromStr,
  ].filter(Boolean);
}

function findSession(sender, from) {
  const keys = buildKeys(sender, from);
  for (const k of keys) {
    if (pendingCvSearch[k]) return { key: k, type: "search", data: pendingCvSearch[k] };
  }
  for (const k of keys) {
    if (pendingCvSeries[k]) return { key: k, type: "series", data: pendingCvSeries[k] };
  }
  return null;
}

function storeSession(sender, from, type, data) {
  const key = buildKeys(sender, from)[0];
  if (type === "search") pendingCvSearch[key] = data;
  else if (type === "series") pendingCvSeries[key] = data;
  return key;
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((c) => {
    const i = normal.indexOf(c);
    return i !== -1 ? small[i] : c;
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

// 🔥 NUMBER PARSER — හැම format එකක්ම handle කරනවා 🔥
function parseInput(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // Single number: "1", "01", "12"
  if (/^\d{1,3}$/.test(t)) {
    return { type: "single", values: [parseInt(t, 10)] };
  }

  // Two numbers separated by space/dot/x/dash/underscore: "1 2", "1.2", "1x2", "1-2"
  const twoMatch = t.match(/^(\d{1,3})[\s.\-_xX]+(\d{1,3})$/);
  if (twoMatch) {
    return { type: "double", values: [parseInt(twoMatch[1], 10), parseInt(twoMatch[2], 10)] };
  }

  // S01E02 format
  const seMatch = t.match(/^s(\d{1,3})[\s._\-xX]*e(\d{1,3})$/i);
  if (seMatch) {
    return { type: "double", values: [parseInt(seMatch[1], 10), parseInt(seMatch[2], 10)] };
  }

  return null;
}

// 🔥 COLLECT ALL POSSIBLE TEXTS 🔥
function collectTexts(body, mek, m) {
  const list = [
    body,
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text,
  ];
  return [...new Set(list.filter(Boolean).map(x => String(x).trim()))];
}

// 🔥 FIND THE NUMBER IN ANY TEXT 🔥
function findNumberInput(texts) {
  for (const t of texts) {
    const parsed = parseInput(t);
    if (parsed) return { text: t, parsed };
  }
  return null;
}

async function sendErrorMsg(sock, from, mek, text) {
  try {
    await sock.sendMessage(from, {
      text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
      contextInfo: channelContextInfo()
    }, { quoted: mek });
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
// 1. Search Command
// ═══════════════════════════════════════════════════════
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

    // ✅ Store session with MULTIPLE keys
    const primaryKey = buildKeys(sender, from)[0];
    Object.keys(pendingCvSeries).forEach(k => { if (k.startsWith(from + "::")) {} }); // no-op
    pendingCvSearch[primaryKey] = { results, timestamp: Date.now() };

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

// ═══════════════════════════════════════════════════════
// 2. Reply Handler — Numbers + Multi-format
// ═══════════════════════════════════════════════════════
replyHandlers.push({
  // ✅ Filter: session තියෙනවා නම් trigger වෙනවා
  filter: (_body, { sender, from }) => !!findSession(sender, from),

  function: async (sock, mek, m, { body, sender, from }) => {
    const session = findSession(sender, from);
    if (!session) return;

    // 🔥 Collect ALL texts & find the number one
    const texts = collectTexts(body, mek, m);
    const numInput = findNumberInput(texts);
    if (!numInput) return; // Number නෑ → silent ignore

    console.log(`[CV] user=${sender} from=${from} input=${numInput.text} parsed=${JSON.stringify(numInput.parsed)} type=${session.type}`);

    // React to let user know it's working
    try { await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } }); } catch {}

    const { type, values } = numInput.parsed;

    // ─────────────────────────────────────────────
    // SEARCH SESSION (single number)
    // ─────────────────────────────────────────────
    if (session.type === "search") {
      const data = session.data;
      delete pendingCvSearch[session.key];

      if (type !== "single") {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return sendErrorMsg(sock, from, mek, "Reply with a single number (1, 2, 3...).");
      }

      const choice = values[0];
      if (choice < 1 || choice > data.results.length) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return sendErrorMsg(sock, from, mek, `Invalid number. Choose 1-${data.results.length}.`);
      }

      const selected = data.results[choice - 1];

      // 🎥 MOVIE
      if (!selected.isSeries) {
        const dlUrl = selected.directLink;
        if (!dlUrl || dlUrl === '#') {
          await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
          return sendErrorMsg(sock, from, mek, "Direct download link is not available.");
        }
        return sendMovieDocument(sock, mek, from, dlUrl, selected);
      }

      // 📺 SERIES
      const seriesKey = buildKeys(sender, from)[0];
      pendingCvSeries[seriesKey] = { series: selected, timestamp: Date.now() };

      const avail = Object.keys(selected.episodesData || {}).join(", ");
      let sText = `╭─[ 📺 *𝗦𝗘𝗥𝗜𝗘𝗦 𝗦𝗘𝗟𝗘𝗖𝗧𝗘𝗗* ]\n│\n`;
      sText += `├ 🎬 *Series:* ${toSmallCaps(selected.title)}\n`;
      sText += `├ 🗂️ *Seasons:* ${avail || "N/A"}\n│\n`;
      sText += `╰─[ 👇 *Reply: Season & Episode* ]\n\n`;
      sText += `> 💡 *Examples:*\n`;
      sText += `> \`1 2\`  →  S01E02\n`;
      sText += `> \`1.2\`  →  S01E02\n`;
      sText += `> \`S1E2\` →  S01E02`;

      const poster = selected.posterImage || selected.image || selected.poster;
      if (poster) {
        await sock.sendMessage(from, { image: { url: poster }, caption: sText, contextInfo: channelContextInfo() }, { quoted: mek });
      } else {
        await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
      }
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      return;
    }

    // ─────────────────────────────────────────────
    // SERIES SESSION (two numbers)
    // ─────────────────────────────────────────────
    if (session.type === "series") {
      const data = session.data;
      delete pendingCvSeries[session.key];

      if (type !== "double") {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return sendErrorMsg(sock, from, mek, "Reply with Season & Episode (e.g., 1 2 or S1E2).");
      }

      const [s, e] = values;
      const epData = data.series.episodesData?.[s]?.[e];

      if (!epData || !epData.d || epData.d === '#') {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return sendErrorMsg(sock, from, mek, `Link not found for S${s} E${e}.`);
      }

      const fS = String(s).padStart(2, "0");
      const fE = String(e).padStart(2, "0");

      return sendMovieDocument(sock, mek, from, epData.d, {
        title: `${data.series.title} S${fS}E${fE}`,
        quality: data.series.quality || "HD",
      });
    }
  }
});

// ═══════════════════════════════════════════════════════
// Send Document
// ═══════════════════════════════════════════════════════
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
    await sendErrorMsg(sock, from, mek, `Failed to send video: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════
setInterval(() => {
  const now = Date.now();
  for (const k in pendingCvSearch) {
    if (now - pendingCvSearch[k].timestamp > 10 * 60 * 1000) delete pendingCvSearch[k];
  }
  for (const k in pendingCvSeries) {
    if (now - pendingCvSeries[k].timestamp > 10 * 60 * 1000) delete pendingCvSeries[k];
  }
}, 5 * 60 * 1000);
