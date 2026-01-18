const { cmd } = require("../command");
const axios = require("axios");

async function askAI(prompt) {
  const apiUrl = `https://vapis.my.id/api/openai?q=${encodeURIComponent(prompt)}`;
  const { data } = await axios.get(apiUrl, { timeout: 20000 });
  return data?.result || null;
}

// ====================== .dec (Sinhala Rachana) ======================
cmd(
  {
    pattern: "dec",
    desc: "සිංහල රචනා ලියන්න",
    category: "ai",
    react: "📝",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply, react }) => {
    try {
      if (!q) {
        return reply(
          "❗ *රචනා මාතෘකාව දෙන්න*\n\n" +
          "උදාහරණ:\n" +
          "`.dec මගේ පාසල`\n" +
          "`.dec පරිසරය රැකගැනීම`"
        );
      }

      await react("⏳");

      const prompt =
        `ඔබ සිංහල ගුරුතුමා/ගුරුතුමියෙක් වගේ රචනා ලියන්න.\n` +
        `මාතෘකාව: "${q}"\n\n` +
        `අවශ්‍යතා:\n` +
        `- සම්පූර්ණයෙන්ම සිංහල අකුරු වලින් (Singlish නෙමෙයි)\n` +
        `- පාසල් මට්ටමේ (Grade 6-11) තේරුම් ගන්න ලේසි\n` +
        `- වචන ~200-300 අතර\n` +
        `- නිගමනයක් එක්කරන්න\n`;

      const result = await askAI(prompt);

      if (!result) {
        await react("❌");
        return reply("⚠️ AI එකෙන් පිළිතුරක් ආවේ නැහැ. පොඩ්ඩක් පස්සේ try කරන්න.");
      }

      await react("✅");
      return reply(`📝 *සිංහල රචනාව*\n\n${result}`);
    } catch (e) {
      console.error("DEC ERROR:", e);
      await react("❌");
      return reply("❌ රචනාව ලියද්දි දෝෂයක් ආවා. (API/Internet issue වෙන්න පුළුවන්)");
    }
  }
);

// ====================== .decen (English Essay) ======================
cmd(
  {
    pattern: "decen",
    desc: "Write an English essay",
    category: "ai",
    react: "📝",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply, react }) => {
    try {
      if (!q) {
        return reply(
          "❗ *Please provide an essay topic*\n\n" +
          "Examples:\n" +
          "`.decen My School`\n" +
          "`.decen Protecting the Environment`"
        );
      }

      await react("⏳");

      const prompt =
        `Write a clear school-level English essay.\n` +
        `Topic: "${q}"\n\n` +
        `Requirements:\n` +
        `- 200 to 300 words\n` +
        `- Simple and easy vocabulary\n` +
        `- Include an introduction, body, and conclusion\n`;

      const result = await askAI(prompt);

      if (!result) {
        await react("❌");
        return reply("⚠️ OpenAI didn't respond. Please try again later.");
      }

      await react("✅");
      return reply(`📝 *English Essay*\n\n${result}`);
    } catch (e) {
      console.error("DECEN ERROR:", e);
      await react("❌");
      return reply("❌ An error occurred while writing the essay. (API/Internet issue)");
    }
  }
);

