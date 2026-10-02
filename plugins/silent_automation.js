const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const { readSettings } = require("../lib/botSettings");
const config = require("../config");

console.log("✅ silent automation plugin loaded (Universal Multi-Session Support)");

// In-Memory Cache for Edited Messages (15 minutes)
const originalMessageStore = new Map();
const STORE_EXPIRY = 15 * 60 * 1000;

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

/**
 * Universal Target Inbox Resolver:
 * Pair site, QR code, හෝ .pair command එකෙන් හදපු ඕනෑම session එකක 
 * Bot run වෙන phone එකේ Owner Inbox එක 100% නිවැරදිව හඳුනාගනී.
 */
function resolveOwnerInboxJid(sock, sessionCtx) {
  // 1. Socket එකේ logged in user ගේ JID එකෙන් කෙලින්ම ගන්න (Most Accurate for all 3 methods)
  const sockUser = sock?.user?.id;
  if (sockUser) {
    const cleanNum = sockUser.split("@")[0].split(":")[0].replace(/\D/g, "");
    if (cleanNum) return `${cleanNum}@s.whatsapp.net`;
  }

  // 2. Session Context එකේ ownerNumber තියෙනවා නම්
  if (sessionCtx?.ownerNumber && sessionCtx.ownerNumber[0]) {
    const cleanNum = String(sessionCtx.ownerNumber[0]).replace(/\D/g, "");
    if (cleanNum) return `${cleanNum}@s.whatsapp.net`;
  }

  // 3. Fallback to Config
  if (config.BOT_OWNER || config.OWNER_NUMBER) {
    const fallback = String(config.BOT_OWNER || config.OWNER_NUMBER).replace(/\D/g, "");
    if (fallback) return `${fallback}@s.whatsapp.net`;
  }

  return null;
}

/* ============================================================
   1. VIEW ONCE & DISAPPEARING MEDIA INTERCEPTOR
============================================================ */
async function processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, isDisappearing = false) {
  try {
    const media = detectMedia(clean);
    if (!media || !media.node?.mediaKey) return;

    const targetInbox = resolveOwnerInboxJid(sock, sessionCtx);
    if (!targetInbox) {
      console.log("⚠️ [Silent Auto] Could not resolve owner inbox for session:", sessionCtx?.sessionId);
      return;
    }

    // Direct buffer download with socket reupload request
    const buffer = await downloadMediaMessage(
      { key: mek.key, message: clean },
      "buffer",
      {},
      {
        logger: P({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    if (!buffer || !buffer.length) {
      console.log("⚠️ [Silent Auto] Download buffer failed/empty.");
      return;
    }

    const rawSender = mek.key.participant || mek.key.remoteJid || "";
    const senderClean = rawSender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const isGroup = mek.key.remoteJid.endsWith("@g.us");
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";
    const tag = isDisappearing ? "DISAPPEARING MEDIA" : "VIEW ONCE MEDIA";
    const captionText = media.node.caption || "";

    const caption = `🤫 *[ SILENT AUTO : ${tag} ]*\n\n` +
      `📍 *Chat:* ${chatType}\n` +
      `👤 *Sender:* @${senderClean}\n\n` +
      (captionText ? `💬 *Caption:* ${captionText}` : "");

    const mentions = [rawSender];

    if (media.type === "image") {
      await sock.sendMessage(targetInbox, {
        image: buffer,
        caption,
        mentions
      });
    } else if (media.type === "video") {
      await sock.sendMessage(targetInbox, {
        video: buffer,
        caption,
        mentions
      });
    } else if (media.type === "audio") {
      await sock.sendMessage(targetInbox, {
        audio: buffer,
        mimetype: media.ptt ? "audio/ogg; codecs=opus" : media.node.mimetype || "audio/mpeg",
        ptt: media.ptt === true
      });
      await sock.sendMessage(targetInbox, {
        text: caption,
        mentions
      });
    }

    console.log(`✅ [Silent Auto] Successfully forwarded ViewOnce to ${targetInbox} from: ${senderClean}`);
  } catch (err) {
    console.log("❌ Silent auto media download error:", err?.message || err);
  }
}

/* ============================================================
   2. EDITED MESSAGE TRACKER (GROUP + PRIVATE DM)
============================================================ */
async function handleSilentEditedMessage(sock, mek, sessionCtx) {
  try {
    const proto = mek?.message?.protocolMessage;
    if (!proto || proto.type !== 14) return;

    const targetMsgId = proto.key?.id;
    if (!targetMsgId) return;

    const cached = originalMessageStore.get(targetMsgId);
    const editedText = extractTextContent(proto.editedMessage);

    const targetInbox = resolveOwnerInboxJid(sock, sessionCtx);
    if (!targetInbox) return;

    const isGroup = proto.key.remoteJid?.endsWith("@g.us");
    const rawSender = isGroup ? (proto.key.participant || mek.key.participant) : proto.key.remoteJid;
    const senderClean = String(rawSender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    const oldText = cached ? cached.text : "*(Not cached or sent before bot was online)*";
    if (cached && cached.text === editedText) return;

    const alertMsg = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
      `📍 *Chat Source:* ${chatType}\n` +
      `👤 *Sender:* @${senderClean}\n\n` +
      `❌ *Original Message:*\n${oldText}\n\n` +
      `✏️ *Edited Message:*\n${editedText || "*(Empty or Caption removed)*"}`;

    await sock.sendMessage(targetInbox, {
      text: alertMsg,
      mentions: [rawSender].filter(Boolean)
    });

    console.log(`✅ [Silent Auto] Edited msg alert sent to ${targetInbox} for: ${senderClean}`);
  } catch (err) {
    console.log("❌ Silent edit error:", err?.message || err);
  }
}

/* ============================================================
   3. MAIN DISPATCHER
============================================================ */
async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message) return;

    // Check setting for this specific session
    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings?.silent_automation) return;

    // 1. Edited Message Protocol Check
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

    // 2. View Once Intercept (Private DMs & Groups)
    if (isViewOnce(mek.message)) {
      await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, false);
      return;
    }

    // 3. Ephemeral / Disappearing Media
    if (mek.message?.ephemeralMessage) {
      const isMedia = Boolean(clean?.imageMessage || clean?.videoMessage || clean?.audioMessage);
      if (isMedia) {
        await processViewOnceOrDisappearing(sock, mek, clean, sessionCtx, true);
        return;
      }
    }

    // 4. Phishing Scan
    if (text) {
      const isSuspicious = SUSPICIOUS_PATTERNS.some(p => p.test(text));
      if (isSuspicious) {
        const targetInbox = resolveOwnerInboxJid(sock, sessionCtx);
        if (targetInbox) {
          const sender = (mek.key.participant || mek.key.remoteJid || "").split("@")[0].split(":")[0];
          await sock.sendMessage(targetInbox, {
            text: `⚠️ *[ SILENT AUTO : PHISHING LINK DETECTED ]*\n\n👤 *Sender:* @${sender}\n🔗 *Message:*\n${text.slice(0, 300)}`,
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
