const { cmd } = require("../command");
const axios = require("axios");

// ✅ Read key from GitHub Actions secret/env (DO NOT hardcode)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) console.error("GEMINI_API_KEY is not set");

// =========================
// ✅ Model candidates (try in order)
// =========================
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

// =========================
// 🌍 Languages (50)
// =========================
const LANGUAGES = {
  si: "Sinhala", en: "English", ta: "Tamil", hi: "Hindi", ja: "Japanese",
  zh: "Chinese", ko: "Korean", fr: "French", de: "German", es: "Spanish",
  it: "Italian", pt: "Portuguese", ru: "Russian", ar: "Arabic", bn: "Bengali",
  ur: "Urdu", fa: "Persian", tr: "Turkish", nl: "Dutch", sv: "Swedish",
  no: "Norwegian", da: "Danish", fi: "Finnish", pl: "Polish", cs: "Czech",
  ro: "Romanian", hu: "Hungarian", el: "Greek", he: "Hebrew", th: "Thai",
  vi: "Vietnamese", id: "Indonesian", ms: "Malay", tl: "Filipino",
  sw: "Swahili", zu: "Zulu", af: "Afrikaans", uk: "Ukrainian",
  sr: "Serbian", hr: "Croatian", sk: "Slovak", sl: "Slovenian",
  lt: "Lithuanian", lv: "Latvian", et: "Estonian", is: "Icelandic",
  ga: "Irish", mt: "Maltese", km: "Khmer"
};

// =========================
// 🧠 Prompt builder
// =========================
function buildPrompt(language, topic) {
  let p = `Write a well-structured essay in ${language}. Topic: ${topic}.`;

  if (language === "Sinhala" && /[a-zA-Z]/.test(topic)) {
    p += " The topic may be written in Singlish. Convert it to proper Sinhala first.";
  } else {
    p += " Write only in the requested language.";
  }

  p += " Include introduction, body, and conclusion. Medium length.";
  return p;
}

// =========================
// 🤖 Gemini generateContent with model fallback
// Uses x-goog-api-key header
// =========================
async function generateEssay(prompt) {
  if (!API_KEY) {
    throw new Error("Missing GEMINI_API_KEY (set it in GitHub Actions Secrets and workflow env)");
  }

  let lastErr = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
          },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 10) return out;

      lastErr = new Error("Empty response from Gemini");
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;

      // If model not found, try next model
      if (status === 404) continue;

      // Other errors -> stop (quota, permission, etc.)
      break;
    }
  }

  throw lastErr || new Error("Unknown Gemini error");
}

// =========================
// .gemodels (debug)
// =========================
cmd(
  {
    pattern: "dechelp",
    desc: "List available Gemini models (first 30)",
    category: "AI",
    react: "📜",
    filename: __filename
  },
  async (conn, mek, m, { from, reply }) => {
    try {
      if (!API_KEY) return reply("GEMINI_API_KEY is not set.");

      const url = "https://generativelanguage.googleapis.com/v1beta/models";
      const res = await axios.get(url, {
        timeout: 30000,
        headers: { "x-goog-api-key": API_KEY }
      });

      const names = (res?.data?.models || []).map(x => x.name).slice(0, 30);
      if (!names.length) return reply("No models returned by the API.");

      return reply("Available models (first 30):\n\n" + names.join("\n"));
    } catch (e) {
      console.error("GEMODELS ERROR:", e?.response?.status, e?.response?.data || e?.message || e);
      reply("Failed to list models.");
    }
  }
);

// =========================
// Auto-create commands: .decsi .decen .decja ...
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
        if (!q) return reply(`Usage:\n.dec${code} <topic>`);

        await reply(`Generating ${language} essay...`);

        const essay = await generateEssay(buildPrompt(language, q));
        const text = `📝 ${language} Essay\n\nTopic: ${q}\n\n${essay}`;

        await conn.sendMessage(from, { text }, { quoted: mek });
      } catch (err) {
        const status = err?.response?.status;
        const data = err?.response?.data;

        console.error("GEMINI ERROR STATUS:", status);
        console.error("GEMINI ERROR:", data || err?.message || err);

        if (status === 403) {
          return reply("Gemini permission denied (check key/quota).");
        }
        if (status === 429) {
          return reply("Gemini rate limit exceeded. Try again later.");
        }
        if (status === 404) {
          return reply("Models not found. Run .gemodels and try again.");
        }

        reply("Failed to generate the essay. Please try again later.");
      }
    }
  );
});
