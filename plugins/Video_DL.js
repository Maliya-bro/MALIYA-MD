const { cmd, replyHandlers } = require("../command");
const ytDlp = require("youtube-dl-exec");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
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

const VIDEO_LIMIT_MB = 45;
const pendingVideoQuality = Object.create(null);

function makeTempFile(ext = ".mp4") {
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

function sanitizeFileName(name = "youtube_video") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_video";
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

function getQualityFromChoice(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "360": case "360p": case "quality:360": return "360";
    case "2": case "480": case "480p": case "quality:480": return "480";
    case "3": case "720": case "720p": case "quality:720": return "720";
    case "4": case "1080": case "1080p": case "quality:1080": return "1080";
    default: return null;
  }
}

function getQualityLabel(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "360": case "360p": case "quality:360": return "360p";
    case "2": case "480": case "480p": case "quality:480": return "480p";
    case "3": case "720": case "720p": case "quality:720": return "720p HD";
    case "4": case "1080": case "1080p": case "quality:1080": return "1080p FHD";
    default: return "Unknown";
  }
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
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text,
  ];
  for (const item of direct) if (item) texts.push(String(item).trim());
  return [...new Set(texts.filter(Boolean))];
}

function extractQualityFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t));
  for (const text of normalized) {
    if (text.includes("QUALITY:360") || text === "360P" || text === "1") return "360";
    if (text.includes("QUALITY:480") || text === "480P" || text === "2") return "480";
    if (text.includes("QUALITY:720") || text === "720P" || text === "3") return "720";
    if (text.includes("QUALITY:1080") || text === "1080P" || text === "4") return "1080";
  }
  return null;
}

// 🔥 Single-Sided Layouts with Small Caps Effect 🔥
function buildVideoDetails(video) {
  const title = toSmallCaps(video.title || "Unknown Title");
  const channel = toSmallCaps(video.author?.name || "Unknown Channel");
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const url = video.url || "Unavailable";

  return `╭─[ 🎥 *${toSmallCaps("VIDEO DETAILS")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${title}\n├ 👤 *${toSmallCaps("Channel:")}* ${channel}\n├ ⏱️ *${toSmallCaps("Duration:")}* ${duration}\n├ 👀 *${toSmallCaps("Views:")}* ${views}\n├ 📅 *${toSmallCaps("Uploaded:")}* ${uploaded}\n├ 🔗 *${toSmallCaps("Link:")}* ${url}\n│\n╰─[ ${generateProgressBar(duration)} ]`;
}

function buildFinalCaption(video, qualityLabel, sizeMB) {
  return `╭─[ ✅ *${toSmallCaps("DOWNLOADED")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${toSmallCaps(video.title || "Unknown Title")}\n├ 🎞️ *${toSmallCaps("Quality:")}* ${toSmallCaps(qualityLabel)}\n├ 📦 *${toSmallCaps("Size:")}* ${sizeMB.toFixed(2)} MB\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
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

async function sendQualityInteractiveMenu(sock, from, mek, video, sessionId) {
  const settings = await readSettings(sessionId);
  if (!!settings.btns_enabled && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(sock, from, {
          image: { url: video.thumbnail },
          text: buildVideoDetails(video),
          footer: "𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 | 𝗬𝗧 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Select Quality ↯",
                sections: [{
                    title: "Video Qualities",
                    rows: [
                      { title: "📹 360p", description: "Fast & smaller size", id: "quality:360" },
                      { title: "📺 480p", description: "Standard quality", id: "quality:480" },
                      { title: "✨ 720p HD", description: "High Definition", id: "quality:720" },
                      { title: "🔥 1080p FHD", description: "Full High Definition", id: "quality:1080" },
                    ],
                }],
              }),
            },
          ],
        }, { quoted: mek }
      );
    } catch (e) { console.log("VIDEO BUTTON ERROR:", e); }
  }
  return sock.sendMessage(from, { image: { url: video.thumbnail }, caption: buildVideoDetails(video) + `\n\n╭─[ 🎥 *${toSmallCaps("VIDEO QUALITY")}* ]\n│\n├ 📱 *[ 01 ]* ➔ 360p\n├ 📱 *[ 02 ]* ➔ 480p\n├ 📱 *[ 03 ]* ➔ 720p HD\n├ 📱 *[ 04 ]* ➔ 1080p FHD\n│\n╰─[ 👇 *${toSmallCaps("Reply with a Number")}* ]`, contextInfo: channelContextInfo() }, { quoted: mek });
}

function isDuplicateQualityAction(state, quality) {
  const now = Date.now();
  const sig = `quality:${quality}`;
  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 5000) return true;
  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function sendErrorMsg(reply, text) {
  await reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`);
}

// 🔥 FALLBACK: Y2MATE (SAVENOW.TO) & OTHER APIs 🔥
async function fallbackAPIs(url, quality, outPath) {
    // 1. Try Y2Mate / Loader.to API
    try {
        const startRes = await axios.get(`https://p.savenow.to/ajax/download.php?format=${quality}&url=${encodeURIComponent(url)}`);
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

    // 2. Try Standard Direct APIs (Default to normal mp4 if quality specific fails)
    const apis = [
        `https://api.deliriussapi.site/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://bk9.fun/download/ytmp4?url=${encodeURIComponent(url)}`
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

async function reencodeForWhatsApp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-movflags +faststart", "-pix_fmt yuv420p", "-profile:v main", "-level 3.1", "-preset fast", "-crf 26", "-vf scale='min(1280,iw)':-2"])
      .format("mp4")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

async function handleVideoQualityDownload(sock, mek, from, sender, reply, choiceRaw) {
  const key = makePendingKey(sender, from);
  const pending = pendingVideoQuality[key];
  if (!pending || pending.isProcessing) return;

  const quality = getQualityFromChoice(choiceRaw);
  const qualityLabel = getQualityLabel(choiceRaw);
  if (!quality || isDuplicateQualityAction(pending, quality)) return;

  pending.isProcessing = true;

  let rawFile = makeTempFile(".mp4");
  let fixedFile = makeTempFile(".mp4");
  let downloadedSuccessfully = false;

  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    // 🔥 ATTEMPT 1: YT-DLP 🔥
    try {
      const formatStr = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}]/best`;
      const ytArgs = {
        format: formatStr,
        output: rawFile,
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
      safeUnlink(rawFile); 
      rawFile = makeTempFile(".mp4");
      
      await fallbackAPIs(pending.video.url, quality, rawFile);
      downloadedSuccessfully = true;
    }

    await sock.sendMessage(from, { react: { text: "🛠", key: mek.key } });
    await reencodeForWhatsApp(rawFile, fixedFile);

    const sizeMB = getFileSizeMB(fixedFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const msgPayload = { mimetype: "video/mp4", fileName: `${cleanTitle}_${quality}p.mp4`, caption: buildFinalCaption(pending.video, qualityLabel, sizeMB), contextInfo: channelContextInfo() };
    if (sizeMB > VIDEO_LIMIT_MB) {
        msgPayload.document = fs.readFileSync(fixedFile);
    } else {
        msgPayload.video = fs.readFileSync(fixedFile);
        msgPayload.gifPlayback = false;
    }

    await sock.sendMessage(from, msgPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (e) {
    const errText = (e && (e.stderr || e.message)) || "Unknown Error";
    console.log("ALL VIDEO DOWNLOAD METHODS FAILED:", errText);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    const cleanErr = String(errText).replace(/\n/g, " ").trim();
    await sendErrorMsg(reply, `Video Download Failed: ${cleanErr.substring(0, 100)}`);
  } finally {
    safeUnlink(rawFile);
    safeUnlink(fixedFile);
    if (pendingVideoQuality[key]) pendingVideoQuality[key].isProcessing = false;
    delete pendingVideoQuality[key];
  }
}

cmd({
  pattern: "video",
  alias: ["ytmp4", "ytv", "vdl"],
  react: "🔍",
  desc: "Download YouTube video with quality selection",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, reply, sessionId }) => {
  try {
    if (!q) return await sendErrorMsg(reply, "Please provide a YouTube link or video name.");

    const video = await getYoutube(q);
    if (!video) return await sendErrorMsg(reply, "No results found.");

    const key = makePendingKey(sender, from);
    pendingVideoQuality[key] = { video, from, createdAt: Date.now(), isProcessing: false, lastActionSig: "", lastActionAt: 0 };

    await sendQualityInteractiveMenu(sock, from, mek, video, sessionId);
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(reply, "Error while preparing video menu.");
  }
});

replyHandlers.push({
  filter: (_body, { sender, from }) => !!pendingVideoQuality[makePendingKey(sender, from)],
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    let quality = extractQualityFromTexts(extractTexts(body, mek, m));
    if (!quality && /^[1-4]$/.test(String(body || "").trim())) quality = getQualityFromChoice(body);
    if (quality) return handleVideoQualityDownload(sock, mek, from, sender, reply, quality);
  },
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingVideoQuality)) {
    if (now - pendingVideoQuality[key].createdAt > 2 * 60 * 1000) delete pendingVideoQuality[key];
  }
}, 30000);
