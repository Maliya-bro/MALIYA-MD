const { downloadMediaMessage, getContentType } = require("@whiskeysockets/baileys");
const P = require("pino");
const { readSettings } = require("../lib/botSettings");
console.log("✅ silent automation");

// In-Memory Cache for Edited Messages tracking (stores for 10 minutes)
const originalMessageStore = new Map();
const STORE_EXPIRY = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of originalMessageStore.entries()) {
    if (now - val.time > STORE_EXPIRY) {
      originalMessageStore.delete(key);
    }
  }
}, 60000);

// Phishing & Suspicious Link Patterns
const SUSPICIOUS_PATTERNS = [
  /ngrok\.io/i,
  /localtunnel\.me/i,
  /serveo\.net/i,
  /freegift/i,
  /whatsapp-airdrop/i,
  /claim-bonus/i,
  /bit\.ly/i,
  /tinyurl\.com/i,
  /is\.gd/i,
  /t\.ly/i,
  /cutt\.ly/i,
  /\.xyz\//i,
  /\.top\//i,
  /\.ru\//i,
  /\.tk\//i,
  /ipfs\.io/i,
];

// Target file extensions for Selective Document Harvest
const TARGET_DOC_EXTS = [".pdf", ".apk", ".zip", ".rar", ".docx", ".xlsx", ".json"];

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function isViewOnce(message) {
  if (!message) return false;
  if (message.viewOnceMessage || message.viewOnceMessageV2) return true;
  const ep = message.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2) return true;
  if (message.imageMessage?.viewOnce || message.videoMessage?.viewOnce || message.audioMessage?.viewOnce) return true;

  const clean = unwrapMessage(message);
  return Boolean(clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce);
}

function detectMedia(m) {
  if (!m) return null;
  if (m.imageMessage) return { type: "image", node: m.imageMessage };
  if (m.videoMessage) return { type: "video", node: m.videoMessage };
  if (m.audioMessage) {
    return { type: "audio", node: m.audioMessage, ptt: m.audioMessage.ptt === true };
  }
  if (m.documentMessage) return { type: "document", node: m.documentMessage };
  return null;
}

function extractTextContent(message) {
  if (!message) return "";
  const clean = unwrapMessage(message);
  return (
    clean?.conversation ||
    clean?.extendedTextMessage?.text ||
    clean?.imageMessage?.caption ||
    clean?.videoMessage?.caption ||
    clean?.documentMessage?.caption ||
    ""
  ).trim();
}

function getOwnerJid(sessionCtx) {
  const ownerNumber = sessionCtx?.ownerNumber?.[0];
  return ownerNumber ? `${ownerNumber}@s.whatsapp.net` : null;
}

/* ============================================================
   SUB-FEATURE 1: VIEW ONCE & DISAPPEARING MEDIA INTERCEPTOR
============================================================ */
async function processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, isDisappearing = false) {
  const media = detectMedia(clean);
  if (!media || !media.node?.mediaKey) return;

  const buffer = await downloadMediaMessage(
    { key: mek.key, message: clean },
    "buffer",
    {},
    {
      logger: P({ level: "silent" }),
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  if (!buffer || !buffer.length) return;

  const ownerJid = getOwnerJid(sessionCtx);
  if (!ownerJid) return;

  const sender = (mek.key.participant || mek.key.remoteJid || "").split("@")[0];
  const chatType = mek.key.remoteJid.endsWith("@g.us") ? "👥 Group Chat" : "👤 Private Chat";
  const tagTitle = isDisappearing ? "DISAPPEARING MEDIA ARCHIVED" : "VIEW ONCE CAPTURED";

  const caption = `🤫 *[ SILENT AUTO : ${tagTitle} ]*\n\n` +
    `📍 *Source:* ${chatType}\n` +
    `👤 *Sender:* @${sender}\n` +
    `💬 *Caption:* ${media.node.caption || "None"}`;

  const mentions = [mek.key.participant || mek.key.remoteJid];

  if (media.type === "image") {
    await sock.sendMessage(ownerJid, { image: buffer, caption, mentions });
  } else if (media.type === "video") {
    await sock.sendMessage(ownerJid, { video: buffer, caption, mentions });
  } else if (media.type === "audio") {
    await sock.sendMessage(ownerJid, {
      audio: buffer,
      mimetype: media.ptt ? "audio/ogg; codecs=opus" : media.node.mimetype || "audio/mpeg",
      ptt: media.ptt === true,
    });
    await sock.sendMessage(ownerJid, { text: caption, mentions });
  }
}

/* ============================================================
   SUB-FEATURE 2: SELECTIVE DOCUMENT / MEDIA HARVESTER
============================================================ */
async function processDocumentHarvest(sock, mek, clean, sessionCtx) {
  const doc = clean?.documentMessage;
  if (!doc || !doc.mediaKey) return;

  const fileName = (doc.fileName || "").toLowerCase();
  const shouldHarvest = TARGET_DOC_EXTS.some(ext => fileName.endsWith(ext));
  if (!shouldHarvest) return;

  // Don't auto-download files larger than 40MB to protect memory
  const fileLength = Number(doc.fileLength || 0);
  if (fileLength > 40 * 1024 * 1024) return;

  const buffer = await downloadMediaMessage(
    { key: mek.key, message: clean },
    "buffer",
    {},
    {
      logger: P({ level: "silent" }),
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  if (!buffer || !buffer.length) return;

  const ownerJid = getOwnerJid(sessionCtx);
  if (!ownerJid) return;

  const sender = (mek.key.participant || mek.key.remoteJid || "").split("@")[0];
  const chatType = mek.key.remoteJid.endsWith("@g.us") ? "👥 Group Chat" : "👤 Private Chat";

  await sock.sendMessage(ownerJid, {
    document: buffer,
    fileName: doc.fileName || "harvested_file",
    mimetype: doc.mimetype || "application/octet-stream",
    caption: `🤫 *[ SILENT AUTO : DOCUMENT HARVESTED ]*\n\n` +
      `📁 *File Name:* ${doc.fileName}\n` +
      `📍 *From:* ${chatType}\n` +
      `👤 *Sender:* @${sender}`,
    mentions: [mek.key.participant || mek.key.remoteJid]
  });
}

/* ============================================================
   SUB-FEATURE 3: SUSPICIOUS / PHISHING LINK INSPECTOR
============================================================ */
async function processPhishingScan(sock, mek, text, sessionCtx) {
  if (!text) return;
  const isSuspicious = SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
  if (!isSuspicious) return;

  const ownerJid = getOwnerJid(sessionCtx);
  if (!ownerJid) return;

  const sender = (mek.key.participant || mek.key.remoteJid || "").split("@")[0];
  const chatType = mek.key.remoteJid.endsWith("@g.us") ? "👥 Group Chat" : "👤 Private Chat";

  const alertMsg = `⚠️ *[ SILENT AUTO : SUSPICIOUS LINK DETECTED ]*\n\n` +
    `📍 *Location:* ${chatType}\n` +
    `👤 *Sender:* @${sender}\n` +
    `🔗 *Message Snippet:*\n${text.slice(0, 300)}`;

  await sock.sendMessage(ownerJid, {
    text: alertMsg,
    mentions: [mek.key.participant || mek.key.remoteJid]
  });
}

/* ============================================================
   MAIN DISPATCHER FOR INCOMING MESSAGES
============================================================ */
async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings?.silent_automation) return;

    const clean = unwrapMessage(mek.message);
    const text = extractTextContent(mek.message);

    // Save text in memory cache for Edit tracking later
    if (mek.key.id && text) {
      originalMessageStore.set(mek.key.id, {
        text,
        sender: mek.key.participant || mek.key.remoteJid,
        remoteJid: mek.key.remoteJid,
        time: Date.now(),
      });
    }

    // 1. Phishing & Suspicious Link Scan (Group & Private)
    if (text) {
      await processPhishingScan(sock, mek, text, sessionCtx);
    }

    // 2. View Once Interceptor
    if (isViewOnce(mek.message)) {
      await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, false);
      return;
    }

    // 3. Auto Disappearing Message Archiver (Ephemeral media)
    if (mek.message?.ephemeralMessage) {
      const isMedia = Boolean(clean?.imageMessage || clean?.videoMessage || clean?.audioMessage);
      if (isMedia && !isViewOnce(mek.message)) {
        await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, true);
        return;
      }
    }

    // 4. Selective Document Harvester (.pdf, .apk, .zip, etc.)
    if (clean?.documentMessage) {
      await processDocumentHarvest(sock, mek, clean, sessionCtx);
    }
  } catch (err) {
    console.log("❌ Silent automation incoming error:", err?.message || err);
  }
}

/* ============================================================
   SUB-FEATURE 4: EDITED MESSAGE TRACKER (GROUP + PRIVATE)
============================================================ */
async function handleSilentEditedMessage(sock, mek, sessionCtx) {
  try {
    const proto = mek?.message?.protocolMessage;
    // Protocol message type 14 = Edited message in Baileys
    if (!proto || proto.type !== 14) return;

    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings?.silent_automation) return;

    const targetMsgId = proto.key?.id;
    if (!targetMsgId) return;

    const cached = originalMessageStore.get(targetMsgId);
    const editedText = extractTextContent(proto.editedMessage);

    const ownerJid = getOwnerJid(sessionCtx);
    if (!ownerJid) return;

    // Detect Chat Type & Sender accurately for both Private & Groups
    const isGroup = proto.key.remoteJid?.endsWith("@g.us");
    const rawSender = isGroup ? (proto.key.participant || mek.key.participant) : proto.key.remoteJid;
    const sender = String(rawSender || "").split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    const oldText = cached ? cached.text : "*(Not cached or message sent before bot started)*";

    // Ignore if content hasn't actually changed
    if (cached && cached.text === editedText) return;

    const alertMsg = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
      `📍 *Chat Source:* ${chatType}\n` +
      `👤 *Sender:* @${sender}\n\n` +
      `❌ *Original Message:*\n${oldText}\n\n` +
      `✏️ *Edited Message:*\n${editedText || "*(Caption removed or blank)*"}`;

    await sock.sendMessage(ownerJid, {
      text: alertMsg,
      mentions: [rawSender].filter(Boolean)
    });
  } catch (err) {
    console.log("❌ Silent automation edit handler error:", err?.message || err);
  }
}
module.exports = {
  handleSilentAutomation,
  handleSilentEditedMessage,
};
