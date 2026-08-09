const { cmd } = require("../command");
const axios = require("axios");
const googleTTS = require("google-tts-api");
const fs = require("fs");
const path = require("path");

/* ================= LANGUAGES ================= */
const LANGS = {
  si: "Sinhala",
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  id: "Indonesian",
  th: "Thai",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  bn: "Bengali",
  ur: "Urdu",
};

/* ================= TRANSLATE ================= */
async function translate(text, targetLang) {
  const res = await axios.get(
    "https://translate.googleapis.com/translate_a/single",
    {
      params: {
        client: "gtx",
        sl: "auto",
        tl: targetLang,
        dt: "t",
        q: text,
      },
      timeout: 15000,
    }
  );

  return (res.data?.[0] || []).map((x) => x?.[0]).join("").trim();
}

/* ================= SEND VOICE ================= */
async function sendVoice(conn, mek, m, text, lang) {
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${Date.now()}.mp3`);

  const ttsUrl = googleTTS.getAudioUrl(text, {
    lang,
    slow: false,
    host: "https://translate.google.com",
  });

  const res = await axios.get(ttsUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
  });

  fs.writeFileSync(outFile, Buffer.from(res.data));

  await conn.sendMessage(
    m.chat,
    {
      audio: fs.readFileSync(outFile),
      mimetype: "audio/mpeg",
      ptt: true,
    },
    { quoted: mek }
  );

  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
}

/* ================= MAIN COMMAND ================= */
cmd(
  {
    pattern: "tts",
    alias: ["voice"],
    desc: "Translate text and send as voice",
    category: "utility",
    react: "🗣️",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      if (!q) {
        return reply(
          "🗣️ *Text to Voice*\n\n" +
            "Usage:\n" +
            ".tts <lang> <text>\n\n" +
            "Examples:\n" +
            ".tts si mama oyata adarei\n" +
            ".tts en mama oyata adarei\n" +
            ".tts fr mama oyata adarei\n\n" +
            "Languages:\n" +
            Object.keys(LANGS).join(", ")
        );
      }

      const parts = q.trim().split(" ");
      const lang = (parts.shift() || "").toLowerCase();
      const text = parts.join(" ").trim();

      if (!lang || !LANGS[lang]) {
        return reply(
          "❌ Invalid language code.\n\n" +
            "Example:\n" +
            ".tts si mama oyata adarei\n\n" +
            "Available:\n" +
            Object.keys(LANGS).join(", ")
        );
      }

      if (!text) {
        return reply(`❌ Usage: .tts ${lang} <text>`);
      }

      await reply(`🔄 Translating to ${LANGS[lang]}...`);
      const translated = await translate(text, lang);

      if (!translated) {
        return reply("❌ Translation failed.");
      }

      await reply("🎙️ Generating voice note from MALIYA-MD...");
      await sendVoice(conn, mek, m, translated, lang);
    } catch (err) {
      console.error("TTS ERROR:", err);
      return reply("❌ Failed (network / TTS error).");
    }
  }
);
