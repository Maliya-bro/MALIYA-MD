const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const { readSettings } = require("../lib/botSettings");
const config = require("../config");

const msgCache = new Map();

// විනාඩි 15කට පරණ Cache වුණු මැසේජ් අයින් කරනවා
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of msgCache.entries()) {
    if (now - val.time > 15 * 60 * 1000) msgCache.delete(key);
  }
}, 60 * 1000);

// ඔයාගේ .vv එකේ වැඩ කරපු Exact Logic එකමයි මේ 
function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function isViewOnceMessage(m) {
  if (!m) return false;
  if (m.viewOnceMessage || m.viewOnceMessageV2) return true;
  const ep = m.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2) return true;
  if (m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce) return true;
  const clean = unwrapMessage(m);
  if (clean?.imageMessage?.viewOnce || clean?.videoMessage?.viewOnce || clean?.audioMessage?.viewOnce) return true;
  return false;
}

function detectMedia(m) {
  if (!m) return null;
  if (m.imageMessage) return { type: "image", node: m.imageMessage };
  if (m.videoMessage) return { type: "video", node: m.videoMessage };
  if (m.audioMessage) return { type: "audio", node: m.audioMessage, ptt: m.audioMessage.ptt === true };
  if (m.documentMessage) return { type: "document", node: m.documentMessage };
  return null;
}

function getText(m) {
  const clean = unwrapMessage(m);
  if (!clean) return "";
  return (clean.conversation || clean.extendedTextMessage?.text || clean.imageMessage?.caption || clean.videoMessage?.caption || clean.documentMessage?.caption || "").trim();
}

// Bot Owner ගේ JID එක හරියටම ගන්නවා
function getOwnerJid(sock, sessionCtx) {
  let num = sock?.user?.id;
  if (num) return `${num.split("@")[0].split(":")[0]}@s.whatsapp.net`;
  num = sessionCtx?.ownerNumber?.[0];
  if (num) return `${String(num).replace(/\D/g, "")}@s.whatsapp.net`;
  if (config.BOT_OWNER) return `${String(config.BOT_OWNER).replace(/\D/g, "")}@s.whatsapp.net`;
  return null;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const from = mek.key.remoteJid || "";
    // Channels සහ Status Broadcast අයින් කරනවා
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    // ⚠️ FORCE ENABLE: ඔයාගේ DB එකේ Settings save වෙන්නේ නැති ප්‍රශ්නයක් තියෙන නිසා 
    // මම Settings Check එක අයින් කරලා කෙලින්ම True කරලා තියෙන්නේ. දැන් අනිවාර්යයෙන් වැඩ කරන්නම ඕනේ.
    const isEnabled = true; 
    if (!isEnabled) return;

    const targetInbox = getOwnerJid(sock, sessionCtx);
    if (!targetInbox) return;

    const sender = (mek.key.participant || from).split("@")[0].split(":")[0];
    const chatType = from.endsWith("@g.us") ? "👥 Group" : "👤 Private";

    // ── 1. EDITED MESSAGE TRACKER ──
    if (mek.message.protocolMessage?.type === 14) {
      const targetId = mek.message.protocolMessage.key?.id;
      const cached = msgCache.get(targetId);
      const newText = getText(mek.message.protocolMessage.editedMessage);
      const oldText = cached ? cached.text : "*(Not cached)*";

      if (cached && cached.text === newText) return;

      await sock.sendMessage(targetInbox, {
        text: `📝 *[ MESSAGE EDITED ]*\n📍 *Chat:* ${chatType}\n👤 *Sender:* @${sender}\n\n❌ *Old:*\n${oldText}\n\n✏️ *New:*\n${newText || "*(Cleared)*"}`,
        mentions: [mek.key.participant || from]
      });
      return;
    }

    // සාමාන්‍ය මැසේජ් Text එක Cache එකට දානවා (පස්සේ කවුරුහරි Edit කරොත් අල්ලන්න)
    const text = getText(mek.message);
    if (mek.key?.id && text) msgCache.set(mek.key.id, { text, time: Date.now() });

    // ── 2. VIEW ONCE GRABBER ──
    if (isViewOnceMessage(mek.message)) {
      const clean = unwrapMessage(mek.message);
      const media = detectMedia(clean);
      if (!media || !media.node?.mediaKey) return;

      // හරියටම ඔයාගේ .vv එකේ තිබ්බ Download විදිහ
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

      const caption = `🤫 *[ VIEW ONCE CAPTURED ]*\n📍 *Chat:* ${chatType}\n👤 *Sender:* @${sender}\n💬 *Caption:* ${media.node.caption || "None"}`;

      if (media.type === "image") {
        await sock.sendMessage(targetInbox, { image: buffer, caption, mentions: [mek.key.participant || from] });
      } else if (media.type === "video") {
        await sock.sendMessage(targetInbox, { video: buffer, caption, mentions: [mek.key.participant || from] });
      } else if (media.type === "audio") {
        await sock.sendMessage(targetInbox, { audio: buffer, mimetype: media.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg", ptt: media.ptt });
        await sock.sendMessage(targetInbox, { text: caption, mentions: [mek.key.participant || from] });
      }
    }
  } catch (err) {
    console.log("❌ Silent auto error:", err?.message);
  }
}

module.exports = { handleSilentAutomation };
