const { cmd, replyHandlers } = require("../command");
const ytDlp = require("youtube-dl-exec");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
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

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡ𝗟𝗜𝗬𝗔-〽️Ｄ 🍁";

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

const MEDIA_LIMIT_MB = 45;
const pendingMediaChoice = Object.create(null);

function makeTempFile(ext = ".mp3") {
  const id = crypto.randomBytes(6).toString("hex");
  return path.join(TEMP_DIR, `${Date.now()}_${id}${ext}`);
}

function safeUnlink(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

function formatViews(num) {
  if (!num) return "Unknown";
  return Number(num).toLocaleString();
}

function formatSeconds(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  seconds = Number(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function generateProgressBar(duration = "0:00") {
  return `▰▰▰▰▰▰▰ *${duration}*`;
}

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function sanitizeFileName(name = "youtube_download") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_download";
}

function normalizeText(s = "") {
  return String(s)
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.templateButtonReplyMessage?.selectedId,
    m?.message?.templateButtonReplyMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.buttonsResponseMessage?.selectedDisplayText,
    mek?.message?.templateButtonReplyMessage?.selectedId,
    mek?.message?.templateButtonReplyMessage?.selectedDisplayText,
    mek?.message?.listResponseMessage?.title,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ];
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }
  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    const parsed = tryParseJsonString(raw);
    if (!parsed) continue;
    const vals = [parsed.id, parsed.selectedId, parsed.selectedRowId, parsed.title, parsed.display_text, parsed.text, parsed.name];
    for (const v of vals) {
      if (v) texts.push(String(v).trim());
    }
  }
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

// 🔥 Single-Sided Layouts 🔥
function buildSongDetails(video) {
  const title = video.title || "Unknown Title";
  const channel = video.author?.name || "Unknown Channel";
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const url = video.url || "Unavailable";

  return `╭─[ 🎵 *𝗦𝗢𝗡𝗚 𝗗𝗘𝗧𝗔𝗜𝗟𝗦* ]\n│\n├ 🎶 *𝗧𝗶𝘁𝗹𝗲:* ${title}\n├ 👤 *𝗖𝗵𝗮𝗻𝗻𝗲𝗹:* ${channel}\n├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* ${duration}\n├ 👀 *𝗩𝗶𝗲𝘄𝘀:* ${views}\n├ 📅 *𝗨𝗽𝗹𝗼𝗮𝗱𝗲𝗱:* ${uploaded}\n├ 🔗 *𝗟𝗶𝗻𝗸:* ${url}\n│\n╰─[ ${generateProgressBar(duration)} ]`;
}

function buildFinalCaption(video, typeLabel, sizeMB) {
  return `╭─[ ✅ *𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗱𝗘𝗗* ]\n│\n├ 🎵 *𝗧𝗶𝘁𝗹𝗲:* ${video.title || "Unknown Title"}\n├ 🎧 *𝗧𝘆𝗽𝗲:* ${typeLabel}\n├ 📦 *𝗦𝗶𝘇𝗲:* ${sizeMB.toFixed(2)} MB\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);

  if (isUrl) {
    const id = query.includes("v=") ? query.split("v=")[1].split("&")[0] : query.split("/").pop().split("?")[0];
    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

function buildStyledAudioMenu(video) {
  const details = buildSongDetails(video);
  return details + `\n\n╭─[ 🎵 *𝗔𝗨𝗗𝗜𝗢 𝗢𝗣𝗧𝗜𝗢𝗡𝗦* ]\n│\n├ 📱 *[ 01 ]* ➔ 🎶 Audio File (MP3)\n├ 📱 *[ 02 ]* ➔ 📁 Document File\n│\n╰─[ 👇 *Reply with 1 or 2* ]`;
}

async function sendNumberedAudioMenu(sock, from, mek, video) {
  const caption = buildStyledAudioMenu(video);
  return sock.sendMessage(
    from,
    {
      image: { url: video.thumbnail },
      caption: caption,
      contextInfo: channelContextInfo(),
    },
    { quoted: mek }
  );
}

async function sendInteractiveAudioMenu(sock, from, mek, video, sessionId) {
  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(
        sock,
        from,
        {
          image: { url: video.thumbnail },
          text: buildSongDetails(video),
          footer: "𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 | 𝗔𝗨𝗗𝗜𝗢 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Select Format ↯",
                sections: [
                  {
                    title: "Audio Options",
                    rows: [
                      { title: "🎶 Audio File (MP3)", description: "Listen directly in WhatsApp", id: "type:audio" },
                      { title: "📁 Document File", description: "Download as MP3 Document", id: "type:doc" },
                    ],
                  },
                ],
              }),
            },
          ],
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("AUDIO BUTTON ERROR:", e);
    }
  }

  return sendNumberedAudioMenu(sock, from, mek, video);
}

// 🔥 ERROR MSG SENDER WITH REAL ERROR DISPLAY 🔥
async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, { 
    text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
    contextInfo: channelContextInfo()
  }, { quoted: mek });
}

async function handleAudioDownload(sock, mek, from, sender, optionChoice) {
  const key = makePendingKey(sender, from);
  const pending = pendingMediaChoice[key];
  if (!pending) return;

  if (pending.isProcessing) return;
  pending.isProcessing = true;

  let audioFile = null;

  try {
    const isDoc = optionChoice === "doc";

    // ⬇️ Only Reacts for downloading state
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    audioFile = makeTempFile(".mp3");

    // 🔥 NO COOKIES: Clean & Direct Android/Web Client Request 🔥
    const ytArgs = {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: "0",
      output: audioFile,
      noWarnings: true,
      noCheckCertificates: true,
      noPlaylist: true,
      extractorArgs: "youtube:player_client=android,web",
      addHeader: ["referer:youtube.com"],
    };

    await ytDlp(pending.video.url, ytArgs);

    if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) {
      throw new Error("Downloaded file is missing or empty.");
    }

    const sizeMB = getFileSizeMB(audioFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    // ⬆️ React for uploading state
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const msgPayload = {
      mimetype: "audio/mpeg",
      fileName: `${cleanTitle}.mp3`,
      contextInfo: channelContextInfo(),
    };

    if (isDoc || sizeMB > MEDIA_LIMIT_MB) {
      msgPayload.document = fs.readFileSync(audioFile);
      msgPayload.caption = buildFinalCaption(pending.video, "Document MP3", sizeMB);
    } else {
      msgPayload.audio = fs.readFileSync(audioFile);
      msgPayload.caption = buildFinalCaption(pending.video, "Audio MP3", sizeMB);
      msgPayload.ptt = false;
    }

    await sock.sendMessage(from, msgPayload, { quoted: mek });

    // ✅ React for success
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    delete pendingMediaChoice[key];
  } catch (e) {
    // 🔥 මෙතනදී සැබෑ Error එක (yt-dlp stderr හෝ message) අල්ලලා WhatsApp එකට දෙනවා 🔥
    const errText = (e && (e.stderr || e.message)) || "Unknown Error";
    console.log("AUDIO DOWNLOAD ERROR:", errText);

    // ❌ React for error
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });

    // සැබෑ Error එකේ පේළි කීපයක් හෝ මුල් අකුරු 150 WhatsApp එකේ පෙන්නයි
    const cleanErr = String(errText).replace(/\n/g, " ").trim();
    await sendErrorMsg(sock, from, mek, `Audio Download Failed: ${cleanErr.substring(0, 150)}`);

    delete pendingMediaChoice[key];
  } finally {
    safeUnlink(audioFile);
    if (pendingMediaChoice[key]) {
      pendingMediaChoice[key].isProcessing = false;
    }
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

      pendingMediaChoice[key] = {
        video,
        from,
        createdAt: Date.now(),
        isProcessing: false,
      };

      await sendInteractiveAudioMenu(sock, from, mek, video, sessionId);
    } catch (e) {
      console.log("SONG MENU ERROR:", e && e.message);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Error while preparing audio menu.");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makePendingKey(sender, from);
    return !!pendingMediaChoice[key];
  },

  function: async (sock, mek, m, { from, body, sender }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingMediaChoice[key];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = extractOptionFromTexts(texts);

    if (!choice && /^[1-2]$/.test(String(body || "").trim())) {
      choice = body.trim() === "1" ? "audio" : "doc";
    }

    if (!choice) return;

    return handleAudioDownload(sock, mek, from, sender, choice);
  },
});

setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000;
  for (const key of Object.keys(pendingMediaChoice)) {
    if (now - pendingMediaChoice[key].createdAt > timeout) {
      delete pendingMediaChoice[key];
    }
  }
}, 30000);
