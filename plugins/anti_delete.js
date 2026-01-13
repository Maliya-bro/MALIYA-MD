const { cmd } = require("../command");

cmd(
  {
    on: "message.upsert",
  },
  async (conn, mek) => {
    try {
      // Ignore if no message
      if (!mek.messages) return;

      for (const message of mek.messages) {
        // Only private chat
        if (message.key.remoteJid.endsWith("@g.us")) continue;

        // Deleted message type
        if (
          message.message?.protocolMessage &&
          message.message.protocolMessage.type === 0
        ) {
          const deletedKey = message.message.protocolMessage.key;

          // fetch original message
          const deletedMsg = deletedKey.id
            ? deletedKey
            : { id: "unknown", remoteJid: message.key.remoteJid };

          // get sender
          const sender = deletedKey.fromMe ? deletedKey.remoteJid : deletedKey.participant || deletedKey.remoteJid;

          // original message content
          const original = deletedKey.message || "📝 [Unknown content]";

          // Send back deleted message to the **user who deleted**
          await conn.sendMessage(
            sender,
            {
              text: `❌ You deleted this message.:\n\n${JSON.stringify(original, null, 2)}`,
            }
          );
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
);
