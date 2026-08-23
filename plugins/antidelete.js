const { readSettings } = require("../lib/botSettings");
const {
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const store = new Map();

module.exports = {
  onMessage: async (conn, msg) => {
    // ✅ FIX: await readSettings() with sessionId
    // msg.key.remoteJid එකෙන් sessionId එක හොයාගන්න බැරි නිසා,
    // අපිට මෙතනදි sessionId pass කරන්න අමාරුයි. 
    // ඒ නිසා අපි anti_delete check එක onDelete වලදි කරමු.
    // onMessage එකේදි message එක store කරන්න විතරයි.
    
    if (!msg?.message || msg.key.fromMe) return;

    // ── PRIVATE CHATS ONLY ──────────────────────────────────
    // Skip group messages entirely
    if (msg.key.remoteJid?.endsWith("@g.us")) return;
    // ────────────────────────────────────────────────────────

    try {
      const id = msg.key.id;
      if (!id) return;

      store.set(id, {
        key: msg.key,
        message: msg.message,
        pushName: msg.pushName || "Unknown",
        timestamp: Date.now(),
        remoteJid: msg.key.remoteJid, // ✅ store the chat ID
      });

      // limit memory
      if (store.size > 1000) {
        const firstKey = store.keys().next().value;
        if (firstKey) store.delete(firstKey);
      }
    } catch {}
  },

  onDelete: async (conn, updates) => {
    try {
      for (const item of updates) {
        const key = item?.key;
        const update = item?.update;

        if (!key || !update) continue;

        const jid = key.remoteJid;

        // ── PRIVATE CHATS ONLY ────────────────────────────
        // Skip group delete events entirely
        if (jid?.endsWith("@g.us")) continue;
        // ──────────────────────────────────────────────────

        const deleted =
          update.message === null ||
          update.messageStubType === 1 ||
          update.messageStubType === 2;

        if (!deleted) continue;

        const msgId = key.id;
        if (!msgId) continue;

        const saved = store.get(msgId);
        if (!saved) continue;

        // ✅ FIX: Get sessionId from the saved message or from context
        // For anti-delete, we need to check if anti_delete is enabled
        // Since we don't have sessionId directly, we'll use the remoteJid
        // to determine which session this belongs to.
        // Actually, the sessionId is not stored in the message.
        // We need to pass sessionId from index.js to this plugin.
        // But let's check if anti_delete is enabled globally for now.
        
        // ✅ FIX: Use sessionId from the saved message or default
        // We'll try to get sessionId from the saved message
        // In index.js, we need to pass sessionId to the plugin.
        // For now, let's read settings without sessionId (uses "default")
        // But we should pass sessionId from index.js
        
        // ✅ FIX: For now, read settings with the default session
        // Later we can pass sessionId from index.js
        let settings;
        try {
          // Try to get settings from the session
          // Since we don't have sessionId here, we'll use the saved remoteJid
          // to determine which session it belongs to.
          // Actually, the better approach is to store sessionId with the message
          // But that requires changes in index.js
          
          // For now, let's read settings without sessionId (uses "default")
          settings = await readSettings();
        } catch (e) {
          console.log("⚠️ Anti-delete settings read error:", e?.message);
          continue;
        }

        // ✅ FIX: Check anti_delete setting
        if (!settings.anti_delete) continue;

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
