const { readSettings } = require("../lib/botSettings");
const {
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

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

      // limit memory
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

        const senderTag = sender
          ? `@${String(sender).split("@")[0]}`
          : "Unknown";

        const infoText = `🚨 *ANTI DELETE*\n\n👤 Sender: ${senderTag}\n🕒 Message restored successfully.`;

        // 📝 TEXT
        if (saved.message.conversation || saved.message.extendedTextMessage) {
          const text =
            saved.message.conversation ||
            saved.message.extendedTextMessage?.text ||
            "";

          await conn.sendMessage(jid, {
            text: `${infoText}\n\n💬 Message:\n${text}`,
            mentions: sender ? [sender] : [],
          });
        }

        // 🖼️ IMAGE
        else if (saved.message.imageMessage) {
          await conn.sendMessage(jid, { text: infoText });

          try {
            const stream = await downloadContentFromMessage(
              saved.message.imageMessage,
              "image"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            await conn.sendMessage(jid, {
              image: buffer,
              caption:
                saved.message.imageMessage.caption || "Restored image",
            });
          } catch {
            await conn.sendMessage(jid, {
              text: "🖼️ Cannot restore image",
            });
          }
        }

        // 🎥 VIDEO
        else if (saved.message.videoMessage) {
          await conn.sendMessage(jid, { text: infoText });

          try {
            const stream = await downloadContentFromMessage(
              saved.message.videoMessage,
              "video"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            await conn.sendMessage(jid, {
              video: buffer,
              caption:
                saved.message.videoMessage.caption || "Restored video",
            });
          } catch {
            await conn.sendMessage(jid, {
              text: "🎥 Cannot restore video",
            });
          }
        }

        // 🔊 AUDIO / VOICE
        else if (saved.message.audioMessage) {
          await conn.sendMessage(jid, { text: infoText });

          try {
            const stream = await downloadContentFromMessage(
              saved.message.audioMessage,
              "audio"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            await conn.sendMessage(jid, {
              audio: buffer,
              mimetype: "audio/mp4",
              ptt: true,
            });
          } catch {
            await conn.sendMessage(jid, {
              text: "🎵 Cannot restore audio",
            });
          }
        }

        // 🧩 STICKER
        else if (saved.message.stickerMessage) {
          await conn.sendMessage(jid, { text: infoText });

          try {
            const stream = await downloadContentFromMessage(
              saved.message.stickerMessage,
              "sticker"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            await conn.sendMessage(jid, {
              sticker: buffer,
            });
          } catch {
            await conn.sendMessage(jid, {
              text: "🧩 Cannot restore sticker",
            });
          }
        }

        // 📄 DOCUMENT
        else if (saved.message.documentMessage) {
          await conn.sendMessage(jid, { text: infoText });

          try {
            const stream = await downloadContentFromMessage(
              saved.message.documentMessage,
              "document"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            await conn.sendMessage(jid, {
              document: buffer,
              mimetype:
                saved.message.documentMessage.mimetype ||
                "application/octet-stream",
              fileName:
                saved.message.documentMessage.fileName ||
                "restored-file",
            });
          } catch {
            await conn.sendMessage(jid, {
              text: "📄 Cannot restore document",
            });
          }
        }

        // ⚠️ OTHER
        else {
          await conn.sendMessage(jid, {
            text: `${infoText}\n\n⚠️ Unknown message type.`,
          });
        }
      }
    } catch (e) {
      console.log("antidelete error:", e?.message || e);
    }
  },
};
