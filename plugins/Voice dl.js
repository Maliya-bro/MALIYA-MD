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
  if (!fs.existsSync(COOKIES_PATH)) {
    return { exists: false, sizeBytes: 0 };
  }
  try {
    const stat = fs.statSync(COOKIES_PATH);
    return { exists: true, sizeBytes: stat.size };
  } catch {
    return { exists: false, sizeBytes: 0 };
  }
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
    body,
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.templateButtonReplyMessage?.selectedId,
    m?.message?.templateButtonReplyMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
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
    const vals = [
      parsed.id,
      parsed.selectedId,
      parsed.selectedRowId,
      parsed.title,
      parsed.display_text,
      parsed.text,
      parsed.name,
    ];
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

function buildSongDetails(video) {
  const title = video.title || "Unknown Title";
  const channel = video.author?.name || "Unknown Channel";
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const videoId = video.videoId || "Unknown";
  const url = video.url || "Unavailable";

  return `┌─❮ 🎵 *𝐒𝐎𝐍𝐆 𝐃𝐄𝐓𝐀𝐈𝐋𝐒* ❯─
│
├─► 🎶 *ᴛɪᴛʟᴇ:* ${title}
├─► 👤 *ᴄʜᴀɴɴᴇʟ:* ${channel}
├─► 🆔 *ᴠɪᴅᴇᴏ ɪᴅ:* ${videoId}
├─► ⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${duration}
├─► 👀 *ᴠɪᴇᴡs:* ${views}
├─► 📅 *ᴜᴘʟᴏᴀᴅᴇᴅ:* ${uploaded}
├─► 🔗 *ʟɪɴᴋ:* ${url}
│
└─❮ ${generateProgressBar(duration)} ❯─`;
}

function buildFinalCaption(video, typeLabel, sizeMB) {
  return `┌─❮ ✅ *𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐂𝐎𝐌𝐏𝐋𝐄𝐓𝐄* ❯─
│
├─► 🎵 *ᴛɪᴛʟᴇ:* ${video.title || "Unknown Title"}
├─► 👤 *ᴄʜᴀɴɴᴇʟ:* ${video.author?.name || "Unknown Channel"}
├─► 🎧 *ᴛʏᴘᴇ:* ${typeLabel}
├─► ⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${video.timestamp || formatSeconds(video.seconds) || "0:00"}
├─► 👀 *ᴠɪᴇᴡs:* ${formatViews(video.views)}
├─► 📦 *sɪᴢᴇ:* ${sizeMB.toFixed(2)} MB
│
└─❮ 💾 *MALIYA-〽️D* ❯─`;
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);

  if (isUrl) {
    const id = query.includes("v=")
      ? query.split("v=")[1].split("&")[0]
      : query.split("/").pop().split("?")[0];
    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

function buildStyledAudioMenu(video) {
  const details = buildSongDetails(video);
  return details + `

┌─❮ 🎵 *𝐀𝐔𝐃𝐈𝐎 𝐎𝐏𝐓𝐈𝐎𝐍𝐒* ❯─
│
├─► *[ 01 ]* ➔ 🎶 Audio File (MP3)
├─► *[ 02 ]* ➔ 📁 Document File
│
└─❮ 💬 *ʀᴇᴘʟʏ ᴡɪᴛʜ 1 ᴏʀ 2* ❯─`;
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
  // ✅ FIX: readSettings with sessionId
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
          footer: "𝐌𝐀𝐋𝐈𝐘𝐀-𝐌𝐃 | 𝐀𝐔𝐃𝐈𝐎 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑",
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

function isCookiesRelatedError(errText = "") {
  const t = String(errText).toLowerCase();
  return (
    t.includes("sign in to confirm") ||
    t.includes("not a bot") ||
    t.includes("cookies") ||
    t.includes("login required") ||
    (t.includes("private video") && t.includes("sign in"))
  );
}

async function handleAudioDownload(sock, mek, from, sender, reply, optionChoice) {
  const key = makePendingKey(sender, from);
  const pending = pendingMediaChoice[key];
  if (!pending) return;

  if (pending.isProcessing) return;
  pending.isProcessing = true;

  let audioFile = null;

  try {
    const isDoc = optionChoice === "doc";
    const label = isDoc ? "Document" : "Audio";

    await reply(`⬇️ *ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ* ${label}...`);

    audioFile = makeTempFile(".mp3");

    const cookies = cookiesStatus();
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

    if (cookies.exists && cookies.sizeBytes > 0) {
      ytArgs.cookies = COOKIES_PATH;
    }

    await ytDlp(pending.video.url, ytArgs);

    if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) {
      throw new Error("Downloaded file is missing or empty.");
    }

    const sizeMB = getFileSizeMB(audioFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    if (isDoc || sizeMB > MEDIA_LIMIT_MB) {
      await sock.sendMessage(
        from,
        {
          document: fs.readFileSync(audioFile),
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          caption: buildFinalCaption(pending.video, "Document MP3", sizeMB),
        },
        { quoted: mek }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          audio: fs.readFileSync(audioFile),
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          caption: buildFinalCaption(pending.video, "Audio MP3", sizeMB),
          ptt: false,
        },
        { quoted: mek }
      );
    }

    delete pendingMediaChoice[key];
  } catch (e) {
    const errText = (e && (e.stderr || e.message)) || "";
    console.log("AUDIO DOWNLOAD ERROR:", errText);

    if (isCookiesRelatedError(errText)) {
      const cookies = cookiesStatus();
      if (!cookies.exists) {
        reply("❌ *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ — ᴄᴏᴏᴋɪᴇs ᴍɪssɪɴɢ.*\n\nYouTube is blocking this download with a bot-check.\nExport a fresh `cookies.txt` from a logged-in YouTube session and place it in the bot's root folder.");
      } else if (cookies.sizeBytes === 0) {
        reply("❌ *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ — ᴄᴏᴏᴋɪᴇs.ᴛxᴛ ɪs ᴇᴍᴘᴛʏ.*\n\nRe-export cookies.txt from a logged-in YouTube session (make sure you're actually signed in when exporting).");
      } else {
        reply("❌ *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ — ᴄᴏᴏᴋɪᴇs ᴇxᴘɪʀᴇᴅ ᴏʀ ɪɴᴠᴀʟɪᴅ.*\n\nYour saved cookies.txt is no longer valid. Export a fresh one from a logged-in YouTube session and replace the old file.");
      }
    } else {
      reply("❌ *ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ/sᴇɴᴅɪɴɢ ᴀᴜᴅɪᴏ.*");
    }

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
    react: "🎵",
    desc: "Download YouTube audio with options",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, reply, sessionId }) => {
    try {
      if (!q) return reply("🎵 *ᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ sᴏɴɢ ɴᴀᴍᴇ ᴏʀ ʏᴏᴜᴛᴜʙᴇ ʟɪɴᴋ.*");

      await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴀᴜᴅɪᴏ...*");

      const video = await getYoutube(q);
      if (!video) return reply("❌ *ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ.*");

      const key = makePendingKey(sender, from);

      pendingMediaChoice[key] = {
        video,
        from,
        createdAt: Date.now(),
        isProcessing: false,
      };

      // ✅ FIX: pass sessionId
      await sendInteractiveAudioMenu(sock, from, mek, video, sessionId);
    } catch (e) {
      console.log("SONG MENU ERROR:", e && e.message);
      reply("❌ *ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴘʀᴇᴘᴀʀɪɴɢ ᴀᴜᴅɪᴏ ᴍᴇɴᴜ.*");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makePendingKey(sender, from);
    return !!pendingMediaChoice[key];
  },

  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingMediaChoice[key];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = extractOptionFromTexts(texts);

    if (!choice && /^[1-2]$/.test(String(body || "").trim())) {
      choice = body.trim() === "1" ? "audio" : "doc";
    }

    if (!choice) return;

    return handleAudioDownload(sock, mek, from, sender, reply, choice);
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
