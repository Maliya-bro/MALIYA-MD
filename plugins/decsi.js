const { cmd } = require('../command');
const axios = require('axios');

cmd({
  pattern: "dec",
  desc: "Get essay in Sinhala",
  category: "AI",
  react: "📝",
  filename: __filename
},
async (conn, mek, m, { q, reply, react }) => {
  try {
    if (!q) return reply(
      "Example:\n.dec api technology gana podi rachanak liyanna"
    );

    const prompt = `
User input may be Singlish or English.
Write a proper Sinhala essay only.
Do NOT use Singlish.
Do NOT include English.

Topic:
${q}
    `.trim();

    const apiUrl = `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(prompt)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000 });

    if (!data || !data.answer) {
      await react("❌");
      return reply("Sinhala rachana generate wenne nෑ.");
    }

    await reply(`📝 *සිංහල රචනාව*\n\n${data.answer}`);
    await react("✅");

  } catch (e) {
    console.error(e);
    await react("❌");
    reply("DeepSeek server error. Try again.");
  }
});
