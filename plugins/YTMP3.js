const { cmd, replyHandlers } = require("../command");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const sharp = require("sharp");
const { readSettings } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

// SaveTube AES-128-CBC Key
const SAVETUBE_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");

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

const pendingSongSearch = Object.create(null);
const pendingAudioType = Object.create(null);

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
function sanitizeFileName(name = "youtube_audio") { return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_audio"; }

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => { const idx = normal.indexOf(char); return idx !== -1 ? small[idx] : char; }).join("");
}

function getTypeFromChoice(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "audio": return "audio";
    case "2": case "doc": case "document": return "doc";
    default: return null;
  }
}

function getTypeLabel(choice) {
  switch (String(choice).trim().toLowerCase()) {
    case "1": case "audio": return "Audio (Standard)";
    case "2": case "doc": case "document": return "Document (Audio)";
    default: return "Unknown";
  }
}

function normalizeText(s = "") { return String(s).replace(/\r/g, "").replace(/\n+/g, "\n").replace(/\s+/g, " ").trim().toUpperCase(); }
function keyFor(sender, from) { return `${from || ""}`; }

function getQuotedId(m, mek) {
  return (
    m?.quoted?.id ||
    m?.quoted?.key?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    m?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    const inputBuf = Buffer.from(res.data);
    return await sharp(inputBuf)
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 },
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return url;
  }
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.buttonsResponseMessage?.selectedDisplayText,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text
  ];
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id) texts.push(String(parsed.id).trim());
      if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
      if (parsed.title) texts.push(String(parsed.title).trim());
      if (parsed.name) texts.push(String(parsed.name).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

function extractTypeFromTexts(texts) {
  const normalized = texts.map((t) => normalizeText(t));
  for (const text of normalized) {
    if (text === "AUDIO" || text.includes("AUDIO") || text === "1") return "audio";
    if (text === "DOC" || text.includes("DOC") || text.includes("DOCUMENT") || text === "2") return "doc";
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
  return `╭─[ 🎵 *${toSmallCaps("AUDIO DETAILS")}* ]\n│\n├ 🎬 *\`Title:\`* ${title}\n├ 👤 *\`Channel:\`* ${channel}\n├ ⏱️ *\`Duration:\`* ${duration}\n├ 👀 *\`Views:\`* ${views}\n├ 📅 *\`Uploaded:\`* ${uploaded}\n├ 🔗 *\`Link:\`* ${url}\n│\n╰─[ ${generateProgressBar(duration)} ]`;
}

function buildFinalCaption(video, typeLabel) {
  return `╭─[ ✅ *${toSmallCaps("DOWNLOADED")}* ]\n│\n├ 🎬 *\`Title:\`* ${toSmallCaps(video.title || "Unknown Title")}\n├ 🎵 *\`Format:\`* ${toSmallCaps(typeLabel)}\n│\n╰──────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
}

/* ================= STYLED SEARCH RESULTS TEXT ================= */
function buildSearchMenuText(videos, query) {
  let txt = `┏━━━━━◥◣◆◢◤━━━━━┓\n  ★彡 *${toSmallCaps("YOUTUBE SEARCH")}* 彡★\n┗━━━━━◢◤◆◥◣━━━━━┛\n\n`;
  txt += `🔍 *\`Query:\`* _${query}_\n`;
  txt += `📦 *\`Total Results:\`* ${videos.length} Tracks\n\n`;
  txt += `╔═════. .★.════════╗\n`;

  videos.forEach((vid, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const dur = vid.timestamp || formatSeconds(vid.seconds) || "0:00";
    const author = vid.author?.name || "Unknown Channel";
    const title = vid.title.length > 38 ? `${vid.title.substring(0, 35)}...` : vid.title;

    txt += `*[ ${num} ]* 🎵 *${title}*\n`;
    txt += `     ├ ⏱️ *\`Duration:\`* _${dur}_\n`;
    txt += `     ╰ 👤 *\`Channel:\`* _${author}_\n\n`;
  });

  txt += `╚════════. .★.═════╝\n\n`;
  txt += `━─ ⋆ ⋅ 𖤐 ⋅ ⋆ ─━┈➤\n`;
  txt += `> 💬 *Swipe & Reply this message with a number (01-10)...*\n`;
  txt += `> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;
  return txt;
}

/* ================= 1. SEARCH RESULTS MENU ================= */
async function sendSongSearchResultsMenu(sock, from, mek, videos, query, sessionId) {
  let btnsOn = true;
  try {
    const settings = await readSettings(sessionId);
    if (settings && typeof settings.btns_enabled !== "undefined") {
      btnsOn = !!settings.btns_enabled;
    }
  } catch (e) {}

  const topThumb = videos[0]?.thumbnail || "";
  const headerText = `┏━━━━━◥◣◆◢◤━━━━━┓\n  ★彡 *${toSmallCaps("YOUTUBE SEARCH")}* 彡★\n┗━━━━━◢◤◆◥◣━━━━━┛\n\n🔍 *\`Query:\`* _${query}_\n🎵 *\`Found:\`* ${videos.length} tracks\n\n👇 *Select a song from the list or tap 1st:*`;

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const fittedThumb = topThumb ? await getFittedImageBuffer(topThumb) : null;

      const listRows = videos.map((vid, idx) => ({
        title: `${idx + 1}. ${vid.title.substring(0, 30)}`,
        description: `⏱️ ${vid.timestamp || formatSeconds(vid.seconds)} | 👤 ${vid.author?.name || "Unknown"}`,
        id: `.songselect ${idx + 1}`
      }));

      const btn = new ButtonV2(sock)
        .setBody(headerText)
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM");

      if (fittedThumb) btn.setThumbnail(fittedThumb);

      btn.addRawButton({
        buttonId: ".songselect 1",
        buttonText: { displayText: "📂List Song" },
        type: 1,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "Select Song",
            sections: [
              {
                title: "YouTube Tracks",
                rows: listRows
              }
            ]
          })
        }
      });

      btn.addButton("⚡GET MP3", ".songselect 1");

      const sentMsg = await btn.send(from, { 
        quoted: mek,
        ...channelContextInfo()
      });

      if (sentMsg?.key?.id) return sentMsg;
    } catch (err) {
      console.log("BUTTONV2 SEARCH ERROR:", err?.message || err);
    }
  }

  return await sock.sendMessage(
    from,
    {
      image: topThumb ? { url: topThumb } : undefined,
      caption: buildSearchMenuText(videos, query),
      contextInfo: channelContextInfo()
    },
    { quoted: mek }
  );
}

/* ================= 2. AUDIO / DOC FORMAT MENU ================= */
async function sendAudioInteractiveMenu(sock, from, mek, video, sessionId) {
  let btnsOn = true;
  try {
    const settings = await readSettings(sessionId);
    if (settings && typeof settings.btns_enabled !== "undefined") {
      btnsOn = !!settings.btns_enabled;
    }
  } catch (e) {}

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const fittedThumb = video.thumbnail ? await getFittedImageBuffer(video.thumbnail) : null;

      const btn = new ButtonV2(sock)
        .setBody(buildAudioDetails(video) + `\n\n👇 *Tap a button below to download:*`)
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM");

      if (fittedThumb) btn.setThumbnail(fittedThumb);

      btn.addButton("🎵 Audio", "audio")
         .addButton("📄 Doc", "doc");

      const sentMsg = await btn.send(from, { 
        quoted: mek,
        ...channelContextInfo()
      });

      if (sentMsg?.key?.id) return sentMsg;
    } catch (err) {
      console.log("BUTTONV2 AUDIO ERROR:", err?.message || err);
    }
  }

  return sock.sendMessage(
    from,
    {
      image: { url: video.thumbnail },
      caption: buildAudioDetails(video) + `\n\n╭─[ 🎵 *${toSmallCaps("SELECT FORMAT")}* ]\n│\n├ 📱 *\`[ 01 ]\`* ➔ 🎵 Audio Format (MP3)\n├ 📱 *\`[ 02 ]\`* ➔ 📄 Send Document (MP3)\n│\n╰─[ 👇 *${toSmallCaps("Reply with a Number")}* ]`,
      contextInfo: channelContextInfo()
    },
    { quoted: mek }
  );
}

function isDuplicateTypeAction(state, type) {
  const now = Date.now();
  const sig = `type:${type}`;
  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 5000) return true;
  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function sendErrorMsg(reply, text) { 
  await reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`); 
}

/* ================= SAVETUBE VIP ENGINE (AES-128-CBC) ================= */
function decryptPayload(encryptedData) {
  try {
    const rawBuffer = Buffer.from(encryptedData.replace(/\s/g, ""), "base64");
    const iv = rawBuffer.subarray(0, 16);
    const data = rawBuffer.subarray(16);

    const decipher = crypto.createDecipheriv("aes-128-cbc", SAVETUBE_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    return JSON.parse(decrypted.toString("utf-8"));
  } catch (err) {
    throw new Error("Payload decryption failed: " + err.message);
  }
}

async function fetchSaveTubeAudioUrl(videoUrl) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    "Origin": "https://ytshortdown.com",
    "Referer": "https://ytshortdown.com/"
  };

  const cdnRes = await axios.get("https://media.savetube.vip/api/random-cdn", { headers, timeout: 15000 });
  const cdnHost = cdnRes.data?.cdn;
  if (!cdnHost) throw new Error("Could not obtain an active CDN host");

  const infoRes = await axios.post(`https://${cdnHost}/v2/info`, { url: videoUrl }, { headers, timeout: 20000 });
  if (!infoRes.data?.status || !infoRes.data?.data) throw new Error("Failed to retrieve encrypted video information");

  const decrypted = decryptPayload(infoRes.data.data);
  const videoId = decrypted.id;
  const downloadKey = decrypted.key;

  const dlRes = await axios.post(
    `https://${cdnHost}/download`,
    {
      id: videoId,
      key: downloadKey,
      downloadType: "audio",
      quality: "128"
    },
    { headers, timeout: 20000 }
  );

  if (dlRes.data?.status && dlRes.data?.data?.downloadUrl) {
    return dlRes.data.data.downloadUrl;
  }
  throw new Error("SaveTube failed to generate direct audio stream URL");
}

/* ================= MAIN DOWNLOAD PROCESSOR (STREAMING TO WHATSAPP) ================= */
async function handleAudioDownload(sock, mek, from, sender, reply, choiceRaw) {
  const key = keyFor(sender, from);
  const pending = pendingAudioType[key];
  if (!pending || pending.isProcessing) return;

  const type = getTypeFromChoice(choiceRaw);
  const typeLabel = getTypeLabel(choiceRaw);
  if (!type || isDuplicateTypeAction(pending, type)) return;

  pending.isProcessing = true;

  try {
    await sock.sendMessage(from, { react: { text: "⬇", key: mek.key } });

    // SaveTube VIP Direct CDN Link එක ලබාගැනීම
    const directAudioUrl = await fetchSaveTubeAudioUrl(pending.video.url);

    await sock.sendMessage(from, { react: { text: "⬆", key: mek.key } });

    const cleanTitle = sanitizeFileName(pending.video.title);
    const caption = buildFinalCaption(pending.video, typeLabel);

    // Direct Stream to WhatsApp (Server storage එකට save නොවේ)
    if (type === "doc") {
      await sock.sendMessage(
        from,
        {
          document: { url: directAudioUrl },
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          caption: caption,
          contextInfo: channelContextInfo()
        },
        { quoted: mek }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          audio: { url: directAudioUrl },
          mimetype: "audio/mpeg",
          fileName: `${cleanTitle}.mp3`,
          contextInfo: channelContextInfo()
        },
        { quoted: mek }
      );
    }

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (e) {
    const errText = (e && (e.stderr || e.message)) || "Unknown Error";
    console.log("SAVETUBE AUDIO DOWNLOAD FAILED:", errText);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    const cleanErr = String(errText).replace(/\n/g, " ").trim();
    await sendErrorMsg(reply, `Audio Download Failed: ${cleanErr.substring(0, 100)}`);
  } finally {
    if (pendingAudioType[key]) pendingAudioType[key].isProcessing = false;
    delete pendingAudioType[key];
  }
}

/* ================= OPEN FORMAT SELECTION ================= */
async function promptAudioFormat(sock, from, mek, sender, video, sessionId) {
  const key = keyFor(sender, from);
  const audioState = {
    video,
    from,
    createdAt: Date.now(),
    isProcessing: false,
    lastActionSig: "",
    lastActionAt: 0,
    expectedMsgId: null
  };

  const sentFormatMsg = await sendAudioInteractiveMenu(sock, from, mek, video, sessionId);
  if (sentFormatMsg?.key?.id) {
    audioState.expectedMsgId = sentFormatMsg.key.id;
  }
  pendingAudioType[key] = audioState;
}

/* ================= COMMAND: .song ================= */
cmd({ 
  pattern: "song",
  alias: ["ytmp3", "yta", "mp3", "play"],
  react: "🎵",
  desc: "Search and download YouTube audio",
  category: "download",
  filename: __filename 
}, async (sock, mek, m, { from, q, sender, reply, sessionId }) => {
  try {
    if (!q) return await sendErrorMsg(reply, "Please provide a YouTube link or song name.");
    
    const key = keyFor(sender, from);
    const isUrl = /(youtube\.com|youtu\.be)/i.test(q);

    if (isUrl) {
      const id = q.includes("v=") ? q.split("v=")[1].split("&")[0] : q.split("/").pop().split("?")[0];
      const video = await yts({ videoId: id });
      if (!video) return await sendErrorMsg(reply, "Song details not found for this URL.");
      return await promptAudioFormat(sock, from, mek, sender, video, sessionId);
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });
    const search = await yts(q);
    if (!search?.videos?.length) return await sendErrorMsg(reply, "No song results found.");

    const top10 = search.videos.slice(0, 10);
    const searchState = {
      videos: top10,
      query: q,
      from,
      sender,
      sessionId,
      createdAt: Date.now(),
      expectedMsgId: null
    };

    const sentSearchMsg = await sendSongSearchResultsMenu(sock, from, mek, top10, q, sessionId);
    if (sentSearchMsg?.key?.id) {
      searchState.expectedMsgId = sentSearchMsg.key.id;
    }
    pendingSongSearch[key] = searchState;
  } catch (e) {
    console.log("SONG SEARCH ERROR:", e);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(reply, "Error while searching for song.");
  }
});

/* ================= COMMAND: .songselect (List Row & First DL) ================= */
cmd({
  pattern: "songselect",
  dontAddCommandList: true,
  filename: __filename
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    const key = keyFor(sender, from);
    const searchState = pendingSongSearch[key];
    if (!searchState) return;

    const index = parseInt(String(q || "").trim(), 10) - 1;
    if (isNaN(index) || index < 0 || index >= searchState.videos.length) return;

    const chosenVideo = searchState.videos[index];
    delete pendingSongSearch[key];

    await promptAudioFormat(sock, from, mek, sender, chosenVideo, sessionId);
  } catch (e) {
    console.log("SONGSELECT ERROR:", e);
  }
});

/* ================= CENTRAL REPLY HANDLER ================= */
replyHandlers.push({
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const searchState = pendingSongSearch[k];
    const audioState = pendingAudioType[k];
    const quotedId = getQuotedId(m, mek);

    // 1. Search selection check
    if (searchState) {
      const texts = extractTexts(text, mek, m);
      for (const t of texts) {
        if (/^\.?SONGSELECT\s+(\d+)$/i.test(t)) return true;
        const n = parseInt(t.trim(), 10);
        if (!isNaN(n) && n >= 1 && n <= searchState.videos.length) {
          if (!quotedId || quotedId === searchState.expectedMsgId) return true;
        }
      }
    }

    // 2. Format selection check
    if (audioState) {
      const texts = extractTexts(text, mek, m);
      let type = extractTypeFromTexts(texts);
      if (type) return true;

      const num = parseInt(String(text || "").trim(), 10);
      const isNum = !isNaN(num) && num >= 1 && num <= 2;
      const isQuoted = quotedId && quotedId === audioState.expectedMsgId;

      return isQuoted || isNum;
    }

    return false;
  },

  function: async (sock, mek, m, { from, body, sender, reply, sessionId }) => {
    const k = keyFor(sender, from);
    const searchState = pendingSongSearch[k];
    const audioState = pendingAudioType[k];
    const texts = extractTexts(body, mek, m);

    // Step 1: Search Result Chosen
    if (searchState) {
      let chosenIndex = -1;
      for (const t of texts) {
        const match = t.match(/^\.?SONGSELECT\s+(\d+)$/i);
        if (match) {
          chosenIndex = parseInt(match[1], 10) - 1;
          break;
        }
        const n = parseInt(t.trim(), 10);
        if (!isNaN(n) && n >= 1 && n <= searchState.videos.length) {
          chosenIndex = n - 1;
          break;
        }
      }

      if (chosenIndex >= 0 && chosenIndex < searchState.videos.length) {
        const chosenVideo = searchState.videos[chosenIndex];
        delete pendingSongSearch[k];
        return await promptAudioFormat(sock, from, mek, sender, chosenVideo, searchState.sessionId || sessionId);
      }
    }

    // Step 2: Format Chosen
    if (audioState && !audioState.isProcessing) {
      let type = extractTypeFromTexts(texts);
      if (!type && /^[1-2]$/.test(String(body || "").trim())) {
        type = getTypeFromChoice(body);
      }
      if (type) {
        return handleAudioDownload(sock, mek, from, sender, reply, type);
      }
    }
  },
});

/* ================= CLEANUP EXPIRED STATES ================= */
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingAudioType)) {
    if (now - pendingAudioType[key].createdAt > 2 * 60 * 1000) delete pendingAudioType[key];
  }
  for (const key of Object.keys(pendingSongSearch)) {
    if (now - pendingSongSearch[key].createdAt > 3 * 60 * 1000) delete pendingSongSearch[key];
  }
}, 30000);
