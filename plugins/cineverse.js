const { cmd } = require("../command");
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

const pendingCvSearch = {};
const pendingCvSeries = {};

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

// 1. Search Command
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, reply, sessionId }) => {
  if (!q) {
    return reply(`⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``);
  }

  await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

  const results = await searchCineverse(q.trim());
  if (results.length === 0) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    return reply(`⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _No results found for "${q}"_`);
  }

  pendingCvSearch[sender] = { results, timestamp: Date.now() };

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
});

// 2. Movie/Series Selection Listener
cmd({
  filter: (text, { sender }) => pendingCvSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingCvSearch[sender].results.length
}, async (sock, mek, m, { body, sender, reply, from }) => {
  const index = parseInt(body.trim()) - 1;
  const selected = pendingCvSearch[sender].results[index];
  delete pendingCvSearch[sender];

  if (!selected.isSeries) {
    const dlUrl = selected.directLink;
    if (!dlUrl || dlUrl === '#') {
      return reply(`❌ _Direct download link is not available for this movie._`);
    }

    try {
      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });
      const cleanTitle = (selected.title || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

      let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      captionText += `🎬 *Movie :* ${toSmallCaps(selected.title)}\n`;
      captionText += `📊 *Quality :* ${selected.quality || "HD"}\n`;
      if (selected.imdbRating) captionText += `⭐ *IMDb :* ${selected.imdbRating}\n`;
      captionText += `\n🌟 *Direct Link :* ${dlUrl}\n\n`;
      captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      await sock.sendMessage(from, {
        document: { url: dlUrl },
        mimetype: "video/mp4",
        fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
        caption: captionText,
        contextInfo: channelContextInfo()
      }, { quoted: mek });

      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
    } catch (e) {
      reply(`❌ _Failed to send video stream._`);
    }

  } else {
    pendingCvSeries[sender] = { series: selected, timestamp: Date.now() };

    let availableSeasons = Object.keys(selected.episodesData || {}).join(", ");
    let sText = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
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
});

// 3. Series Episode Selection Listener
cmd({
  filter: (text, { sender }) => {
    if (!pendingCvSeries[sender]) return false;
    const parts = String(text || "").trim().split(/\s+/);
    return parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]);
  }
}, async (sock, mek, m, { body, sender, reply, from }) => {
  const parts = body.trim().split(/\s+/);
  const s = parseInt(parts[0], 10);
  const e = parseInt(parts[1], 10);
  
  const { series } = pendingCvSeries[sender];
  delete pendingCvSeries[sender];

  const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

  if (!epData || !epData.d || epData.d === '#') {
    return reply(`❌ _Link not found for S${s} E${e}._`);
  }

  const fS = s < 10 ? '0' + s : s;
  const fE = e < 10 ? '0' + e : e;
  const epTitle = `${series.title} S${fS}E${fE}`;
  
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });
    const cleanTitle = epTitle.replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐄𝐏𝐈𝐒𝐎𝐃𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    captionText += `🎬 *Episode :* ${toSmallCaps(epTitle)}\n`;
    captionText += `📊 *Quality :* ${series.quality || "HD"}\n`;
    captionText += `\n🌟 *Direct Link :* ${epData.d}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    await sock.sendMessage(from, {
      document: { url: epData.d },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (err) {
    reply(`❌ _Failed to send video stream._`);
  }
});

// Auto Cleanup
setInterval(() => {
  const now = Date.now();
  for (const s in pendingCvSearch) if (now - pendingCvSearch[s].timestamp > 10 * 60 * 1000) delete pendingCvSearch[s];
  for (const s in pendingCvSeries) if (now - pendingCvSeries[s].timestamp > 10 * 60 * 1000) delete pendingCvSeries[s];
}, 5 * 60 * 1000);
