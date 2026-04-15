const axios = require("axios");
const { MongoClient } = require("mongodb");

// ========= ENV =========
const DEFAULT_KEY = process.env.GEMINI_API_KEY2 || "";
const MONGO = process.env.MONGODB_URI || "";
const DB = "maliya_md";
const CACHE = "global_ai_cache";

// ========= MONGO =========
let db;
async function getDb() {
  if (db) return db;
  const client = new MongoClient(MONGO);
  await client.connect();
  db = client.db(DB);
  console.log("✅ Mongo Connected");
  return db;
}

// ========= HELPERS =========
function normalize(t) {
  return String(t).toLowerCase().trim();
}

function similarity(a, b) {
  const x = normalize(a).split(" ");
  const y = normalize(b).split(" ");
  const c = x.filter(w => y.includes(w));
  return c.length / Math.max(x.length, y.length);
}

// ========= HEAVY =========
function isHeavy(text) {
  const t = normalize(text);
  return (
    text.length > 80 ||
    t.includes("essay") ||
    t.includes("rachana") ||
    t.includes("composition")
  );
}

// ========= LANGUAGE =========
function detectLang(text) {
  if (/[අ-෴]/.test(text)) return "si";
  if (text.toLowerCase().includes("english")) return "en";
  return "si";
}

// ========= COMMAND SUGGEST =========
function findCommand(text) {
  const t = normalize(text);
  const lang = detectLang(text);

  if (/(essay|rachana|composition|රචනා)/i.test(t)) {
    return {
      cmd: `.dec${lang}`,
      ex: `.dec${lang} amma`,
    };
  }

  if (/(tts|voice|speak)/i.test(t)) {
    return {
      cmd: `.tts ${lang}`,
      ex: `.tts ${lang} ayubowan`,
    };
  }

  return null;
}

// ========= CACHE =========
async function findCache(q) {
  const d = await getDb();
  const doc = await d.collection(CACHE).findOne({ q: normalize(q) });
  return doc?.a || null;
}

async function saveCache(q, a) {
  const d = await getDb();
  const key = normalize(q);

  const exist = await d.collection(CACHE).findOne({ q: key });
  if (exist) return;

  await d.collection(CACHE).insertOne({
    q: key,
    raw: q,
    a,
  });
}

async function getAllCache() {
  const d = await getDb();
  return await d.collection(CACHE).find().limit(20).toArray();
}

// ========= PROMPT =========
function buildPrompt(user, sender, owner) {
  return `
You are MALIYA-MD.

RULES:
- NEVER say Gemini, Google, AI, ChatGPT.
- Always say MALIYA-MD.
- Be friendly and natural.
- Use emojis sometimes 😊🔥
- Use sender name: ${sender}
- Owner name: ${owner} (not too much)

සිංහල:
- ඔයා MALIYA-MD bot එක
- Gemini/Google කියන්න එපා
- යාලුවෙක් වගේ කතා කරන්න 😄

User: ${user}
`;
}

// ========= CLEAN =========
function clean(text) {
  let t = String(text);

  const bad = ["gemini", "google", "chatgpt", "openai"];
  for (const w of bad) {
    t = t.replace(new RegExp(w, "gi"), "MALIYA-MD");
  }

  return t.trim();
}

// ========= AI =========
async function ai(prompt) {
  const res = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      contents: [{ parts: [{ text: prompt }] }],
    },
    {
      headers: { "x-goog-api-key": DEFAULT_KEY },
    }
  );

  return res.data.candidates[0].content.parts[0].text;
}

// ========= MAIN =========
async function onMessage(conn, mek, m, ctx = {}) {
  try {
    const from = mek.key.remoteJid;
    if (!from || from.endsWith("@g.us")) return;
    if (mek.key.fromMe) return;

    const body = String(ctx.body || "").trim();
    if (!body) return;
    if (body.startsWith(".")) return;

    const sender = mek.pushName || "friend";
    const owner = conn.user.name || "owner";

    // 🔥 HEAVY
    if (isHeavy(body)) {
      const cmd = findCommand(body);
      if (cmd) {
        return conn.sendMessage(from, {
          text:
            `⚠️ Heavy request bro 😅\n\n` +
            `👉 use ${cmd.cmd}\n\n` +
            `📌 example:\n${cmd.ex}`,
        });
      }
      return;
    }

    // 🔥 CACHE EXACT
    const exact = await findCache(body);
    if (exact) {
      return conn.sendMessage(from, { text: exact });
    }

    // 🔥 SIMILAR
    const list = await getAllCache();
    for (const i of list) {
      if (similarity(body, i.raw) > 0.7) {
        return conn.sendMessage(from, { text: i.a });
      }
    }

    // 🔥 AI
    const prompt = buildPrompt(body, sender, owner);
    let reply = await ai(prompt);
    reply = clean(reply);

    await conn.sendMessage(from, { text: reply });

    // save short only
    if (reply.length < 400) {
      await saveCache(body, reply);
    }

  } catch (e) {
    console.log("ERR:", e.message);
  }
}

module.exports = { onMessage };
