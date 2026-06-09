// ═══════════════════════════════════════════════════════════════
//  plugins/auto_msg.js — MALIYA-MD Multi-User AI Chat Plugin
//  ---------------------------------------------------------------
//  Fixes applied:
//    ✅ #1  Key validation — AIza prefix requirement removed
//    ✅ #2  Bot no longer replies to its own messages
//    ✅ #3  Singlish input → Full Sinhala Unicode reply only
//    ✅ #4  pushName extracted from mek.pushName as fallback
//           + AI explicitly told to address user by name
// ═══════════════════════════════════════════════════════════════

"use strict";

const { cmd } = require("../command");
const axios   = require("axios");
const { MongoClient } = require("mongodb");

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://MALIYA-MD:279221@maliya-md.uzal3aa.mongodb.net/?appName=maliya-md";

const MONGO_DB = process.env.MONGODB_DB || "maliya_md";

let _client = null;
let _db     = null;

async function getDb() {
  if (_db) return _db;
  _client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
  await _client.connect();
  _db = _client.db(MONGO_DB);
  console.log("🤖 auto_msg: MongoDB connected");
  return _db;
}

// ─── Collections ──────────────────────────────────────────────
// user_api_keys : { phone, ownerName, keys: [], createdAt, updatedAt }
// chat_history  : { phone, messages: [{role,text,ts}], updatedAt }
// auto_msg_cfg  : { phone, enabled: bool, updatedAt }

// ─── Key Management ───────────────────────────────────────────
async function getUserDoc(phone) {
  const db = await getDb();
  return db.collection("user_api_keys").findOne({ phone });
}

async function getUserKeys(phone) {
  const doc = await getUserDoc(phone);
  return doc ? (doc.keys || []) : [];
}

async function getUserOwnerName(phone) {
  const doc = await getUserDoc(phone);
  return doc ? (doc.ownerName || "") : "";
}

// ─── FIX #1: Relaxed key validation ──────────────────────────
// Old code required key.startsWith("AIza") — now accepts any
// key that is at least 15 characters (letters, digits, _, -, .)
function isValidApiKey(key) {
  return typeof key === "string" && key.length >= 15 && /^[\w\-\.]+$/.test(key);
}

// Returns: { ok, reason }
// reason: "key_taken" | "already_exists" | "limit_reached"
async function addUserKey(phone, key, ownerName) {
  const db = await getDb();

  // Check if key belongs to a different user
  const existing = await db.collection("user_api_keys").findOne({ keys: key });
  if (existing && existing.phone !== phone) {
    return { ok: false, reason: "key_taken" };
  }

  const doc  = await getUserDoc(phone);
  const keys = doc ? (doc.keys || []) : [];

  if (keys.includes(key)) return { ok: false, reason: "already_exists" };
  if (keys.length >= 3)   return { ok: false, reason: "limit_reached" };

  await db.collection("user_api_keys").updateOne(
    { phone },
    {
      $push: { keys: key },
      $set:  { ownerName, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  return { ok: true };
}

async function removeUserKey(phone, oneBasedIndex) {
  const db   = await getDb();
  const doc  = await getUserDoc(phone);
  const keys = doc ? [...(doc.keys || [])] : [];

  const idx = oneBasedIndex - 1;
  if (idx < 0 || idx >= keys.length) return false;

  keys.splice(idx, 1);
  await db.collection("user_api_keys").updateOne(
    { phone },
    { $set: { keys, updatedAt: new Date() } }
  );
  return true;
}

// ─── Auto-reply toggle (MongoDB) ──────────────────────────────
async function setAutoReply(phone, enabled) {
  const db = await getDb();
  await db.collection("auto_msg_cfg").updateOne(
    { phone },
    {
      $set:        { enabled: !!enabled, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function isAutoReplyEnabled(phone) {
  const db  = await getDb();
  const doc = await db.collection("auto_msg_cfg").findOne({ phone });
  return doc ? doc.enabled : false;
}

// ─── Chat History (MongoDB) ───────────────────────────────────
const HISTORY_MAX = 20;

async function getHistory(phone) {
  const db  = await getDb();
  const doc = await db.collection("chat_history").findOne({ phone });
  return doc ? (doc.messages || []) : [];
}

async function appendHistory(phone, role, text) {
  const db   = await getDb();
  const turn = { role, text: String(text).slice(0, 2000), ts: Date.now() };

  await db.collection("chat_history").updateOne(
    { phone },
    {
      $push: { messages: { $each: [turn], $slice: -HISTORY_MAX } },
      $set:  { updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

async function clearHistory(phone) {
  const db = await getDb();
  await db.collection("chat_history").updateOne(
    { phone },
    { $set: { messages: [], updatedAt: new Date() } },
    { upsert: true }
  );
}

// ─── Language Detection ───────────────────────────────────────
const SI_UNICODE  = /[\u0D80-\u0DFF]/;
const TA_UNICODE  = /[\u0B80-\u0BFF]/;
const SINGLISH_KW = [
  "mata","oya","mage","mokak","mokada","kohomada","karanna","puluwan",
  "thiyenawa","wenawa","kiyanne","kiyala","ane","machan","bro","ganna",
  "danna","hadanne","thiyanawa","wela","neda","api","eka","epa","wenna",
  "balanna","thawa","honda","tikak","godak","oyata","meka",
];

// ─── FIX #3: detectLang now distinguishes Singlish vs SI Unicode
// Both return "si" — but we track HOW it was detected so the
// system prompt can force full Unicode regardless of input style.
function detectLang(text) {
  if (SI_UNICODE.test(text))  return "si";
  if (TA_UNICODE.test(text))  return "ta";
  const lower = text.toLowerCase();
  if (SINGLISH_KW.some((w) => lower.includes(w))) return "si"; // Singlish → still "si"
  return "en";
}

// ─── FIX #3 + #4: Identity / System Prompt ───────────────────
// • Sinhala (si): ALWAYS reply in full Sinhala Unicode, never Singlish
// • Tamil  (ta): reply in Tamil Unicode
// • English(en): reply in English
// • pushName is now addressed by name explicitly in the prompt
function buildSystemPrompt(ownerName, pushName, lang) {
  const who  = ownerName ? `${ownerName}ගේ MALIYA-MD WhatsApp Bot` : "MALIYA-MD WhatsApp Bot";
  // FIX #4: use pushName as the person's actual name in the prompt
  const user = pushName && pushName.trim() ? pushName.trim() : "user";

  if (lang === "si") {
    // FIX #3: Singlish input arrive කළත් ALWAYS full Sinhala Unicode reply
    return (
      `ඔයා ${who}. ඔයාව manage කරන්නේ ${ownerName || "Bot Owner"}.` +
      // FIX #4: explicitly address user by their WhatsApp name
      ` දැන් chat කරන කෙනාගේ නම ${user}. ඔවුන් ව ${user} කියලා address කරන්න.` +
      // FIX #3: force full Sinhala Unicode — NO Singlish romanisation
      ` සෑම reply එකක්ම *සම්පූර්ණ සිංහල Unicode* ගෙන් ලියන්න.` +
      ` Singlish (roman letters වලින් සිංහල) use කරන්නෙ නෑ. ` +
      `Short, friendly, natural. Bot ලෙස behave කරන්නේ නෑ — friend ගෙ ආකාරයෙන් chat කරන්න. ` +
      `Markdown bold (*text*) use කළ හැකිය.`
    );
  }
  if (lang === "ta") {
    return (
      `நீங்கள் ${who}. உங்களை நிர்வகிப்பது ${ownerName || "Bot Owner"}.` +
      // FIX #4: address user by name
      ` இப்போது பேசுபவரின் பெயர் ${user}. அவர்களை ${user} என்று அழையுங்கள்.` +
      ` தமிழில் பதில் சொல்லுங்கள். குறுகியதாக, நட்பாக, இயல்பாக பேசுங்கள்.`
    );
  }
  // English
  return (
    `You are ${who}. You are managed by ${ownerName || "Bot Owner"}.` +
    // FIX #4: address user by name
    ` The person chatting with you is named ${user}. Address them as ${user} naturally.` +
    ` Reply in English. Be short, friendly, and natural. Don't act robotic — chat like a friend. ` +
    `Markdown bold (*text*) is okay.`
  );
}

// ─── Gemini API Call ──────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

async function callGemini(apiKey, systemPrompt, history, userText) {
  const contents = [];

  // Inject system prompt as first user turn (Gemini has no system role)
  contents.push({ role: "user",  parts: [{ text: systemPrompt }] });
  contents.push({ role: "model", parts: [{ text: "Understood. I'll follow those instructions." }] });

  // History
  for (const turn of history) {
    contents.push({
      role:  turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    });
  }

  // Current message
  contents.push({ role: "user", parts: [{ text: userText }] });

  for (const model of GEMINI_MODELS) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${model}:generateContent?key=${apiKey}`;
      const res = await axios.post(url, { contents }, {
        headers: { "Content-Type": "application/json" },
        timeout: 28000,
      });

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (text) return text.trim();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 400) break;    // Bad key — stop trying models
      if (status === 429) continue; // Rate limit — try next model
      console.log(`⚠️ Gemini ${model} error:`, e?.message?.slice(0, 80));
    }
  }
  return null;
}

// Try all user keys, return first successful reply
async function callWithUserKeys(phone, systemPrompt, history, userText) {
  const keys = await getUserKeys(phone);
  if (!keys.length) return { reply: null, reason: "no_keys" };

  for (const key of keys) {
    const reply = await callGemini(key, systemPrompt, history, userText);
    if (reply) return { reply, reason: null };
  }

  return { reply: null, reason: "all_failed" };
}

// ─── Reactions ────────────────────────────────────────────────
const THINKING_REACTS = ["🤔", "💭", "⏳", "🔍", "✨"];
const REPLY_REACTS    = ["❤️", "🔥", "😊", "👍", "💫", "🌟", "🎯", "⚡"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function react(conn, mek, emoji) {
  try {
    await conn.sendMessage(mek.key.remoteJid, {
      react: { text: emoji, key: mek.key },
    });
  } catch (_) {}
}

// ─── Error messages per language ──────────────────────────────
function noKeyMsg(lang) {
  if (lang === "si") return "❌ ඔයාගේ Gemini API key save නෑ.\nBot owner ගාන *.setkey <key>* send කරන්න.\n> MALIYA-MD ❤️";
  if (lang === "ta") return "❌ உங்கள் Gemini API key சேமிக்கப்படவில்லை.\n> MALIYA-MD ❤️";
  return "❌ No API key saved for you. Ask the bot owner to use *.setkey <key>*.\n> MALIYA-MD ❤️";
}

function failMsg(lang) {
  if (lang === "si") return "❌ AI service unavailable. ටිකක් wait කරලා try කරන්න.\n> MALIYA-MD ❤️";
  if (lang === "ta") return "❌ AI சேவை கிடைக்கவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.\n> MALIYA-MD ❤️";
  return "❌ AI service unavailable right now. Try again later.\n> MALIYA-MD ❤️";
}

// ═══════════════════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════════════════

// .setkey <api key>
cmd({
  pattern: "setkey",
  desc:    "Save your personal Gemini API key",
  type:    "all",
  react:   "🔑",
}, async (conn, mek, m, { args, sender, pushName }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const key   = (args[0] || "").trim();
  const lang  = detectLang(m.body || "");

  // ── FIX #1: Use isValidApiKey instead of hard-coded AIza check ──
  if (!isValidApiKey(key)) {
    const hint = lang === "si"
      ? "❌ Invalid API key.\nFormat: *.setkey <your_key>*\nGoogle AI Studio: https://aistudio.google.com/apikey\n> MALIYA-MD ❤️"
      : "❌ Invalid API key.\nFormat: *.setkey <your_key>*\nGet one: https://aistudio.google.com/apikey\n> MALIYA-MD ❤️";
    return m.reply(hint);
  }

  const result = await addUserKey(phone, key, pushName || phone);

  if (!result.ok) {
    const msgs = {
      key_taken: lang === "si"
        ? "❌ මේ API key කෙනෙකුගේ account ගෙ registered. වෙනත් key එකක් use කරන්න.\n> MALIYA-MD ❤️"
        : "❌ This API key is already registered to another user.\n> MALIYA-MD ❤️",
      already_exists: lang === "si"
        ? "⚠️ මේ key දැනටමත් save කර ඇත.\n> MALIYA-MD ❤️"
        : "⚠️ This key is already saved.\n> MALIYA-MD ❤️",
      limit_reached: lang === "si"
        ? "❌ Keys 3 ක් limit. *.removekey <number>* ගෙන් එකක් remove කරන්න.\n> MALIYA-MD ❤️"
        : "❌ You already have 3 keys. Use *.removekey <number>* to remove one first.\n> MALIYA-MD ❤️",
    };
    return m.reply(msgs[result.reason] || "❌ Error saving key.\n> MALIYA-MD ❤️");
  }

  // Auto-enable on first key
  const keys = await getUserKeys(phone);
  if (keys.length === 1) await setAutoReply(phone, true);

  const ok = lang === "si"
    ? `✅ *API key save වුණා!*\nDirect message ගෙන් AI chat use කළ හැකිය.\n\n*.msg on/off* — Enable/disable\n*.msg status* — Status check\n> MALIYA-MD ❤️`
    : `✅ *API key saved!*\nYou can now use AI chat in private messages.\n\n*.msg on/off* — Enable/disable\n*.msg status* — Check status\n> MALIYA-MD ❤️`;
  m.reply(ok);
});

// .removekey <number>
cmd({
  pattern: "removekey",
  desc:    "Remove one of your saved API keys",
  type:    "all",
  react:   "🗑️",
}, async (conn, mek, m, { args, sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const num   = parseInt(args[0]);
  const lang  = detectLang(m.body || "");

  if (!num || num < 1 || num > 3) {
    return m.reply(lang === "si"
      ? "Usage: *.removekey <1-3>*\nExample: .removekey 1\n> MALIYA-MD ❤️"
      : "Usage: *.removekey <1-3>*\nExample: .removekey 1\n> MALIYA-MD ❤️");
  }

  const ok = await removeUserKey(phone, num);
  m.reply(ok
    ? (lang === "si" ? "✅ API key remove කළා.\n> MALIYA-MD ❤️" : "✅ API key removed.\n> MALIYA-MD ❤️")
    : (lang === "si" ? "❌ Key හොයාගත්නේ නෑ.\n> MALIYA-MD ❤️"  : "❌ Key not found.\n> MALIYA-MD ❤️")
  );
});

// .mykeys
cmd({
  pattern: "mykeys",
  desc:    "List your saved API keys",
  type:    "all",
  react:   "🔑",
}, async (conn, mek, m, { sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const keys  = await getUserKeys(phone);
  const lang  = detectLang(m.body || "");

  if (!keys.length) {
    return m.reply(lang === "si"
      ? "❌ API keys නෑ. *.setkey <key>* use කරන්න.\n> MALIYA-MD ❤️"
      : "❌ No API keys saved. Use *.setkey <key>*.\n> MALIYA-MD ❤️");
  }

  const list = keys
    .map((k, i) => `*${i + 1}.* \`${k.slice(0, 8)}...${k.slice(-4)}\``)
    .join("\n");

  m.reply(`🔑 *Your API Keys (${keys.length}/3)*\n\n${list}\n\n> MALIYA-MD ❤️`);
});

// .msg on | off | status | clear | help
cmd({
  pattern: "msg",
  desc:    "Control AI auto-reply",
  type:    "all",
  react:   "🤖",
}, async (conn, mek, m, { args, sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const sub   = (args[0] || "").toLowerCase().trim();
  const lang  = detectLang(m.body || "");

  if (sub === "on") {
    const keys = await getUserKeys(phone);
    if (!keys.length) return m.reply(noKeyMsg(lang));
    await setAutoReply(phone, true);
    return m.reply(lang === "si"
      ? "✅ AI auto reply *ON*\n> MALIYA-MD ❤️"
      : "✅ AI auto reply *ON*\n> MALIYA-MD ❤️");
  }

  if (sub === "off") {
    await setAutoReply(phone, false);
    return m.reply(lang === "si"
      ? "⛔ AI auto reply *OFF*\n> MALIYA-MD ❤️"
      : "⛔ AI auto reply *OFF*\n> MALIYA-MD ❤️");
  }

  if (sub === "clear") {
    await clearHistory(phone);
    return m.reply(lang === "si"
      ? "🗑️ Chat history clear කළා.\n> MALIYA-MD ❤️"
      : "🗑️ Chat history cleared.\n> MALIYA-MD ❤️");
  }

  if (sub === "status") {
    const keys    = await getUserKeys(phone);
    const enabled = await isAutoReplyEnabled(phone);
    const history = await getHistory(phone);
    return m.reply(
      `📊 *AI Status*\n\n` +
      `🤖 Auto Reply: ${enabled ? "ON ✅" : "OFF ⛔"}\n` +
      `🔑 API Keys: ${keys.length}/3\n` +
      `💬 Chat History: ${history.length} turns\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // Help
  m.reply(lang === "si"
    ? `🤖 *AI Chat Commands*\n\n` +
      `*.setkey <key>* — API key save කරන්න\n` +
      `*.removekey <1-3>* — Key remove කරන්න\n` +
      `*.mykeys* — Keys list කරන්න\n` +
      `*.msg on* — AI reply on\n` +
      `*.msg off* — AI reply off\n` +
      `*.msg clear* — History clear\n` +
      `*.msg status* — Status check\n` +
      `> MALIYA-MD ❤️`
    : `🤖 *AI Chat Commands*\n\n` +
      `*.setkey <key>* — Save API key\n` +
      `*.removekey <1-3>* — Remove a key\n` +
      `*.mykeys* — List your keys\n` +
      `*.msg on* — Enable AI reply\n` +
      `*.msg off* — Disable AI reply\n` +
      `*.msg clear* — Clear chat history\n` +
      `*.msg status* — Check status\n` +
      `> MALIYA-MD ❤️`
  );
});

// ═══════════════════════════════════════════════════════════════
//  AUTO-REPLY HANDLER
// ═══════════════════════════════════════════════════════════════

const _cooldowns = new Map(); // phone -> last reply timestamp
const COOLDOWN_MS = 8000;     // 8 s between replies per user

async function handleAutoMsg({
  conn,
  mek,
  m,
  sender,
  pushName,
  body,
  isGroup,
  sessionOwnerPhone,
  sessionOwnerName,
}) {
  try {
    // ── Only private chats ──────────────────────────────────
    if (isGroup) return false;

    // ── Skip empty or command messages ──────────────────────
    if (!body || body.startsWith(".")) return false;

    const phone = String(sender || "").split("@")[0].replace(/\D/g, "");
    if (!phone) return false;

    // ── FIX #2: Don't reply to the bot's own messages ────────
    // Baileys exposes conn.user.id as "phone:device@s.whatsapp.net"
    // We strip everything except the numeric phone part.
    const botJidPhone = (conn.user?.id || "")
      .split(":")[0]      // remove device suffix  e.g. "94771234567:3"
      .split("@")[0]      // remove domain          e.g. "@s.whatsapp.net"
      .replace(/\D/g, "");

    if (botJidPhone && phone === botJidPhone)         return false; // own message
    if (sessionOwnerPhone && phone === sessionOwnerPhone) return false; // explicit owner

    // ── Also ignore messages sent BY the bot (fromMe flag) ──
    if (mek?.key?.fromMe) return false;

    // ── Check auto reply enabled ─────────────────────────────
    const enabled = await isAutoReplyEnabled(phone);
    if (!enabled) return false;

    // ── Check user has keys ───────────────────────────────────
    const keys = await getUserKeys(phone);
    const lang = detectLang(body);
    if (!keys.length) {
      await react(conn, mek, "❌");
      await conn.sendMessage(m.chat, { text: noKeyMsg(lang) }, { quoted: mek });
      return true;
    }

    // ── Cooldown ──────────────────────────────────────────────
    const now  = Date.now();
    const last = _cooldowns.get(phone) || 0;
    if (now - last < COOLDOWN_MS) return false;
    _cooldowns.set(phone, now);

    // ── Thinking reaction ─────────────────────────────────────
    await react(conn, mek, pick(THINKING_REACTS));

    // ── FIX #4: Resolve pushName — prefer arg, fallback to mek ──
    const effectivePushName =
      (pushName && pushName.trim())        ? pushName.trim()     :
      (mek?.pushName && mek.pushName.trim()) ? mek.pushName.trim() :
      "";

    // ── Get owner name for this session ───────────────────────
    const storedOwner = await getUserOwnerName(phone);
    const ownerName   = sessionOwnerName || storedOwner || "Bot Owner";

    // ── Build prompt (FIX #3 + #4 applied inside) ─────────────
    const systemPrompt = buildSystemPrompt(ownerName, effectivePushName, lang);
    const history      = await getHistory(phone);

    // ── Call Gemini (try each key) ────────────────────────────
    const { reply, reason } = await callWithUserKeys(phone, systemPrompt, history, body);

    if (!reply) {
      await react(conn, mek, "❌");
      await conn.sendMessage(
        m.chat,
        { text: reason === "no_keys" ? noKeyMsg(lang) : failMsg(lang) },
        { quoted: mek }
      );
      return true;
    }

    // ── Save history ──────────────────────────────────────────
    await appendHistory(phone, "user",  body);
    await appendHistory(phone, "model", reply);

    // ── Reply reaction ────────────────────────────────────────
    await react(conn, mek, pick(REPLY_REACTS));

    // ── Send reply (split if very long) ──────────────────────
    const MAX_LEN = 3500;
    if (reply.length <= MAX_LEN) {
      await conn.sendMessage(m.chat, { text: reply }, { quoted: mek });
    } else {
      const chunks = [];
      let rem = reply;
      while (rem.length > MAX_LEN) {
        let cut = rem.lastIndexOf("\n", MAX_LEN);
        if (cut < 800) cut = rem.lastIndexOf(". ", MAX_LEN);
        if (cut < 800) cut = MAX_LEN;
        chunks.push(rem.slice(0, cut).trim());
        rem = rem.slice(cut).trim();
      }
      if (rem) chunks.push(rem);
      for (const chunk of chunks) {
        await conn.sendMessage(m.chat, { text: chunk }, { quoted: mek });
      }
    }

    return true;
  } catch (err) {
    console.error("❌ auto_msg handleAutoMsg error:", err?.message || err);
    return false;
  }
}

module.exports = { handleAutoMsg };

// ═══════════════════════════════════════════════════════════════
//  HOW TO INTEGRATE IN index.js
//  ---------------------------------------------------------------
//  1. At the top of index.js add:
//       const { handleAutoMsg } = require("./plugins/auto_msg");
//
//  2. Inside your messages.upsert / message handler, AFTER
//     all command processing, add:
//
//       const handled = await handleAutoMsg({
//         conn,               // your WASocket instance
//         mek,                // the raw message object
//         m,                  // your parsed message wrapper
//         sender,             // e.g. "94XXXXXXXXX@s.whatsapp.net"
//         pushName,           // m.pushName or mek.pushName  ← FIX #4
//         body,               // message text body
//         isGroup,            // boolean
//         sessionOwnerPhone,  // logged-in bot's phone number (digits only)
//         sessionOwnerName,   // bot owner display name from config
//       });
//       if (handled) return;
// ═══════════════════════════════════════════════════════════════
