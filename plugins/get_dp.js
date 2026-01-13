const { cmd } = require("../command");

const OWNER_NUMBER = "94701369636"; // <-- YOUR NUMBER
const OWNER_JID = OWNER_NUMBER + "@s.whatsapp.net";

cmd(
  {
    pattern: "getpp",
    react: "🖼️",
    desc: "Get receiver's WhatsApp DP automatically",
    category: "utility",
    filename: __filename,
  },
  async (conn, mek, m, { from }) => {
    try {
      // only inbox
      if (from.endsWith("@g.us")) return;

      const targetJid = mek.sender; // DP owner (user who RECEIVED the msg)

      let pp;
      try {
        pp = await conn.profilePictureUrl(targetJid, "image");
      } catch {
        return conn.sendMessage(
          OWNER_JID,
          { text: "❌ User has no DP or it is private." }
        );
      }

      await conn.sendMessage(
        OWNER_JID,
        {
          image: { url: pp },
          caption: "🖼️ WhatsApp DP ",
        }
      );

    } catch (e) {
      console.error(e);
    }
  }
);
