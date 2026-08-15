const { cmd, replyHandlers } = require("../command");
const ytDlp = require("yt-dlp-exec");
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
const HAS_COOKIES = fs.existsSync(COOKIES_PATH);

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
  return `00:00 ───🔘──────── ${duration}`;
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

function tryParseJsonString(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

// පරිශීලකයාගේ නවතම Response එකෙන් පමණක් Quality එක Extract කරගැනීමට සකස් කරන ලදී
function extractQualityFromMessage(body, mek, m) {
  const candidates = [];

  if (body) candidates.push(String(body).trim());
  if (m?.body) candidates.push(String(m.body).trim());
  if (m?.text) candidates.push(String(m.text).trim());

  // Interactive Single Select List responses
  const listId = m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (listId) candidates.push(String(listId).trim());

  // Buttons responses
  const btnId = m?.message?.buttonsResponseMessage?.selectedButtonId ||
                mek?.message?.buttonsResponseMessage?.selectedButtonId;
  if (btnId) candidates.push(String(btnId).trim());

  // Native flow responses (Interactive menu)
  const paramsRaw = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
                    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsRaw) {
    const parsed = tryParseJsonString(paramsRaw);
    if (parsed) {
      if (parsed.id) candidates.push(String(parsed.id).trim());
      if (parsed.selectedId) candidates.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) candidates.push(String(parsed.selectedRowId).trim());
    }
  }

  for (const str of candidates) {
    const cleaned = str.toLowerCase();
    if (cleaned === "1" || cleaned === "360" || cleaned === "360p" || cleaned === "quality:360") return "360";
    if (cleaned === "2" || cleaned === "480" || cleaned === "480p" || cleaned === "quality:480") return "480";
    if (cleaned === "3" || cleaned === "720" || cleaned === "720p" || cleaned === "quality:720") return "720";
    if (cleaned === "4" || cleaned === "1080" || cleaned === "1080p" || cleaned === "quality:1080") return "1080";
  }

  return null;
}

function buildVideoDetails(video) {
  const title = video.title || "Unknown Title";
  const channel = video.author?.name || "Unknown Channel";
  const duration = video.timestamp || formatSeconds(video.seconds) || "0:00";
  const views = formatViews(video.views);
  const uploaded = video.ago || "Unknown";

  return `🎥 *${title}*

╔════ VIDEO DETAILS ════╗
  👤 Channel  : ${channel}
  ⏱️ Duration : ${duration}
  👀 Views    : ${views}
  📅 Date     : ${uploaded}
╚════════════════════╝

${generateProgressBar(duration)}`;
}

function buildFinalCaption(video, qualityLabel, sizeMB) {
  return `╔════ VIDEO READY ════╗
  🎥 Title   : ${video.title || "Unknown"}
  👤 Channel : ${video.author?.name || "Unknown"}
  🎞️ Quality : ${qualityLabel}
  ⏱️ Time    : ${video.timestamp || formatSeconds(video.seconds) || "0:00"}
  📦 Size    : ${sizeMB.toFixed(2)} MB
╚═════════════════════╝`;
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

async function downloadVideoWithYtdl(videoUrl, quality, outPath) {
  const formatStr = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;

  await ytDlp(videoUrl, {
    format: formatStr,
    output: outPath,
    ffmpegLocation: ffmpegPath,
    noWarnings: true,
    noCheckCertificates: true,
    noPlaylist: true,
    extractorArgs: "youtube:player_client=android,web",
    ...(HAS_COOKIES ? { cookies: COOKIES_PATH } : {}),
    addHeader: [
      "referer:youtube.com",
    ],
  });

  return outPath;
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

function buildStyledVideoMenu(video) {
  const details = buildVideoDetails(video);
  let msg = `=====================\n`;
  msg += `   🎬 VIDEO DOWNLOADER   \n`;
  msg += `=====================\n\n`;
  msg += details + "\n\n";
  msg += `╔══ SELECT QUALITY ══╗\n`;
  msg += `  [1] 360p (Fast)\n`;
  msg += `  [2] 480p (Standard)\n`;
  msg += `  [3] 720p (HD)\n`;
  msg += `  [4] 1080p (FHD)\n`;
  msg += `╚══════════════════╝\n\n`;
  msg += `📌 *Reply with 1, 2, 3, or 4.*`;
  return msg;
}

async function sendNumberedVideoMenu(sock, from, mek, video) {
  const caption = buildStyledVideoMenu(video);
  return sock.sendMessage(
    from,
    {
      image: { url: video.thumbnail },
      caption: caption,
    },
    { quoted: mek }
  );
}

async function sendQualityInteractiveMenu(sock, from, mek, video) {
  const settings = readSettings();
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(
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
                      { title: "📹 360p", description: "Fast & smaller size", id: "quality:360" },
                      { title: "📺 480p", description: "Better standard quality", id: "quality:480" },
                      { title: "✨ 720p HD", description: "HD quality video", id: "quality:720" },
                      { title: "🔥 1080p FHD", description: "Full HD quality video", id: "quality:1080" },
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
      console.log("VIDEO BUTTON ERROR:", e);
    }
  }

  return sendNumberedVideoMenu(sock, from, mek, video);
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

    rawFile = makeTempFile(".mp4");
    fixedFile = makeTempFile(".mp4");

    await downloadVideoWithYtdl(pending.video.url, quality, rawFile);

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
    console.log("VIDEO QUALITY ERROR:", e && (e.stderr || e.message), e && e.stack);
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
      console.log("VIDEO MENU ERROR:", e && e.message, e && e.stack);
      reply("❌ Error while preparing video menu.");
    }
  }
);

replyHandlers.push({
  filter: (_body, { sender, from }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingVideoQuality[key];
    if (!pending) return false;

    // Menu එක යවා තත්පර 1.5ක් යනතුරු ස්වයංක්‍රීය Trigger වීම වැළැක්වීමට Cooldown එකක්
    if (Date.now() - pending.createdAt < 1500) return false;

    return true;
  },

  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingVideoQuality[key];
    if (!pending || pending.isProcessing) return;

    const quality = extractQualityFromMessage(body, mek, m);
    if (!quality) return;

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
