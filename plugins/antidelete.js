const { readSettings, getDb } = require("../lib/botSettings");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const MSG_COLLECTION = "wa_antidelete_store";
let ttlEnsured = false;

// ── MongoDB TTL Index (Auto-delete older than 24h) ───────────
async function ensureIndex() {
  if (ttlEnsured) return;
  try {
    const db = await getDb();
    const col = db.collection(MSG_COLLECTION);
    await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours
    ttlEnsured = true;
  } catch (_) {}
}

function extractText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  );
}

function formatAlert({ title, isGroup, senderTag, content, isMedia = false }) {
  const time = new Date().toLocaleTimeString();
  const scope = isGroup ? "👥 *Chat:* Group" : "👤 *Chat:* Private DM";

  const lines = [
    `*${title}*`,
    `────────────────────`,
    scope,
    `👤 *Sender:* ${senderTag}`,
    `🕒 *Time:* \`${time}\``,
    `────────────────────`,
  ];

  if (isMedia) {
    if (content) lines.push(`💬 *Caption:* _${content}_`);
  } else if (content) {
    lines.push(content);
  }

  return lines.join("\n");
}

async function handleEditMessage(conn, updateObj) {
  try {
    const key = updateObj?.key;
    const message = updateObj?.message || updateObj?.update?.message;
    if (!key || !message) return;

    const protoMsg = message?.protocolMessage;
    const isEdit = protoMsg?.type === 14 || Boolean(protoMsg?.editedMessage) || Boolean(message?.editedMessage);
    if (!isEdit) return;

    const targetKey = protoMsg?.key || key;
    const targetId = targetKey.id;
    if (!targetId) return;

    const db = await getDb();
    const col = db.collection(MSG_COLLECTION);
    const oldMsgData = await col.findOne({ messageId: targetId });
    if (!oldMsgData) return;

    let settings = { anti_edit: true };
    try {
      settings = await readSettings();
    } catch {}
    if (settings.anti_edit === false) return;

    const remoteJid = key.remoteJid || targetKey.remoteJid;
    if (!remoteJid || remoteJid === "status@broadcast") return;

    const isGroup = remoteJid.endsWith("@g.us");
    const sender = key.participant || targetKey.participant || (isGroup ? null : remoteJid) || "";
    const senderTag = sender ? `@${sender.split("@")[0]}` : "Unknown";

    const oldText = oldMsgData.text || "";
    const newMsgObj = protoMsg?.editedMessage || message?.editedMessage?.message || message?.editedMessage;
    const newText = extractText(newMsgObj);

    if (oldText && newText && oldText === newText) return;

    const contentText = [
      `📝 *Original Message:*\n> _${oldText || "(Empty / Media)"}_`,
      ``,
      `✏️ *Edited Message:*\n> _${newText || "(Empty)"}_`,
    ].join("\n");

    const alertText = formatAlert({
      title: "✏️ *EDITED MESSAGE DETECTED*",
      isGroup,
      senderTag,
      content: contentText,
    });

    await conn.sendMessage(remoteJid, {
      text: alertText,
      mentions: sender ? [sender] : [],
    });

    await col.updateOne(
      { messageId: targetId },
      { $set: { text: newText, message: newMsgObj, updatedAt: new Date() } }
    );
  } catch (e) {
    console.log("Anti-Edit Error:", e?.message || e);
  }
}

module.exports = {
  onMessage: async (conn, msg) => {
    try {
      if (!msg?.message || msg.key?.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === "status@broadcast") return;

      const protoMsg = msg.message?.protocolMessage;
      if (protoMsg?.type === 14 || Boolean(msg.message?.editedMessage)) {
        await handleEditMessage(conn, msg);
        return;
      }

      const id = msg.key.id;
      if (!id) return;

      await ensureIndex();

      const db = await getDb();
      const col = db.collection(MSG_COLLECTION);

      const text = extractText(msg.message);

      // Lightweight MongoDB Document (No Buffer Bloat)
      await col.updateOne(
        { messageId: id },
        {
          $set: {
            messageId: id,
            key: msg.key,
            message: msg.message,
            text: text,
            pushName: msg.pushName || "Unknown",
            remoteJid: remoteJid,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.log("Anti-Delete onMessage Error:", e?.message);
    }
  },

  onUpdate: async (conn, updates) => {
    try {
      for (const update of updates) {
        await handleEditMessage(conn, update);
      }
    } catch (e) {
      console.log("Anti-Edit onUpdate Error:", e?.message || e);
    }
  },

  onDelete: async (conn, updates) => {
    try {
      for (const item of updates) {
        const key = item?.key;
        const update = item?.update;
        if (!key || !update) continue;

        const remoteJid = key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") continue;

        const isDeleted =
          update.message === null ||
          update.messageStubType === 1 ||
          update.messageStubType === 2;

        if (!isDeleted) continue;

        const msgId = key.id;
        if (!msgId) continue;

        const db = await getDb();
        const col = db.collection(MSG_COLLECTION);
        const saved = await col.findOne({ messageId: msgId });
        if (!saved || !saved.message) continue;

        let settings = { anti_delete: true };
        try {
          settings = await readSettings();
        } catch (e) {
          continue;
        }

        if (!settings.anti_delete) continue;

        const isGroup = remoteJid.endsWith("@g.us");
        const sender =
          key.participant ||
          saved.key?.participant ||
          (isGroup ? null : remoteJid) ||
          "";

        const senderTag = sender ? `@${sender.split("@")[0]}` : "Unknown";

        // Restore Text
        if (saved.message.conversation || saved.message.extendedTextMessage) {
          const text = extractText(saved.message);
          const alertText = formatAlert({
            title: "🚨 *DELETED MESSAGE RESTORED*",
            isGroup,
            senderTag,
            content: `💬 *Deleted Message:*\n> _${text}_`,
          });

          await conn.sendMessage(remoteJid, {
            text: alertText,
            mentions: sender ? [sender] : [],
          });
        }

        // Restore Media
        const mediaTypes = [
          { type: "image", obj: saved.message.imageMessage, label: "IMAGE" },
          { type: "video", obj: saved.message.videoMessage, label: "VIDEO" },
          { type: "audio", obj: saved.message.audioMessage, label: "AUDIO" },
          { type: "sticker", obj: saved.message.stickerMessage, label: "STICKER" },
          { type: "document", obj: saved.message.documentMessage, label: "DOCUMENT" },
        ];

        for (const media of mediaTypes) {
          if (!media.obj) continue;

          try {
            const stream = await downloadContentFromMessage(media.obj, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            const captionText = formatAlert({
              title: `🚨 *RESTORED ${media.label}*`,
              isGroup,
              senderTag,
              content: media.obj.caption || "",
              isMedia: true,
            });

            if (media.type === "image") {
              await conn.sendMessage(remoteJid, { image: buffer, caption: captionText, mentions: sender ? [sender] : [] });
            } else if (media.type === "video") {
              await conn.sendMessage(remoteJid, { video: buffer, caption: captionText, mentions: sender ? [sender] : [] });
            } else if (media.type === "audio") {
              await conn.sendMessage(remoteJid, { text: captionText, mentions: sender ? [sender] : [] });
              await conn.sendMessage(remoteJid, { audio: buffer, mimetype: "audio/mp4", ptt: true });
            } else if (media.type === "sticker") {
              await conn.sendMessage(remoteJid, { text: captionText, mentions: sender ? [sender] : [] });
              await conn.sendMessage(remoteJid, { sticker: buffer });
            } else if (media.type === "document") {
              await conn.sendMessage(remoteJid, {
                document: buffer,
                mimetype: media.obj.mimetype || "application/octet-stream",
                fileName: media.obj.fileName || "restored-file",
                caption: captionText,
                mentions: sender ? [sender] : [],
              });
            }

            buffer = null; // Clean buffer immediately
          } catch (dlErr) {
            console.log("AntiDelete media download error:", dlErr?.message);
          }
          break;
        }
      }
    } catch (e) {
      console.log("Anti-Delete onDelete Error:", e?.message || e);
    }
  },
};
