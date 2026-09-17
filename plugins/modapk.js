const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const pendingAn1 = {};

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".apk") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
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

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

// ==========================================
// 1. Scraper Functions
// ==========================================
async function searchAN1(query) {
  try {
    const searchUrl = `https://an1.com/?story=${encodeURIComponent(query)}&do=search&subaction=search`;
    const { data } = await axios.get(searchUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    
    const results = [];
    $('.item_app').each((i, el) => {
      if (i >= 15) return false;
      const title = $(el).find('.name a span').text().trim() || $(el).find('.name a').text().trim();
      const appUrl = $(el).find('.name a').attr('href');
      const img = $(el).find('.img img').attr('src');
      const developer = $(el).find('.developer').text().trim();
      
      if (title && appUrl) {
        results.push({ title, url: appUrl, img, developer });
      }
    });
    return results;
  } catch (error) {
    return [];
  }
}

async function getAppDetails(appUrl) {
  try {
    const { data } = await axios.get(appUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    const version = $('span[itemprop="softwareVersion"]').text().trim() || "Unknown";
    const size = $('span[itemprop="fileSize"]').text().trim() || "Unknown";
    let dlPagePath = $('a.btn-green[href*="file_"]').attr('href');
    if (!dlPagePath) return null;
    const dlPageUrl = dlPagePath.startsWith('http') ? dlPagePath : `https://an1.com${dlPagePath}`;
    return { version, size, dlPageUrl };
  } catch (error) {
    return null;
  }
}

async function getDirectDownloadLink(dlPageUrl) {
  try {
    const { data } = await axios.get(dlPageUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    return $('#pre_download').attr('href');
  } catch (error) {
    return null;
  }
}

// ── 2. Search Command ──────────────────────────────────────────
cmd({
  pattern: "an1",
  alias: ["modgame", "modapk"],
  desc: "Unlimited money MOD Android games and tools",
  category: "download",
  react: "🎮",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎮 *𝐌𝐎𝐃 𝐆𝐀𝐌𝐄𝐒 (𝐀𝐍𝟏)*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.an1 <game name>\`\n💡 *Example:*\n• \`.an1 shadow fight 2\`\n• \`.an1 subway surfers\`\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchAN1(q.trim());

    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐍𝐎 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n😞 _No MOD Games Found for:_ *${q}*\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    const k = makePendingKey(sender, from);
    pendingAn1[k] = {
      results: results,
      timestamp: Date.now(),
      isProcessing: false
    };

    let listText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    listText += `🎮 *𝐀𝐍𝟏 𝐌𝐎𝐃 𝐆𝐀𝐌𝐄𝐒*\n`;
    listText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    listText += `🎯 *Search :* _${q}_\n`;
    listText += `📊 *Total :* _${pendingAn1[k].results.length} Games_\n\n`;

    pendingAn1[k].results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      listText += `*[ ${numStr} ]* ➔ 🎮 *${(item.title || 'Game').substring(0, 40)}*\n`;
    });

    listText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 👇 *Reply with a number to Download...*`;

    // අදාළ Game එකේ Thumbnail එක යැවීම (නැති නම් Default Image එක)
    const displayImg = results[0].img || DEFAULT_IMAGE;

    await sock.sendMessage(from, { 
      image: { url: displayImg }, 
      caption: listText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error("AN1 Search Error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sock.sendMessage(from, { 
        text: `❌ *Error:* Failed to search games on AN1.com.`,
        contextInfo: channelContextInfo()
    }, { quoted: mek });
  }
});

// ── 3. Reply Handler ───────────────────────────────────────────
const an1ReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingAn1[k];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const input = String(body || "").trim();
    if (!input || !/^\d+$/.test(input)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingAn1[k];
    if (!pending || pending.isProcessing) return;

    const choice = parseInt(input, 10);
    if (choice < 1 || choice > pending.results.length) return;

    pending.isProcessing = true;
    await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const selectedGame = pending.results[choice - 1];
    delete pendingAn1[k]; // Clear session immediately to avoid spam

    try {
      // 1. Scrape App Details
      const details = await getAppDetails(selectedGame.url);
      if (!details || !details.dlPageUrl) {
        return await sock.sendMessage(from, { 
          text: `❌ *Error:* Failed to find the download page.`,
          contextInfo: channelContextInfo() 
        }, { quoted: mek });
      }

      // 2. Extract Direct Download Link
      const directLink = await getDirectDownloadLink(details.dlPageUrl);
      if (!directLink) {
        return await sock.sendMessage(from, { 
          text: `❌ *Error:* Failed to extract the direct download link.`,
          contextInfo: channelContextInfo() 
        }, { quoted: mek });
      }

      // 3. Download and Send
      await executeDownload(sock, mek, from, directLink, selectedGame, details);

    } catch (infoErr) {
      console.error("AN1 Extraction Error:", infoErr);
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      await sock.sendMessage(from, { 
        text: `❌ *Error:* An error occurred while fetching the download link.`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(an1ReplyHandler);
}

// ── 4. Download Execution ─────────────────────────────────────────
async function executeDownload(sock, mek, from, url, selectedApp, details) {
  let tempFile = makeTempFile(".apk");
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    const response = await axios({
      url: url,
      method: "GET",
      responseType: "stream",
      headers: HEADERS, 
      timeout: 180000, // 3 Minutes Timeout
      maxContentLength: 300 * 1024 * 1024,
      maxBodyLength: 300 * 1024 * 1024
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(tempFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB === 0) throw new Error("Downloaded file is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanName = selectedApp.title.replace(/[\\/:*?"<>|]/g, "").trim();
    const isLargeDoc = sizeMB > 60;
    
    let caption = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    caption += `✅ *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    caption += `📦 *App:* ${selectedApp.title}\n`;
    caption += `👤 *Dev:* ${selectedApp.developer}\n`;
    caption += `🏷️ *Version:* ${details.version}\n`;
    caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n`;
    caption += `📁 *Format:* ${isLargeDoc ? "Document (Raw Binary)" : "Standard APK"}\n\n`;
    caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const docPayload = {
      document: fs.readFileSync(tempFile),
      mimetype: isLargeDoc ? "application/octet-stream" : "application/vnd.android.package-archive",
      fileName: `${cleanName}.apk`,
      caption: caption,
      contextInfo: channelContextInfo()
    };

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("AN1 Download Error:", err.message);
    let fallbackMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    fallbackMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄 𝐎𝐑 𝐄𝐑𝐑𝐎𝐑*\n`;
    fallbackMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    fallbackMsg += `📦 *App:* ${selectedApp.title}\n`;
    fallbackMsg += `ℹ️ _File size exceeds limits or connection timed out._\n\n`;
    fallbackMsg += `🔗 *Direct Download Link:*\n${url}\n\n`;
    fallbackMsg += `⊱━━━• ✿ •━━━• ✿ •━━━⊰`;
    
    await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
  } finally {
    safeUnlink(tempFile);
  }
}

// Memory Cleanup
setInterval(() => {
  const now = Date.now();
  for (const k in pendingAn1) {
    if (now - pendingAn1[k].timestamp > SESSION_TIMEOUT) {
      delete pendingAn1[k];
    }
  }
}, 2.5 * 60 * 1000);
