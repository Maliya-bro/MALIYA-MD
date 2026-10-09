const { downloadMediaMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const P = require("pino");

console.log("✅ [SILENT AUTO] Multi-Session Engine Loaded!");

const editCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of editCache.entries()) {
    if (now - val.time > 15 * 60 * 1000) editCache.delete(key);
  }
}, 60 * 1000);

function unwrap(msg) {
  if (!msg) return null;
  let m = msg;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m;
}

function isViewOnce(rawMsg) {
  if (!rawMsg) return false;
  const str = JSON.stringify(rawMsg);
  if (str.includes("viewOnceMessage") || str.includes('"viewOnce":true')) return true;
  return false;
}

function getText(rawMsg) {
  const clean = unwrap(rawMsg);
  if (!clean) return "";
  return (
    clean.conversation ||
    clean.extendedTextMessage?.text ||
    clean.imageMessage?.caption ||
    clean.videoMessage?.caption ||
    ""
  ).trim();
}

function resolveInbox(sock, sessionCtx) {
  if (sock?.user?.id) {
    return jidNormalizedUser(sock.user.id);
  }
  if (sessionCtx?.ownerNumber && sessionCtx.ownerNumber[0]) {
    const num = String(sessionCtx.ownerNumber[0]).replace(/\D/g, "");
    return `${num}@s.whatsapp.net`;
  }
  return null;
}

async function handleSilentAutomation(sock, mek, m, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const from = mek.key.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    const targetInbox = resolveInbox(sock, sessionCtx);
    if (!targetInbox) return;

    const isGroup = from.endsWith("@g.us");
    const rawSender = mek.key.participant || from;
    const sender = rawSender.split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    // ── 1. EDITED MESSAGE TRACKER ──
    const proto = mek.message?.protocolMessage;
    if (proto && proto.type === 14) {
      const targetId = proto.key?.id;
      const cached = editCache.get(targetId);
      const newText = getText(proto.editedMessage);
      const oldText = cached ? cached.text : "*(Not cached)*";

      if (cached && cached.text === newText) return;

      const editMsg = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n\n` +
        `❌ *Original:*\n${oldText}\n\n` +
        `✏️ *Edited:*\n${newText || "*(Empty/Cleared)*"}`;

      await sock.sendMessage(targetInbox, {
        text: editMsg,
        mentions: [rawSender]
      });
      return;
    }

    // Cache message for edit sniffer
    const currentText = getText(mek.message);
    if (mek.key?.id && currentText) {
      editCache.set(mek.key.id, { text: currentText, time: Date.now() });
      if (editCache.size > 1500) editCache.delete(editCache.keys().next().value);
    }

    // ── 2. VIEW ONCE INTERCEPTOR ──
    if (isViewOnce(mek.message)) {
      const clean = unwrap(mek.message);
      if (!clean) return;

      let type = clean.imageMessage ? "image" : clean.videoMessage ? "video" : clean.audioMessage ? "audio" : null;
      let mediaNode = clean[type + "Message"];
      if (!type || !mediaNode) return;

      let buffer = null;

      // Primary download via msg.js wrapper m.download()[cite: 1]
      try {
        if (m && typeof m.download === "function") {
          buffer = await m.download();
        }
      } catch (_) {}

      // Secondary fallback via verified Baileys downloadMediaMessage with updateMediaMessage
      if (!buffer || !buffer.length) {
        try {
          buffer = await downloadMediaMessage(
            { key: mek.key, message: clean },
            "buffer",
            {},
            {
              logger: P({ level: "silent" }),
              reuploadRequest: sock.updateMediaMessage,
            }
          );
        } catch (_) {}
      }

      if (!buffer || !buffer.length) return;

      const captionText = mediaNode.caption || "";
      const finalCaption = `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n` +
        (captionText ? `💬 *Caption:* ${captionText}` : "");

      const mentions = [rawSender];

      if (type === "image") {
        await sock.sendMessage(targetInbox, {
          image: buffer,
          caption: finalCaption,
          mentions
        });
      } else if (type === "video") {
        await sock.sendMessage(targetInbox, {
          video: buffer,
          caption: finalCaption,
          mentions
        });
      } else if (type === "audio") {
        await sock.sendMessage(targetInbox, {
          audio: buffer,
          mimetype: mediaNode.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: mediaNode.ptt === true
        });
        await sock.sendMessage(targetInbox, {
          text: finalCaption,
          mentions
        });
      }
    }
  } catch (err) {
    // Silent fail
  }
}

module.exports = { handleSilentAutomation };
