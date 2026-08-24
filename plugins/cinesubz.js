const { cmd } = require("../command");
const axios = require("axios");

const pendingSearch = {};
const pendingQuality = {};

const API_BASE = "https://chama-movie-api.koyeb.app";

// API Keys ලැයිස්තුව
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

// මාරුවෙන් මාරුවට API Key එක ලබාදෙන Function එක (Round-Robin Rotation)
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
  alias: ["cinesub", "cs", "cssearch"],
  react: "🎬",
  desc: "Search and send movies from Cinesubz.co",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
  if (!q) {
    return reply(`🎬 *ᴄɪɴᴇsᴜʙᴢ ᴍᴏᴠɪᴇ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* \`.cinesubz <movie_name>\`\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`.cinesubz avengers\``);
  }

  await reply(`🔍 *sᴇᴀʀᴄʜɪɴɢ ᴄɪɴᴇsᴜʙᴢ ғᴏʀ ᴍᴏᴠɪᴇs...*\n\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*`);

  try {
    // මේ සෙවුම් වටය සඳහා API Key එකක් තෝරාගැනීම
    const apiKey = getNextApiKey();
    const searchUrl = `${API_BASE}/api/v1/movie/cinesubz/search?q=${encodeURIComponent(q.trim())}&api_key=${apiKey}`;
    const res = await axios.get(searchUrl, { headers, timeout: 60000 });

    if (!res.data || !res.data.status || !res.data.data || res.data.data.length === 0) {
      return reply(`❌ *ɴᴏ ᴍᴏᴠɪᴇs ғᴏᴜɴᴅ ᴏɴ ᴄɪɴᴇsᴜʙᴢ!*`);
    }

    const results = res.data.data.slice(0, 10);
    // තෝරාගත් API Key එක Session එක තුළ Save කර තැබීම
    pendingSearch[sender] = { results, apiKey, timestamp: Date.now() };

    let text = `╭━━━〔 🎬 *ᴄɪɴᴇsᴜʙᴢ sᴇᴀʀᴄʜ* 〕━━━\n┃\n`;
    text += `┃ 🔎 *sᴇᴀʀᴄʜ:* ${toSmallCaps(q)}\n`;
    text += `┃ 📊 *ʀᴇsᴜʟᴛs:* ${results.length}\n┃\n`;
    text += `╰━━━───────━━━━► ❥\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const typeIcon = item.type === "tvshows" ? "📺" : "🎥";
      text += `*[ ${numStr} ]* ${typeIcon} *${toSmallCaps(item.title)}*\n`;
    });

    text += `\n───────────────────\n`;
    text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴍᴏᴠɪᴇ ɴᴜᴍʙᴇʀ (1-${results.length})*`;
    reply(text);

  } catch (error) {
    console.error("Cinesubz Search Error:", error.message);
    reply(`❌ *ᴇʀʀᴏʀ sᴇᴀʀᴄʜɪɴɢ ᴍᴏᴠɪᴇs. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.*`);
  }
});

// 2. Movie Selection Listener
cmd({
  filter: (text, { sender }) => pendingSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingSearch[sender].results.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  const apiKey = pendingSearch[sender].apiKey; // Search එකට භාවිත කළ Key එකම ලබා ගැනීම
  delete pendingSearch[sender];

  reply(`🔗 *ғᴇᴛᴄʜɪɴɢ ᴍᴏᴠɪᴇ ᴅᴇᴛᴀɪʟs ᴀɴᴅ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs...*`);

  try {
    const movieUrl = `${API_BASE}/api/v1/movie/cinesubz/infodl?q=${encodeURIComponent(selected.link)}&api_key=${apiKey}`;
    const res = await axios.get(movieUrl, { headers, timeout: 60000 });
    const movieInfo = res.data?.data;

    if (!movieInfo || !movieInfo.downloads || movieInfo.downloads.length === 0) {
      return reply(`❌ *ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs ᴀᴠᴀɪʟᴀʙʟᴇ ғᴏʀ ᴛʜɪs ᴍᴏᴠɪᴇ!*`);
    }

    const downloadLinks = movieInfo.downloads;
    pendingQuality[sender] = { movie: { metadata: movieInfo, downloadLinks }, apiKey, timestamp: Date.now() };

    let qualityMsg = `╭━━━〔 📥 *ᴀᴠᴀɪʟᴀʙʟᴇ ǫᴜᴀʟɪᴛɪᴇs* 〕━━━\n┃\n`;
    qualityMsg += `┃ 🎬 *${toSmallCaps(movieInfo.title)}*\n`;
    if (movieInfo.imdb || movieInfo.rating) qualityMsg += `┃ ⭐ *ɪᴍᴅʙ:* ${movieInfo.imdb || movieInfo.rating}\n`;
    if (movieInfo.year) qualityMsg += `┃ 📅 *ʏᴇᴀʀ:* ${movieInfo.year}\n`;
    qualityMsg += `┃\n╰━━━───────━━━━► ❥\n\n`;

    downloadLinks.forEach((d, i) => {
      const numStr = String(i + 1).padStart(2, "0");
      qualityMsg += `*[ ${numStr} ]* 📊 *${d.quality}* _(${d.size || "N/A"})_\n`;
    });

    qualityMsg += `\n───────────────────\n`;
    qualityMsg += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ǫᴜᴀʟɪᴛʏ ɴᴜᴍʙᴇʀ (1-${downloadLinks.length}) ᴛᴏ ʀᴇᴄᴇɪᴠᴇ ᴛʜᴇ ᴍᴏᴠɪᴇ.*`;

    if (movieInfo.image || movieInfo.thumbnail) {
      await danuwa.sendMessage(from, { image: { url: movieInfo.image || movieInfo.thumbnail }, caption: qualityMsg }, { quoted: mek });
    } else {
      await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
    }

  } catch (error) {
    console.error("Fetch Movie Details Error:", error.message);
    reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ʟᴏᴀᴅ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋs.*`);
  }
});

// 3. Quality Selection & Document Send Listener
cmd({
  filter: (text, { sender }) => pendingQuality[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingQuality[sender].movie.downloadLinks.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "📥", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];

  const selectedLink = movie.downloadLinks[index];
  reply(`⬇️ *ᴜᴘʟᴏᴀᴅɪɴɢ ${selectedLink.quality} ᴍᴏᴠɪᴇ ᴀs ᴀ ᴅᴏᴄᴜᴍᴇɴᴛ...*\n\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ᴀ ᴍᴏᴍᴇɴᴛ.*`);

  try {
    const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);

    await danuwa.sendMessage(from, {
      document: { url: selectedLink.link },
      mimetype: "video/mp4",
      fileName: `${cleanTitle} - ${selectedLink.quality}.mp4`,
      caption: `🎬 *${toSmallCaps(movie.metadata.title)}*\n\n📊 *ǫᴜᴀʟɪᴛʏ:* ${selectedLink.quality}\n💾 *sɪᴢᴇ:* ${selectedLink.size || "N/A"}\n\n🍿 *ᴇɴᴊᴏʏ ʏᴏᴜʀ ᴍᴏᴠɪᴇ!*`
    }, { quoted: mek });

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
