const { cmd, replyHandlers } = require("../command");
const { ytmp4 } = require("sadaslk-dlcore");
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

const VIDEO_LIMIT_MB = 45;
const pendingVideoQuality = Object.create(null);

function makeTempFile(ext = ".mp4") {
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

function sanitizeFileName(name = "youtube_video") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_video";
}

function getQualityFromChoice(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1":
    case "360":
    case "360p":
    case "quality:360":
      return "360";
    case "2":
    case "480":
    case "480p":
    case "quality:480":
      return "480";
    case "3":
    case "720":
    case "720p":
    case "quality:720":
      return "720";
    case "4":
    case "1080":
    case "1080p":
    case "quality:1080":
      return "1080";
    default:
      return null;
  }
}

function getQualityLabel(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1":
    case "360":
    case "360p":
    case "quality:360":
      return "360p";
    case "2":
    case "480":
    case "480p":
    case "quality:480":
      return "480p";
    case "3":
    case "720":
    case "720p":
    case "quality:720":
      return "720p HD";
    case "4":
    case "1080":
    case "1080p":
    case "quality:1080":
      return "1080p FHD";
    default:
      return "Unknown";
  }
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

function extractQualityFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);

  for (const text of normalized) {
    if (text.includes("QUALITY:360")) return "360";
    if (text.includes("QUALITY:480")) return "480";
    if (text.includes("QUALITY:720")) return "720";
    if (text.includes("QUALITY:1080")) return "1080";

    if (text === "360P" || text.includes("360P")) return "360";
    if (text === "480P" || text.includes("480P")) return "480";
    if (text === "720P" || text.includes("720P")) return "720";
    if (text === "1080P" || text.includes("1080P")) return "1080";

    if (text === "1") return "360";
    if (text === "2") return "480";
    if (text === "3") return "720";
    if (text === "4") return "1080";
  }

  return null;
}

function buildVideoDetails(video) {
  const title = video.title || "Unknown Title";
  const channel = video.author?.name || "Unknown Channel";
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";
  const videoId = video.videoId || "Unknown";
  const url = video.url || "Unavailable";
  const live = video.live ? "Yes" : "No";

  return `🎥 *${title}*

╭━━━〔 📄 VIDEO DETAILS 〕━━━╮
👤 *Channel:* ${channel}
🆔 *Video ID:* ${videoId}
⏱️ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}
📡 *Live:* ${live}
🔗 *Link:* ${url}
╰━━━━━━━━━━━━━━━━━━━━━━━╯

${generateProgressBar(duration)}`;
}

function buildFinalCaption(video, qualityLabel, sizeMB) {
  return `╭━〔 ✅ DOWNLOAD COMPLETE 〕━╮
🎥 *Title:* ${video.title || "Unknown Title"}
👤 *Channel:* ${video.author?.name || "Unknown Channel"}
🎞️ *Quality:* ${qualityLabel}
⏱️ *Duration:* ${video.timestamp || formatSeconds(video.seconds) || "0:00"}
👀 *Views:* ${formatViews(video.views)}
📅 *Uploaded:* ${video.ago || "Unknown"}
📦 *Size:* ${sizeMB.toFixed(2)} MB
╰━━━━━━━━━━━━━━━━━╯`;
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

async function reencodeForWhatsApp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-movflags +faststart",
        "-pix_fmt yuv420p",
        "-profile:v main",
        "-level 3.1",
        "-preset veryfast",
        "-crf 28",
        "-maxrate 1200k",
        "-bufsize 2400k",
        "-vf scale='min(854,iw)':-2",
      ])
      .format("mp4")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

async function sendQualityInteractiveMenu(sock, from, mek, video) {
  return sendInteractiveMessage(
    sock,
    from,
    {
      image: { url: video.thumbnail },
      text: buildVideoDetails(video),
      footer: "MALIYA-MD | Quality Selector",
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Select Quality ↯",
            sections: [
              {
                title: "Video Qualities",
                rows: [
                  {
                    title: "📹 360p",
                    description: "Fast & smaller size",
                    id: "quality:360",
                  },
                  {
                    title: "📺 480p",
                    description: "Better standard quality",
                    id: "quality:480",
                  },
                  {
                    title: "✨ 720p HD",
                    description: "HD quality video",
                    id: "quality:720",
                  },
                  {
                    title: "🔥 1080p FHD",
                    description: "Full HD quality video",
                    id: "quality:1080",
                  },
                ],
              },
            ],
          }),
        },
      ],
    },
    { quoted: mek }
  );
}

function isDuplicateQualityAction(state, quality) {
  const now = Date.now();
  const sig = `quality:${quality}`;

  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 5000) {
    return true;
  }

  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function handleVideoQualityDownload(sock, mek, from, sender, reply, choiceRaw) {
  const key = makePendingKey(sender, from);
  const pending = pendingVideoQuality[key];
  if (!pending) return;

  const quality = getQualityFromChoice(choiceRaw);
  const qualityLabel = getQualityLabel(choiceRaw);

  if (!quality) return;

  if (pending.isProcessing) return;
  if (isDuplicateQualityAction(pending, quality)) return;

  pending.isProcessing = true;

  let rawFile = null;
  let fixedFile = null;

  try {
    await reply(`⬇️ Downloading *${qualityLabel}* video...`);

    const data = await ytmp4(pending.video.url, {
      format: "mp4",
      videoQuality: quality,
    });

    if (!data?.url) {
      delete pendingVideoQuality[key];
      return reply("❌ Failed to download selected quality video.");
    }

    rawFile = makeTempFile(".mp4");
    fixedFile = makeTempFile(".mp4");

    await downloadFile(data.url, rawFile);
    await reply("🛠 Converting video for phone support...");
    await reencodeForWhatsApp(rawFile, fixedFile);

    const sizeMB = getFileSizeMB(fixedFile);
    const cleanTitle = sanitizeFileName(pending.video.title);

    if (sizeMB > VIDEO_LIMIT_MB) {
      await sock.sendMessage(
        from,
        {
          document: fs.readFileSync(fixedFile),
          mimetype: "video/mp4",
          fileName: `${cleanTitle}_${quality}p.mp4`,
          caption: buildFinalCaption(pending.video, qualityLabel, sizeMB),
        },
        { quoted: mek }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          video: fs.readFileSync(fixedFile),
          mimetype: "video/mp4",
          fileName: `${cleanTitle}_${quality}p.mp4`,
          caption: buildFinalCaption(pending.video, qualityLabel, sizeMB),
          gifPlayback: false,
        },
        { quoted: mek }
      );
    }

    delete pendingVideoQuality[key];
  } catch (e) {
    console.log("VIDEO QUALITY ERROR:", e);
    reply("❌ Error while downloading/converting selected quality video.");
    delete pendingVideoQuality[key];
  } finally {
    safeUnlink(rawFile);
    safeUnlink(fixedFile);

    if (pendingVideoQuality[key]) {
      pendingVideoQuality[key].isProcessing = false;
    }
  }
}

cmd(
  {
    pattern: "video",
    alias: ["ytmp4", "ytv", "vdl"],
    react: "🎥",
    desc: "Download YouTube video with quality selection",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, reply }) => {
    try {
      if (!q) return reply("🎬 Please provide a YouTube link or video name.");

      await reply("🔍 Searching Video...");

      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const key = makePendingKey(sender, from);

      pendingVideoQuality[key] = {
        video,
        from,
        createdAt: Date.now(),
        isProcessing: false,
        lastActionSig: "",
        lastActionAt: 0,
      };

      await sendQualityInteractiveMenu(sock, from, mek, video);
    } catch (e) {
      console.log("VIDEO MENU ERROR:", e);
      reply("❌ Error while preparing video menu.");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makePendingKey(sender, from);
    return !!pendingVideoQuality[key];
  },

  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingVideoQuality[key];
    if (!pending) return;
    if (pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let quality = extractQualityFromTexts(texts);

    if (!quality && /^[1-4]$/.test(String(body || "").trim())) {
      quality = getQualityFromChoice(body);
    }

    if (!quality) return; // unrelated message නම් ignore

    return handleVideoQualityDownload(sock, mek, from, sender, reply, quality);
  },
});

setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000;

  for (const key of Object.keys(pendingVideoQuality)) {
    if (now - pendingVideoQuality[key].createdAt > timeout) {
      delete pendingVideoQuality[key];
    }
  }
}, 30000);
