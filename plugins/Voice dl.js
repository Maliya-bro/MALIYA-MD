const { cmd, replyHandlers } = require("../command");
const { ytmp3 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const { sendInteractiveMessage } = require("gifted-btns");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const AUDIO_LIMIT_MB = 45;
const pendingAudioActions = Object.create(null);

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
  return `*00:00* ──────────◉ *${duration}*`;
}

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function sanitizeFileName(name = "youtube_audio") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_audio";
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
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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

function getAudioActionFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);

  for (const text of normalized) {
    if (text.includes("AUDIO:MP3") || text.includes("GET AUDIO")) return "audio";
    if (text.includes("AUDIO:PTT") || text.includes("GET VOICE NOTE")) return "ptt";
    if (text.includes("AUDIO:DOC") || text.includes("GET DOCUMENT")) return "doc";
  }

  return null;
}

function buildAudioDetails(video) {
  const title = video.title || "Unknown Title";
  const channel = video.author?.name || "Unknown Channel";
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const videoId = video.videoId || "Unknown";
  const url = video.url || "Unavailable";

  return `🎵 *${title}*

╭━━━〔 📄 SONG DETAILS 〕━━━╮
👤 *Channel:* ${channel}
🆔 *Video ID:* ${videoId}
⏱️ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}
🔗 *Link:* ${url}
╰━━━━━━━━━━━━━━━╯

${generateProgressBar(duration)}`;
}

function buildFinalAudioCaption(video, mode, sizeMB) {
  const modeLabel =
    mode === "audio" ? "Audio" :
    mode === "ptt" ? "Voice Note" :
    "Document";

  return `╭━〔 ✅ DOWNLOAD COMPLETE 〕━╮
🎵 *Title:* ${video.title || "Unknown Title"}
👤 *Channel:* ${video.author?.name || "Unknown Channel"}
📦 *Type:* ${modeLabel}
⏱️ *Duration:* ${video.timestamp || formatSeconds(video.seconds) || "0:00"}
👀 *Views:* ${formatViews(video.views)}
📅 *Uploaded:* ${video.ago || "Unknown"}
💾 *Size:* ${sizeMB.toFixed(2)} MB
╰━━━━━━━━━━━━━╯`;
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

async function downloadFile(url, outPath) {
  const res = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 180000,
    headers: { "User-Agent": "Mozilla/5.0" },
    maxRedirects: 5,
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath);
    res.data.pipe(writer);
    writer.on("finish", () => resolve(outPath));
    writer.on("error", reject);
  });
}

async function convertToOpusPTT(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libopus")
      .audioBitrate("64k")
      .audioChannels(1)
      .audioFrequency(48000)
      .format("ogg")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

async function sendAudioInteractiveButtons(sock, from, mek, video) {
  return sendInteractiveMessage(
    sock,
    from,
    {
      image: { url: video.thumbnail },
      text: buildAudioDetails(video),
      footer: "MALIYA-MD | Audio Selector",
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🎵 Get Audio",
            id: "audio:mp3",
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🎙️ Get Voice Note",
            id: "audio:ptt",
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📄 Get Document",
            id: "audio:doc",
          }),
        },
      ],
    },
    { quoted: mek }
  );
}

function isDuplicateAction(state, action) {
  const now = Date.now();
  const sig = `audio:${action}`;

  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 5000) {
    return true;
  }

  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function handleAudioAction(sock, mek, from, sender, reply, actionRaw) {
  const key = makePendingKey(sender, from);
  const pending = pendingAudioActions[key];
  if (!pending) return;

  const action =
    actionRaw === "audio" || actionRaw === "ptt" || actionRaw === "doc"
      ? actionRaw
      : null;

  if (!action) return;
  if (pending.isProcessing) return;
  if (isDuplicateAction(pending, action)) return;

  pending.isProcessing = true;

  let rawMp3 = null;
  let pttFile = null;

  try {
    const actionLabel =
      action === "audio" ? "audio" :
      action === "ptt" ? "voice note" :
      "document";

    await reply(`⬇️ Downloading *${actionLabel}*...`);

    const data = await ytmp3(pending.video.url);

    if (!data?.url) {
      delete pendingAudioActions[key];
      return reply("❌ Failed to download audio.");
    }

    rawMp3 = makeTempFile(".mp3");
    await downloadFile(data.url, rawMp3);

    const sizeMB = getFileSizeMB(rawMp3);
    const cleanTitle = sanitizeFileName(pending.video.title);

    if (sizeMB > AUDIO_LIMIT_MB && action !== "doc") {
      await sock.sendMessage(
        from,
        {
          document: fs.readFileSync(rawMp3),
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          caption: buildFinalAudioCaption(pending.video, "doc", sizeMB),
        },
        { quoted: mek }
      );

      delete pendingAudioActions[key];
      return;
    }

    if (action === "audio") {
      await sock.sendMessage(
        from,
        {
          audio: fs.readFileSync(rawMp3),
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
        },
        { quoted: mek }
      );

      await reply(buildFinalAudioCaption(pending.video, "audio", sizeMB));
    }

    if (action === "ptt") {
      pttFile = makeTempFile(".ogg");
      await reply("🎙️ Converting to voice note...");
      await convertToOpusPTT(rawMp3, pttFile);

      await sock.sendMessage(
        from,
        {
          audio: fs.readFileSync(pttFile),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        },
        { quoted: mek }
      );

      await reply(buildFinalAudioCaption(pending.video, "ptt", sizeMB));
    }

    if (action === "doc") {
      await sock.sendMessage(
        from,
        {
          document: fs.readFileSync(rawMp3),
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          caption: buildFinalAudioCaption(pending.video, "doc", sizeMB),
        },
        { quoted: mek }
      );
    }

    delete pendingAudioActions[key];
  } catch (e) {
    console.log("AUDIO ACTION ERROR:", e);
    reply("❌ Error while downloading/sending audio.");
    delete pendingAudioActions[key];
  } finally {
    safeUnlink(rawMp3);
    safeUnlink(pttFile);

    if (pendingAudioActions[key]) {
      pendingAudioActions[key].isProcessing = false;
    }
  }
}

cmd(
  {
    pattern: "audio",
    alias: ["ytmp3", "song", "play", "adl"],
    react: "🎵",
    desc: "Download YouTube audio with 3 direct buttons",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, reply }) => {
    try {
      if (!q) return reply("🎵 Please provide a YouTube link or song name.");

      await reply("🔍 Searching Audio...");

      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const key = makePendingKey(sender, from);

      pendingAudioActions[key] = {
        video,
        from,
        createdAt: Date.now(),
        isProcessing: false,
        lastActionSig: "",
        lastActionAt: 0,
      };

      await sendAudioInteractiveButtons(sock, from, mek, video);
    } catch (e) {
      console.log("AUDIO MENU ERROR:", e);
      reply("❌ Error while preparing audio buttons.");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makePendingKey(sender, from);
    return !!pendingAudioActions[key];
  },

  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingAudioActions[key];
    if (!pending) return;
    if (pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    const action = getAudioActionFromTexts(texts);

    if (!action) return;

    return handleAudioAction(sock, mek, from, sender, reply, action);
  },
});

setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000;

  for (const key of Object.keys(pendingAudioActions)) {
    if (now - pendingAudioActions[key].createdAt > timeout) {
      delete pendingAudioActions[key];
    }
  }
}, 30000);
