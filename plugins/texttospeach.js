const { cmd } = require("../command");
const axios = require("axios");
const gTTS = require("gtts");
const fs = require("fs");
const path = require("path");

// ✅ Add as many as you want (20+)
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
  ms: "Malay",
  nl: "Dutch",
  pl: "Polish",
};

async function translate(text, targetLang) {
  const url = "https://translate.googleapis.com/translate_a/single";
  const res = await axios.get(url, {
    params: {
      client: "gtx",
      sl: "auto",
      tl: targetLang,
      dt: "t",
      q: text,
    },
    timeout: 15000,
  });

  const data = res.data;
  return (data?.[0] || []).map((x) => x?.[0]).join("") || "";
}

async function sendVoice(conn, mek, m, text, lang, asPtt = true) {
  const outDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${Date.now()}.mp3`);

  const tts = new gTTS(text, lang);
  await new Promise((res, rej) => tts.save(outFile, (err) => (err ? rej(err) : res())));

  await conn.sendMessage(
    m.chat,
    { audio: fs.readFileSync(outFile), mimetype: "audio/mpeg", ptt: asPtt },
    { quoted: mek }
  );

  fs.unlinkSync(outFile);
}

// ✅ Help command: .tts
cmd(
  {
    pattern: "tts",
    alias: ["voice"],
    desc: "Translate your text to a language and send as voice",
    category: "utility",
    react: "🗣️",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    const codes = Object.keys(LANGS).join(", ");
    return reply(
      "✅ Usage:\n" +
        ".tts<lang> <text>\n\n" +
        "Examples:\n" +
        ".ttssi mama oyata adarei\n" +
        ".ttsen kohomada oyage day?\n" +
        ".ttsfr mama oyata adarei\n\n" +
        "Supported lang codes:\n" +
        codes
    );
  }
);

// ✅ Register commands: .ttssi, .ttsen, .ttsfr, ... (+ voice variants)
for (const code of Object.keys(LANGS)) {
  const langName = LANGS[code];

  // .tts<code>
  cmd(
    {
      pattern: `tts${code}`,
      alias: [`voice${code}`], // e.g., .voicesi
      desc: `Translate to ${langName} and send as voice`,
      category: "utility",
      react: "🗣️",
      filename: __filename,
    },
    async (conn, mek, m, { q, reply }) => {
      try {
        if (!q) {
          return reply(
            `❌ Please provide text.\nExample: .tts${code} hello`
          );
        }

        await reply(`🔄 Translating to ${langName}...`);
        const translated = await translate(q, code);

        if (!translated) return reply("❌ Translation failed. Please try again.");

        await reply("🎙️ Generating voice note...");
        await sendVoice(conn, mek, m, translated, code, true);
      } catch (e) {
        console.error(e);
        return reply("❌ Failed (network blocked / translate endpoint error).");
      }
    }
  );
}
