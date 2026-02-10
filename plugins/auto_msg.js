const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ========= ENV (ONLY THIS PLUGIN) =========
const API_KEY = process.env.GEMINI_API_KEY2;
if (!API_KEY) console.error("GEMINI_API_KEY2 is not set (auto_msg plugin)");

// ========= MODELS =========
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

// ========= SETTINGS =========
const PREFIXES = ["."];
const STORE = path.join(process.cwd(), "data", "auto_msg.json");
const COOLDOWN_MS = 2500;

// ========= IDENTITY =========
const IDENTITY_EN =
  "I am MALIYA-MD bot.I am an ai powerd advace bot made by malindu nadith";
const IDENTITY_SI =
  "මම MALIYA-MD bot. මම Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.";

// ========= STORE (GLOBAL) =========
function ensureStore() {
  const dir = path.dirname(STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE)) {
    fs.writeFileSync(
      STORE,
      JSON.stringify({ global: { enabled: false } }, null, 2)
    );
  }
}
function readStore() {
  ensureStore();
  try {
    const db = JSON.parse(fs.readFileSync(STORE, "utf8"));
    if (!db.global) db.global = { enabled: false };
    return db;
  } catch {
    return { global: { enabled: false } };
  }
}
function writeStore(db) {
  ensureStore();
  fs.writeFileSync(STORE, JSON.stringify(db, null, 2));
}
function setGlobalEnabled(val) {
  const db = readStore();
  db.global.enabled = !!val;
  writeStore(db);
}
function isGlobalEnabled() {
  const db = readStore();
  return !!db.global.enabled;
}

// ========= COOLDOWN =========
const lastReplyAt = new Map();
function inCooldown(chatId) {
  const now = Date.now();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  lastReplyAt.set(chatId, now);
  return false;
}

// ========= LANGUAGE DETECT (Sinhala + Singlish) =========
function detectLang(text) {
  if (!text) return "en";
  const t = text.toLowerCase().trim();

  // Sinhala unicode
  if (/[අ-෴]/.test(text)) return "si";

  // Singlish hints
  const singlishHints = [
    "oya","kawda","mokada","mokak","kohomada","karanna","puluwan",
    "eka","mage","mata","one","nathi","hari","thawa","denna",
    "kiyala","kiyanne","wedak","wada","balanna","ai","ne","da",
    "thiyenne","thiyanawa","wenne","ganna","haduwe","hadapu"
  ];

  if (singlishHints.some(w => t.includes(w))) return "si";

  return "en";
}

// ========= IDENTITY DETECT =========
function isIdentityQuestion(text) {
  const t = (text || "").toLowerCase();

  const siKeys = [
    "oya kawda","kawda oya","oyawa haduwe","haduwe kawda",
    "oya kawuruda","me bot eka kawda","meeka haduwe"
  ];

  const enKeys = [
    "who are you","who made you","who created you",
    "who built you","what are you"
  ];

  return siKeys.some(k => t.includes(k)) || enKeys.some(k => t.includes(k));
}

function getIdentityReply(lang) {
  return lang === "si" ? IDENTITY_SI : IDENTITY_EN;
}

// ========= PROMPT =========
function buildChatPrompt(userText, lang) {
  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.
Google / WhatsApp / Gemini කියලා කිසිම වෙලාවක කියන්න එපා.
කෙටි, friendly Sinhalaෙන් උත්තර දෙන්න.

User: ${userText}
`.trim();
  }

  return `
Your name is "MALIYA-MD" bot.
You are made by Malindu Nadith.
Never say Google/WhatsApp/Gemini.
Reply short and friendly.

User: ${userText}
`.trim();
}

// ========= GEMINI CALL =========
async function geminiGenerate(prompt) {
  if (!API_KEY) throw new Error("Missing GEMINI_API_KEY2");

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
      if (out && out.length > 1) return out;

      lastErr = new Error("Empty response");
    } catch (e) {
      lastErr = e;
      if (e?.response?.status === 404) continue;
      break;
    }
  }

  throw lastErr || new Error("Gemini error");
}

// ========= COMMAND .msg =========
cmd(
  {
    pattern: "msg",
    desc: "Auto Reply ON/OFF (Private chats only)",
    category: "AI",
    react: "💬",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    const arg = (q || "").trim().toLowerCase();

    if (!arg) return reply("Use:\n.msg on\n.msg off\n.msg status");

    if (arg === "on") {
      setGlobalEnabled(true);
      return reply("✅ Auto Reply ON (Private chats only)");
    }

    if (arg === "off") {
      setGlobalEnabled(false);
      return reply("⛔ Auto Reply OFF");
    }

    if (arg === "status") {
      return reply(`Auto Reply: ${isGlobalEnabled() ? "ON" : "OFF"}`);
    }
  }
);

// ========= HOOK =========
async function onMessage(conn, mek, m, ctx = {}) {
  try {
    const from = ctx.from || mek?.key?.remoteJid;
    if (!from) return;

    // ✅ Private chats only
    const isGroup = String(from).endsWith("@g.us");
    if (isGroup) return;

    if (!isGlobalEnabled()) return;
    if (mek?.key?.fromMe) return;

    const body = (ctx.body || "").trim();
    if (!body) return;

    // ignore commands
    if (PREFIXES.some(p => body.startsWith(p))) return;

    if (inCooldown(from)) return;

    const lang = detectLang(body);

    // identity
    if (isIdentityQuestion(body)) {
      return await conn.sendMessage(from, {
        text: getIdentityReply(lang),
      }, { quoted: mek });
    }

    const prompt = buildChatPrompt(body, lang);
    const out = await geminiGenerate(prompt);

    if (out) {
      await conn.sendMessage(from, { text: out }, { quoted: mek });
    }
  } catch (e) {
    console.log("AUTO_MSG ERROR:", e?.message || e);
  }
}

module.exports = { onMessage };
