const { cmd } = require("../command");

cmd(
  {
    pattern: "getpp",
    react: "🖼️",
    desc: "Fetch someone else's DP and send to requester",
    category: "utility",
    filename: __filename,
  },
  async (conn, mek, m, { from, reply, q }) => {
    try {
      // Only private chat
      if (from.endsWith("@g.us")) {
        return reply("*❌ This command works only in private chat.*");
      }

      if (!q) return reply("*❌ Send like this: .getpp 9477xxxx or .getpp @mention*");

      let targetJid;

      // Mention
      if (mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        targetJid = mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
      }
      // Number
      else {
        const number = q.replace(/[^0-9]/g, "");
        targetJid = number + "@s.whatsapp.net";
      }

      let pp;
      try {
        pp = await conn.profilePictureUrl(targetJid, "image");
      } catch {
        return reply("*❌ Target user has no DP or it is private.*");
      }

      // Send DP back to requester
      await conn.sendMessage(
        from,
        {
          image: { url: pp },
          caption: `🖼️ *Here is the profile picture of the requested user*`,
        },
        { quoted: mek }
      );

    } catch (e) {
      console.error(e);
      reply("*❌ Error while fetching DP*");
    }
  }
);
