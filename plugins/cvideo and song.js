const { cmd } = require("../command");
const ytDlp = require("youtube-dl-exec");
const yts = require("yt-search");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const { sendButtons } = require("gifted-btns");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/* ================= STORAGE ================= */

const STORE_PATH = path.join(__dirname, "csong_targets.json");
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { groups: [] };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8") || '{"groups":[]}');
  } catch {
    return { groups: [] };
  }
}

function writeStore(obj) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
}

function isGroupJid(jid = "") {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

/* ================= CHANNEL CONTEXT ================= */

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363427174988449@newsletter",
      newsletterName: "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁",
      serverMessageId: -1,
    },
  };
}

/* ================= HELPERS ================= */

function getBodyFromMek(mek) {
  const msg = mek?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.listResponseMessage?.title ||
    msg.interactiveResponseMessage?.body?.text ||
    ""
  );
}

function tryParseJsonString(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractTextsFromMek(mek) {
  const msg = mek?.message || {};
  const texts = [];

  const vals = [
    msg.conversation,
    msg.extendedTextMessage?.text,
    msg.imageMessage?.caption,
    msg.videoMessage?.caption,
    msg.buttonsResponseMessage?.selectedButtonId,
    msg.buttonsResponseMessage?.selectedDisplayText,
    msg.templateButtonReplyMessage?.selectedId,
    msg.templateButtonReplyMessage?.selectedDisplayText,
    msg.listResponseMessage?.singleSelectReply?.selectedRowId,
    msg.listResponseMessage?.title,
    msg.interactiveResponseMessage?.body?.text,
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ];

  for (const v of vals) {
    if (v) texts.push(String(v).trim());
  }

  const raw = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (raw) {
    const parsed = tryParseJsonString(raw);
    if (parsed) {
      const pvals = [
        parsed.id,
        parsed.selectedId,
        parsed.selectedRowId,
        parsed.title,
        parsed.display_text,
        parsed.text,
        parsed.name,
      ];
      for (const v of pvals) {
        if (v) texts.push(String(v).trim());
      }
    }
  }

  return [...new Set(texts.filter(Boolean))];
}

function normalizeText(s = "") {
  return String(s).replace(/\s+/g, " ").trim().toUpperCase();
}

function getSenderJid(sock, mek) {
  return mek.key?.fromMe ? sock.user?.id : (mek.key?.participant || mek.key?.remoteJid);
}

function makePendingKey(senderJid, from) {
  return `${from || ""}::${(senderJid || "").split(":")[0]}`;
}

function makeTempFile(ext = ".mp4") {
  const id = crypto.randomBytes(6).toString("hex");
  return path.join(TEMP_DIR, `${Date.now()}_${id}${ext}`);
}

function safeUnlink(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function sanitizeFileName(name = "youtube_media") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_media";
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.includes("v=")
      ? query.split("v=")[1].split("&")[0]
      : query.split("/").pop().split("?")[0];
    const r = await yts({ videoId: id });
    return r?.title ? r : null;
  }
  const search = await yts(query);
  return search.videos?.[0] || null;
}

function generateProgressBar(duration) {
  const totalBars = 10;
  const bar = "─".repeat(totalBars);
  return `*00:00* ${bar}○ *${duration || "0:00"}*`;
}

async function getGroupName(bot, jid) {
  try {
    const meta = await bot.groupMetadata(jid);
    return meta?.subject || jid;
  } catch {
    return jid;
  }
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
        "-vf scale='min(854,iw)':-2"
      ])
      .format("mp4")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

function makePreviewCaption(video, extraLine = "") {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";
  const views = Number(video?.views || 0).toLocaleString();
  const uploaded = video?.ago || "Unknown";
  const progressBar = generateProgressBar(duration);

  return `
🎬 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}
${extraLine ? `\n\n${extraLine}` : ""}
  `.trim();
}

function makeSongCaption(video) {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";
  const views = Number(video?.views || 0).toLocaleString();
  const uploaded = video?.ago || "Unknown";
  const progressBar = generateProgressBar(duration);

  return `
🎵 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}

🍀 *ENJOY YOUR SONG* 🍀
> USE HEADPHONES FOR THE BEST EXPERIENCE 🎧🎧🎧🎧🎧🎧🎧
  `.trim();
}

function makeVideoCaption(video, sizeMB, modeLabel = "Video") {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";
  const views = Number(video?.views || 0).toLocaleString();
  const uploaded = video?.ago || "Unknown";

  return `🎬 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}
📦 *Size:* ${sizeMB.toFixed(2)} MB
📁 *Mode:* ${modeLabel}`;
}

/* ================= DOWNLOAD FUNCTIONS (using yt-dlp) ================= */

async function downloadAudio(videoUrl, outPath) {
  const ytArgs = {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: "0",
    output: outPath,
    noWarnings: true,
    noCheckCertificates: true,
    noPlaylist: true,
    extractorArgs: "youtube:player_client=android,web",
    addHeader: ["referer:youtube.com"],
  };
  await ytDlp(videoUrl, ytArgs);
  return outPath;
}

async function downloadVideo(videoUrl, outPath, quality = 480) {
  const formatStr = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}]/best`;
  const ytArgs = {
    format: formatStr,
    output: outPath,
    ffmpegLocation: ffmpegPath,
    noWarnings: true,
    noCheckCertificates: true,
    noPlaylist: true,
    extractorArgs: "youtube:player_client=android,web",
    addHeader: ["referer:youtube.com"],
  };
  await ytDlp(videoUrl, ytArgs);
  return outPath;
}

/* ================= SENDERS (with context only) ================= */

async function sendAudioToGroup(bot, quoted, target, video) {
  await bot.sendMessage(
    target,
    {
      image: { url: video.thumbnail },
      caption: makeSongCaption(video),
      contextInfo: channelContextInfo(),
    },
    { quoted }
  );

  const audioFile = makeTempFile(".mp3");
  try {
    await downloadAudio(video.url, audioFile);
    if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size === 0) {
      throw new Error("Downloaded audio file is empty.");
    }

    await bot.sendMessage(
      target,
      {
        audio: fs.readFileSync(audioFile),
        mimetype: "audio/mpeg",
        fileName: `${sanitizeFileName(video.title)}.mp3`,
        ptt: false,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );
  } finally {
    safeUnlink(audioFile);
  }
}

async function prepareVideoFile(video) {
  const VIDEO_LIMIT_MB = 45;
  const quality = 480;
  let rawFile = null;
  let fixedFile = null;

  try {
    const stamp = Date.now();
    rawFile = makeTempFile(`_raw_${stamp}.mp4`);
    fixedFile = makeTempFile(`_fixed_${stamp}.mp4`);

    await downloadVideo(video.url, rawFile, quality);
    await reencodeForWhatsApp(rawFile, fixedFile);

    const sizeMB = getFileSizeMB(fixedFile);
    const fileName = `${sanitizeFileName(video.title)}.mp4`;

    return {
      rawFile,
      fixedFile,
      sizeMB,
      fileName,
      asDocument: sizeMB > VIDEO_LIMIT_MB,
    };
  } catch (e) {
    safeUnlink(rawFile);
    safeUnlink(fixedFile);
    throw e;
  }
}

async function sendVideoOnlyToGroup(bot, quoted, target, video) {
  let prepared = null;
  try {
    prepared = await prepareVideoFile(video);

    if (prepared.asDocument) {
      await bot.sendMessage(
        target,
        {
          document: fs.readFileSync(prepared.fixedFile),
          mimetype: "video/mp4",
          fileName: prepared.fileName,
          caption: makeVideoCaption(video, prepared.sizeMB, "Document"),
          contextInfo: channelContextInfo(),
        },
        { quoted }
      );
    } else {
      await bot.sendMessage(
        target,
        {
          video: fs.readFileSync(prepared.fixedFile),
          mimetype: "video/mp4",
          fileName: prepared.fileName,
          caption: makeVideoCaption(video, prepared.sizeMB, "Playable Video"),
          gifPlayback: false,
          contextInfo: channelContextInfo(),
        },
        { quoted }
      );
    }
  } finally {
    safeUnlink(prepared?.rawFile);
    safeUnlink(prepared?.fixedFile);
  }
}

async function sendVideoAndAudioToGroup(bot, quoted, target, video) {
  let prepared = null;
  let audioFile = null;

  try {
    // Video
    prepared = await prepareVideoFile(video);

    if (prepared.asDocument) {
      await bot.sendMessage(
        target,
        {
          document: fs.readFileSync(prepared.fixedFile),
          mimetype: "video/mp4",
          fileName: prepared.fileName,
          caption: makeVideoCaption(video, prepared.sizeMB, "Document"),
          contextInfo: channelContextInfo(),
        },
        { quoted }
      );
    } else {
      await bot.sendMessage(
        target,
        {
          video: fs.readFileSync(prepared.fixedFile),
          mimetype: "video/mp4",
          fileName: prepared.fileName,
          caption: makeVideoCaption(video, prepared.sizeMB, "Playable Video"),
          gifPlayback: false,
          contextInfo: channelContextInfo(),
        },
        { quoted }
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Audio
    audioFile = makeTempFile(".mp3");
    await downloadAudio(video.url, audioFile);

    const audioBuffer = fs.readFileSync(audioFile);

    await bot.sendMessage(
      target,
      {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        fileName: `${sanitizeFileName(video.title)}.mp3`,
        ptt: false,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );
  } finally {
    safeUnlink(prepared?.rawFile);
    safeUnlink(prepared?.fixedFile);
    safeUnlink(audioFile);
  }
}

/* ================= PENDING ================= */

const pending = Object.create(null);
const TTL = 2 * 60 * 1000;

function getModeFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);

  for (const text of normalized) {
    if (
      text.includes("CMODE:AUDIO") ||
      text.includes("SEND AUDIO")
    ) return "audio";

    if (
      text.includes("CMODE:VIDEO_AUDIO") ||
      text.includes("VIDEO & AUDIO") ||
      text.includes("VIDEO AND AUDIO")
    ) return "video_audio";

    if (
      text.includes("CMODE:VIDEO") ||
      text.includes("SEND VIDEO")
    ) return "video";
  }

  return null;
}

function isDuplicateAction(state, sig) {
  const now = Date.now();
  if (state.lastSig === sig && now - (state.lastAt || 0) < 4000) return true;
  state.lastSig = sig;
  state.lastAt = now;
  return false;
}

async function executeSendMode(bot, quoted, from, target, targetName, video, mode) {
  if (mode === "audio") {
    await sendAudioToGroup(bot, quoted, target, video);
    await bot.sendMessage(
      from,
      { 
        text: `✅ Audio sent successfully to *${targetName}*.`,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );
    return;
  }

  if (mode === "video") {
    await sendVideoOnlyToGroup(bot, quoted, target, video);
    await bot.sendMessage(
      from,
      { 
        text: `✅ Video sent successfully to *${targetName}*.`,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );
    return;
  }

  if (mode === "video_audio") {
    await bot.sendMessage(
      from,
      { 
        text: `📦 Sending video and audio to *${targetName}*...`,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );

    await sendVideoAndAudioToGroup(bot, quoted, target, video);

    await bot.sendMessage(
      from,
      { 
        text: `✅ Video and audio sent successfully to *${targetName}*.`,
        contextInfo: channelContextInfo(),
      },
      { quoted }
    );
    return;
  }
}

/* ================= COMMANDS: TARGET GROUP MGMT ================= */

cmd(
  { pattern: "ctarget", react: "🎯", category: "config", filename: __filename },
  async (bot, mek, m, { from, reply }) => {
    try {
      if (!isGroupJid(from)) return reply("Use this command inside a group.");

      const store = readStore();
      if (!store.groups.includes(from)) {
        store.groups.push(from);
        writeStore(store);
      }

      const name = await getGroupName(bot, from);
      return reply(`Saved target group: *${name}*`);
    } catch (e) {
      console.log(e);
      return reply("Error saving target group.");
    }
  }
);

cmd(
  { pattern: "ctargetlist", react: "📋", category: "config", filename: __filename },
  async (bot, mek, m, { reply }) => {
    try {
      const store = readStore();
      if (!store.groups.length) return reply("No target groups saved.");

      const names = await Promise.all(store.groups.map((g) => getGroupName(bot, g)));
      const lines = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
      return reply(`Saved target groups:\n\n${lines}\n\nRemove: .ctargetdel <number>\nClear: .ctargetclear`);
    } catch (e) {
      console.log(e);
      return reply("Error listing target groups.");
    }
  }
);

cmd(
  { pattern: "ctargetdel", alias: ["ctargetremove"], react: "🗑️", category: "config", filename: __filename },
  async (bot, mek, m, { q, reply }) => {
    try {
      const store = readStore();
      if (!store.groups.length) return reply("No target groups saved.");

      const num = parseInt((q || "").trim(), 10);
      if (!num || num < 1 || num > store.groups.length) {
        return reply(`Usage: .ctargetdel <number>\nExample: .ctargetdel 2`);
      }

      const removed = store.groups.splice(num - 1, 1)[0];
      writeStore(store);

      const name = await getGroupName(bot, removed);
      return reply(`Removed target group: *${name}*`);
    } catch (e) {
      console.log(e);
      return reply("Error removing target group.");
    }
  }
);

cmd(
  { pattern: "ctargetclear", react: "🧹", category: "config", filename: __filename },
  async (bot, mek, m, { reply }) => {
    try {
      writeStore({ groups: [] });
      return reply("All target groups cleared.");
    } catch (e) {
      console.log(e);
      return reply("Error clearing target groups.");
    }
  }
);

/* ================= MAIN COMMAND ================= */

cmd(
  { pattern: "csend", alias: ["cmedia"], react: "🎬", category: "download", filename: __filename },
  async (bot, mek, m, { from, q, reply, sender }) => {
    try {
      const store = readStore();
      const groups = store.groups || [];

      if (!groups.length) {
        return reply("No target groups saved. Use .ctarget inside a group first.");
      }

      if (!q) return reply("Please provide a song/video name or YouTube link.");

      await reply("🔎 Searching media...");

      const video = await getYoutube(q);
      if (!video) return reply("No results found.");

      const senderJid = sender || getSenderJid(bot, mek);
      const key = makePendingKey(senderJid, from);

      pending[key] = {
        mode: "choose_send_type",
        video,
        groups,
        from,
        createdAt: Date.now(),
        lastSig: "",
        lastAt: 0,
        isProcessing: false,
      };

      await sendButtons(
        bot,
        from,
        {
          title: "🎯 Choose Send Type",
          text: makePreviewCaption(video),
          footer: "MALIYA-MD | Media Sender",
          image: { url: video.thumbnail },
          contextInfo: channelContextInfo(),
          buttons: [
            { id: "cmode:audio", text: "🎵 Send Audio" },
            { id: "cmode:video", text: "🎬 Send Video" },
            { id: "cmode:video_audio", text: "📦 Send Video & Audio" },
          ],
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("csend command error:", e?.message || e);
      return reply("Error while processing the media.");
    }
  }
);

/* ================= BUTTON / NUMBER HOOK ================= */

global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push({
  onMessage: async (bot, mek) => {
    try {
      const from = mek.key?.remoteJid;
      if (!from || from === "status@broadcast") return;

      const senderJid = getSenderJid(bot, mek);
      if (!senderJid) return;

      const key = makePendingKey(senderJid, from);
      const p = pending[key];
      if (!p) return;

      if (p.from !== from) return;

      if (Date.now() - p.createdAt > TTL) {
        delete pending[key];
        await bot.sendMessage(
          from,
          { 
            text: "Selection expired. Please run .csend again.",
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
        );
        return;
      }

      if (p.isProcessing) return;

      const body = (getBodyFromMek(mek) || "").trim();
      const texts = extractTextsFromMek(mek);
      const mode = getModeFromTexts(texts);

      if (p.mode === "choose_send_type") {
        if (!mode) return;

        if (isDuplicateAction(p, `mode:${mode}`)) return;

        if (p.groups.length === 1) {
          const target = p.groups[0];
          const targetName = await getGroupName(bot, target);

          p.isProcessing = true;
          try {
            delete pending[key];
            await bot.sendMessage(
              from,
              { 
                text: `📤 Sending to *${targetName}*...`,
                contextInfo: channelContextInfo(),
              },
              { quoted: mek }
            );
            await executeSendMode(bot, mek, from, target, targetName, p.video, mode);
          } finally {
            p.isProcessing = false;
          }
          return;
        }

        p.mode = "choose_group";
        p.selectedSendMode = mode;
        p.createdAt = Date.now();

        const names = await Promise.all(p.groups.map((g) => getGroupName(bot, g)));
        const list = names.map((n, i) => `${i + 1}. ${n}`).join("\n");

        await bot.sendMessage(
          from,
          {
            text: `🎯 *Selected:* ${mode === "audio" ? "Send Audio" : mode === "video" ? "Send Video" : "Send Video & Audio"}\n\nReply with target group number:\n\n${list}`,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
        );
        return;
      }

      if (p.mode === "choose_group") {
        if (!/^\d+$/.test(body)) return;

        const num = parseInt(body, 10);
        if (num < 1 || num > p.groups.length) {
          await bot.sendMessage(
            from,
            { 
              text: `Invalid number. Reply 1-${p.groups.length} only.`,
              contextInfo: channelContextInfo(),
            },
            { quoted: mek }
          );
          return;
        }

        if (isDuplicateAction(p, `group:${num}`)) return;

        const target = p.groups[num - 1];
        const targetName = await getGroupName(bot, target);
        const modeToSend = p.selectedSendMode;

        p.isProcessing = true;
        delete pending[key];

        await bot.sendMessage(
          from,
          { 
            text: `📤 Sending to *${targetName}*...`,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
        );

        try {
          await executeSendMode(bot, mek, from, target, targetName, p.video, modeToSend);
        } finally {
          p.isProcessing = false;
        }
      }
    } catch (e) {
      console.log("csend hook error:", e?.message || e);
    }
  },
});
