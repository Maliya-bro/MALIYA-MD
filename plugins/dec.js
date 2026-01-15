const axios = require("axios");
const { cmd } = require("../command");

const GEMINI_API_KEY = "AIzaSyC1JhddNmClnFQ1KUTRZG3SVEOVCx6uRLE";

const IMAGE_URL =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png?raw=true";

cmd(
  {
    pattern: "dec",
    react: "📝",
    desc: "Generate Sinhala/English essay with Gemini",
    category: "ai",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, body, isCmd, command }) => {
    try {
      if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("PASTE_YOUR")) {
        return await bot.sendMessage(from, { text: "❌ Gemini API key not set in dec.js" }, { quoted: mek });
      }

      // q usually contains text after command in this framework
      const input = (q || "").trim();
      if (!input) {
        return await bot.sendMessage(
          from,
          {
            text:
              "❌ Title missing.\n\n✅ Usage:\n.dec <title>\n.dec en <title>\n\nExample:\n.dec ශ්‍රී ලංකාවේ සංස්කෘතිය\n.dec en The Importance of Education",
          },
          { quoted: mek }
        );
      }

      // Language handling:
      // .dec en My Title
      // default Sinhala
      let lang = "si";
      let title = input;

      const firstWord = input.split(/\s+/)[0]?.toLowerCase();
      if (firstWord === "en" || firstWord === "si") {
        lang = firstWord;
        title = input.split(/\s+/).slice(1).join(" ").trim();
      }

      if (!title) {
        return await bot.sendMessage(from, { text: "❌ Please provide a valid title." }, { quoted: mek });
      }

      const prompt =
        lang === "en"
          ? `Write a well-structured English essay about: "${title}". Include: an introduction, 3-5 body paragraphs with clear points, and a conclusion. Keep it clear and school-friendly.`
          : `මෙම මාතෘකාව ගැන හොඳින් සංවිධානය කළ සිංහල රචනාවක් ලියන්න: "${title}". හැඳින්වීම, මූලික අදහස් 3-5 පරිච්ඡේද, සහ අවසාන නිගමනය ඇතුළත් කරන්න. සරල, පැහැදිලි, ශිෂ්‍ය මට්ටමට ගැලපෙන විදිහට ලියන්න.`;

      const endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY);

      const res = await axios.post(
        endpoint,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const out =
        res?.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("")?.trim() ||
        "";

      if (!out) {
        console.log("Gemini response:", res.data);
        return await bot.sendMessage(from, { text: "❌ Gemini returned empty text." }, { quoted: mek });
      }

      // WhatsApp caption safe limit
      const MAX = 3500;
      const essay = out.length > MAX ? out.slice(0, MAX) + "\n\n...(trimmed)" : out;

      const caption = `📝 ${lang === "en" ? "Essay" : "රචනාව"}: ${title}\n\n${essay}`;

      await bot.sendMessage(
        from,
        {
          image: { url: IMAGE_URL },
          caption,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("DEC ERROR:", e?.response?.data || e);
      await bot.sendMessage(from, { text: "❌ Error while generating essay (check console)." }, { quoted: mek });
    }
  }
);
