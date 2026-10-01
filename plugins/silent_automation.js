const { downloadContentFromMessage, getContentType } = require("@whiskeysockets/baileys");
const { readSettings } = require("../lib/botSettings");
const config = require("../config");

console.log("✅ silent automation plugin loaded");

// In-Memory Cache for Edited Messages (10 minutes)
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

const SUSPICIOUS_PATTERNS = [
  /ngrok\.io/i, /localtunnel\.me/i, /serveo\.net/i, /freegift/i,
  /whatsapp-airdrop/i, /claim-bonus/i, /bit\.ly/i, /tinyurl\.com/i,
  /\.xyz\//i, /\.top\//i
];

const TARGET_DOC_EXTS = [".pdf", ".apk", ".zip", ".rar", ".docx", ".xlsx"];

function unwrapMessage(msg) {
  if (!msg) return null;
  let m = msg;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m;
}

function isViewOnce(msg) {
  if (!msg) return false;
  if (msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension) return true;
  const ep = msg.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2 || ep?.viewOnceMessageV2Extension) return true;

  const clean = unwrapMessage(msg);
  if (clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce) return true;
  return false;
}

function extractTextContent(msg) {
  if (!msg) return "";
  const clean = unwrapMessage(msg);
  return (
    clean?.conversation ||
    clean?.extendedTextMessage?.text ||
    clean?.imageMessage?.caption ||
    clean?.videoMessage?.caption ||
    clean?.documentMessage?.caption ||
    ""
  ).trim();
}

// Exact owner number resolution as in index.js status forwarder
function getOwnerJid(sock, sessionCtx) {
  let ownerNumber = sessionCtx?.ownerNumber?.[0];
  if (!ownerNumber && config.BOT_OWNER) ownerNumber = String(config.BOT_OWNER).replace(/\D/g, "");
  if (!ownerNumber && config.OWNER_NUMBER) ownerNumber = String(config.OWNER_NUMBER).replace(/\D/g, "");
  if (!ownerNumber && sock?.user?.id) ownerNumber = sock.user.id.split("@")[0].split(":")[0].replace(/\D/g, "");
  return ownerNumber ? `${ownerNumber}@s.whatsapp.net` : null;
}

// Download stream helper (Same method used in index.js status download)
async function downloadMediaStream(mediaMsg, type) {
  try {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (e) {
    console.log("❌ Stream download error:", e?.message || e);
    return null;
  }
}

/* ============================================================
   1. VIEW ONCE & DISAPPEARING FORWARDER (INDEX.JS STATUS STYLE)
============================================================ */
async function processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, isDisappearing = false) {
  try {
    let msgType = null;
    let streamType = null;

    if (clean.imageMessage) {
      msgType = "imageMessage";
      streamType = "image";
    } else if (clean.videoMessage) {
      msgType = "videoMessage";
      streamType = "video";
    } else if (clean.audioMessage) {
      msgType = "audioMessage";
      streamType = "audio";
    }

    if (!msgType) return;

    const mediaMsg = clean[msgType];
    if (!mediaMsg) return;

    const buffer = await downloadMediaStream(mediaMsg, streamType);
    if (!buffer || !buffer.length) return;

    const ownerJid = getOwnerJid(sock, sessionCtx);
    if (!ownerJid) {
      console.log("⚠️ Owner JID not found for session:", sessionCtx?.sessionId);
      return;
    }

    const participant = (mek.key.participant || mek.key.remoteJid || "").split("@")[0].split(":")[0];
    const isGroup = mek.key.remoteJid.endsWith("@g.us");
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat";
    const tag = isDisappearing ? "DISAPPEARING MEDIA" : "VIEW ONCE CAPTURED";
    const captionText = mediaMsg.caption || "";

    const caption = `🤫 *[ SILENT AUTO : ${tag} ]*\n\n` +
      `👤 *From:* @${participant}\n` +
      `📍 *Chat:* ${chatType}\n\n` +
      `${captionText}`;

    if (msgType === "imageMessage") {
      const mimetype = mediaMsg.mimetype || "image/jpeg";
      await sock.sendMessage(ownerJid, {
        image: buffer,
        mimetype,
        caption,
        mentions: [mek.key.participant || mek.key.remoteJid]
      });
    } else if (msgType === "videoMessage") {
      const mimetype = mediaMsg.mimetype || "video/mp4";
      await sock.sendMessage(ownerJid, {
        video: buffer,
        mimetype,
        caption,
        mentions: [mek.key.participant || mek.key.remoteJid]
      });
    } else if (msgType === "audioMessage") {
      const isPtt = mediaMsg.ptt === true;
      await sock.sendMessage(ownerJid, {
        audio: buffer,
        mimetype: isPtt ? "audio/ogg; codecs=opus" : mediaMsg.mimetype || "audio/mpeg",
        ptt: isPtt
      });
      await sock.sendMessage(ownerJid, {
        text: caption,
        mentions: [mek.key.participant || mek.key.remoteJid]
      });
    }

    console.log(`✅ [Silent Auto] ${tag} forwarded to owner inbox: ${participant}`);
  } catch (err) {
    console.log("❌ Silent auto media forward error:", err?.message || err);
  }
}

/* ============================================================
   2. SELECTIVE DOCUMENT HARVESTER
============================================================ */
async function processDocumentHarvest(sock, mek, clean, sessionCtx) {
  try {
    const doc = clean.documentMessage;
    if (!doc) return;

    const fileName = (doc.fileName || "").toLowerCase();
    const shouldHarvest = TARGET_DOC_EXTS.some(ext => fileName.endsWith(ext));
    if (!shouldHarvest) return;

    if (Number(doc.fileLength || 0) > 40 * 1024 * 1024) return;

    const buffer = await downloadMediaStream(doc, "document");
    if (!buffer || !buffer.length) return;

    const ownerJid = getOwnerJid(sock, sessionCtx);
    if (!ownerJid) return;

    const participant = (mek.key.participant || mek.key.remoteJid || "").split("@")[0].split(":")[0];
    const isGroup = mek.key.remoteJid.endsWith("@g.us");

    await sock.sendMessage(ownerJid, {
      document: buffer,
      fileName: doc.fileName || "harvested_file",
      mimetype: doc.mimetype || "application/octet-stream",
      caption: `🤫 *[ SILENT AUTO : DOCUMENT HARVESTED ]*\n📁 *File:* ${doc.fileName}\n👤 *From:* @${participant} (${isGroup ? "Group" : "DM"})`,
      mentions: [mek.key.participant || mek.key.remoteJid]
    });
  } catch (e) {
    console.log("❌ Doc harvest error:", e?.message || e);
  }
}

/* ============================================================
   3. EDITED MESSAGE TRACKER (GROUP + PRIVATE)
============================================================ */
async function handleSilentEditedMessage(sock, mek, sessionCtx) {
  try {
    const proto = mek?.message?.protocolMessage;
    if (!proto || proto.type !== 14) return;

    const targetMsgId = proto.key?.id;
    if (!targetMsgId) return;

    const cached = originalMessageStore.get(targetMsgId);
    const editedText = extractTextContent(proto.editedMessage);

    const ownerJid = getOwnerJid(sock, sessionCtx);
    if (!ownerJid) return;

    const isGroup = proto.key.remoteJid?.endsWith("@g.us");
    const rawSender = isGroup ? (proto.key.participant || mek.key.participant) : proto.key.remoteJid;
    const sender = String(rawSender || "").split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    const oldText = cached ? cached.text : "*(Not cached or sent before bot was running)*";
    if (cached && cached.text === editedText) return;

    const alertMsg = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
      `📍 *Chat:* ${chatType}\n` +
      `👤 *Sender:* @${sender}\n\n` +
      `❌ *Original Message:*\n${oldText}\n\n` +
      `✏️ *Edited Message:*\n${editedText || "*(Caption removed or blank)*"}`;

    await sock.sendMessage(ownerJid, {
      text: alertMsg,
      mentions: [rawSender].filter(Boolean)
    });

    console.log(`✅ [Silent Auto] Edited msg alert sent to owner inbox for: ${sender}`);
  } catch (err) {
    console.log("❌ Silent edit error:", err?.message || err);
  }
}

/* ============================================================
   4. MAIN DISPATCHER (INCOMING MESSAGES)
============================================================ */
async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings?.silent_automation) return;

    // Direct check for Edited message
    const proto = mek.message.protocolMessage;
    if (proto && proto.type === 14) {
      await handleSilentEditedMessage(sock, mek, sessionCtx);
      return;
    }

    const clean = unwrapMessage(mek.message);
    const text = extractTextContent(mek.message);

    // Cache original text for Edit Sniffer
    if (mek.key.id && text) {
      originalMessageStore.set(mek.key.id, {
        text,
        sender: mek.key.participant || mek.key.remoteJid,
        time: Date.now(),
      });
    }

    // A. View Once Interceptor
    if (isViewOnce(mek.message)) {
      await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, false);
      return;
    }

    // B. Ephemeral / Disappearing Media
    if (mek.message?.ephemeralMessage) {
      const isMedia = Boolean(clean?.imageMessage || clean?.videoMessage || clean?.audioMessage);
      if (isMedia) {
        await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, true);
        return;
      }
    }

    // C. Documents
    if (clean?.documentMessage) {
      await processDocumentHarvest(sock, mek, clean, sessionCtx);
    }

    // D. Phishing Scan
    if (text) {
      const isSuspicious = SUSPICIOUS_PATTERNS.some(p => p.test(text));
      if (isSuspicious) {
        const ownerJid = getOwnerJid(sock, sessionCtx);
        if (ownerJid) {
          const participant = (mek.key.participant || mek.key.remoteJid || "").split("@")[0].split(":")[0];
          await sock.sendMessage(ownerJid, {
            text: `⚠️ *[ SILENT AUTO : PHISHING LINK DETECTED ]*\n\n👤 *Sender:* @${participant}\n🔗 *Message:*\n${text.slice(0, 300)}`,
            mentions: [mek.key.participant || mek.key.remoteJid]
          });
        }
      }
    }
  } catch (err) {
    console.log("❌ Silent automation incoming error:", err?.message || err);
  }
}

module.exports = {
  handleSilentAutomation,
  handleSilentEditedMessage,
};
