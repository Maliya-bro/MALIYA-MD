const { downloadContentFromMessage, getContentType } = require("@whiskeysockets/baileys");
const { readSettings } = require("../lib/botSettings");
const config = require("../config");

console.log("✅ [SILENT AUTO] Plugin file loaded successfully!");

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

async function getBuffer(mediaMsg, type) {
  try {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (e) {
    console.log("❌ [SILENT AUTO] Stream Download Error:", e?.message || e);
    return null;
  }
}

function getTargetJid(sock) {
  if (sock?.user?.id) {
    const num = sock.user.id.split("@")[0].split(":")[0].replace(/\D/g, "");
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

    const rawType = Object.keys(mek.message)[0];
    const from = mek.key?.remoteJid || "";

    // 🔍 1. Console Log Every Incoming Message
    console.log(`\n🔍 [INCOMING MSG] Type: ${rawType} | From: ${from} | ID: ${mek.key?.id}`);

    // Check Settings
    const sid = sessionCtx?.sessionId;
    let isEnabled = false;
    try {
      const s = await readSettings(sid);
      isEnabled = Boolean(s?.silent_automation);
      console.log(`⚙️ [SETTING CHECK] Session: ${sid} | silent_automation: ${isEnabled}`);
    } catch (e) {
      console.log("⚠️ [SETTING CHECK] Error reading settings, default to TRUE:", e.message);
      isEnabled = true;
    }

    if (!isEnabled) {
      console.log("⛔ [BLOCKED] silent_automation is OFF in settings. Turn it ON via .setting on silent");
      return;
    }

    const targetInbox = getTargetJid(sock);
    console.log(`🎯 [TARGET INBOX RESOLVED] -> ${targetInbox}`);

    if (!targetInbox) {
      console.log("❌ [FAILED] Could not determine target inbox JID.");
      return;
    }

    const isGroup = from.endsWith("@g.us");
    const sender = (mek.key.participant || from).split("@")[0].split(":")[0];
    const chatType = isGroup ? "👥 Group Chat" : "👤 Private Chat (DM)";

    // ── 2. EDITED MESSAGE CHECK ──
    const proto = mek.message?.protocolMessage;
    if (proto) {
      console.log(`🔔 [PROTOCOL DETECTED] Type: ${proto.type} | TargetID: ${proto.key?.id}`);
    }

    if (proto && proto.type === 14) {
      console.log("🎯 [EDIT DETECTED] Processing Edited Message...");
      const targetId = proto.key?.id;
      const cached = msgCache.get(targetId);
      const newText = getText(proto.editedMessage);
      const oldText = cached ? cached.text : "*(Not cached or sent before bot was online)*";

      console.log(`📝 [EDIT CONTENT] Old: "${oldText}" -> New: "${newText}"`);

      const editCaption = `📝 *[ SILENT AUTO : MESSAGE EDITED ]*\n\n` +
        `📍 *Chat:* ${chatType}\n` +
        `👤 *Sender:* @${sender}\n\n` +
        `❌ *Original:*\n${oldText}\n\n` +
        `✏️ *Edited:*\n${newText || "*(Empty/Cleared)*"}`;

      await sock.sendMessage(targetInbox, {
        text: editCaption,
        mentions: [mek.key.participant || from]
      });
      console.log(`✅ [EDIT SENT] Dispatched to inbox: ${targetInbox}`);
      return;
    }

    // Cache normal text messages
    const textContent = getText(mek.message);
    if (mek.key?.id && textContent) {
      msgCache.set(mek.key.id, { text: textContent, time: Date.now() });
      console.log(`💾 [CACHED MSG] ID: ${mek.key.id} | Preview: "${textContent.slice(0, 30)}"`);
      if (msgCache.size > 1500) {
        const first = msgCache.keys().next().value;
        if (first) msgCache.delete(first);
      }
    }

    // ── 3. VIEW ONCE CHECK ──
    const isVV = checkIsViewOnce(mek.message);
    console.log(`👁️ [VIEW ONCE CHECK] Is View Once? -> ${isVV}`);

    if (isVV) {
      console.log("🚀 [VV DETECTED] Unwrapping View Once Node...");
      const clean = unwrap(mek.message);
      if (!clean) {
        console.log("❌ [VV FAIL] Failed to unwrap clean message.");
        return;
      }

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

      console.log(`📦 [MEDIA DETECTED] Type: ${msgType} | Stream: ${streamType}`);

      if (!msgType) {
        console.log("❌ [VV FAIL] Unsupported media payload.");
        return;
      }

      const mediaNode = clean[msgType];
      if (!mediaNode) {
        console.log("❌ [VV FAIL] mediaNode is null or undefined.");
        return;
      }

      console.log("⏳ [DOWNLOADING STREAM] Fetching media buffer...");
      const buffer = await getBuffer(mediaNode, streamType);

      if (!buffer || !buffer.length) {
        console.log("❌ [VV FAIL] Buffer download failed or returned 0 bytes.");
        return;
      }

      console.log(`✅ [DOWNLOAD SUCCESS] Buffer Size: ${buffer.length} bytes. Dispatching to ${targetInbox}...`);

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
      console.log(`🎉 [VV SUCCESS] View Once delivered to inbox: ${targetInbox}`);
    }
  } catch (err) {
    console.log("❌ [SILENT AUTO ERROR]:", err);
  }
}

module.exports = { handleSilentAutomation };
