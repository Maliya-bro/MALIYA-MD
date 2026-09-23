const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { scrapeMovieData } = require("films365-scraper");
const { readSettings, getCustomImage } = require("../lib/botSettings");

// ── Context Info (Channel Details) ─────────────
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";

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

const TEMP_DIR = path.join(os.tmpdir(), "maliya_films365_temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".mp4") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

// ✅ Group එකේ ඕනෑම කෙනෙකුට reply කළ හැකි වන පරිදි 'from' පමණක් භාවිතය
function makePendingKey(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingFilms365[k];
}

// ✅ Quoted Message ID extract කරගැනීම
function getQuotedStanzaId(mek, m) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    null
  );
}

const pendingFilms365 = Object.create(null);
const lastProcessedMsg = {};
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

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
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ==========================================
// 1. Search Function (Next.js API)
// ==========================================
async function searchFilms365(query) {
  try {
    const searchUrl = 'https://www.films365.org/';
    const payload = JSON.stringify([query.trim()]);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': '70c4ed2cef3a9a6249fefcf471f2861ff214836e12',
      'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22(home)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2C%22%2F%22%2C%22refresh%22%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D'
    };

    const { data: searchHtml } = await axios.post(searchUrl, payload, { headers: headers, timeout: 15000 });
    const movies = [];
    const jsonMatches = searchHtml.matchAll(/"id":"([a-f0-9\-]{36})","title":"([^"]+)"/g);
    
    for (const match of jsonMatches) {
      const id = match[1];
      const title = match[2];
      const fullLink = `https://www.films365.org/movie/${id}`;
      
      const isDuplicate = movies.some(m => m.link === fullLink);
      if (!isDuplicate) {
        movies.push({ title, link: fullLink, id });
      }
    }
    return movies;
  } catch (error) {
    console.error("Films365 Search Error:", error.message);
    return [];
  }
}

// ==========================================
// 2. Command Trigger (.films365)
// ==========================================
cmd({
  pattern: "films365",
  alias: ["f365", "movie365"],
  react: "🎬",
  desc: "Search and download movies from Films365",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎬 *𝐅𝐈𝐋𝐌𝐒𝟑𝟔𝟓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.films365 <movie name>\`\n💡 *Example:* \`.films365 spiderman\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchFilms365(q.trim());

    if (!results || results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No movies found for "${q}" on Films365.`);
    }

    const key = makePendingKey(sender, from);
    clearUserSession(key);

    let text = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    text += `🎬 *𝐅𝐈𝐋𝐌𝐒𝟑𝟔𝟓 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    text += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      text += `*[ ${numStr} ]* ➔ *${item.title}*\n`;
    });
    text += `\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n> 💬 *Please reply to this message with a number to Download...*`;

    let finalSearchImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "films365_header");
        if (custom && custom.data) finalSearchImg = custom.data;
      } catch (e) {}
    }

    const menuMsg = await sock.sendMessage(from, { 
      image: { url: finalSearchImg }, 
      caption: text,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    pendingFilms365[key] = {
      expectedMsgId: menuMsg.key.id,
      results,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to Films365 server.");
  }
});

// ==========================================
// 3. Number Reply Listener
// ==========================================
const filmsReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const key = makePendingKey(sender, from);
    return !!pendingFilms365[key];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingFilms365[key];
    if (!pending || pending.isProcessing) return;

    const rawInput = String(body || "").trim();
    if (!rawInput || !/^\d+$/.test(rawInput)) return;

    // 🔥 User reply කර ඇත්තේ Bot එවූ Menu message එකටම දැයි පරීක්ෂා කිරීම
    const quotedId = getQuotedStanzaId(mek, m);
    if (!quotedId || quotedId !== pending.expectedMsgId) return;

    // Spam Cooldown Protection
    const now = Date.now();
    const lastMsg = lastProcessedMsg[key];
    if (lastMsg && lastMsg.text === rawInput && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[key] = { text: rawInput, time: now };

    const input = parseInt(rawInput, 10);
    if (isNaN(input) || input < 1 || input > pending.results.length) return;

    pending.isProcessing = true;
    const selected = pending.results[input - 1];

    await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

    try {
      // 1. Scrape Movie Data using the package
      const metadata = await scrapeMovieData(selected.link);
      
      if (!metadata || !metadata.downloadUrl) {
        clearUserSession(key);
        return await sendErrorMsg(sock, from, mek, "Failed to extract the direct download link from Films365.");
      }

      // 2. Download Process එකට යැවීම
      clearUserSession(key);
      await executeDownload(sock, mek, from, metadata, selected);

    } catch (error) {
      clearUserSession(key);
      console.error("Films365 Extraction Error:", error.message);
      await sendErrorMsg(sock, from, mek, "An error occurred while fetching the movie details.");
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(filmsReplyHandler);

// ==========================================
// 4. Download Execution (With Document Thumbnail)
// ==========================================
async function executeDownload(sock, mek, from, metadata, selectedApp) {
  let tempFile = makeTempFile(".mp4");
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    // Download Request (Allow large files)
    const response = await axios({
      url: metadata.downloadUrl,
      method: "GET",
      responseType: "stream",
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 
      timeout: 0, // No timeout for large files
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const stats = fs.statSync(tempFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB === 0) throw new Error("Downloaded file is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanName = selectedApp.title.replace(/[\\/:*?"<>|]/g, "").trim();
    
    let caption = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    caption += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    caption += `🎬 *Name:* ${metadata.title}\n`;
    if (metadata.date) caption += `📅 *Date:* ${metadata.date}\n`;
    if (metadata.duration) caption += `⏱️ *Duration:* ${metadata.duration}\n`;
    if (metadata.rate) caption += `⭐ *Rate:* ${metadata.rate}\n`;
    caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(DEFAULT_IMAGE);

    const docPayload = {
      document: { stream: fs.createReadStream(tempFile) },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanName}.mp4`,
      caption: caption,
      contextInfo: channelContextInfo(),
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    let fallbackMsg = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    fallbackMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄 𝐎𝐑 𝐄𝐑𝐑𝐎𝐑*\n`;
    fallbackMsg += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    fallbackMsg += `🎬 *Movie:* ${metadata.title || selectedApp.title}\n`;
    fallbackMsg += `ℹ️ _File size exceeds WhatsApp limits or connection timed out._\n\n`;
    fallbackMsg += `🔗 *Direct Download Link:*\n${metadata.downloadUrl}\n\n`;
    fallbackMsg += `⊱━━• ✿ •━━━━━• ✿ •━━⊰`;
    
    await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
  } finally {
    safeUnlink(tempFile);
  }
}

// Expired sessions cleanup
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingFilms365)) {
    if (now - pendingFilms365[key].timestamp > SESSION_TIMEOUT) {
      delete pendingFilms365[key];
    }
  }
  for (const key of Object.keys(lastProcessedMsg)) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 30000);
