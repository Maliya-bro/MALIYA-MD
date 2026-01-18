const { cmd } = require("../command");
const axios = require("axios");

// ✅ safe reaction function (work if baileys supports)
async function sendReact(conn, m, emoji) {
  try {
    // Some bots keep message key in mek / m
    const key = m?.key || m?.msg?.key || m;
    if (!conn?.sendMessage || !key) return;

    await conn.sendMessage(key.remoteJid, {
      react: { text: emoji, key }
    });
  } catch (e) {
    // ignore reaction errors
  }
}

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
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      if (!q) {
        return reply(
          "❗ *රචනා මාතෘකාව දෙන්න*\n\n" +
          "උදාහරණ:\n" +
          "`.dec මගේ පාසල`\n" +
          "`.dec පරිසරය රැකගැනීම`"
        );
      }

      await sendReact(conn, mek, "⏳");

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
        await sendReact(conn, mek, "❌");
        return reply("⚠️ AI එකෙන් පිළිතුරක් ආවේ නැහැ. පොඩ්ඩක් පස්සේ try කරන්න.");
      }

      await sendReact(conn, mek, "✅");
      return reply(`📝 *සිංහල රචනාව*\n\n${result}`);
    } catch (e) {
      console.error("DEC ERROR:", e);
      await sendReact(conn, mek, "❌");
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
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      if (!q) {
        return reply(
          "❗ *Please provide an essay topic*\n\n" +
          "Examples:\n" +
          "`.decen My School`\n" +
          "`.decen Protecting the Environment`"
        );
      }

      await sendReact(conn, mek, "⏳");

      const prompt =
        `Write a clear school-level English essay.\n` +
        `Topic: "${q}"\n\n` +
        `Requirements:\n` +
        `- 200 to 300 words\n` +
        `- Simple and easy vocabulary\n` +
        `- Include an introduction, body, and conclusion\n`;

      const result = await askAI(prompt);

      if (!result) {
        await sendReact(conn, mek, "❌");
        return reply("⚠️ AI didn't respond. Please try again later.");
      }

      await sendReact(conn, mek, "✅");
      return reply(`📝 *English Essay*\n\n${result}`);
    } catch (e) {
      console.error("DECEN ERROR:", e);
      await sendReact(conn, mek, "❌");
      return reply("❌ An error occurred while writing the essay. (API/Internet issue)");
    }
  }
);
