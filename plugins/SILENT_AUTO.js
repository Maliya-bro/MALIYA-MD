const { downloadMediaMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const P = require("pino");

console.log("✅ [SILENT AUTO] Direct Real-time Interceptor Active!");

/* ---------- Owner resolution (mongodb) ---------- */
let getSessionOwnerPhone = null;
for (const p of ["../lib/mongodb", "./mongodb", "../database/mongodb", "../lib/database"]) {
  try {
    const mod = require(p);
    if (mod?.getSessionOwnerPhone) { getSessionOwnerPhone = mod.getSessionOwnerPhone; break; }
  } catch {}
}

async function resolveOwnerJid(sock) {
  const raw = (sock?.user?.id || "").split(":")[0].split("@")[0];
  let phone = null;
  try {
    if (getSessionOwnerPhone) phone = await getSessionOwnerPhone(raw || "default");
  } catch {}
  if (!phone && raw) phone = raw;
  const cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned) return `${cleaned}@s.whatsapp.net`;
  // ultimate fallback
  return sock?.user?.id ? jidNormalizedUser(sock.user.id) : null;
}

/* ---------- Cache ---------- */
const editCache = new Map();
const MAX_CACHE = 200;
const TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of editCache.entries()) {
    if (now - val.time > TTL_MS) editCache.delete(key);
  }
}, 60 * 1000);

/* ---------- Message helpers ---------- */
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
  return (target.conversation || target.extendedTextMessage?.text || "").trim();
}

/* ---------- Try re-download from cached message ---------- */
async function tryDownloadMedia(sock, cached) {
  if (!cached?.key || !cached?.message) return null;
  const media = extractMediaNode(cached.message);
  if (!media?.node) return null;

  try {
    const buffer = await downloadMediaMessage(
      { key: cached.key, message: media.clean },
      "buffer",
      {},
      { logger: P({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
    );
    if (buffer?.length) return { buffer, media };
  } catch {}
  return null;
}

/* ---------- Main interceptor ---------- */
async function handleSilentAutomation(sock, mek, m, sessionCtx) {
  try {
    if (!mek?.message) return;

    const from = mek.key?.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    // 🎯 Owner inbox (resolved via mongodb, not bot's own JID)
    const targetInbox = await resolveOwnerJid(sock);
    if (!targetInbox) return;

    const isGroup = from.endsWith("@g.us");
    const rawSender = mek.key.participant || from;
    const sender = rawSender.split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    const proto = mek.message?.protocolMessage;

    // ── 1. EDITED MESSAGE ──
    if (proto && proto.type === 14) {
      const targetId = proto.key?.id;
      const cached = editCache.get(targetId);
      const newText = getMessageText(proto.editedMessage);
      const oldText = cached
        ? (cached.text || "*(No text)*")
        : "*(Not cached)*";

      if (cached && cached.text === newText) return;

      const editMsg =
        `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n\n` +
        `❌ *Original:*\n${oldText}\n\n` +
        `✏️ *Edited:*\n${newText || "*(Empty/Cleared)*"}`;

      await sock.sendMessage(targetInbox, {
        text: editMsg,
        mentions: [rawSender],
      });

      // keep cache in sync so a 2nd edit shows the correct "previous"
      if (cached) {
        cached.text = newText;
        cached.time = Date.now();
      }
      return;
    }

    // ── 2. DELETED MESSAGE (REVOKE) ──
    if (proto && proto.type === 0) {
      const targetId = proto.key?.id;
      const cached = targetId ? editCache.get(targetId) : null;

      const deletedText = cached
        ? (cached.text || "*(No text)*")
        : "*(Content not cached)*";

      const deleteMsg =
        `🗑️ *[ SILENT AUTO : MESSAGE DELETED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n\n` +
        `❌ *Deleted Message:*\n${deletedText}`;

      await sock.sendMessage(targetInbox, {
        text: deleteMsg,
        mentions: [rawSender],
      });

      // If the deleted message had media and we have it cached → forward it
      if (cached?.message) {
        try {
          const mediaData = await tryDownloadMedia(sock, cached);
          if (mediaData?.buffer?.length) {
            const mediaCaption =
              `🗑️ *[ SILENT AUTO : DELETED MEDIA ]*\n` +
              `📍 *Chat:* ${chatType}\n` +
              `👤 *Sender:* @${sender}`;

            if (mediaData.media.type === "image") {
              await sock.sendMessage(targetInbox, {
                image: mediaData.buffer,
                caption: mediaCaption,
                mentions: [rawSender],
              });
            } else if (mediaData.media.type === "video") {
              await sock.sendMessage(targetInbox, {
                video: mediaData.buffer,
                caption: mediaCaption,
                mentions: [rawSender],
              });
            } else if (mediaData.media.type === "audio") {
              await sock.sendMessage(targetInbox, {
                audio: mediaData.buffer,
                mimetype: mediaData.media.node.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
                ptt: mediaData.media.node.ptt === true,
              });
              await sock.sendMessage(targetInbox, {
                text: mediaCaption,
                mentions: [rawSender],
              });
            }
          }
        } catch {}
      }

      if (targetId) editCache.delete(targetId);
      return;
    }

    // ── 3. CACHE CURRENT MESSAGE (text + media) ──
    const currentText = getMessageText(mek.message);
    const hasMedia = extractMediaNode(mek.message) !== null;

    if (mek.key?.id && (currentText || hasMedia)) {
      editCache.set(mek.key.id, {
        text: currentText,
        message: mek.message,
        key: mek.key,
        time: Date.now(),
      });
      if (editCache.size > MAX_CACHE) {
        const oldest = editCache.keys().next().value;
        if (oldest) editCache.delete(oldest);
      }
    }

    // ── 4. VIEW ONCE → OWNER ──
    if (checkIsViewOnce(mek.message)) {
      const media = extractMediaNode(mek.message);
      if (!media || !media.node) return;

      let buffer = null;

      try {
        if (m && typeof m.download === "function") {
          buffer = await m.download();
        }
      } catch (_) {}

      if (!buffer || !buffer.length) {
        try {
          buffer = await downloadMediaMessage(
            { key: mek.key, message: media.clean },
            "buffer",
            {},
            { logger: P({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
          );
        } catch (_) {}
      }

      if (!buffer || !buffer.length) return;

      const captionText = media.node.caption || "";
      const finalCaption =
        `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n` +
        (captionText ? `💬 *Caption:* ${captionText}` : "");

      const mentions = [rawSender];

      if (media.type === "image") {
        await sock.sendMessage(targetInbox, {
          image: buffer,
          caption: finalCaption,
          mentions,
        });
      } else if (media.type === "video") {
        await sock.sendMessage(targetInbox, {
          video: buffer,
          caption: finalCaption,
          mentions,
        });
      } else if (media.type === "audio") {
        await sock.sendMessage(targetInbox, {
          audio: buffer,
          mimetype: media.node.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: media.node.ptt === true,
        });
        await sock.sendMessage(targetInbox, {
          text: finalCaption,
          mentions,
        });
      }

      buffer = null; // free memory
    }
  } catch (err) {
    // Silent fail — never reply to sender
  }
}

module.exports = { handleSilentAutomation };
