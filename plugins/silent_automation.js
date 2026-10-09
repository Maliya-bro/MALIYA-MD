const { downloadMediaMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const { cmd } = require("../command");
const P = require("pino");

console.log("✅ [SILENT AUTO] Direct Chat Mode + .testinbox Diagnostic Loaded!");

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

async function handleSilentAutomation(sock, mek, m, sessionCtx) {
  try {
    if (!mek?.message || mek.key.fromMe) return;

    const from = mek.key.remoteJid || "";
    if (from.endsWith("@newsletter") || from === "status@broadcast") return;

    // 🎯 කෙළින්ම මැසේජ් එක වැටුණු Chat එකටම යැවීම
    const targetChat = from;

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

      await sock.sendMessage(targetChat, {
        text: editMsg,
        mentions: [rawSender]
      }, { quoted: mek });
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

      // Primary: m.download() wrapper
      try {
        if (m && typeof m.download === "function") {
          buffer = await m.download();
        }
      } catch (_) {}

      // Fallback: Baileys downloadMediaMessage with updateMediaMessage
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
        await sock.sendMessage(targetChat, {
          image: buffer,
          caption: finalCaption,
          mentions
        }, { quoted: mek });
      } else if (type === "video") {
        await sock.sendMessage(targetChat, {
          video: buffer,
          caption: finalCaption,
          mentions
        }, { quoted: mek });
      } else if (type === "audio") {
        await sock.sendMessage(targetChat, {
          audio: buffer,
          mimetype: mediaNode.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
          ptt: mediaNode.ptt === true
        }, { quoted: mek });
        await sock.sendMessage(targetChat, {
          text: finalCaption,
          mentions
        }, { quoted: mek });
      }
    }
  } catch (err) {
    // Silent fail
  }
}

// ── 3. TEST INBOX DIAGNOSTIC COMMAND ──
cmd(
  {
    pattern: "testinbox",
    desc: "Test inbox resolution and direct message delivery",
    category: "owner",
    react: "📬",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, isGroup, reply, sessionId }) => {
    try {
      const sockUser = conn?.user?.id || "N/A";
      const normalizedSockUser = conn?.user?.id ? jidNormalizedUser(conn.user.id) : "N/A";
      const rawChat = from;
      const rawSender = sender;

      const infoText = `📊 *[ INBOX & SESSION DIAGNOSTIC ]* 📊\n\n` +
        `🔹 *Current Chat JID:* \`${rawChat}\`\n` +
        `🔹 *Sender JID:* \`${rawSender}\`\n` +
        `🔹 *Socket User JID:* \`${sockUser}\`\n` +
        `🔹 *Normalized User JID:* \`${normalizedSockUser}\`\n` +
        `🔹 *Session ID:* \`${sessionId || "N/A"}\`\n` +
        `🔹 *Is Group:* ${isGroup ? "Yes" : "No"}\n\n` +
        `⏳ *Testing Self-Delivery in 2 seconds...*`;

      await reply(infoText);

      // Direct test message to Normalized User JID
      if (normalizedSockUser !== "N/A") {
        try {
          await conn.sendMessage(normalizedSockUser, {
            text: `✅ *[ DIRECT SELF-INBOX TEST SUCCESSFUL ]*\n\nමෙම පණිවිඩය සාර්ථකව ඔබේ Normalized JID (\`${normalizedSockUser}\`) වෙත ලැබුණි.`
          });
        } catch (selfErr) {
          await reply(`❌ *Self-Inbox Delivery Failed:* ${selfErr?.message || selfErr}`);
        }
      }
    } catch (e) {
      reply(`❌ *Diagnostic Error:* ${e?.message || e}`);
    }
  }
);

module.exports = { handleSilentAutomation };
