const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { readSettings } = require("../lib/botSettings");
const config = require("../config");

console.log("✅ silent automation plugin active");

// In-Memory Store for Edited Messages
const msgCache = new Map();

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
  if (clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce) return true;
  return false;
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

// Download buffer using stream
async function getBuffer(mediaMsg, type) {
  try {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (e) {
    console.log("❌ Stream error:", e?.message);
    return null;
  }
}

// Target Inbox resolver - returns the logged-in user's direct JID
function getTargetJid(sock) {
  if (sock?.user?.id) {
    const num = sock.user.id.split("@")[0].split(":")[0];
    return `${num}@s.whatsapp.net`;
  }
  if (config.BOT_OWNER) {
    const num = String(config.BOT_OWNER).replace(/\D/g, "");
    return `${num}@s.whatsapp.net`;
  }
  return null;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message) return;

    // Check Settings safely
    const sid = sessionCtx?.sessionId;
    let isEnabled = false;
    try {
      const s = await readSettings(sid);
      isEnabled = Boolean(s?.silent_automation);
    } catch {
      isEnabled = true;
    }

    if (!isEnabled) return;

    const targetInbox = getTargetJid(sock);
    if (!targetInbox) return;

    const from = mek.key.remoteJid || "";
    const isGroup = from.endsWith("@g.us");
    const sender = (mek.key.participant || from).split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    // ── 1. EDITED MESSAGE TRACKER ──
    const proto = mek.message.protocolMessage;
    if (proto && proto.type === 14) {
      const targetId = proto.key?.id;
      const cached = msgCache.get(targetId);
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
        mentions: [mek.key.participant || from]
      });
      return;
    }

    // Cache normal messages for edit sniffer
    const textContent = getText(mek.message);
    if (mek.key?.id && textContent) {
      msgCache.set(mek.key.id, { text: textContent, time: Date.now() });
      if (msgCache.size > 1500) {
        const first = msgCache.keys().next().value;
        if (first) msgCache.delete(first);
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

      const buffer = await getBuffer(mediaNode, streamType);
      if (!buffer || !buffer.length) return;

      const captionText = mediaNode.caption || "";
      const baseCaption = `🤫 *[ SILENT AUTO : VIEW ONCE ]*\n\n` +
        `📍 *Source:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n` +
        (captionText ? `💬 *Caption:* ${captionText}` : "");

      const mentions = [mek.key.participant || from];

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
      console.log(`✅ [Silent Auto] View Once forwarded to inbox from: ${sender}`);
    }
  } catch (err) {
    console.log("❌ Silent automation execution error:", err?.message || err);
  }
}

module.exports = { handleSilentAutomation };
