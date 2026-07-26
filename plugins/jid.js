const { cmd } = require("../command");

cmd(
  {
    pattern: "getjid",
    desc: "Get WhatsApp Channel JID",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { q, reply }) => {
    try {
      if (!q) {
        return reply(
          "Example:\n.getjid https://whatsapp.com/channel/0029VbCyHsvAO7RKAbYw7p1o"
        );
      }

      // Extract invite code
      const match = q.match(/channel\/([A-Za-z0-9]+)/);

      if (!match) {
        return reply("❌ Invalid WhatsApp Channel Link!");
      }

      const inviteCode = match[1];

      // Get metadata
      const data = await sock.newsletterMetadata(
        "invite",
        inviteCode
      );

      return reply(
        `📢 *Channel Information*\n\n` +
        `• Name: ${data.name}\n` +
        `• JID: ${data.id}\n` +
        `• Subscribers: ${data.subscribers || "Unknown"}`
      );

    } catch (e) {
      console.log(e);
      reply("❌ Failed to fetch Channel JID!\n\n" + e.message);
    }
  }
);
