cmd({
  pattern: "decen",
  desc: "English Essay",
  category: "AI",
  react: "📘",
  filename: __filename
},
async (conn, mek, m, { q, reply, react }) => {
  try {
    if (!q) return reply(
      "Example:\n.decen write an essay about artificial intelligence"
    );

    const prompt = `
Write a clear, well-structured English essay.
Formal tone.
No Sinhala.

Topic:
${q}
    `.trim();

    const apiUrl = `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(prompt)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000 });

    if (!data || !data.answer) {
      await react("❌");
      return reply("English essay generate wenne nෑ.");
    }

    await reply(`📘 *English Essay*\n\n${data.answer}`);
    await react("✅");

  } catch (e) {
    console.error(e);
    await react("❌");
    reply("DeepSeek server error. Try again.");
  }
});
