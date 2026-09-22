const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Jimp = require("jimp"); // 🛠️ Mobile Thumbnail සඳහා Jimp එකතු කළා
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩ𝗬Ａ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingMovieSub = {};
const lastProcessedMsg = {};

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".mp4") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingMovieSub[k];
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

// 🛠️ FIX: Mobile App එකට support කරන විදියට Thumbnail එක Resize කර Base64 කිරීම
async function getThumbnailBuffer(url) {
  try {
    if (!url || url === 'No Image') return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    
    const image = await Jimp.read(Buffer.from(res.data));
    image.resize(320, Jimp.AUTO);
    image.quality(60);
    
    const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    return resizedBuffer.toString("base64");
  } catch (e) {
    console.error("Thumbnail generation error:", e.message);
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

const BASE_URL = 'https://www.moviesublk.com';

// ==========================================
// 1. Scraper Functions
// ==========================================
async function searchMovieSubLK(query) {
  try {
    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('.post-outer').each((i, el) => {
      if (i >= 15) return false;
      
      const titleElement = $(el).find('h2.post-title a, h3.post-title a');
      const title = titleElement.text().trim();
      const url = titleElement.attr('href');
      
      let image = $(el).find('.post-image img').attr('src');
      if (!image) {
        const imgTagStr = $(el).find('.post-image script').html() || '';
        const imgMatch = imgTagStr.match(/src=["']([^"']+)["']/);
        if (imgMatch) image = imgMatch[1];
      }

      if (title && url) {
        results.push({ title, url, image: image || DEFAULT_IMAGE });
      }
    });

    return results;
  } catch (error) {
    return [];
  }
}

async function getDownloadLinks(pageUrl) {
  try {
    const { data } = await axios.get(pageUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    const scripts = $('script').toArray();
    let links = { gdrive: [], telegram: [], subtitle: [] };

    for (const script of scripts) {
      const content = $(script).html() || '';
      
      if (content.includes('gd:') || content.includes('tg:')) {
        const gdMatches = [...content.matchAll(/gd:\s*["']([^"']+)["']/g)];
        const tgMatches = [...content.matchAll(/tg:\s*["']([^"']+)["']/g)];
        const sbMatches = [...content.matchAll(/sb:\s*["']([^"']+)["']/g)];

        gdMatches.forEach(m => { if(m[1] && m[1] !== '#') links.gdrive.push(m[1]); });
        tgMatches.forEach(m => { if(m[1] && m[1] !== '#') links.telegram.push(m[1]); });
        sbMatches.forEach(m => { if(m[1] && m[1] !== '#') links.subtitle.push(m[1]); });
      }
      
      if (content.includes('realGdriveDownload')) {
        const gdMatch = content.match(/realGdriveDownload\s*=\s*["']([^"']+)["']/);
        const tgMatch = content.match(/realTelegramDownload\s*=\s*["']([^"']+)["']/);
        const sbMatch = content.match(/realSubDownload\s*=\s*["']([^"']+)["']/);

        if (gdMatch && gdMatch[1] && gdMatch[1] !== '#') links.gdrive.push(gdMatch[1]);
        if (tgMatch && tgMatch[1] && tgMatch[1] !== '#') links.telegram.push(tgMatch[1]);
        if (sbMatch && sbMatch[1] && sbMatch[1] !== '#') links.subtitle.push(sbMatch[1]);
      }
    }

    links.gdrive = [...new Set(links.gdrive)];
    links.telegram = [...new Set(links.telegram)];
    links.subtitle = [...new Set(links.subtitle)];

    return links;
  } catch (error) {
    return null;
  }
}

// 🛠️ FIX: \vert{}\vert{} ඉවත් කර සාමාන්‍ය || (OR) සංකේතය යෙදීම
async function getMediaFireLink(url) {
  if (!url.includes('mediafire.com')) return url;
  try {
    const { data } = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const dlLink = $('#downloadButton').attr('href') \vert{}\vert{} $('a.input.popsok').attr('href');
    return dlLink || url;
  } catch (e) {
    return url;
  }
}

// ── 2. Search Command ──────────────────────────────────────────
cmd({
  pattern: "moviesub",
  alias: ["msub", "moviesublk", "ms"],
  desc: "Search movies and TV shows from MovieSubLK",
  category: "download",
  react: "🎬",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐌𝐎𝐕𝐈𝐄𝐒𝐔𝐁.𝐋𝐊 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.msub <movie name>\`\n💡 *Example:*\n• \`.msub peddi\`\n• \`.msub the vampire diaries\`\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchMovieSubLK(q.trim());

    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐍𝐎 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n😞 _No Movies Found for:_ *${q}*\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    const k = makePendingKey(sender, from);
    clearUserSession(k);

    pendingMovieSub[k] = {
      step: 1,
      results: results,
      timestamp: Date.now(),
      isProcessing: false
    };

    let listText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    listText += `🎬 *𝐌𝐎𝐕𝐈𝐄𝐒𝐔𝐁 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    listText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    listText += `🎯 *Search :* _${q}_\n`;
    listText += `📊 *Total :* _${pendingMovieSub[k].results.length} Movies_\n\n`;

    pendingMovieSub[k].results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      listText += `*[ ${numStr} ]* ➔ 🎬 *${(item.title || 'Movie').substring(0, 45)}*\n`;
    });

    listText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 👇 *Reply with a number to Download...*`;

    let displayImg = results[0].image && results[0].image !== 'No Image' ? results[0].image : DEFAULT_IMAGE;
    
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "moviesub_header");
        if (custom && custom.data) displayImg = custom.data;
      } catch (e) {}
    }

    await sock.sendMessage(from, { 
      image: { url: displayImg }, 
      caption: listText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error("MovieSub Search Error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to search on MovieSubLK.");
  }
});

// ── 3. Reply Handler ───────────────────────────────────────────
const msReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingMovieSub[k];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const input = String(body || "").trim();
    if (!input || !/^\d+$/.test(input)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingMovieSub[k];
    if (!pending || pending.isProcessing) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: input, time: now };

    const choice = parseInt(input, 10);

    // ── STEP 1: Movie Selection ──
    if (pending.step === 1) {
      if (choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const selectedMovie = pending.results[choice - 1];

      try {
        const dlLinks = await getDownloadLinks(selectedMovie.url);

        if (!dlLinks || (dlLinks.gdrive.length === 0 && dlLinks.telegram.length === 0 && dlLinks.subtitle.length === 0)) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No download links found for this movie.");
        }

        const isSeries = dlLinks.gdrive.length > 1 || dlLinks.telegram.length > 1;

        if (isSeries) {
          pending.step = 2;
          pending.dlLinks = dlLinks;
          pending.selectedMovie = selectedMovie;
          pending.isProcessing = false;
          pending.timestamp = Date.now();

          let msg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
          msg += `📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐄𝐏𝐈𝐒𝐎𝐃𝐄𝐒*\n`;
          msg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
          msg += `🎬 *Series:* ${selectedMovie.title}\n`;
          msg += `🗂️ *Episodes:* ${dlLinks.gdrive.length || dlLinks.telegram.length}\n\n`;
          msg += `> 👇 *Reply with the Episode Number (1 to ${dlLinks.gdrive.length || dlLinks.telegram.length}):*\n`;
          msg += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰`;

          await sock.sendMessage(from, { text: msg, contextInfo: channelContextInfo() }, { quoted: mek });
          await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
          return;

        } else {
          clearUserSession(k);
          const vUrl = dlLinks.gdrive[0] || dlLinks.telegram[0];
          const sUrl = dlLinks.subtitle[0];
          await executeMovieSubDownload(sock, mek, from, vUrl, sUrl, selectedMovie.title, dlLinks, selectedMovie.image);
        }

      } catch (infoErr) {
        console.error("MovieSub Link Error:", infoErr);
        clearUserSession(k);
        await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
        await sendErrorMsg(sock, from, mek, "Failed to extract download links.");
      }
    } 
    // ── STEP 2: Episode Selection ──
    else if (pending.step === 2) {
      const epIndex = choice - 1;
      const totalEps = pending.dlLinks.gdrive.length || pending.dlLinks.telegram.length;

      if (choice < 1 || choice > totalEps) return;

      pending.isProcessing = true;
      const vUrl = pending.dlLinks.gdrive[epIndex] || pending.dlLinks.telegram[epIndex];
      const sUrl = pending.dlLinks.subtitle[epIndex];
      const epTitle = `${pending.selectedMovie.title} - Ep ${choice}`;
      const img = pending.selectedMovie.image;
      
      const savedLinks = pending.dlLinks;
      clearUserSession(k);
      
      await executeMovieSubDownload(sock, mek, from, vUrl, sUrl, epTitle, savedLinks, img);
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(msReplyHandler);
}

// ==========================================
// 4. Download Execution & Fallback System
// ==========================================
async function executeMovieSubDownload(sock, mek, from, videoUrl, subUrl, titleName, fullLinksObj, posterImg) {
  let tempVideo = makeTempFile(".mp4");
  let tempSub = makeTempFile(".ass");

  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    if (!videoUrl || videoUrl === '#') throw new Error("Invalid Video Link");

    // ── 1. Download Video ──
    const response = await axios({
      url: videoUrl,
      method: "GET",
      responseType: "stream",
      headers: HEADERS, 
      timeout: 180000, 
      maxContentLength: 2000 * 1024 * 1024,
      maxBodyLength: 2000 * 1024 * 1024
    });

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      throw new Error("Direct download blocked (Google Drive Virus Scan or Captcha).");
    }

    const writer = fs.createWriteStream(tempVideo);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(tempVideo);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB === 0) throw new Error("Downloaded file is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanName = titleName.replace(/[\\/:*?"<>|]/g, "").trim();
    const isLargeDoc = sizeMB > 60;
    
    let caption = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    caption += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    caption += `🎬 *Title:* ${toSmallCaps(titleName)}\n`;
    caption += `📦 *Size:* ${sizeMB.toFixed(2)} MB\n`;
    caption += `📁 *Format:* ${isLargeDoc ? "Document (Raw Stream)" : "Standard MP4"}\n\n`;
    caption += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(posterImg);

    const docPayload = {
      document: { stream: fs.createReadStream(tempVideo) },
      mimetype: isLargeDoc ? "application/octet-stream" : "video/mp4",
      fileName: `${cleanName}.mp4`,
      caption: caption,
      contextInfo: channelContextInfo(),
    };

    if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

    await sock.sendMessage(from, docPayload, { quoted: mek });

    // ── 2. Download Subtitle ──
    if (subUrl && subUrl !== '#') {
      let directSubUrl = await getMediaFireLink(subUrl);
      
      const subRes = await axios({
        url: directSubUrl,
        method: "GET",
        responseType: "stream",
        timeout: 60000
      });

      let subExt = directSubUrl.toLowerCase().includes('.srt') ? ".srt" : ".ass";
      const subWriter = fs.createWriteStream(tempSub);
      subRes.data.pipe(subWriter);

      await new Promise((res, rej) => {
        subWriter.on('finish', res);
        subWriter.on('error', rej);
      });

      await sock.sendMessage(from, {
        document: { stream: fs.createReadStream(tempSub) },
        mimetype: "application/octet-stream",
        fileName: `${cleanName} Subtitle${subExt}`,
        caption: `> 📜 *${cleanName} Subtitle*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.log("MovieSub Download Skipped/Error:", err.message);
    
    let fallbackMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    fallbackMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄 𝐎𝐑 𝐁𝐋𝐎𝐂𝐊𝐄𝐃*\n`;
    fallbackMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    fallbackMsg += `🎬 *Title:* ${toSmallCaps(titleName)}\n`;
    fallbackMsg += `ℹ️ _File size exceeds WhatsApp limit or direct download is blocked by Google Drive. Use the links below to download manually._\n\n`;
    
    if (videoUrl && videoUrl !== '#') {
      fallbackMsg += `🔗 *Direct Video Link:*\n${videoUrl}\n\n`;
    } else {
      if (fullLinksObj && fullLinksObj.gdrive && fullLinksObj.gdrive.length > 0) {
        fallbackMsg += `🔗 *G-Drive:*\n${fullLinksObj.gdrive[0]}\n\n`;
      }
      if (fullLinksObj && fullLinksObj.telegram && fullLinksObj.telegram.length > 0) {
        fallbackMsg += `✈️ *Telegram:*\n${fullLinksObj.telegram[0]}\n\n`;
      }
    }
    
    if (subUrl && subUrl !== '#') {
      fallbackMsg += `📜 *Subtitle Link:*\n${subUrl}\n\n`;
    }

    fallbackMsg += `⊱━━━• ✿ •━━━• ✿ •━━━⊰`;
    
    await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } finally {
    safeUnlink(tempVideo);
    safeUnlink(tempSub);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingMovieSub) {
    if (now - pendingMovieSub[k].timestamp > SESSION_TIMEOUT) {
      delete pendingMovieSub[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);
