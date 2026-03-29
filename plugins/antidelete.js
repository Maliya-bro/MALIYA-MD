const { readSettings } = require("../lib/botSettings");

const store = new Map();

module.exports = {
  onMessage: async (conn, msg) => {
    if (!readSettings().anti_delete) return;
    if (!msg?.message || msg.key.fromMe) return;

    try {
      const id = msg.key.id;
      if (!id) return;

      store.set(id, {
        key: msg.key,
        message: msg.message,
        pushName: msg.pushName || "Unknown",
        timestamp: Date.now(),
      });

      if (store.size > 1000) {
        const firstKey = store.keys().next().value;
        if (firstKey) store.delete(firstKey);
      }
    } catch {}
  },

  onDelete: async (conn, updates) => {
    if (!readSettings().anti_delete) return;

    try {
      for (const item of updates) {
        const key = item?.key;
        const update = item?.update;

        if (!key || !update) continue;

        const deleted =
          update.message === null ||
          update.messageStubType === 1 ||
          update.messageStubType === 2;

        if (!deleted) continue;

        const msgId = key.id;
        if (!msgId) continue;

        const saved = store.get(msgId);
        if (!saved) continue;

        const jid = key.remoteJid;
        const sender =
          key.participant ||
          key.remoteJid ||
          saved.key?.participant ||
          saved.key?.remoteJid ||
          "";

        const senderTag = sender ? `@${String(sender).split("@")[0]}` : "Unknown";

        const infoText = `🚨 *ANTI DELETE*\n\n👤 Sender: ${senderTag}\n🕒 Message restored successfully.`;

        if (saved.message.conversation || saved.message.extendedTextMessage) {
          const text =
            saved.message.conversation ||
            saved.message.extendedTextMessage?.text ||
            "";

          await conn.sendMessage(jid, {
            text: `${infoText}\n\n💬 Message:\n${text}`,
            mentions: sender ? [sender] : [],
          });
        } else if (saved.message.imageMessage) {
          await conn.sendMessage(jid, {
            text: infoText,
            mentions: sender ? [sender] : [],
          });

          await conn.sendMessage(jid, {
            image: { url: saved.message.imageMessage.url || "" },
            caption: saved.message.imageMessage.caption || "Restored deleted image",
          }).catch(async () => {
            await conn.sendMessage(jid, {
              text: "🖼️ Deleted image detected, but media could not be restored.",
            });
          });
        } else if (saved.message.videoMessage) {
          await conn.sendMessage(jid, {
            text: infoText,
            mentions: sender ? [sender] : [],
          });

          await conn.sendMessage(jid, {
            video: { url: saved.message.videoMessage.url || "" },
            caption: saved.message.videoMessage.caption || "Restored deleted video",
          }).catch(async () => {
            await conn.sendMessage(jid, {
              text: "🎥 Deleted video detected, but media could not be restored.",
            });
          });
        } else if (saved.message.audioMessage) {
          await conn.sendMessage(jid, {
            text: infoText,
            mentions: sender ? [sender] : [],
          });

          await conn.sendMessage(jid, {
            audio: { url: saved.message.audioMessage.url || "" },
            mimetype: saved.message.audioMessage.mimetype || "audio/mp4",
            ptt: false,
          }).catch(async () => {
            await conn.sendMessage(jid, {
              text: "🎵 Deleted audio detected, but media could not be restored.",
            });
          });
        } else if (saved.message.stickerMessage) {
          await conn.sendMessage(jid, {
            text: infoText,
            mentions: sender ? [sender] : [],
          });

          await conn.sendMessage(jid, {
            sticker: { url: saved.message.stickerMessage.url || "" },
          }).catch(async () => {
            await conn.sendMessage(jid, {
              text: "🧩 Deleted sticker detected, but media could not be restored.",
            });
          });
        } else if (saved.message.documentMessage) {
          await conn.sendMessage(jid, {
            text: infoText,
            mentions: sender ? [sender] : [],
          });

          await conn.sendMessage(jid, {
            document: { url: saved.message.documentMessage.url || "" },
            mimetype: saved.message.documentMessage.mimetype,
            fileName: saved.message.documentMessage.fileName || "restored-file",
            caption: saved.message.documentMessage.caption || "",
          }).catch(async () => {
            await conn.sendMessage(jid, {
              text: "📄 Deleted document detected, but media could not be restored.",
            });
          });
        } else {
          await conn.sendMessage(jid, {
            text: `${infoText}\n\n⚠️ Deleted message type detected but could not be fully restored.`,
            mentions: sender ? [sender] : [],
          });
        }
      }
    } catch (e) {
      console.log("antidelete onDelete error:", e?.message || e);
    }
  },
};
