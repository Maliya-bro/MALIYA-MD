const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const { readSettings } = require("../lib/botSettings");

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  return message;
}

function isViewOnce(message) {
  if (!message) return false;
  if (message.viewOnceMessage || message.viewOnceMessageV2) return true;
  const ep = message.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2) return true;
  if (message.imageMessage?.viewOnce) return true;
  if (message.videoMessage?.viewOnce) return true;
  if (message.audioMessage?.viewOnce) return true;

  const clean = unwrapMessage(message);
  if (clean?.imageMessage?.viewOnce) return true;
  if (clean?.videoMessage?.viewOnce) return true;
  if (clean?.audioMessage?.viewOnce) return true;

  return false;
}

function detectMedia(m) {
  if (!m) return null;
  if (m.imageMessage) return { type: "image", node: m.imageMessage };
  if (m.videoMessage) return { type: "video", node: m.videoMessage };
  if (m.audioMessage) {
    const isPtt = m.audioMessage.ptt === true;
    return { type: "audio", node: m.audioMessage, ptt: isPtt };
  }
  return null;
}

// Sub-task: Intercept View Once
async function processViewOnceIntercept(sock, mek, clean, sessionCtx) {
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

  const ownerNumber = sessionCtx.ownerNumber?.[0];
  if (!ownerNumber) return;
  const ownerJid = ownerNumber + "@s.whatsapp.net";

  const sender = (mek.key.participant || mek.key.remoteJid || "").split("@")[0];
  const chatType = mek.key.remoteJid.endsWith("@g.us") ? "👥 Group Chat" : "👤 Private Chat";

  const caption = `🤫 *[ SILENT AUTOMATION : VIEW ONCE ]*\n\n` +
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

// Main Silent Automation Dispatcher
async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings?.silent_automation) return;

    // Feature 1: View Once Interceptor
    if (isViewOnce(mek.message)) {
      const clean = unwrapMessage(mek.message);
      await processViewOnceIntercept(sock, mek, clean, sessionCtx);
    }

    // Feature 2: ඉදිරියට එකතු කරන silent actions මෙතැනට plug කරන්න
  } catch (err) {
    console.log("❌ Silent automation error:", err?.message || err);
  }
}

module.exports = { handleSilentAutomation };
