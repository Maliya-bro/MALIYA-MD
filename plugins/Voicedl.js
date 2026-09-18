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
const { readSettings } = require("../lib/botSettings");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const COOKIES_PATH = path.join(__dirname, "../cookies.txt");
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

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

const pendingAudioType = Object.create(null);

function makeTempFile(ext = ".mp3") { return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`); }
function safeUnlink(file) { try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {} }

function isValidMediaFile(filePath) {
  try { if (!fs.existsSync(filePath)) return false; return fs.statSync(filePath).size > 10240; } 
  catch { return false; }
}

function formatViews(num) { return !num ? "Unknown" : Number(num).toLocaleString(); }
function formatSeconds(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  seconds = Number(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function generateProgressBar(duration = "0:00") { return `▰▰▰▰▰▰▰ *${duration}*`; }
function getFileSizeMB(filePath) { return fs.statSync(filePath).size / (1024 * 1024); }
function sanitizeFileName(name = "youtube_audio") { return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_audio"; }

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => { const idx = normal.indexOf(char); return idx !== -1 ? small[idx] : char; }).join("");
}

function getTypeFromChoice(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "audio": case "type:audio": return "audio";
    case "2": case "ptt": case "voice": case "type:ptt": return "ptt";
    case "3": case "doc": case "document": case "type:doc": return "doc";
    default: return null;
  }
}

function getTypeLabel(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "audio": case "type:audio": return "Audio (Standard)";
    case "2": case "ptt": case "voice": case "type:ptt": return "Voice Note (PTT)";
    case "3": case "doc": case "document": case "type:doc": return "Document (Audio)";
    default: return "Unknown";
  }
}

function normalizeText(s = "") { return String(s).replace(/\r/g, "").replace(/\n+/g, "\n").replace(/\s+/g, " ").trim().toUpperCase(); }
function makePendingKey(sender, from) { return `${from || ""}::${(sender || "").split(":")[0]}`; }

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.templateButtonReplyMessage?.selectedId, m?.message?.interactiveResponseMessage?.body?.text,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId, mek?.message?.templateButtonReplyMessage?.selectedId,
    mek?.message?.interactiveResponseMessage?.body?.text, mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
  ];
  for (const item of direct) {
    if (!item) continue;
    if (typeof item === "string" && item.startsWith("{")) {
      try { const parsed = JSON.parse(item); if (parsed.id) texts.push(String(parsed.id).trim()); } catch {}
    }
    texts.push(String(item).trim());
  }
  return [...new Set(texts.filter(Boolean))];
}

function extractTypeFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t));
  for (const text of normalized) {
    if (text.includes("TYPE:AUDIO") || text === "AUDIO" || text === "1") return "audio";
    if (text.includes("TYPE:PTT") || text === "VOICE" || text === "2") return "ptt";
    if (text.includes("TYPE:DOC") || text === "DOCUMENT" || text === "3") return "doc";
  }
  return null;
}

function buildAudioDetails(video) {
  const title = toSmallCaps(video.title || "Unknown Title");
  const channel = toSmallCaps(video.author?.name || "Unknown Channel");
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const url = video.url || "Unavailable";
  return `╭─[ 🎵 *${toSmallCaps("AUDIO DETAILS")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${title}\n├ 👤 *${toSmallCaps("Channel:")}* ${channel}\n├ ⏱️ *${toSmallCaps("Duration:")}* ${duration}\n├ 👀 *${toSmallCaps("Views:")}* ${views}\n├ 📅 *${toSmallCaps("Uploaded:")}* ${uploaded}\n├ 🔗 *${toSmallCaps("Link:")}* ${url}\n│\n╰─[ ${generateProgressBar(duration)} ]`;
}

function buildFinalCaption(video, typeLabel, sizeMB) {
  return `╭─[ ✅ *${toSmallCaps("DOWNLOADED")}* ]\n│\n├ 🎬 *${toSmallCaps("Title:")}* ${toSmallCaps(video.title || "Unknown Title")}\n├ 🎵 *${toSmallCaps("Format:")}* ${toSmallCaps(typeLabel)}\n├ 📦 *${toSmallCaps("Size:")}* ${sizeMB.toFixed(2)} MB\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
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

async function sendAudioInteractiveMenu(sock, from, mek, video, sessionId) {
  const settings = await readSettings(sessionId);
  
  if (!!settings.btns_enabled) {
    try {
      // ɓuri moƴƴude ko Button mo @vanzxy/baileys
      const { Button } = await import("@vanzxy/baileys");
      const msg = new Button(sock)
          .setImage(video.thumbnail)
          .setBody(buildAudioDetails(video))
          .setFooter("𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 | 𝗬𝗧 𝗠𝗣𝟯 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥")
          .addReply("🎵 Audio Format", "type:audio")
          .addReply("🎙️ Voice Note", "type:ptt")
          .addReply("📄 Send Document", "type:doc");

      await msg.send(from, { quoted: mek });
      return;
    } catch (e) { console.log("AUDIO BUTTON ERROR:", e); }
  }

  return sock.sendMessage(from, { image: { url: video.thumbnail }, caption: buildAudioDetails(video) + `\n\n╭─[ 🎵 *${toSmallCaps("SELECT FORMAT")}* ]\n│\n├ 📱 *[ 01 ]* ➔ 🎵 Audio Format\n├ 📱 *[ 02 ]* ➔ 🎙️ Voice Note (PTT)\n├ 📱 *[ 03 ]* ➔ 📄 Send Document\n│\n╰─[ 👇 *${toSmallCaps("Reply with a Number")}* ]`, contextInfo: channelContextInfo() }, { quoted: mek });
}

function isDuplicateTypeAction(state, type) {
  const now = Date.now();
  const sig = `type:${type}`;
  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 5000) return true;
  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function sendErrorMsg(reply, text) { await reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`); }

async function downloadFromLaguAPI(videoId, outPath) {
  const apiUrl = `https://api.download-lagu-mp3.com/@api/json/mp3/${videoId}`;
  const response = await axios.get(apiUrl, { timeout: 20000 });
  if (response.data && response.data.vidInfo) {
    const bestFormat = response.data.vidInfo["0"] || Object.values(response.data.vidInfo)[0];
    if (bestFormat && bestFormat.dloadUrl) {
      let downloadUrl = bestFormat.dloadUrl.startsWith("//") ? "https:" + bestFormat.dloadUrl : bestFormat.dloadUrl;
      const writer = fs.createWriteStream(outPath);
      const fileRes = await axios({ url: downloadUrl, method: "GET", responseType: "stream", timeout: 120000 });
      fileRes.data.pipe(writer);
      return new Promise((resolve, reject) => { writer.on("finish", () => resolve(true)); writer.on("error", reject); });
    }
  }
  throw new Error("Lagu API returned invalid JSON structure.");
}

async function downloadFromYTmp3GeAPI(url, outPath) {
  const requestData = `youtube_url=${encodeURIComponent(url)}&quality=320`;
  const response = await axios.post("https://ytmp3.ge/api/convert", requestData, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 300000 });
  if (response.data && response.data.success && response.data.downloadUrl) {
    const writer = fs.createWriteStream(outPath);
    const fileRes = await axios({ url: response.data.downloadUrl, method: "GET", responseType: "stream", timeout: 120000 });
    fileRes.data.pipe(writer);
    return new Promise((resolve, reject) => { writer.on("finish", () => resolve(true)); writer.on("error", reject); });
  } else throw new Error(response.data?.error || "YTMP3.GE API returned an invalid response.");
}

async function fallbackAudioAPIs(url, outPath) {
  const apis = [`https://api.deliriussapi.site/download/ytmp3?url=${encodeURIComponent(url)}`, `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(url)}`];
  for (let api of apis) {
    try {
      const res = await axios.get(api, { timeout: 15000 });
      const dlUrl = res.data?.result?.download?.url || res.data?.result?.dl_link || res.data?.dl || res.data?.data?.dl || res.data?.BK9;
      if (dlUrl) {
        const writer = fs.createWriteStream(outPath);
        const fileRes = await axios({ url: dlUrl, method: 'GET', responseType: 'stream', timeout: 120000 });
        fileRes.data.pipe(writer);
        return new Promise((resolve, reject) => { writer.on('finish', () => resolve(true)); writer.on('error', reject); });
      }
    } catch (e) { continue; }
  }
  throw new Error("All Backup APIs Failed");
}

async function convertAudio(inputPath, outputPath, isPtt = false) {
  return new Promise((resolve, reject) => {
    if (!isValidMediaFile(inputPath)) return reject(new Error("Input file is corrupted or empty before conversion."));
    let command = ffmpeg(inputPath);
    if (isPtt) {
      command.audioCodec("libopus").format("ogg").audioBitrate("64k").audioChannels(1).audioFrequency(48000).on("end", () => resolve(outputPath)).on("error", (err) => reject(new Error(`FFmpeg Error (PTT): ${err.message}`))).save(outputPath);
    } else {
      command.audioCodec("libmp3lame").format("mp3").audioBitrate("192k").on("end", () => resolve(outputPath)).on("error", (err) => reject(new Error(`FFmpeg Error (MP3): ${err.message}`))).save(outputPath);
    }
  });
}

async function handleAudioDownload(sock, mek, from, sender, reply, choiceRaw) {
  const key = makePendingKey(sender, from);
  const pending = pendingAudioType[key];
  if (!pending || pending.isProcessing) return;

  const type = getTypeFromChoice(choiceRaw);
  const typeLabel = getTypeLabel(choiceRaw);
  if (!type || isDuplicateTypeAction(pending, type)) return;

  pending.isProcessing = true;
  let rawFile = makeTempFile(".m4a");
  let finalFile = makeTempFile(type === "ptt" ? ".opus" : ".mp3");
  let downloadedSuccessfully = false;
  let videoId = pending.video.videoId;

  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });
    try {
      const ytArgs = { format: "bestaudio[ext=m4a]/bestaudio/best", output: rawFile, ffmpegLocation: ffmpegPath, noWarnings: true, noCheckCertificates: true, noPlaylist: true, extractorArgs: "youtube:player_client=android,web", addHeader: ["referer:youtube.com"] };
      const cookies = cookiesStatus();
      if (cookies.exists && cookies.sizeBytes > 0) ytArgs.cookies = COOKIES_PATH;
      await ytDlp(pending.video.url, ytArgs);
      if (isValidMediaFile(rawFile)) downloadedSuccessfully = true;
      else throw new Error("YT-DLP file is invalid or empty");
    } catch (ytErr) { console.log("YT-DLP AUDIO ERROR:", ytErr.message.substring(0, 100)); }

    if (!downloadedSuccessfully && videoId) {
      try { safeUnlink(rawFile); rawFile = makeTempFile(".mp3"); await downloadFromLaguAPI(videoId, rawFile); if (isValidMediaFile(rawFile)) downloadedSuccessfully = true; else throw new Error("Lagu MP3 file is invalid"); } catch (laguErr) { console.log("LAGU MP3 API ERROR:", laguErr.message); }
    }

    if (!downloadedSuccessfully) {
      try { safeUnlink(rawFile); rawFile = makeTempFile(".mp3"); await downloadFromYTmp3GeAPI(pending.video.url, rawFile); if (isValidMediaFile(rawFile)) downloadedSuccessfully = true; else throw new Error("YTMP3.GE file is invalid"); } catch (ytgeErr) { console.log("YTMP3.GE API ERROR:", ytgeErr.message); }
    }

    if (!downloadedSuccessfully) {
      try { safeUnlink(rawFile); rawFile = makeTempFile(".mp3"); await fallbackAudioAPIs(pending.video.url, rawFile); if (isValidMediaFile(rawFile)) downloadedSuccessfully = true; else throw new Error("Fallback file is invalid"); } catch (fbErr) { console.log("OLD FALLBACK API ERROR:", fbErr.message); }
    }

    if (!downloadedSuccessfully) throw new Error("All download methods failed to provide a valid audio file.");

    await sock.sendMessage(from, { react: { text: "🛠", key: mek.key } });
    await convertAudio(rawFile, finalFile, type === "ptt");

    const sizeMB = getFileSizeMB(finalFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const caption = buildFinalCaption(pending.video, typeLabel, sizeMB);
    const buffer = fs.readFileSync(finalFile);

    if (type === "doc") {
      await sock.sendMessage(from, { document: buffer, mimetype: "audio/mpeg", fileName: `${cleanTitle}.mp3`, caption: caption, contextInfo: channelContextInfo() }, { quoted: mek });
    } else if (type === "ptt") {
      await sock.sendMessage(from, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true, contextInfo: channelContextInfo() }, { quoted: mek });
    } else {
      await sock.sendMessage(from, { audio: buffer, mimetype: "audio/mpeg", contextInfo: channelContextInfo() }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (e) {
    const errText = (e && (e.stderr || e.message)) || "Unknown Error";
    console.log("ALL AUDIO DOWNLOAD METHODS FAILED:", errText);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    const cleanErr = String(errText).replace(/\n/g, " ").trim();
    await sendErrorMsg(reply, `Audio Download Failed: ${cleanErr.substring(0, 100)}`);
  } finally {
    safeUnlink(rawFile); safeUnlink(finalFile);
    if (pendingAudioType[key]) pendingAudioType[key].isProcessing = false;
    delete pendingAudioType[key];
  }
}

cmd({ pattern: "song", alias: ["ytmp3", "yta", "mp3", "play"], react: "🔍", desc: "Download YouTube audio", category: "download", filename: __filename },
  async (sock, mek, m, { from, q, sender, reply, sessionId }) => {
  try {
    if (!q) return await sendErrorMsg(reply, "Please provide a YouTube link or song name.");
    const video = await getYoutube(q);
    if (!video) return await sendErrorMsg(reply, "No results found.");
    const key = makePendingKey(sender, from);
    pendingAudioType[key] = { video, from, createdAt: Date.now(), isProcessing: false, lastActionSig: "", lastActionAt: 0 };
    await sendAudioInteractiveMenu(sock, from, mek, video, sessionId);
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(reply, "Error while preparing audio menu.");
  }
});

replyHandlers.push({
  filter: (_body, { sender, from }) => !!pendingAudioType[makePendingKey(sender, from)],
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    let type = extractTypeFromTexts(extractTexts(body, mek, m));
    if (!type && /^[1-3]$/.test(String(body || "").trim())) type = getTypeFromChoice(body);
    if (type) return handleAudioDownload(sock, mek, from, sender, reply, type);
  },
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingAudioType)) {
    if (now - pendingAudioType[key].createdAt > 2 * 60 * 1000) delete pendingAudioType[key];
  }
}, 30000);
