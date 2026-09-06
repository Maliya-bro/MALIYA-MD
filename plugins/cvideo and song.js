const { cmd, replyHandlers } = require("../command");
const ytDlp = require("youtube-dl-exec");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/* ================= STORAGE ================= */

const STORE_PATH = path.join(__dirname, "csong_targets.json");
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const COOKIES_PATH = path.join(__dirname, "../cookies.txt");

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

/* ================= CONTEXT & HELPERS ================= */

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

function tryParseJsonString(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeText(s = "") {
  return String(s).replace(/\r/g, "").replace(/\n+/g, "\n").replace(/\s+/g, " ").trim().toUpperCase();
}

function getSenderJid(sock, mek) {
  return mek.key?.fromMe ? sock.user?.id : (mek.key?.participant || mek.key?.remoteJid);
}

function makePendingKey(senderJid, from) {
  return `${from || ""}::${(senderJid || "").split(":")[0]}`;
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.includes("v=") ? query.split("v=")[1].split("&")[0] : query.split("/").pop().split("?")[0];
    const r = await yts({ videoId: id });
    return r?.title ? r : null;
  }
  const search = await yts(query);
  return search.videos?.[0] || null;
}

function generateProgressBar(duration) {
  return `▰▰▰▰▰▰▰ *${duration || "0:00"}*`;
}

async function getGroupName(bot, jid) {
  try {
    const meta = await bot.groupMetadata(jid);
    return meta?.subject || jid;
  } catch {
    return jid;
  }
}

function sanitizeFileName(name = "youtube_media") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_media";
}

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
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
        "-preset fast",
        "-crf 26",
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

function safeUnlink(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

// 🔥 Single-Sided Layouts 🔥

function makeTargetBox(title, desc) {
    return `╭─[ 🎯 *${title}* ]\n│\n├ ${desc}\n╰──────────────⮞`;
}

function buildMenuCaption(video) {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";
  
  let msg = `╭─[ 🎯 *𝗖𝗛𝗢𝗢𝗦𝗘 𝗠𝗢𝗗𝗘* ]\n│\n`;
  msg += `├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${title}\n`;
  msg += `├ 👤 *𝗖𝗵𝗮𝗻𝗻𝗲𝗹:* ${channel}\n`;
  msg += `├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* ${duration}\n│\n`;
  msg += `├ 👇 *Reply with a Number:*\n│\n`;
  msg += `├ 📱 *[ 01 ]* 🎵 Send Audio\n`;
  msg += `├ 📱 *[ 02 ]* 🎬 Send Video\n`;
  msg += `├ 📱 *[ 03 ]* 📦 Send Both\n│\n`;
  msg += `╰──────────────⮞`;
  return msg;
}

function buildGroupSelectionCaption(names, mode) {
  let modeText = mode === "audio" ? "Audio" : mode === "video" ? "Video" : "Video & Audio";
  let msg = `╭─[ 🎯 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗚𝗥𝗢𝗨𝗣* ]\n│\n`;
  msg += `├ 📌 *𝗠𝗼𝗱𝗲:* ${modeText}\n│\n`;
  msg += `├ 👇 *Reply with Group Number:*\n│\n`;
  names.forEach((n, i) => {
      msg += `├ 📱 *[ ${String(i + 1).padStart(2, "0")} ]* 👥 ${n}\n`;
  });
  msg += `│\n╰──────────────⮞`;
  return msg;
}

function makeFinalCaption(video, sizeMB, modeLabel) {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";

  return `╭─[ ✅ *𝗠𝗘𝗗𝗜𝗔 𝗦𝗘𝗡𝗧* ]\n│\n├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${title}\n├ 👤 *𝗖𝗵𝗮𝗻𝗻𝗲𝗹:* ${channel}\n├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* ${duration}\n├ 📦 *𝗦𝗶𝘇𝗲:* ${sizeMB.toFixed(2)} MB\n├ 📁 *𝗠𝗼𝗱𝗲:* ${modeLabel}\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
}

// Send Error function
async function sendErrorMsg(sock, from, mek, text) {
    await sock.sendMessage(from, { 
        text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
        contextInfo: channelContextInfo()
    }, { quoted: mek });
}

/* ================= DOWNLOADERS & SENDERS ================= */

async function sendAudioToGroup(bot, target, video, from, originalMek) {
  await bot.sendMessage(from, { react: { text: "⬇️", key: originalMek.key } });

  const audioFile = path.join(TEMP_DIR, `${Date.now()}_${Math.random().toString(16).slice(2)}.mp3`);
  
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

  await ytDlp(video.url, ytArgs);

  if (!fs.existsSync(audioFile)) throw new Error("Audio download failed.");

  await bot.sendMessage(from, { react: { text: "⬆️", key: originalMek.key } });
  const sizeMB = getFileSizeMB(audioFile);

  await bot.sendMessage(target, {
    audio: fs.readFileSync(audioFile),
    mimetype: "audio/mpeg",
    fileName: `${sanitizeFileName(video.title)}.mp3`,
    contextInfo: channelContextInfo(),
  });

  await bot.sendMessage(target, { 
      text: makeFinalCaption(video, sizeMB, "Audio Track"),
      contextInfo: channelContextInfo() 
  });

  safeUnlink(audioFile);
}

async function prepareVideoFile(video, from, originalMek, bot) {
  const VIDEO_LIMIT_MB = 45;
  await bot.sendMessage(from, { react: { text: "⬇️", key: originalMek.key } });

  const stamp = Date.now();
  const rawFile = path.join(TEMP_DIR, `cmedia_raw_${stamp}.mp4`);
  const fixedFile = path.join(TEMP_DIR, `cmedia_fixed_${stamp}.mp4`);

  const cookies = cookiesStatus();
  const formatStr = `bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]/best`;
  
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

  if (cookies.exists && cookies.sizeBytes > 0) {
    ytArgs.cookies = COOKIES_PATH;
  }

  await ytDlp(video.url, ytArgs);

  await bot.sendMessage(from, { react: { text: "🛠", key: originalMek.key } });
  await reencodeForWhatsApp(rawFile, fixedFile);

  const sizeMB = getFileSizeMB(fixedFile);
  const fileName = `${sanitizeFileName(video.title)}.mp4`;

  return { rawFile, fixedFile, sizeMB, fileName, asDocument: sizeMB > VIDEO_LIMIT_MB };
}

async function sendVideoOnlyToGroup(bot, target, video, from, originalMek) {
  let prepared = null;
  try {
    prepared = await prepareVideoFile(video, from, originalMek, bot);
    await bot.sendMessage(from, { react: { text: "⬆️", key: originalMek.key } });

    const msgPayload = {
        mimetype: "video/mp4",
        fileName: prepared.fileName,
        caption: makeFinalCaption(video, prepared.sizeMB, prepared.asDocument ? "Document" : "Video"),
        contextInfo: channelContextInfo()
    };

    if (prepared.asDocument) msgPayload.document = fs.readFileSync(prepared.fixedFile);
    else {
      msgPayload.video = fs.readFileSync(prepared.fixedFile);
      msgPayload.gifPlayback = false;
    }

    await bot.sendMessage(target, msgPayload);
  } finally {
    safeUnlink(prepared?.rawFile);
    safeUnlink(prepared?.fixedFile);
  }
}

async function sendVideoAndAudioToGroup(bot, target, video, from, originalMek) {
  await sendVideoOnlyToGroup(bot, target, video, from, originalMek);
  await sendAudioToGroup(bot, target, video, from, originalMek);
}

/* ================= PENDING STATE ================= */

const pendingCSend = Object.create(null);

function getModeFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);
  for (const text of normalized) {
    if (text.includes("AUDIO") || text === "1") return "audio";
    if (text.includes("VIDEO") || text === "2") return "video";
    if (text.includes("BOTH") || text === "3") return "video_audio";
  }
  return null;
}

async function executeSendMode(bot, from, originalMek, target, video, mode) {
  try {
      if (mode === "audio") {
        await sendAudioToGroup(bot, target, video, from, originalMek);
      } else if (mode === "video") {
        await sendVideoOnlyToGroup(bot, target, video, from, originalMek);
      } else if (mode === "video_audio") {
        await sendVideoAndAudioToGroup(bot, target, video, from, originalMek);
      }
      // ✅ Success React
      await bot.sendMessage(from, { react: { text: "✅", key: originalMek.key } });
  } catch (error) {
      console.log("Send Execution Error:", error);
      const errText = (error && (error.stderr || error.message)) || "";
      await bot.sendMessage(from, { react: { text: "❌", key: originalMek.key } });

      if (isCookiesRelatedError(errText)) {
        await sendErrorMsg(bot, from, originalMek, "Download blocked by YouTube. Export fresh cookies.txt.");
      } else {
        await sendErrorMsg(bot, from, originalMek, "Failed to send media to the target group.");
      }
  }
}

/* ================= COMMANDS ================= */

cmd({ pattern: "ctarget", react: "🎯", category: "config", filename: __filename }, async (bot, mek, m, { from, reply }) => {
  try {
    if (!isGroupJid(from)) return reply(makeTargetBox("𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗖𝗛𝗔𝗧", "📌 _Use this command inside a group._"));
    const store = readStore();
    if (!store.groups.includes(from)) {
      store.groups.push(from);
      writeStore(store);
    }
    const name = await getGroupName(bot, from);
    return reply(makeTargetBox("𝗧𝗔𝗥𝗚𝗘𝗧 𝗦𝗔𝗩𝗘𝗗", `📌 *𝗚𝗿𝗼𝘂𝗽:* ${name}`));
  } catch (e) {
    return reply(makeTargetBox("𝗘𝗥𝗥𝗢𝗥", "🚫 _Error saving target group._"));
  }
});

cmd({ pattern: "ctargetlist", react: "📋", category: "config", filename: __filename }, async (bot, mek, m, { reply }) => {
  try {
    const store = readStore();
    if (!store.groups.length) return reply(makeTargetBox("𝗧𝗔𝗥𝗚𝗘𝗧 𝗟𝗜𝗦𝗧", "📌 _No target groups saved._"));

    const names = await Promise.all(store.groups.map((g) => getGroupName(bot, g)));
    const lines = names.map((n, i) => `├ 📱 *[ ${String(i + 1).padStart(2, "0")} ]* ${n}`).join("\n");
    return reply(`╭─[ 📋 *𝗧𝗔𝗥𝗚𝗘𝗧 𝗟𝗜𝗦𝗧* ]\n│\n${lines}\n│\n├ 🗑️ .ctargetdel <num>\n├ 🧹 .ctargetclear\n╰──────────────⮞`);
  } catch (e) {
    return reply(makeTargetBox("𝗘𝗥𝗥𝗢𝗥", "🚫 _Error listing target groups._"));
  }
});

cmd({ pattern: "ctargetdel", alias: ["ctargetremove"], react: "🗑️", category: "config", filename: __filename }, async (bot, mek, m, { q, reply }) => {
  try {
    const store = readStore();
    if (!store.groups.length) return reply(makeTargetBox("𝗘𝗠𝗣𝗧𝗬", "📌 _No target groups saved._"));

    const num = parseInt((q || "").trim(), 10);
    if (!num || num < 1 || num > store.groups.length) {
      return reply(makeTargetBox("𝗜𝗡𝗩𝗔𝗟𝗜𝗗", "📌 _Usage: .ctargetdel <number>_"));
    }

    const removed = store.groups.splice(num - 1, 1)[0];
    writeStore(store);

    const name = await getGroupName(bot, removed);
    return reply(makeTargetBox("𝗧𝗔𝗥𝗚𝗘𝗧 𝗥𝗘𝗠𝗢𝗩𝗘𝗗", `📌 *𝗚𝗿𝗼𝘂𝗽:* ${name}`));
  } catch (e) {
    return reply(makeTargetBox("𝗘𝗥𝗥𝗢𝗥", "🚫 _Error removing target group._"));
  }
});

cmd({ pattern: "ctargetclear", react: "🧹", category: "config", filename: __filename }, async (bot, mek, m, { reply }) => {
  try {
    writeStore({ groups: [] });
    return reply(makeTargetBox("𝗖𝗟𝗘𝗔𝗥𝗘𝗗", "📌 _All target groups cleared._"));
  } catch (e) {
    return reply(makeTargetBox("𝗘𝗥𝗥𝗢𝗥", "🚫 _Error clearing target groups._"));
  }
});

/* ================= MAIN SENDER COMMAND ================= */

cmd({ pattern: "csend", alias: ["cmedia"], react: "🔍", category: "download", filename: __filename }, async (bot, mek, m, { from, q, sender }) => {
  try {
    const store = readStore();
    const groups = store.groups || [];

    if (!groups.length) {
      await bot.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(bot, from, mek, "No target groups saved. Use .ctarget inside a group first.");
    }
    if (!q) {
      await bot.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(bot, from, mek, "Please provide a song/video name or YouTube link.");
    }

    const video = await getYoutube(q);
    if (!video) {
      await bot.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(bot, from, mek, "No results found.");
    }

    const senderJid = sender || getSenderJid(bot, mek);
    const key = makePendingKey(senderJid, from);

    pendingCSend[key] = {
      mode: "choose_send_type",
      video,
      groups,
      from,
      originalMek: mek, // Save original message to react on it later
      createdAt: Date.now(),
      isProcessing: false,
    };

    // ⏳ React to indicate waiting for input
    await bot.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    await bot.sendMessage(from, {
        image: { url: video.thumbnail },
        caption: buildMenuCaption(video),
        contextInfo: channelContextInfo()
    }, { quoted: mek });

  } catch (e) {
    console.log("csend command error:", e);
    await bot.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(bot, from, mek, "Error while processing the media.");
  }
});

/* ================= REPLY HANDLER ================= */

replyHandlers.push({
    filter: (body, { sender, from }) => {
        const key = makePendingKey(sender, from);
        return !!pendingCSend[key];
    },
    function: async (bot, mek, m, { from, body, sender }) => {
        const key = makePendingKey(sender, from);
        const p = pendingCSend[key];
        if (!p || p.isProcessing) return;

        const input = (body || "").trim();
        
        if (p.mode === "choose_send_type") {
            const mode = getModeFromTexts([input]);
            if (!mode) return; // Ignore invalid inputs

            if (p.groups.length === 1) {
                // 1 Target only -> Start Processing Immediately
                p.isProcessing = true;
                const target = p.groups[0];
                delete pendingCSend[key];

                await executeSendMode(bot, from, p.originalMek, target, p.video, mode);
                return;
            }

            // Multiple Targets -> Ask for Group
            p.mode = "choose_group";
            p.selectedSendMode = mode;
            p.createdAt = Date.now();

            const names = await Promise.all(p.groups.map((g) => getGroupName(bot, g)));
            await bot.sendMessage(from, {
                text: buildGroupSelectionCaption(names, mode),
                contextInfo: channelContextInfo()
            }, { quoted: mek });
            return;
        }

        if (p.mode === "choose_group") {
            if (!/^\d+$/.test(input)) return;

            const num = parseInt(input, 10);
            if (num < 1 || num > p.groups.length) {
                await sendErrorMsg(bot, from, mek, `Invalid number. Reply 1-${p.groups.length} only.`);
                return;
            }

            const target = p.groups[num - 1];
            const modeToSend = p.selectedSendMode;
            
            p.isProcessing = true;
            delete pendingCSend[key];

            await executeSendMode(bot, from, p.originalMek, target, p.video, modeToSend);
        }
    }
});

/* ================= CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingCSend)) {
    if (now - pendingCSend[key].createdAt > 2 * 60 * 1000) {
      delete pendingCSend[key];
    }
  }
}, 30000);
