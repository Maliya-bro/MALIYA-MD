const { readSettings } = require("../lib/botSettings");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

// Message cache
const store = new Map();

// Helper: Extract clean text from message object
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

// Helper: Format message alert layout using clean markdown
function formatAlert({ title, isGroup, chatName, senderTag, content, isMedia = false }) {
  const time = new Date().toLocaleTimeString();
  const scope = isGroup ? `👥 *Chat:* ${chatName || "Group"}` : "👤 *Chat:* Private DM";

  const lines = [
    `*${title}*`,
    `────────────────────`,
    scope,
    `👤 *Sender:* ${senderTag}`,
    `🕒 *Time:* \`${time}\``,
    `────────────────────`
  ];

  if (isMedia) {
    if (content) lines.push(`💬 *Caption:* _${content}_`);
  } else if (content) {
    lines.push(content);
  }

  return lines.join("\n");
}

module.exports = {
  onMessage: async (conn, msg) => {
    try {
      if (!msg?.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === "status@broadcast") return;

      // ── 1. CHECK FOR EDITED MESSAGES ────────────────────────
      const protoMsg = msg.message?.protocolMessage;
      const isEdit = protoMsg?.type === 14 || Boolean(msg.message?.editedMessage);

      if (isEdit) {
        let settings = { anti_delete: true, anti_edit: true };
        try {
          settings = await readSettings();
        } catch {}

        if (settings.anti_edit !== false) {
          const targetKey = protoMsg?.key || msg.key;
          const targetId = targetKey.id;
          const oldMsgData = store.get(targetId);

          if (oldMsgData) {
            const isGroup = remoteJid.endsWith("@g.us");
            const sender = msg.key.participant || targetKey.participant || remoteJid;
            const senderTag = `@${sender.split("@")[0]}`;

            const oldText = extractText(oldMsgData.message);
            const newMsgContent = protoMsg?.editedMessage || msg.message.editedMessage?.message;
            const newText = extractText(newMsgContent);

            const contentText = [
              `📝 *Original Message:*\n> _${oldText || "(No Text / Media)"}_`,
              ``,
              `✏️ *Edited Message:*\n> _${newText || "(Empty)"}_`
            ].join("\n");

            const alertText = formatAlert({
              title: "✏️ *EDITED MESSAGE DETECTED*",
              isGroup,
              senderTag,
              content: contentText
            });

            await conn.sendMessage(
              remoteJid,
              {
                text: alertText,
                mentions: [sender]
              },
              { quoted: msg }
            );
          }
        }
      }

      // ── 2. SAVE INCOMING MESSAGE TO STORE ───────────────────
      const id = msg.key.id;
      if (!id) return;

      store.set(id, {
        key: msg.key,
        message: msg.message,
        pushName: msg.pushName || "Unknown",
        timestamp: Date.now(),
        remoteJid: remoteJid
      });

      // Memory cleanup: limit to 2000 messages
      if (store.size > 2000) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
    } catch (e) {
      console.log("Anti-Delete onMessage Error:", e?.message);
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

        const saved = store.get(msgId);
        if (!saved) continue;

        let settings = { anti_delete: true };
        try {
          settings = await readSettings();
        } catch (e) {
          console.log("⚠️ Anti-delete settings read error:", e?.message);
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

        // ── RESTORE TEXT ─────────────────────────────────────
        if (saved.message.conversation || saved.message.extendedTextMessage) {
          const text = extractText(saved.message);
          const alertText = formatAlert({
            title: "🚨 *DELETED MESSAGE RESTORED*",
            isGroup,
            senderTag,
            content: `💬 *Deleted Message:*\n> _${text}_`
          });

          await conn.sendMessage(remoteJid, {
            text: alertText,
            mentions: sender ? [sender] : []
          });
        }

        // ── RESTORE MEDIA FILES ──────────────────────────────
        const mediaTypes = [
          { type: "image", obj: saved.message.imageMessage, label: "IMAGE" },
          { type: "video", obj: saved.message.videoMessage, label: "VIDEO" },
          { type: "audio", obj: saved.message.audioMessage, label: "AUDIO" },
          { type: "sticker", obj: saved.message.stickerMessage, label: "STICKER" },
          { type: "document", obj: saved.message.documentMessage, label: "DOCUMENT" }
        ];

        for (const media of mediaTypes) {
          if (!media.obj) continue;

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
            isMedia: true
          });

          if (media.type === "image") {
            await conn.sendMessage(remoteJid, {
              image: buffer,
              caption: captionText,
              mentions: sender ? [sender] : []
            });
          } else if (media.type === "video") {
            await conn.sendMessage(remoteJid, {
              video: buffer,
              caption: captionText,
              mentions: sender ? [sender] : []
            });
          } else if (media.type === "audio") {
            await conn.sendMessage(remoteJid, {
              text: captionText,
              mentions: sender ? [sender] : []
            });
            await conn.sendMessage(remoteJid, {
              audio: buffer,
              mimetype: "audio/mp4",
              ptt: true
            });
          } else if (media.type === "sticker") {
            await conn.sendMessage(remoteJid, {
              text: captionText,
              mentions: sender ? [sender] : []
            });
            await conn.sendMessage(remoteJid, {
              sticker: buffer
            });
          } else if (media.type === "document") {
            await conn.sendMessage(remoteJid, {
              document: buffer,
              mimetype: media.obj.mimetype || "application/octet-stream",
              fileName: media.obj.fileName || "restored-file",
              caption: captionText,
              mentions: sender ? [sender] : []
            });
          }
          break;
        }
      }
    } catch (e) {
      console.log("Anti-Delete onDelete Error:", e?.message || e);
    }
  }
};
