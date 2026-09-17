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

// 🔥 Global session stores
const pendingCvSearch = {};
const pendingCvSeries = {};

console.log("[CV] ✅ cineverse module loaded —", new Date().toISOString());

// ═══════════════════════════════════════════════════════
// SESSION KEY — Multiple patterns for robustness
// ═══════════════════════════════════════════════════════
function makeKey(sender, from) {
  return `${String(from || "")}::${String(sender || "").split(":")[0]}`;
}

function storeSession(sender, from, type, data) {
  const key = makeKey(sender, from);
  const payload = { ...data, timestamp: Date.now() };
  if (type === "search") pendingCvSearch[key] = payload;
  else if (type === "series") pendingCvSeries[key] = payload;
  console.log(`[CV] 💾 Stored ${type} session: key="${key}"`);
  return key;
}

function findSession(sender, from) {
  const exactKey = makeKey(sender, from);

  // 1. Try exact key
  if (pendingCvSearch[exactKey]) return { key: exactKey, type: "search", data: pendingCvSearch[exactKey] };
  if (pendingCvSeries[exactKey]) return { key: exactKey, type: "series", data: pendingCvSeries[exactKey] };

  // 2. Fallback — match by `from` only
  const fromPrefix = String(from || "") + "::";
  for (const k in pendingCvSearch) {
    if (k.startsWith(fromPrefix)) return { key: k, type: "search", data: pendingCvSearch[k] };
  }
  for (const k in pendingCvSeries) {
    if (k.startsWith(fromPrefix)) return { key: k, type: "series", data: pendingCvSeries[k] };
  }

  return null;
}

function deleteSession(found) {
  if (!found) return;
  if (found.type === "search") delete pendingCvSearch[found.key];
  else if (found.type === "series") delete pendingCvSeries[found.key];
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
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

// 🔥 Parse ANY number format
function parseInput(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // S01E02 format first
  const seMatch = t.match(/^s(\d{1,3})[\s._\-xX]*e(\d{1,3})$/i);
  if (seMatch) return { type: "double", values: [+seMatch[1], +seMatch[2]] };

  // Two numbers: "1 2", "1.2", "1x2", "1-2", "1_2"
  const twoMatch = t.match(/^(\d{1,3})[\s.\-_xX]+(\d{1,3})$/);
  if (twoMatch) return { type: "double", values: [+twoMatch[1], +twoMatch[2]] };

  // Single number
  if (/^\d{1,3}$/.test(t)) return { type: "single", values: [+t] };

  return null;
}

// 🔥 Collect ALL possible texts
function collectTexts(body, mek, m) {
  const list = [
    body,
    m?.body, m?.text,
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
  const out = [];
  for (const x of list) {
    if (x == null) continue;
    const s = String(x).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function findNumberInput(texts) {
  for (const t of texts) {
    const p = parseInput(t);
    if (p) return { text: t, parsed: p };
  }
  return null;
}

async function sendErrorMsg(sock, from, mek, text) {
  try {
    await sock.sendMessage(from, {
      text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
      contextInfo: channelContextInfo()
    }, { quoted: mek });
  } catch (e) { console.error("[CV] sendErrorMsg error:", e); }
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
    console.log(`[CV CMD] sender=${sender} from=${from} q=${q}`);

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

    // Store session
    storeSession(sender, from, "search", { results });

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
    console.error("[CV CMD ERROR]", e);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

// ═══════════════════════════════════════════════════════
// 2. Reply Handler
// ═══════════════════════════════════════════════════════
replyHandlers.push({
  filter: (body, ctx) => {
    try {
      console.log("━━━ [CV FILTER] ━━━");
      console.log("  body      =", JSON.stringify(body));
      console.log("  sender    =", ctx?.sender);
      console.log("  from      =", ctx?.from);
      console.log("  searchKeys=", Object.keys(pendingCvSearch));
      console.log("  seriesKeys=", Object.keys(pendingCvSeries));

      const found = findSession(ctx?.sender, ctx?.from);
      console.log("  found     =", !!found);
      if (found) console.log("  foundType =", found.type);

      return !!found;
    } catch (e) {
      console.error("[CV FILTER ERROR]", e);
      return false;
    }
  },

  function: async (sock, mek, m, ctx) => {
    try {
      const { body, sender, from } = ctx;
      console.log("━━━ [CV FUNCTION] ━━━");

      const found = findSession(sender, from);
      if (!found) {
        console.log("  ❌ session not found");
        return;
      }

      const texts = collectTexts(body, mek, m);
      console.log("  texts =", JSON.stringify(texts));

      const numInput = findNumberInput(texts);
      console.log("  numInput =", JSON.stringify(numInput));

      if (!numInput) {
        console.log("  ⏭️ no number found → silent return");
        return;
      }

      try { await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } }); } catch {}

      const { type, values } = numInput.parsed;

      // ── SEARCH session ──
      if (found.type === "search") {
        const data = found.data;
        deleteSession(found);

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
        console.log("  ✅ selected:", selected.title);

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
        storeSession(sender, from, "series", { series: selected });

        const avail = Object.keys(selected.episodesData || {}).join(", ");
        let sText = `╭─[ 📺 *𝗦𝗘𝗥𝗜𝗘𝗦 𝗦𝗘𝗟𝗘𝗖𝗧𝗘𝗗* ]\n│\n`;
        sText += `├ 🎬 *Series:* ${toSmallCaps(selected.title)}\n`;
        sText += `├ 🗂️ *Seasons:* ${avail || "N/A"}\n│\n`;
        sText += `╰─[ 👇 *Reply: Season & Episode* ]\n\n`;
        sText += `> 💡 *Examples:* \`1 2\`, \`1.2\`, \`S1E2\``;

        const poster = selected.posterImage || selected.image || selected.poster;
        if (poster) {
          await sock.sendMessage(from, { image: { url: poster }, caption: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        } else {
          await sock.sendMessage(from, { text: sText, contextInfo: channelContextInfo() }, { quoted: mek });
        }
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
        return;
      }

      // ── SERIES session ──
      if (found.type === "series") {
        const data = found.data;
        deleteSession(found);

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
    } catch (e) {
      console.error("[CV FUNCTION ERROR]", e);
    }
  }
});

// ═══════════════════════════════════════════════════════
// Send Document
// ═══════════════════════════════════════════════════════
async function sendMovieDocument(sock, mek, from, url, item) {
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });
    console.log("[CV] Downloading:", item.title);

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
    console.log("[CV] ✅ Sent:", item.title);

  } catch (err) {
    console.error("[CV] Send Error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed: ${err.message}`);
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
