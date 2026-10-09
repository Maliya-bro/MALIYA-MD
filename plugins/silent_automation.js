const { downloadMediaMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const P = require("pino");

console.log("✅ [SILENT AUTO] Direct Real-time Interceptor Active!");

const editCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of editCache.entries()) {
    if (now - val.time > 15 * 60 * 1000) editCache.delete(key);
  }
}, 60 * 1000);

// සියලුම View Once wrappers ගැළවීම
function extractMediaNode(rawMsg) {
  if (!rawMsg) return null;
  let target = rawMsg;

  if (target.ephemeralMessage?.message) target = target.ephemeralMessage.message;
  if (target.viewOnceMessageV2?.message) target = target.viewOnceMessageV2.message;
  if (target.viewOnceMessage?.message) target = target.viewOnceMessage.message;
  if (target.viewOnceMessageV2Extension?.message) target = target.viewOnceMessageV2Extension.message;
  if (target.documentWithCaptionMessage?.message) target = target.documentWithCaptionMessage.message;

  if (target.imageMessage) return { type: "image", node: target.imageMessage, clean: target };
  if (target.videoMessage) return { type: "video", node: target.videoMessage, clean: target };
  if (target.audioMessage) return { type: "audio", node: target.audioMessage, clean: target };
  return null;
}

function checkIsViewOnce(rawMsg) {
  if (!rawMsg) return false;
  const str = JSON.stringify(rawMsg);
  return str.includes("viewOnceMessage") || str.includes('"viewOnce":true');
}

function getMessageText(rawMsg) {
  if (!rawMsg) return "";
  const media = extractMediaNode(rawMsg);
  if (media?.node?.caption) return media.node.caption.trim();

  let target = rawMsg;
  if (target.ephemeralMessage?.message) target = target.ephemeralMessage.message;
  return (
    target.conversation ||
    target.extendedTextMessage?.text ||
    ""
  ).trim();
}

async function handleSilentAutomation(sock, mek, m, sessionCtx) {
  try {
    if (!mek?.message) return;

    const from = mek.key?.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    // 🎯 .testinbox එකෙන් තහවුරු වූ ඔබගේ normalized JID එක
    const targetInbox = sock?.user?.id ? jidNormalizedUser(sock.user.id) : null;
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
      const newText = getMessageText(proto.editedMessage);
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

    // සාමාන්‍ය මැසේජ් cache කිරීම
    const currentText = getMessageText(mek.message);
    if (mek.key?.id && currentText) {
      editCache.set(mek.key.id, { text: currentText, time: Date.now() });
      if (editCache.size > 1500) editCache.delete(editCache.keys().next().value);
    }

    // ── 2. VIEW ONCE INTERCEPTOR ──
    if (checkIsViewOnce(mek.message)) {
      const media = extractMediaNode(mek.message);
      if (!media || !media.node) return;

      let buffer = null;

      // 1. msg.js එකේ m.download() මඟින් බාගත කිරීම
      try {
        if (m && typeof m.download === "function") {
          buffer = await m.download();
        }
      } catch (_) {}

      // 2. Fallback: .vv diagnostic එකේ සාර්ථක වූ downloadMediaMessage ක්‍රමය
      if (!buffer || !buffer.length) {
        try {
          buffer = await downloadMediaMessage(
            { key: mek.key, message: media.clean },
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

      const captionText = media.node.caption || "";
      const finalCaption = `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n` +
        (captionText ? `💬 *Caption:* ${captionText}` : "");

      const mentions = [rawSender];

      if (media.type === "image") {
        await sock.sendMessage(targetInbox, {
          image: buffer,
          caption: finalCaption,
          mentions
        });
      } else if (media.type === "video") {
        await sock.sendMessage(targetInbox, {
          video: buffer,
          caption: finalCaption,
          mentions
        });
      } else if (media.type === "audio") {
        await sock.sendMessage(targetInbox, {
          audio: buffer,
          mimetype: media.node.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: media.node.ptt === true
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
