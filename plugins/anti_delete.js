const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");

cmd(
  {
    on: "message.upsert",
  },
  async (conn, mek) => {
    try {
      if (!mek.messages) return;

      for (const message of mek.messages) {
        const from = message.key.remoteJid;

        // Only inbox (private chat)
        if (from.endsWith("@g.us")) continue;

        // Check if message was deleted
        if (
          message.message?.protocolMessage &&
          message.message.protocolMessage.type === 0
        ) {
          const deletedKey = message.message.protocolMessage.key;

          // Original sender of deleted message
          const sender = deletedKey.participant || deletedKey.remoteJid;

          const deletedMessage = deletedKey.message;
          if (!deletedMessage) continue;

          // Handle text messages
          if (deletedMessage.conversation) {
            await conn.sendMessage(
              sender,
              {
                text: `❌ You deleted this message:\n\n${deletedMessage.conversation}`
              }
            );
          }

          // Handle media messages
          const mediaTypes = ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"];
          for (const type of mediaTypes) {
            if (deletedMessage[type]) {
              const mediaBuffer = await conn.downloadMediaMessage({ message: deletedMessage[type] }, "buffer");
              const ext = type === "imageMessage" ? ".jpg" :
                          type === "videoMessage" ? ".mp4" :
                          type === "audioMessage" ? ".mp3" :
                          type === "stickerMessage" ? ".webp" : ".dat";
              const filename = path.join(__dirname, `deleted_${Date.now()}${ext}`);
              fs.writeFileSync(filename, mediaBuffer);

              await conn.sendMessage(
                sender,
                {
                  [type.replace("Message", "")]: fs.readFileSync(filename),
                  caption: "❌ You deleted this media message"
                }
              );

              fs.unlinkSync(filename);
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
);
