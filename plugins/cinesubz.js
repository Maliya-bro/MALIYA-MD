const { cmd } = require("../command");
const axios = require("axios");

const pendingSearch = {};
const pendingQuality = {};

const API_BASE = "https://api.chamindu.site";

// API Keys
const API_KEYS = [
  "chama_api_430e2c6fba9381049992c8b23378d092",
  "chama_api_b1f489dd1a70d495e36b866f1d357d31",
  "chama_api_e6c8ddab785ade7c84793d6014a72356",
  "chama_api_70cc983cf9e9e3ad0ff254df6b9c134d"
];

let currentKeyIndex = 0;

// 100% Universal Small Caps Font Converter
function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

// Round-Robin API Key Rotation
function getNextApiKey() {
  const apiKey = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return apiKey;
}

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// 1. Search Command
cmd({
  pattern: "cinesubz",
  alias: ["cinesub", "cs", "cssearch", "film", "movie"],
  react: "🎬",
  desc: "Search and send movies from Cinesubz.co",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply(`🎬 *ᴄɪɴᴇsᴜʙᴢ ᴍᴏᴠɪᴇ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*

📌 *ᴜsᴀɢᴇ:* \`.cinesubz <movie_name>\`
💡 *ᴇxᴀᴍᴘʟᴇ:* \`.cinesubz avengers\``);
  }

  await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });
  await reply(`🔍 *sᴇᴀʀᴄʜɪɴɢ ᴄɪɴᴇsᴜʙᴢ ғᴏʀ ᴍᴏᴠɪᴇs...*

⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*`);

  try {
    const apiKey = getNextApiKey();
    const searchUrl = `${API_BASE}/api/v1/movie/cinesubz/search?q=${encodeURIComponent(q.trim())}&api_key=${apiKey}`;
    const res = await axios.get(searchUrl, { headers, timeout: 60000 });

    if (!res.data || !res.data.status || !res.data.data || res.data.data.length === 0) {
      return reply(`❌ *ɴᴏ ᴍᴏᴠɪᴇs ғᴏᴜɴᴅ ᴏɴ ᴄɪɴᴇsᴜʙᴢ!*`);
    }

    const results = res.data.data.slice(0, 10);
    pendingSearch[sender] = { results, apiKey, timestamp: Date.now() };

    let text = `╭───〔 🎬 *ᴄɪɴᴇsᴜʙᴢ sᴇᴀʀᴄʜ* 〕───
│
│ 🔎 *sᴇᴀʀᴄʜ:* ${toSmallCaps(q)}
│ 📊 *ʀᴇsᴜʟᴛs:* ${results.length}
│
╰────────────────► ❥

`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const typeIcon = item.type === "tvshows" ? "📺" : "🎥";
      text += `*[ ${numStr} ]* ${typeIcon} *${toSmallCaps(item.title)}*\n`;
    });

    text += `
───────────────────
📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴍᴏᴠɪᴇ ɴᴜᴍʙᴇʀ (1-${results.length})*`;
    
    await danuwa.sendMessage(from, { text }, { quoted: mek });

  } catch (error) {
    console.error("Cinesubz Search Error:", error.message);
    reply(`❌ *ᴇʀʀᴏʀ sᴇᴀʀᴄʜɪɴɢ ᴍᴏᴠɪᴇs. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.*`);
  }
});

// 2. Movie Selection Listener (FIXED FILTER)
cmd({
  filter: (text, { sender }) => {
    if (!text || !pendingSearch[sender]) return false;
    const num = parseInt(String(text).trim(), 10);
    if (isNaN(num)) return false;
    if (num < 1 || num > pendingSearch[sender].results.length) return false;
    return true;
  }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  const apiKey = pendingSearch[sender].apiKey;
  delete pendingSearch[sender];

  await reply(`🎬 *${toSmallCaps(selected.title)}*

🔗 *ғᴇᴛᴄʜɪɴɢ ᴍᴏᴠɪᴇ ᴅᴇᴛᴀɪʟs ᴀɴᴅ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs...*`);

  try {
    const movieUrl = `${API_BASE}/api/v1/movie/cinesubz/infodl?q=${encodeURIComponent(selected.link)}&api_key=${apiKey}`;
    const res = await axios.get(movieUrl, { headers, timeout: 60000 });
    const movieInfo = res.data?.data;

    if (!movieInfo || !movieInfo.downloads || movieInfo.downloads.length === 0) {
      return reply(`❌ *ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs ᴀᴠᴀɪʟᴀʙʟᴇ ғᴏʀ ᴛʜɪs ᴍᴏᴠɪᴇ!*`);
    }

    const downloadLinks = movieInfo.downloads;
    pendingQuality[sender] = { movie: { metadata: movieInfo, downloadLinks }, apiKey, timestamp: Date.now() };

    let qualityMsg = `╭───〔 📥 *ᴀᴠᴀɪʟᴀʙʟᴇ ǫᴜᴀʟɪᴛɪᴇs* 〕───
│
│ 🎬 *${toSmallCaps(movieInfo.title)}*
`;
    if (movieInfo.imdb || movieInfo.rating) qualityMsg += `│ ⭐ *ɪᴍʙᴅ:* ${movieInfo.imdb || movieInfo.rating}\n`;
    if (movieInfo.year) qualityMsg += `│ 📅 *ʏᴇᴀʀ:* ${movieInfo.year}\n`;
    qualityMsg += `│
╰────────────────► ❥

`;

    downloadLinks.forEach((d, i) => {
      const numStr = String(i + 1).padStart(2, "0");
      qualityMsg += `*[ ${numStr} ]* 📊 *${d.quality}* _(${d.size || "N/A"})_\n`;
    });

    qualityMsg += `
───────────────────
📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ǫᴜᴀʟɪᴛʏ ɴᴜᴍʙᴇʀ (1-${downloadLinks.length}) ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʜᴇ ᴍᴏᴠɪᴇ.*`;

    if (movieInfo.image || movieInfo.thumbnail) {
      await danuwa.sendMessage(from, { image: { url: movieInfo.image || movieInfo.thumbnail }, caption: qualityMsg }, { quoted: mek });
    } else {
      await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
    }

  } catch (error) {
    console.error("Fetch Movie Details Error:", error.message);
    reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs.*`);
  }
});

// 3. Quality Selection & Document Send Listener (FIXED FILTER)
cmd({
  filter: (text, { sender }) => {
    if (!text || !pendingQuality[sender]) return false;
    const num = parseInt(String(text).trim(), 10);
    if (isNaN(num)) return false;
    if (num < 1 || num > pendingQuality[sender].movie.downloadLinks.length) return false;
    return true;
  }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "⚡", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];

  const selectedLink = movie.downloadLinks[index];
  await reply(`⬇️ *ᴜᴘʟᴏᴀᴅɪɴɢ ${selectedLink.quality} ᴍᴏᴠɪᴇ ᴀs ᴀ ᴅᴏᴄᴜᴍᴇɴᴛ...*

🎬 *${toSmallCaps(movie.metadata.title)}*
📊 *ǫᴜᴀʟɪᴛʏ:* ${selectedLink.quality}

⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ A ᴍᴏᴍᴇɴᴛ...*`);

  try {
    const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);

    await danuwa.sendMessage(from, {
      document: { url: selectedLink.link },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD-MINI ${cleanTitle} - ${selectedLink.quality}.mp4`,
      caption: `🎬 *${toSmallCaps(movie.metadata.title)}*

📊 *ǫᴜᴀʟɪᴛʏ:* ${selectedLink.quality}
💾 *sɪᴢᴇ:* ${selectedLink.size || "N/A"}

🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴍᴏᴠɪᴇ!*

👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`
    }, { quoted: mek });

    await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Send Document Error:", error.message);
    reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ᴍᴏᴠɪᴇ ᴅᴏᴄᴜᴍᴇɴᴛ:* ${error.message || "Unknown error"}`);
  }
});

// Auto Cleanup for Expired Sessions (10 mins)
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
