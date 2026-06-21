// ═══════════════════════════════════════════════════════════════
//  auto_msg.js — MALIYA-MD Upgraded AI Chat Plugin
//  ---------------------------------------------------------------
//  ✅ No API key needed  — free AI (ch.at + pollinations) built-in
//  ✅ Add Gemini key     — auto upgrades to Gemini (better quality)
//  ✅ .msg on works for EVERYONE without any setup
//  ✅ Fallback chain: Gemini → ch.at → pollinations.ai
//  ✅ All original fixes retained (#1 #2 #3 #4)
// ═══════════════════════════════════════════════════════════════

"use strict";

const { cmd }       = require("../command");
const axios         = require("axios");
const { MongoClient } = require("mongodb");

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI ||
  "mongodb+srv://MALIYA-MD:279221279221@maliya-md.uzal3aa.mongodb.net/?appName=maliya-md";
const MONGO_DB  = process.env.MONGODB_DB || "maliya_md";

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

function isValidApiKey(key) {
  return typeof key === "string" && key.length >= 15 && /^[\w\-\.]+$/.test(key);
}

async function addUserKey(phone, key, ownerName) {
  const db = await getDb();
  const existing = await db.collection("user_api_keys").findOne({ keys: key });
  if (existing && existing.phone !== phone) return { ok: false, reason: "key_taken" };
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
  const idx  = oneBasedIndex - 1;
  if (idx < 0 || idx >= keys.length) return false;
  keys.splice(idx, 1);
  await db.collection("user_api_keys").updateOne(
    { phone },
    { $set: { keys, updatedAt: new Date() } }
  );
  return true;
}

// ─── Auto-reply toggle ────────────────────────────────────────
async function setAutoReply(phone, enabled) {
  const db = await getDb();
  await db.collection("auto_msg_cfg").updateOne(
    { phone },
    { $set: { enabled: !!enabled, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}
async function isAutoReplyEnabled(phone) {
  const db  = await getDb();
  const doc = await db.collection("auto_msg_cfg").findOne({ phone });
  return doc ? doc.enabled : false;
}

// ─── Chat History ─────────────────────────────────────────────
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
function detectLang(text) {
  if (SI_UNICODE.test(text))  return "si";
  if (TA_UNICODE.test(text))  return "ta";
  const lower = text.toLowerCase();
  if (SINGLISH_KW.some((w) => lower.includes(w))) return "si";
  return "en";
}

// ─── System Prompt ────────────────────────────────────────────
function buildSystemPrompt(ownerName, pushName, lang) {
  const who  = ownerName ? `${ownerName}ගේ MALIYA-MD WhatsApp Bot` : "MALIYA-MD WhatsApp Bot";
  const user = pushName && pushName.trim() ? pushName.trim() : "user";
  if (lang === "si") {
    return (
      `ඔයා ${who}. ඔයාව manage කරන්නේ ${ownerName || "Bot Owner"}.` +
      ` දැන් chat කරන කෙනාගේ නම ${user}. ඔවුන් ව ${user} කියලා address කරන්න.` +
      ` සෑම reply එකක්ම *සම්පූර්ණ සිංහල Unicode* ගෙන් ලියන්න.` +
      ` Singlish use කරන්නෙ නෑ. Short, friendly, natural. Markdown bold (*text*) use කළ හැකිය.`
    );
  }
  if (lang === "ta") {
    return (
      `நீங்கள் ${who}. இப்போது பேசுபவரின் பெயர் ${user}. அவர்களை ${user} என்று அழையுங்கள்.` +
      ` தமிழில் பதில் சொல்லுங்கள். குறுகியதாக, நட்பாக பேசுங்கள்.`
    );
  }
  return (
    `You are ${who}. The person chatting is named ${user}. Address them as ${user} naturally.` +
    ` Reply in English. Be short, friendly, and natural. Don't act robotic.`
  );
}

// ══════════════════════════════════════════════════════════════
//  FREE AI PROVIDERS (no API key needed)
// ══════════════════════════════════════════════════════════════

// Provider 1 — ch.at (~400ms, reliable)
async function callChAt(prompt, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await axios.post(
        "https://ch.at/api/chat",
        { message: prompt },
        {
          headers: { "Content-Type": "application/json", "User-Agent": "MALIYA-MD-Bot/2.0" },
          timeout: 12000,
        }
      );
      const t = res.data?.answer || res.data?.reply || res.data?.message ||
                res.data?.response || res.data?.result;
      if (t && String(t).trim().length > 2) return { text: String(t).trim(), source: "ch.at" };
    } catch (_) {}
    if (i < retries) await new Promise(r => setTimeout(r, 500 * i));
  }
  return null;
}

// Provider 2 — pollinations.ai (free, ~3-5s)
async function callPollinations(prompt) {
  try {
    const res = await axios.get(
      "https://text.pollinations.ai/" + encodeURIComponent(prompt.slice(0, 500)) +
      "?model=openai&seed=" + (Date.now() % 9999),
      { timeout: 18000 }
    );
    const t = typeof res.data === "string" ? res.data.trim() : null;
    if (t && t.length > 2) return { text: t, source: "pollinations" };
    return null;
  } catch { return null; }
}

// Provider 3 — Gemini (requires user API key, best quality)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

async function callGemini(apiKey, systemPrompt, history, userText) {
  const contents = [];
  contents.push({ role: "user",  parts: [{ text: systemPrompt }] });
  contents.push({ role: "model", parts: [{ text: "Understood. I'll follow those instructions." }] });
  for (const turn of history) {
    contents.push({ role: turn.role === "user" ? "user" : "model", parts: [{ text: turn.text }] });
  }
  contents.push({ role: "user", parts: [{ text: userText }] });

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await axios.post(url, { contents }, {
        headers: { "Content-Type": "application/json" },
        timeout: 28000,
      });
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (text) return { text: text.trim(), source: `gemini/${model}` };
    } catch (e) {
      const status = e?.response?.status;
      if (status === 400) break;    // Bad key — stop
      if (status === 429) continue; // Rate limit — try next model
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
//  SMART AI CALLER — Gemini first, then free fallbacks
// ══════════════════════════════════════════════════════════════
async function askAI(phone, systemPrompt, history, userText) {
  // 1. Try Gemini with user keys (best quality)
  const keys = await getUserKeys(phone);
  if (keys.length) {
    for (const key of keys) {
      const result = await callGemini(key, systemPrompt, history, userText);
      if (result) return result;
    }
  }

  // Build a simple prompt string for free providers
  const freePrompt = systemPrompt
    ? `${systemPrompt}\n\nUser: ${userText}`
    : userText;

  // 2. Try ch.at (fast, free)
  const chAtResult = await Promise.race([
    callChAt(freePrompt),
    new Promise(r => setTimeout(() => r(null), 14000)),
  ]);
  if (chAtResult) return chAtResult;

  // 3. Try pollinations.ai (free fallback)
  const pollinationsResult = await callPollinations(freePrompt);
  if (pollinationsResult) return pollinationsResult;

  return null;
}

// ─── Reactions ────────────────────────────────────────────────
const THINKING_REACTS = ["🤔", "💭", "⏳", "🔍", "✨"];
const REPLY_REACTS    = ["❤️", "🔥", "😊", "👍", "💫", "🌟", "🎯", "⚡"];
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
async function react(conn, mek, emoji) {
  try { await conn.sendMessage(mek.key.remoteJid, { react: { text: emoji, key: mek.key } }); } catch (_) {}
}

// ─── Error messages ───────────────────────────────────────────
function failMsg(lang) {
  if (lang === "si") return "❌ AI service unavailable. ටිකක් wait කරලා try කරන්න.\n> MALIYA-MD ❤️";
  if (lang === "ta") return "❌ AI சேவை கிடைக்கவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.\n> MALIYA-MD ❤️";
  return "❌ AI unavailable right now. Try again later.\n> MALIYA-MD ❤️";
}

// ══════════════════════════════════════════════════════════════
//  COMMANDS
// ══════════════════════════════════════════════════════════════

// .setkey — optional, upgrades to Gemini
cmd({
  pattern: "setkey",
  desc:    "Add Gemini API key (optional — upgrades AI quality)",
  type:    "all",
  react:   "🔑",
}, async (conn, mek, m, { args, sender, pushName }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const key   = (args[0] || "").trim();
  const lang  = detectLang(m.body || "");

  if (!isValidApiKey(key)) {
    return m.reply(lang === "si"
      ? "❌ Invalid API key.\nFormat: *.setkey <your_key>*\nGet one free: https://aistudio.google.com/apikey\n> MALIYA-MD ❤️"
      : "❌ Invalid API key.\nFormat: *.setkey <your_key>*\nGet free key: https://aistudio.google.com/apikey\n> MALIYA-MD ❤️");
  }

  const result = await addUserKey(phone, key, pushName || phone);
  if (!result.ok) {
    const msgs = {
      key_taken:      lang === "si" ? "❌ මේ API key කෙනෙකුගේ account ගෙ registered.\n> MALIYA-MD ❤️" : "❌ This key is registered to another user.\n> MALIYA-MD ❤️",
      already_exists: lang === "si" ? "⚠️ මේ key දැනටමත් save කර ඇත.\n> MALIYA-MD ❤️"              : "⚠️ This key is already saved.\n> MALIYA-MD ❤️",
      limit_reached:  lang === "si" ? "❌ Keys 3 ක් limit. *.removekey <n>* ගෙන් remove කරන්න.\n> MALIYA-MD ❤️" : "❌ Max 3 keys. Use *.removekey <n>* first.\n> MALIYA-MD ❤️",
    };
    return m.reply(msgs[result.reason] || "❌ Error saving key.\n> MALIYA-MD ❤️");
  }

  m.reply(lang === "si"
    ? `✅ *Gemini API key save වුණා!*\n🚀 AI quality upgrade වෙලා — Gemini use කරයි.\n> MALIYA-MD ❤️`
    : `✅ *Gemini API key saved!*\n🚀 AI upgraded — Gemini will be used now.\n> MALIYA-MD ❤️`);
});

// .removekey
cmd({
  pattern: "removekey",
  desc:    "Remove a saved API key",
  type:    "all",
  react:   "🗑️",
}, async (conn, mek, m, { args, sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const num   = parseInt(args[0]);
  const lang  = detectLang(m.body || "");
  if (!num || num < 1 || num > 3) return m.reply("Usage: *.removekey <1-3>*\n> MALIYA-MD ❤️");
  const ok = await removeUserKey(phone, num);
  m.reply(ok
    ? (lang === "si" ? "✅ API key remove කළා.\n> MALIYA-MD ❤️" : "✅ Key removed.\n> MALIYA-MD ❤️")
    : (lang === "si" ? "❌ Key හොයාගත්නේ නෑ.\n> MALIYA-MD ❤️"  : "❌ Key not found.\n> MALIYA-MD ❤️"));
});

// .mykeys
cmd({
  pattern: "mykeys",
  desc:    "List your saved Gemini API keys",
  type:    "all",
  react:   "🔑",
}, async (conn, mek, m, { sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const keys  = await getUserKeys(phone);
  const lang  = detectLang(m.body || "");
  if (!keys.length) {
    return m.reply(lang === "si"
      ? "ℹ️ Gemini API keys නෑ.\nFree AI (ch.at + pollinations) use කෙරෙයි.\n*.setkey <key>* — Upgrade to Gemini\n> MALIYA-MD ❤️"
      : "ℹ️ No Gemini keys saved.\nFree AI (ch.at + pollinations) is active.\n*.setkey <key>* — Upgrade to Gemini\n> MALIYA-MD ❤️");
  }
  const list = keys.map((k, i) => `*${i + 1}.* \`${k.slice(0, 8)}...${k.slice(-4)}\``).join("\n");
  m.reply(`🔑 *Gemini Keys (${keys.length}/3)*\n\n${list}\n\n> MALIYA-MD ❤️`);
});

// .msg on | off | status | clear | help
cmd({
  pattern: "msg",
  desc:    "Control AI auto-reply (works without API key)",
  type:    "all",
  react:   "🤖",
}, async (conn, mek, m, { args, sender }) => {
  const phone = sender.split("@")[0].replace(/\D/g, "");
  const sub   = (args[0] || "").toLowerCase().trim();
  const lang  = detectLang(m.body || "");

  if (sub === "on") {
    await setAutoReply(phone, true);
    const keys   = await getUserKeys(phone);
    const source = keys.length ? "🚀 Gemini AI (high quality)" : "⚡ Free AI (ch.at + pollinations)";
    return m.reply(lang === "si"
      ? `✅ AI auto reply *ON*\n${source}\n\n💡 Upgrade: *.setkey <gemini_key>*\n> MALIYA-MD ❤️`
      : `✅ AI auto reply *ON*\n${source}\n\n💡 Upgrade: *.setkey <gemini_key>*\n> MALIYA-MD ❤️`);
  }

  if (sub === "off") {
    await setAutoReply(phone, false);
    return m.reply("⛔ AI auto reply *OFF*\n> MALIYA-MD ❤️");
  }

  if (sub === "clear") {
    await clearHistory(phone);
    return m.reply("🗑️ Chat history cleared.\n> MALIYA-MD ❤️");
  }

  if (sub === "status") {
    const keys    = await getUserKeys(phone);
    const enabled = await isAutoReplyEnabled(phone);
    const history = await getHistory(phone);
    const source  = keys.length ? `🚀 Gemini AI (${keys.length} key/s)` : "⚡ Free AI (ch.at + pollinations)";
    return m.reply(
      `📊 *AI Status*\n\n` +
      `🤖 Auto Reply : ${enabled ? "ON ✅" : "OFF ⛔"}\n` +
      `🧠 AI Source  : ${source}\n` +
      `💬 History    : ${history.length} turns\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // Help
  m.reply(lang === "si"
    ? `🤖 *AI Chat Commands*\n\n` +
      `*.msg on*      — AI reply on (API key නැතිව ත් works)\n` +
      `*.msg off*     — AI reply off\n` +
      `*.msg clear*   — History clear\n` +
      `*.msg status*  — Status check\n` +
      `*.setkey <key>* — Gemini key add (optional upgrade)\n` +
      `*.mykeys*      — Keys list\n` +
      `*.removekey <n>* — Key remove\n` +
      `\n💡 Gemini key නැතිව ch.at + pollinations free AI use කෙරෙයි.\n` +
      `> MALIYA-MD ❤️`
    : `🤖 *AI Chat Commands*\n\n` +
      `*.msg on*      — Enable AI reply (works without API key)\n` +
      `*.msg off*     — Disable AI reply\n` +
      `*.msg clear*   — Clear history\n` +
      `*.msg status*  — Check status\n` +
      `*.setkey <key>* — Add Gemini key (optional upgrade)\n` +
      `*.mykeys*      — List keys\n` +
      `*.removekey <n>* — Remove a key\n` +
      `\n💡 Without a Gemini key, free AI (ch.at + pollinations) is used.\n` +
      `> MALIYA-MD ❤️`
  );
});

// ══════════════════════════════════════════════════════════════
//  AUTO-REPLY HANDLER
// ══════════════════════════════════════════════════════════════
const _cooldowns = new Map();
const COOLDOWN_MS = 8000;

async function handleAutoMsg({ conn, mek, m, sender, pushName, body, isGroup, sessionOwnerPhone, sessionOwnerName }) {
  try {
    if (isGroup) return false;
    if (!body || body.startsWith(".")) return false;

    const phone = String(sender || "").split("@")[0].replace(/\D/g, "");
    if (!phone) return false;

    // Don't reply to bot's own messages (Fix #2)
    const botJidPhone = (conn.user?.id || "").split(":")[0].split("@")[0].replace(/\D/g, "");
    if (botJidPhone && phone === botJidPhone)          return false;
    if (sessionOwnerPhone && phone === sessionOwnerPhone) return false;
    if (mek?.key?.fromMe) return false;

    const enabled = await isAutoReplyEnabled(phone);
    if (!enabled) return false;

    // Cooldown
    const now  = Date.now();
    const last = _cooldowns.get(phone) || 0;
    if (now - last < COOLDOWN_MS) return false;
    _cooldowns.set(phone, now);

    await react(conn, mek, pick(THINKING_REACTS));

    const lang = detectLang(body);

    // Fix #4: resolve pushName
    const effectivePushName =
      (pushName && pushName.trim())            ? pushName.trim()      :
      (mek?.pushName && mek.pushName.trim())   ? mek.pushName.trim()  : "";

    const storedOwner  = await getUserOwnerName(phone);
    const ownerName    = sessionOwnerName || storedOwner || "Bot Owner";
    const systemPrompt = buildSystemPrompt(ownerName, effectivePushName, lang);
    const history      = await getHistory(phone);

    // Call AI — Gemini first, then free fallbacks
    const result = await askAI(phone, systemPrompt, history, body);

    if (!result) {
      await react(conn, mek, "❌");
      await conn.sendMessage(m.chat, { text: failMsg(lang) }, { quoted: mek });
      return true;
    }

    await appendHistory(phone, "user",  body);
    await appendHistory(phone, "model", result.text);
    await react(conn, mek, pick(REPLY_REACTS));

    // Send (split if long)
    const MAX_LEN = 3500;
    if (result.text.length <= MAX_LEN) {
      await conn.sendMessage(m.chat, { text: result.text }, { quoted: mek });
    } else {
      let rem = result.text;
      while (rem.length > 0) {
        let cut = rem.lastIndexOf("\n", MAX_LEN);
        if (cut < 800) cut = rem.lastIndexOf(". ", MAX_LEN);
        if (cut < 800) cut = MAX_LEN;
        const chunk = rem.slice(0, cut).trim();
        if (chunk) await conn.sendMessage(m.chat, { text: chunk }, { quoted: mek });
        rem = rem.slice(cut).trim();
      }
    }

    return true;
  } catch (err) {
    console.error("❌ auto_msg error:", err?.message || err);
    return false;
  }
}

module.exports = { handleAutoMsg };

// ══════════════════════════════════════════════════════════════
//  HOW TO INTEGRATE IN index.js
//  -----------------------------------------------------------
//  const { handleAutoMsg } = require("./plugins/auto_msg");
//
//  // inside messages.upsert handler, after command processing:
//  const handled = await handleAutoMsg({
//    conn, mek, m, sender, pushName, body,
//    isGroup, sessionOwnerPhone, sessionOwnerName,
//  });
//  if (handled) return;
// ══════════════════════════════════════════════════════════════
