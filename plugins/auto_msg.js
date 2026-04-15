
const { cmd } = require("../command");
const axios = require("axios");
const { MongoClient } = require("mongodb");

// ========= ENV =========
const DEFAULT_GEMINI_API_KEY = process.env.GEMINI_API_KEY2 || "";
const DEFAULT_DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const APIKEY_COLLECTION = "user_api_keys";

const BOT_NAME = "MALIYA-MD";

// ========= MONGO =========
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (!MONGODB_URI) return null;
  if (cachedDb) return cachedDb;

  cachedClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);

  console.log("✅ Mongo connected (auto_msg)");
  return cachedDb;
}

function getOwnerNumber(conn) {
  return String(conn?.user?.id || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

// ========= KEY SAVE =========
async function saveKey(conn, apiKey, pushName = "") {
  const db = await getDb();
  if (!db) throw new Error("Mongo not connected");

  const phone = getOwnerNumber(conn);

  await db.collection(APIKEY_COLLECTION).updateOne(
    { phone },
    {
      $set: {
        phone,
        geminiApiKey: apiKey,
        pushName,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function getUserKey(conn) {
  const db = await getDb();
  if (!db) return null;

  const phone = getOwnerNumber(conn);
  const row = await db.collection(APIKEY_COLLECTION).findOne({ phone });

  return row?.geminiApiKey || null;
}

// ========= HELPERS =========
function detectLang(text) {
  if (/[අ-෴]/.test(text)) return "si";
  return "en";
}

function getSenderName(mek, m) {
  return mek?.pushName || m?.pushName || "friend";
}

function splitMessage(text, size = 3500) {
  const arr = [];
  let str = text;

  while (str.length > size) {
    arr.push(str.slice(0, size));
    str = str.slice(size);
  }
  if (str) arr.push(str);
  return arr;
}

async function sendLong(conn, jid, text, quoted) {
  const parts = splitMessage(text);
  for (const p of parts) {
    await conn.sendMessage(jid, { text: p }, { quoted });
  }
}

// ========= PROMPT =========
function buildPrompt(userText, lang, senderName, ownerName) {
  if (lang === "si") {
    return `
ඔබ "${BOT_NAME}" bot එකක්.
ඔබ ${ownerName} ගේ bot එක.

User නම: ${senderName}

Natural, friendly Sinhala / Singlish reply දෙන්න.
User ට name එකෙන් කතා කරන්න.

ඔබ ගැන අහුවොත්:
"මම ${ownerName} ගේ ${BOT_NAME} bot එක"

User: ${userText}
`;
  }

  return `
You are ${BOT_NAME}.
You belong to ${ownerName}.

User name: ${senderName}

Reply naturally and friendly.

If asked who you are:
"I am ${BOT_NAME}, owned by ${ownerName}"

User: ${userText}
`;
}

// ========= AI =========
async function generateGemini(prompt, conn) {
  const userKey = await getUserKey(conn);
  const apiKey = userKey || DEFAULT_GEMINI_API_KEY;

  if (!apiKey) throw new Error("No Gemini key");

  const res = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      contents: [{ parts: [{ text: prompt }] }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
    }
  );

  return res?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function generateDeepSeek(prompt) {
  if (!DEFAULT_DEEPSEEK_API_KEY) throw new Error("No DeepSeek key");

  const res = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${DEFAULT_DEEPSEEK_API_KEY}`,
      },
    }
  );

  return res?.data?.choices?.[0]?.message?.content;
}

async function generateText(prompt, conn) {
  try {
    return await generateGemini(prompt, conn);
  } catch {
    return await generateDeepSeek(prompt);
  }
}

// ========= COMMAND =========
cmd(
  {
    pattern: "setkey",
    desc: "Set your Gemini API key",
    category: "AI",
    react: "🔑",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply, isOwner }) => {
    try {
      if (!isOwner) return reply("❌ Only owner can set key");

      if (!q) return reply("Use:\n.setkey YOUR_API_KEY");

      await saveKey(conn, q.trim(), mek.pushName || "");

      return reply("✅ API key saved (only for you)");
    } catch (e) {
      return reply("❌ Error saving key");
    }
  }
);

// ========= MAIN =========
async function onMessage(conn, mek, m, ctx = {}) {
  try {
    const from = mek.key.remoteJid;
    if (!from || from.endsWith("@g.us")) return;
    if (mek.key.fromMe) return;

    const body = String(ctx.body || "").trim();
    if (!body) return;

    if (body.startsWith(".")) return;

    const lang = detectLang(body);
    const senderName = getSenderName(mek, m);
    const ownerName = senderName; // simple (no spam owner names)

    const prompt = buildPrompt(body, lang, senderName, ownerName);

    const ai = await generateText(prompt, conn);
    if (!ai) return;

    await sendLong(conn, from, ai, mek);
  } catch (e) {
    console.log("auto_msg error:", e?.message || e);
  }
}

module.exports = { onMessage };
