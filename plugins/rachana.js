const { cmd } = require("../command");
const axios = require("axios");

// 50 Most Useful Languages
const LANGUAGES = {
  si: "Sinhala",
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  bn: "Bengali",
  ur: "Urdu",
  fa: "Persian",
  tr: "Turkish",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  pl: "Polish",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  tl: "Filipino",
  sw: "Swahili",
  zu: "Zulu",
  af: "Afrikaans",
  uk: "Ukrainian",
  sr: "Serbian",
  hr: "Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  is: "Icelandic",
  ga: "Irish",
  mt: "Maltese",
  km: "Khmer"
};

// Auto-generate commands like .decsi .decen .decja ...
Object.entries(LANGUAGES).forEach(([code, language]) => {
  cmd(
    {
      pattern: "dec" + code,
      desc: `Generate an essay in ${language}`,
      category: "AI",
      react: "📝",
      filename: __filename
    },
    async (conn, mek, m, { from, q, reply }) => {
      try {
        if (!q) {
          return reply(
            `Usage error.\nExample:\n.dec${code} The beauty of Sri Lanka`
          );
        }

        const hasLatinLetters = /[a-zA-Z]/.test(q);
        let extraInstruction = "";

        if (language === "Sinhala" && hasLatinLetters) {
          extraInstruction =
            "IMPORTANT: The topic may be written in Singlish. Convert it to proper Sinhala before writing the essay.\n";
        }

        const prompt = `
Write a well-structured essay in ${language}.
- Include introduction, body, and conclusion
- Use clear and simple language
- Medium length
${extraInstruction}
TOPIC: ${q}
        `.trim();

        reply(`Generating ${language} essay...`);

        const api = `https://lance-frank-asta.onrender.com/api/gpt?q=${encodeURIComponent(prompt)}`;
        const { data } = await axios.get(api);

        if (!data || !data.message) {
          return reply("Failed to generate the essay. Please try again.");
        }

        const text =
`📝 ${language} Essay

Topic: ${q}

${data.message}`;

        await conn.sendMessage(from, { text }, { quoted: mek });

      } catch (err) {
        console.error(err);
        reply("An error occurred while generating the essay.");
      }
    }
  );
});
