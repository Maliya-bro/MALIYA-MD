const { cmd } = require("../command");
const axios = require("axios");

// =========================
// 🔑 GEMINI API KEY (TEST)
// =========================
const API_KEY = "AIzaSyDEpXKpIJ3A3UsmytcqA7VGSOst1vX8tow";

// =========================
// 🌍 Languages (50)
// =========================
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

// =========================
// 🧠 Prompt builder
// =========================
function buildPrompt(language, topic) {
  let prompt = `Write a well-structured essay in ${language}. Topic: ${topic}.`;

  if (language === "Sinhala" && /[a-zA-Z]/.test(topic)) {
    prompt += " The topic may be written in Singlish. Convert it to proper Sinhala first.";
  } else {
    prompt += " Write only in the requested language.";
  }

  prompt += " Include introduction, body, and conclusion. Medium length.";
  return prompt;
}

// =========================
// 🤖 Gemini API call
// =========================
async function generateEssay(prompt) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    },
    { timeout: 30000 }
  );

  return res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

// =========================
// ⚙️ Commands auto-create
// =========================
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
          return reply(`Usage:\n.dec${code} <topic>`);
        }

        await reply(`Generating ${language} essay...`);

        const essay = await generateEssay(buildPrompt(language, q));
        if (!essay) throw new Error("Empty response from Gemini");

        const text =
`📝 ${language} Essay

Topic: ${q}

${essay}`;

        await conn.sendMessage(from, { text }, { quoted: mek });

      } catch (err) {
        console.error("GEMINI ERROR:", err?.response?.data || err?.message || err);
        reply("Failed to generate the essay. Please try again later.");
      }
    }
  );
});
