const { downloadMediaMessage, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const { readSettings } = require("../lib/botSettings");

const sessionMsgStores = new Map();

function getSessionStore(sessionId) {
  let store = sessionMsgStores.get(sessionId);
  if (!store) {
    store = new Map();
    sessionMsgStores.set(sessionId, store);
  }
  return store;
}

setInterval(() => {
  const now = Date.now();
  for (const [sId, store] of sessionMsgStores.entries()) {
    for (const [mId, val] of store.entries()) {
      if (now - val.time > 15 * 60 * 1000) {
        store.delete(mId);
      }
    }
    if (store.size === 0) sessionMsgStores.delete(sId);
  }
}, 5 * 60 * 1000);

function unwrap(m) {
  if (!m) return null;
  if (m.ephemeralMessage?.message) return unwrap(m.ephemeralMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrap(m.viewOnceMessageV2.message);
  if (m.viewOnceMessage?.message) return unwrap(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2Extension?.message) return unwrap(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage?.message) return unwrap(m.documentWithCaptionMessage.message);
  return m;
}

function checkIsViewOnce(rawMsg) {
  if (!rawMsg) return false;
  if (rawMsg.viewOnceMessage || rawMsg.viewOnceMessageV2 || rawMsg.viewOnceMessageV2Extension) return true;
  const ep = rawMsg.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2 || ep?.viewOnceMessageV2Extension) return true;

  const clean = unwrap(rawMsg);
  return Boolean(clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce);
}

function getText(m) {
  if (!m) return "";
  const clean = unwrap(m);
  return (
    clean?.conversation ||
    clean?.extendedTextMessage?.text ||
    clean?.imageMessage?.caption ||
    clean?.videoMessage?.caption ||
    clean?.documentMessage?.caption ||
    ""
  ).trim();
}

function resolveCurrentSessionOwner(sock, sessionCtx) {
  const sockId = sock?.user?.id;
  if (sockId) {
    const clean = sockId.split("@")[0].split(":")[0].replace(/\D/g, "");
    if (clean) return `${clean}@s.whatsapp.net`;
  }

  if (sessionCtx?.ownerNumber && sessionCtx.ownerNumber[0]) {
    const clean = String(sessionCtx.ownerNumber[0]).replace(/\D/g, "");
    if (clean) return `${clean}@s.whatsapp.net`;
  }

  return null;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message) return;

    const from = mek.key?.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    const sId = sessionCtx?.sessionId || "default";
    const settings = await readSettings(sId);
    if (!settings?.silent_automation) return;

    const targetInbox = resolveCurrentSessionOwner(sock, sessionCtx);
    if (!targetInbox) return;

    const isGroup = from.endsWith("@g.us");
    const rawSender = mek.key.participant || from;
    const sender = rawSender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    const store = getSessionStore(sId);

    // ── 1. EDITED MESSAGE TRACKER ──
    const proto = mek.message?.protocolMessage;
    if (proto && proto.type === 14) {
      const targetId = proto.key?.id;
      const cached = store.get(targetId);
      const newText = getText(proto.editedMessage);
      const oldText = cached ? cached.text : "*(Not cached or sent before bot online)*";

      if (cached && cached.text === newText) return;

      const editCaption = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n\n` +
        `❌ *Original:*\n${oldText}\n\n` +
        `✏️ *Edited:*\n${newText || "*(Empty/Cleared)*"}`;

      await sock.sendMessage(targetInbox, {
        text: editCaption,
        mentions: [rawSender]
      });
      return;
    }

    // Cache message
    const textContent = getText(mek.message);
    if (mek.key?.id && textContent) {
      store.set(mek.key.id, { text: textContent, time: Date.now() });
      if (store.size > 1000) {
        const first = store.keys().next().value;
        if (first) store.delete(first);
      }
    }

    // ── 2. VIEW ONCE INTERCEPTOR ──
    if (checkIsViewOnce(mek.message)) {
      const clean = unwrap(mek.message);
      if (!clean) return;

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
      const mediaNode = clean[msgType];
      if (!mediaNode) return;

      let buffer = null;
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
      } catch {
        try {
          const stream = await downloadContentFromMessage(mediaNode, streamType);
          let buf = Buffer.from([]);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          buffer = buf;
        } catch {}
      }

      if (!buffer || !buffer.length) return;

      const captionText = mediaNode.caption || "";
      const baseCaption = `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n` +
        (captionText ? `💬 *Caption:* ${captionText}` : "");

      const mentions = [rawSender];

      if (msgType === "imageMessage") {
        await sock.sendMessage(targetInbox, {
          image: buffer,
          caption: baseCaption,
          mentions
        });
      } else if (msgType === "videoMessage") {
        await sock.sendMessage(targetInbox, {
          video: buffer,
          caption: baseCaption,
          mentions
        });
      } else if (msgType === "audioMessage") {
        await sock.sendMessage(targetInbox, {
          audio: buffer,
          mimetype: mediaNode.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: mediaNode.ptt === true
        });
        await sock.sendMessage(targetInbox, {
          text: baseCaption,
          mentions
        });
      }
    }
  } catch {}
}

module.exports = { handleSilentAutomation };
