const { cmd, replyHandlers } = require("../command");
const ytDlp = require("youtube-dl-exec");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const { sendInteractiveMessage } = require("gifted-btns");
const { readSettings } = require("../lib/botSettings");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// 🔥 Cookies File Path 🔥
const COOKIES_PATH = path.join(__dirname, "../cookies.txt");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 Ｍ𝗔𝗟𝗜𝗬𝗔-〽️Ｄ 🍁";

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

function cookiesStatus() {
  if (!fs.existsSync(COOKIES_PATH)) return { exists: false, sizeBytes: 0 };
  try { return { exists: true, sizeBytes: fs.statSync(COOKIES_PATH).size }; } 
  catch { return { exists: false, sizeBytes: 0 }; }
}

const MEDIA_LIMIT_MB = 45;
const pendingMediaChoice = Object.create(null);

function makeTempFile(ext = ".mp3") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function formatViews(num) {
  return !num ? "Unknown" : Number(num).toLocaleString();
}

function formatSeconds(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  seconds = Number(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function generateProgressBar(duration = "0:00") {
  return `▰▰▰▰▰▰▰ *${duration}*`;
}

function getFileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

function sanitizeFileName(name = "youtube_download") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_download";
}

// ── Small Caps Font Effect ─────────────
function toSmallCaps(str = "") {
    const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
    return String(str).split("").map((char) => {
        const idx = normal.indexOf(char);
        return idx !== -1 ? small[idx] : char;
    }).join("");
}

function normalizeText(s = "") {
  return String(s).replace(/\r/g, "").replace(/\n+/g, "\n").replace(/\s+/g, " ").trim().toUpperCase();
}

function tryParseJsonString(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.interactiveResponseMessage?.body?.text,
  ];
  for (const item of direct) if (item) texts.push(String(item).trim());
  return [...new Set(texts.filter(Boolean))];
}

function extractOptionFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);
  for (const text of normalized) {
    if (text.includes("TYPE:AUDIO") || text === "AUDIO" || text === "1") return "audio";
    if (text.includes("TYPE:DOC") || text === "DOCUMENT" || text === "2") return "doc";
  }
  return null;
}

// 🔥 Single-Sided Layouts with Small Caps Effect 🔥
function buildSongDetails(video) {
  const title = toSmallCaps(video.title || "Unknown Title");
  const channel = toSmallCaps(video.author?.name || "Unknown Channel");
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const url = video.url || "Unavailable";

  return `╭─[ 🎵 *${toSmallCaps("SONG DETAILS")}* ]\n│\n├ 🎶 *${toSmallCaps("Title:")}* ${title}\n├ 👤 *${toSmallCaps("Channel:")}* ${channel}\n├ ⏱️ *${toSmallCaps("Duration:")}* ${duration}\n├ 👀 *${toSmallCaps("Views:")}* ${views}\n├ 📅 *${toSmallCaps("Uploaded:")}* ${uploaded}\n├ 🔗 *${toSmallCaps("Link:")}* ${url}\n│\n╰─[ ${generateProgressBar(duration)} ]`;
}

function buildFinalCaption(video, typeLabel, sizeMB) {
  return `╭─[ ✅ *${toSmallCaps("DOWNLOADED")}* ]\n│\n├ 🎵 *${toSmallCaps("Title:")}* ${toSmallCaps(video.title || "Unknown Title")}\n├ 🎧 *${toSmallCaps("Type:")}* ${toSmallCaps(typeLabel)}\n├ 📦 *${toSmallCaps("Size:")}* ${sizeMB.toFixed(2)} MB\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.includes("v=") ? query.split("v=")[1].split("&")[0] : query.split("/").pop().split("?")[0];
    return await yts({ videoId: id });
  }
  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

async function sendInteractiveAudioMenu(sock, from, mek, video, sessionId) {
  const settings = await readSettings(sessionId);
  if (!!settings.btns_enabled && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(sock, from, {
          image: { url: video.thumbnail },
          text: buildSongDetails(video),
          footer: "𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 | 𝗔𝗨𝗗𝗜𝗢 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Select Format ↯",
                sections: [{
                    title: "Audio Options",
                    rows: [
                      { title: "🎶 Audio File (MP3)", description: "Listen directly in WhatsApp", id: "type:audio" },
                      { title: "📁 Document File", description: "Download as MP3 Document", id: "type:doc" },
                    ],
                }],
              }),
            },
          ],
        }, { quoted: mek }
      );
    } catch (e) { console.log("AUDIO BUTTON ERROR:", e); }
  }
  return sock.sendMessage(from, { image: { url: video.thumbnail }, caption: buildSongDetails(video) + `\n\n╭─[ 🎵 *${toSmallCaps("AUDIO OPTIONS")}* ]\n│\n├ 📱 *[ 01 ]* ➔ 🎶 Audio File (MP3)\n├ 📱 *[ 02 ]* ➔ 📁 Document File\n│\n╰─[ 👇 *${toSmallCaps("Reply with 1 or 2")}* ]`, contextInfo: channelContextInfo() }, { quoted: mek });
}

// 🔥 FALLBACK: Y2MATE (SAVENOW.TO) & OTHER APIs 🔥
async function fallbackAPIs(url, outPath) {
    // 1. Try Y2Mate / Loader.to API
    try {
        const startRes = await axios.get(`https://p.savenow.to/ajax/download.php?format=mp3&url=${encodeURIComponent(url)}`);
        if (startRes.data && startRes.data.id) {
            const jobId = startRes.data.id;
            let dlUrl = null;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 3000)); // Poll every 3 seconds
                const prog = await axios.get(`https://p.savenow.to/ajax/progress.php?id=${jobId}`);
                if (prog.data && prog.data.success === 1 && prog.data.download_url) {
                    dlUrl = prog.data.download_url;
                    break;
                }
            }
            if (dlUrl) {
                const writer = fs.createWriteStream(outPath);
                const res = await axios({ url: dlUrl, method: 'GET', responseType: 'stream', timeout: 120000 });
                res.data.pipe(writer);
                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(true));
                    writer.on('error', reject);
                });
            }
        }
    } catch (e) { console.log("Y2Mate Fallback Failed:", e.message); }

    // 2. Try Standard Direct APIs
    const apis = [
        `https://api.deliriussapi.site/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(url)}`
    ];
    for (let api of apis) {
        try {
            const res = await axios.get(api, { timeout: 15000 });
            const dlUrl = res.data?.result?.download?.url || res.data?.result?.dl_link || res.data?.dl || res.data?.data?.dl || res.data?.BK9;
            if (dlUrl) {
                const writer = fs.createWriteStream(outPath);
                const fileRes = await axios({ url: dlUrl, method: 'GET', responseType: 'stream', timeout: 120000 });
                fileRes.data.pipe(writer);
                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(true));
                    writer.on('error', reject);
                });
            }
        } catch (e) { continue; }
    }
    throw new Error("All Backup APIs Failed");
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, { text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`, contextInfo: channelContextInfo() }, { quoted: mek });
}

async function handleAudioDownload(sock, mek, from, sender, optionChoice) {
  const key = makePendingKey(sender, from);
  const pending = pendingMediaChoice[key];
  if (!pending || pending.isProcessing) return;
  pending.isProcessing = true;

  let audioFile = makeTempFile(".mp3");
  let downloadedSuccessfully = false;
  const isDoc = optionChoice === "doc";

  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    // 🔥 ATTEMPT 1: YT-DLP (FORMAT FIXED) 🔥
    try {
      const ytArgs = {
        extractAudio: true,
        audioFormat: "mp3", 
        // ⛔ format: "bestaudio/best" <- අයින් කලා! yt-dlp ඔටෝම හොඳම එක හොයාගන්නවා
        output: audioFile,
        ffmpegLocation: ffmpegPath,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        extractorArgs: "youtube:player_client=android,web",
        addHeader: ["referer:youtube.com"],
      };

      const cookies = cookiesStatus();
      if (cookies.exists && cookies.sizeBytes > 0) ytArgs.cookies = COOKIES_PATH;

      await ytDlp(pending.video.url, ytArgs);
      downloadedSuccessfully = true;
    } catch (ytErr) {
      console.log("YT-DLP ERROR:", ytErr.message.substring(0, 100));
    }

    // 🔥 ATTEMPT 2: Y2MATE API FALLBACK 🔥
    if (!downloadedSuccessfully) {
      console.log("Switching to Y2Mate API Fallback...");
      safeUnlink(audioFile); 
      audioFile = makeTempFile(".mp3");
      
      await fallbackAPIs(pending.video.url, audioFile);
      downloadedSuccessfully = true;
    }

    if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) {
      throw new Error("Downloaded file is missing or empty.");
    }

    const sizeMB = getFileSizeMB(audioFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const msgPayload = { mimetype: "audio/mpeg", fileName: `${cleanTitle}.mp3`, contextInfo: channelContextInfo() };
    if (isDoc || sizeMB > MEDIA_LIMIT_MB) {
      msgPayload.document = fs.readFileSync(audioFile);
      msgPayload.caption = buildFinalCaption(pending.video, "Document MP3", sizeMB);
    } else {
      msgPayload.audio = fs.readFileSync(audioFile);
      msgPayload.caption = buildFinalCaption(pending.video, "Audio MP3", sizeMB);
      msgPayload.ptt = false;
    }

    await sock.sendMessage(from, msgPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (e) {
    const errText = (e && (e.stderr || e.message)) || "Unknown Error";
    console.log("ALL AUDIO DOWNLOAD METHODS FAILED:", errText);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    const cleanErr = String(errText).replace(/\n/g, " ").trim();
    await sendErrorMsg(sock, from, mek, `Audio Download Failed: ${cleanErr.substring(0, 100)}`);
  } finally {
    safeUnlink(audioFile);
    if (pendingMediaChoice[key]) pendingMediaChoice[key].isProcessing = false;
    delete pendingMediaChoice[key];
  }
}

cmd(
  {
    pattern: "song",
    alias: ["play", "ytmp3", "yta"],
    react: "🔍",
    desc: "Download YouTube audio with options",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    try {
      if (!q) return await sendErrorMsg(sock, from, mek, "Please provide a song name or YouTube link.");

      const video = await getYoutube(q);
      if (!video) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(sock, from, mek, "No results found.");
      }

      const key = makePendingKey(sender, from);
      pendingMediaChoice[key] = { video, from, createdAt: Date.now(), isProcessing: false };

      await sendInteractiveAudioMenu(sock, from, mek, video, sessionId);
    } catch (e) {
      console.log("SONG MENU ERROR:", e && e.message);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Error while preparing audio menu.");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => !!pendingMediaChoice[makePendingKey(sender, from)],
  function: async (sock, mek, m, { from, body, sender }) => {
    const choice = extractOptionFromTexts(extractTexts(body, mek, m)) || (/^[1-2]$/.test(String(body || "").trim()) ? (body.trim() === "1" ? "audio" : "doc") : null);
    if (choice) return handleAudioDownload(sock, mek, from, sender, choice);
  },
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingMediaChoice)) {
    if (now - pendingMediaChoice[key].createdAt > 2 * 60 * 1000) delete pendingMediaChoice[key];
  }
}, 30000);
