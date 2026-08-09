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

  return (res.data?.[0] || []).map((x) => x?.[0]).join("") || "";
}

/* ================= SEND VOICE (FIXED) ================= */
async function sendVoice(conn, mek, m, text, lang) {
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${Date.now()}.mp3`);

  // generate TTS url
  const ttsUrl = googleTTS.getAudioUrl(text, {
    lang,
    slow: false,
    host: "https://translate.google.com",
  });

  // download audio
  const res = await axios.get(ttsUrl, { responseType: "arraybuffer" });
  fs.writeFileSync(outFile, Buffer.from(res.data));

  // ✅ CORRECT Baileys audio payload
  await conn.sendMessage(
    m.chat,
    {
      audio: { url: outFile },
      mimetype: "audio/mpeg",
      ptt: true,
    },
    { quoted: mek }
  );

  fs.unlinkSync(outFile);
}

/* ================= HELP ================= */
cmd(
  {
    pattern: "tts",
    alias: ["voice"],
    desc: "Translate text and send as voice (.tts<lang>)",
    category: "utility",
    react: "🗣️",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    reply(
      "🗣️ *Text to Voice*\n\n" +
        "Usage:\n" +
        ".tts<lang> <text>\n\n" +
        "Examples:\n" +
        ".ttssi mama oyata adarei\n" +
        ".ttsen mama oyata adarei\n" +
        ".ttsfr mama oyata adarei\n\n" +
        "Languages:\n" +
        Object.keys(LANGS).join(", ")
    );
  }
);

/* ================= REGISTER COMMANDS ================= */
for (const code of Object.keys(LANGS)) {
  const langName = LANGS[code];

  cmd(
    {
      pattern: `tts${code}`,
      alias: [`voice${code}`],
      desc: `Translate to ${langName} and send voice`,
      category: "utility",
      react: "🗣️",
      filename: __filename,
    },
    async (conn, mek, m, { q, reply }) => {
      try {
        if (!q) {
          return reply(`❌ Usage: .tts${code} <text>`);
        }

        await reply(`🔄 Translating to ${langName}...`);
        const translated = await translate(q, code);
        if (!translated) return reply("❌ Translation failed.");

        await reply("🎙️ Generating voice note from MALIYA-MD...");
        await sendVoice(conn, mek, m, translated, code);
      } catch (err) {
        console.error(err);
        reply("❌ Failed (network / TTS error).");
      }
    }
  );
}
