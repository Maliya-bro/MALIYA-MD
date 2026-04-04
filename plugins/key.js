const { cmd } = require("../command");
const { saveUserKey } = require("../lib/mega_db");

cmd(
  {
    pattern: "key",
    desc: "Set Gemini API key",
    category: "AI",
    react: "🔑",
    filename: __filename,
  },
  async (conn, mek, m, { args, reply }) => {
    const jid = mek.key.remoteJid;
    const key = args[0];

    if (!key) return reply("❌ Use: .key YOUR_GEMINI_API_KEY");

    await saveUserKey(jid, key);

    return reply("✅ API Key saved to MEGA + linked to your number");
  }
);
