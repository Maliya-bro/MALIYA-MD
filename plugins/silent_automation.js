const { downloadMediaMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const P = require("pino");

console.log("✅ [SILENT AUTO] Diagnostic-Verified Engine Active!");

const editCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of editCache.entries()) {
    if (now - val.time > 15 * 60 * 1000) editCache.delete(key);
  }
}, 60 * 1000);

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2Extension) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function detectMedia(m) {
  if (!m) return null;
  if (m.imageMessage) return { type: "image", node: m.imageMessage };
  if (m.videoMessage) return { type: "video", node: m.videoMessage };
  if (m.audioMessage) return { type: "audio", node: m.audioMessage, ptt: m.audioMessage.ptt === true };
  return null;
}

function isViewOnceMessage(raw) {
  if (!raw) return false;
  const jsonStr = JSON.stringify(raw);
  if (jsonStr.includes("viewOnceMessage") || jsonStr.includes('"viewOnce":true')) return true;

  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
  const clean = unwrapMessage(raw);
  if (clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce) return true;
  return false;
}

function getText(m) {
  const clean = unwrapMessage(m);
  if (!clean) return "";
  return (
    clean.conversation ||
    clean.extendedTextMessage?.text ||
    clean.imageMessage?.caption ||
    clean.videoMessage?.caption ||
    ""
  ).trim();
}

// 🎯 Multi-Session එකේදී Botගේම Inbox (You Chat) එකට නිවැරදිව JID එක Normalize කිරීම
function resolveInboxJid(sock) {
  if (sock?.user?.id) {
    return jidNormalizedUser(sock.user.id);
  }
  return null;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const from = mek.key.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    const targetInbox = resolveInboxJid(sock);
    if (!targetInbox) return;

    const isGroup = from.endsWith("@g.us");
    const rawSender = mek.key.participant || from;
    const senderClean = rawSender.split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    // ── 1. EDITED MESSAGE TRACKER ──
    const proto = mek.message.protocolMessage;
    if (proto && proto.type === 14) {
      const targetId = proto.key?.id;
      const cached = editCache.get(targetId);
      const newText = getText(proto.editedMessage);
      const oldText = cached ? cached.text : "*(Not cached)*";

      if (cached && cached.text === newText) return;

      const editMsg = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${senderClean}\n\n` +
        `❌ *Original:*\n${oldText}\n\n` +
        `✏️ *Edited:*\n${newText || "*(Empty/Cleared)*"}`;

      await sock.sendMessage(targetInbox, {
        text: editMsg,
        mentions: [rawSender]
      });
      return;
    }

    // Cache message for edit sniffer
    const rawText = getText(mek.message);
    if (mek.key?.id && rawText) {
      editCache.set(mek.key.id, { text: rawText, time: Date.now() });
      if (editCache.size > 1500) editCache.delete(editCache.keys().next().value);
    }

    // ── 2. VIEW ONCE INTERCEPTOR (Diagnostic Logic) ──
    if (isViewOnceMessage(mek.message)) {
      const clean = unwrapMessage(mek.message);
      if (!clean) return;

      const media = detectMedia(clean);
      if (!media || !media.node?.mediaKey) return;

      // 🛠️ Diagnostic Report එකේ 100% සාර්ථක වූ downloadMediaMessage call එක
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

      const captionText = media.node.caption || "";
      const finalCaption = `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${senderClean}\n` +
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
          mimetype: media.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: media.ptt === true
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
