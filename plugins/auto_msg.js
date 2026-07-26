// ═══════════════════════════════════════════════════════════════
//  auto_msg.js — MALIYA-MD Upgraded AI Chat Plugin
//  ---------------------------------------------------------------
//  ✅ Bot owner .msg on  → ALL private chats *to that owner's bot* get AI replies
//  ✅ Bot owner .msg on all → Groups + private both get AI replies (owner-scoped)
//  ✅ Bot owner .msg off → turns it off for that owner's bot only
//  ✅ Bot owner .msg global off → Global mode + owner opt-in OFF (hard stop, group+private)
//  ✅ No API key needed — free AI (ch.at + pollinations) built-in
//  ✅ Add Gemini key (.setkey) → auto upgrades to Gemini
//  ✅ Fallback chain: Gemini → ch.at → pollinations.ai
//  ✅ FIX (this version): ".msg on" is now scoped to the OWNER/session,
//     not the sender. Previously auto_msg_cfg was keyed by the sender's
//     phone, which meant turning "on" only affected AI replies TO that
//     one sender's own messages — not "reply to anyone messaging my bot".
//     Now auto_msg_cfg is keyed by scopePhone (the owner/session), so:
//       - Owner A's ".msg on" → replies to ALL senders messaging A's bot
//       - Owner B's bot is completely unaffected (different scopePhone doc)
//  ✅ NEW: chat_history now stored in ImageKit (JSON file per user) instead
//     of MongoDB, to reduce DB load. MongoDB is still used for keys,
//     global/personal toggle state, etc.
//  ✅ NEW: Seen All Msg — read-receipt everything, independent of AI toggle
// ═══════════════════════════════════════════════════════════════

"use strict";

const { cmd }         = require("../command");
const axios           = require("axios");
const FormData        = require("form-data");
const { MongoClient } = require("mongodb");
const { readSettings, setSetting, toggleSetting } = require("../lib/botSettings");

// ─── Config — reads BOT_OWNER from your config.js / config.env ─
const { BOT_OWNER } = require("../config");
const OWNER_NUMBER = String(BOT_OWNER || process.env.BOT_OWNER || "").replace(/\D/g, "");

// ─── MongoDB ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";
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

// ─── ImageKit config (chat_history storage) ───────────────────
// NOTE: private key must be an env var in production, not hardcoded.
// Kept here only because it was provided directly for this task —
// move it to process.env.IMAGEKIT_PRIVATE_KEY before deploying.
const IMAGEKIT_URL_ENDPOINT  = process.env.IMAGEKIT_URL_ENDPOINT  || "https://ik.imagekit.io/edusmart";
const IMAGEKIT_PUBLIC_KEY    = process.env.IMAGEKIT_PUBLIC_KEY    || "public_hLpLsH3zTT0HOnp41TeukNXnlIc=";
const IMAGEKIT_PRIVATE_KEY   = process.env.IMAGEKIT_PRIVATE_KEY   || "private_7wSnh+9Lp59oWo46JvQdS8fNtaI=";
const IMAGEKIT_UPLOAD_URL    = "https://upload.imagekit.io/api/v1/files/upload";
const IMAGEKIT_LIST_URL      = "https://api.imagekit.io/v1/files";
const IMAGEKIT_FOLDER        = "/chat_history";

function imagekitAuthHeader() {
  // ImageKit private-key auth = HTTP Basic with private key as username, no password
  const token = Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
  return `Basic ${token}`;
}

function historyFileName(phone) {
  return `history_${phone}.json`;
}

// Find existing file's fileId by name (needed to overwrite/delete cleanly;
// ImageKit upload with same fileName otherwise just versions it, so we
// delete the old one first to keep exactly one file per user).
async function findHistoryFileId(phone) {
  try {
    const res = await axios.get(IMAGEKIT_LIST_URL, {
      headers: { Authorization: imagekitAuthHeader() },
      params: {
        path: IMAGEKIT_FOLDER,
        name: historyFileName(phone),
        limit: 1,
      },
      timeout: 10000,
    });
    const list = Array.isArray(res.data) ? res.data : [];
    return list.length ? list[0].fileId : null;
  } catch (e) {
    console.log("⚠️ ImageKit list error:", e?.response?.data || e?.message || e);
    return null;
  }
}

async function deleteHistoryFile(fileId) {
  if (!fileId) return;
  try {
    await axios.delete(`https://api.imagekit.io/v1/files/${fileId}`, {
      headers: { Authorization: imagekitAuthHeader() },
      timeout: 10000,
    });
  } catch (e) {
    console.log("⚠️ ImageKit delete error:", e?.response?.data || e?.message || e);
  }
}

async function getHistory(phone) {
  try {
    // ImageKit doesn't let us fetch raw JSON by fileId directly without
    // the public URL, so we build the public URL from the known path.
    const url = `${IMAGEKIT_URL_ENDPOINT}${IMAGEKIT_FOLDER}/${historyFileName(phone)}`;
    const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    if (res.status === 200 && Array.isArray(res.data?.messages)) {
      return res.data.messages;
    }
    if (res.status === 200 && Array.isArray(res.data)) {
      return res.data; // tolerate a bare-array format
    }
    return [];
  } catch (_) {
    return [];
  }
}

async function saveHistory(phone, messages) {
  try {
    const payload = JSON.stringify({ phone, messages, updatedAt: new Date().toISOString() });

    const form = new FormData();
    form.append("file", Buffer.from(payload, "utf8"), historyFileName(phone));
    form.append("fileName", historyFileName(phone));
    form.append("folder", IMAGEKIT_FOLDER);
    form.append("useUniqueFileName", "false");
    form.append("isPrivateFile", "false");

    // Remove any existing file with same name first, so we don't
    // accumulate versioned duplicates for every save.
    const existingId = await findHistoryFileId(phone);
    if (existingId) await deleteHistoryFile(existingId);

    await axios.post(IMAGEKIT_UPLOAD_URL, form, {
      headers: { ...form.getHeaders(), Authorization: imagekitAuthHeader() },
      timeout: 15000,
    });
  } catch (e) {
    console.log("⚠️ ImageKit save error:", e?.response?.data || e?.message || e);
  }
}

const HISTORY_MAX = 20;
async function appendHistory(phone, role, text) {
  const turn = { role, text: String(text).slice(0, 2000), ts: Date.now() };
  const existing = await getHistory(phone);
  const updated  = [...existing, turn].slice(-HISTORY_MAX);
  await saveHistory(phone, updated);
}
async function clearHistory(phone) {
  await saveHistory(phone, []);
}

// ─── Key Management (still MongoDB) ───────────────────────────
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

// ─── Global Mode — scoped per bot-owner session ───────────────
// Key: "global_<ownerPhone>" so one owner's setting never affects another.
async function setGlobalMode(enabled, includeGroups = false, scopePhone = "default") {
  const db  = await getDb();
  const key = `global_${String(scopePhone || "default").replace(/\D/g, "") || "default"}`;
  await db.collection("global_cfg").updateOne(
    { _id: key },
    {
      $set: {
        enabled: !!enabled,
        includeGroups: !!includeGroups,
        ...(enabled ? { hardOff: false } : {}),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
async function setGlobalHardOff(scopePhone = "default") {
  const db  = await getDb();
  const key = `global_${String(scopePhone || "default").replace(/\D/g, "") || "default"}`;
  await db.collection("global_cfg").updateOne(
    { _id: key },
    {
      $set: {
        enabled: false,
        includeGroups: false,
        hardOff: true,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}
async function getGlobalMode(scopePhone = "default") {
  const db  = await getDb();
  const key = `global_${String(scopePhone || "default").replace(/\D/g, "") || "default"}`;
  const doc = await db.collection("global_cfg").findOne({ _id: key });
  return doc
    ? { enabled: !!doc.enabled, includeGroups: !!doc.includeGroups, hardOff: !!doc.hardOff }
    : { enabled: false, includeGroups: false, hardOff: false };
}

// ─── Per-OWNER auto-reply toggle (".msg on" / ".msg off") ─────
// FIX: this used to be keyed by the *sender's* phone, which broke the
// intended behavior — ".msg on" is a per-bot setting the owner flips,
// and it should apply to every sender messaging that owner's bot.
// Now keyed by scopePhone (the owner/session), same as global_cfg.
async function setAutoReply(scopePhone, enabled) {
  const db  = await getDb();
  const key = String(scopePhone || "default").replace(/\D/g, "") || "default";
  await db.collection("auto_msg_cfg").updateOne(
    { _id: key },
    {
      $set: {
        enabled: !!enabled,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}
async function isAutoReplyEnabled(scopePhone) {
  const db  = await getDb();
  const key = String(scopePhone || "default").replace(/\D/g, "") || "default";
  const doc = await db.collection("auto_msg_cfg").findOne({ _id: key });
  return doc ? !!doc.enabled : false;
}

// Per-SENDER opt-out still exists so an individual person chatting with
// an owner's bot can mute AI replies just for themselves, without the
// owner having to turn the whole thing off.
async function setSenderOptOut(phone, optedOut) {
  const db = await getDb();
  await db.collection("auto_msg_optout").updateOne(
    { phone },
    { $set: { optedOut: !!optedOut, updatedAt: new Date() } },
    { upsert: true }
  );
}
async function isSenderOptedOut(phone) {
  const db  = await getDb();
  const doc = await db.collection("auto_msg_optout").findOne({ phone });
  return doc ? (doc.optedOut === true) : false;
}

// ─── Resolve: should THIS message get an AI auto-reply? ────────
// Combines global mode + owner-level personal toggle + sender opt-out
// + group rules — all scoped to THIS owner's bot (scopePhone).
async function resolveShouldReply(senderPhone, isGroup, scopePhone) {
  const global = await getGlobalMode(scopePhone);

  // Hard-off always wins — group + private both blocked, for this owner's bot.
  if (global.hardOff) return false;

  const senderOptedOut = await isSenderOptedOut(senderPhone);
  if (senderOptedOut) return false;

  if (global.enabled) {
    if (isGroup) return !!global.includeGroups;
    return true;
  }

  // Global mode OFF → fall back to this owner's personal ".msg on" toggle.
  // This now applies to ALL senders messaging this owner's bot, private only
  // (groups require the owner-only ".msg on all").
  if (isGroup) return false;
  return await isAutoReplyEnabled(scopePhone);
}

// ─── Language Detection ───────────────────────────────────────
const SI_UNICODE  = /[\u0D80-\u0DFF]/;
const TA_UNICODE  = /[\u0B80-\u0BFF]/;
const SINGLISH_KW = [
  "mata","oya","mage","mokak","mokada","kohomada","karanna","puluwan",
  "thiyenawa","wenawa","kiyanne","kiyala","ane","machan","bro","ganna",
  "danna","hadanne","thiyanawa","wela","neda","api","eka","epa","wenna",
  "balanna","thawa","honda","tikak","godak","oyata","meka","oyage","meka",
  "kawda","kawruwat","mona","hari","naha","inne","hitiye","giye","aawa",
  "gawa","danne","thene","wenne","denne","lassana","honda","nangi","aiya",
  "akka","ayye","malli","duwa","putha","ammae","thaathae","apita","apige",
];
function detectLang(text) {
  if (SI_UNICODE.test(text))  return "si";
  if (TA_UNICODE.test(text))  return "ta";
  const lower = text.toLowerCase();
  if (SINGLISH_KW.some((w) => lower.includes(w))) return "singlish";
  return "en";
}

// ─── System Prompt ────────────────────────────────────────────
function buildSystemPrompt(ownerName, pushName, lang) {
  const who  = ownerName ? `${ownerName}ge MALIYA-MD WhatsApp Bot` : "MALIYA-MD WhatsApp Bot";
  const whoSi = ownerName ? `${ownerName}ගේ MALIYA-MD WhatsApp Bot` : "MALIYA-MD WhatsApp Bot";
  const user = pushName && pushName.trim() ? pushName.trim() : "user";

  if (lang === "singlish") {
    return (
      `Oya ${who}. Oya manage karanney ${ownerName || "Bot Owner"}.` +
      ` Dan chat karana kenage nam ${user}. Ovunta ${user} kiyala address karanna.` +
      ` වැදගත්: Reply karanna Sinhala unicode walin — Sinhala words Sinhala Unicode walin (Sinhala Unicode use karaganna).` +
      ` Example: "kohomada ${user}? 😊 mokak karannada?"` +
      ` Emojis use karanna replies walata. Short, friendly, natural chat style.` +
      ` Previous conversation context use karala relevant replies denna.`
    );
  }
  if (lang === "si") {
    return (
      `ඔයා ${whoSi}. ඔයාව manage කරන්නේ ${ownerName || "Bot Owner"}.` +
      ` දැන් chat කරන කෙනාගේ නම ${user}. ඔවුන්ව ${user} කියලා address කරන්න.` +
      ` වැදගත්: සෑම reply එකක්ම සම්පූර්ණ *සිංහල Unicode* ගෙන් ලියන්න — Singlish use කරන්නෙ නෑ.` +
      ` Emojis use කරන්න replies වලට. Short, friendly, natural chat style.` +
      ` කලින් conversation context use කරලා relevant replies දෙන්න.`
    );
  }
  if (lang === "ta") {
    return (
      `நீங்கள் ${ownerName ? `${ownerName}இன் MALIYA-MD WhatsApp Bot` : "MALIYA-MD WhatsApp Bot"}.` +
      ` இப்போது பேசுபவரின் பெயர் ${user}. அவர்களை ${user} என்று அழையுங்கள்.` +
      ` IMPORTANT: தமிழில் மட்டும் பதில் சொல்லுங்கள். Emojis பயன்படுத்துங்கள். குறுகியதாக, நட்பாக பேசுங்கள்.` +
      ` முந்தைய உரையாடல் context பயன்படுத்தி பதில் சொல்லுங்கள்.`
    );
  }
  return (
    `You are ${who}. The person chatting is named ${user}. Address them as ${user} naturally.` +
    ` IMPORTANT: Reply ONLY in English. Use emojis to make replies feel warm and expressive.` +
    ` Be short, friendly, and conversational.` +
    ` Use the previous conversation history for context when replying.`
  );
}

// ══════════════════════════════════════════════════════════════
//  FREE AI PROVIDERS
// ══════════════════════════════════════════════════════════════

async function callChAt(prompt, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await axios.post(
        "https://ch.at/api/chat",
        { message: prompt },
        { headers: { "Content-Type": "application/json", "User-Agent": "MALIYA-MD-Bot/2.0" }, timeout: 12000 }
      );
      const t = res.data?.answer || res.data?.reply || res.data?.message ||
                res.data?.response || res.data?.result;
      if (t && String(t).trim().length > 2) return { text: String(t).trim(), source: "ch.at" };
    } catch (_) {}
    if (i < retries) await new Promise(r => setTimeout(r, 500 * i));
  }
  return null;
}

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

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

async function callGemini(apiKey, systemPrompt, history, userText) {
  const contents = [];
  contents.push({ role: "user",  parts: [{ text: systemPrompt }] });
  contents.push({ role: "model", parts: [{ text: "Understood." }] });
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
      if (status === 400) break;
      if (status === 429) continue;
    }
  }
  return null;
}

function buildFreePrompt(systemPrompt, history, userText) {
  const lines = [];
  if (systemPrompt) lines.push(`[System]: ${systemPrompt}`);
  lines.push("");
  const recent = history.slice(-8);
  if (recent.length > 0) {
    lines.push("[Conversation so far]:");
    for (const turn of recent) {
      const role = turn.role === "user" ? "User" : "Bot";
      lines.push(`${role}: ${turn.text}`);
    }
    lines.push("");
  }
  lines.push(`User: ${userText}`);
  lines.push("Bot:");
  return lines.join("\n");
}

async function askAI(phone, systemPrompt, history, userText) {
  const keys = await getUserKeys(phone);
  if (keys.length) {
    for (const key of keys) {
      const result = await callGemini(key, systemPrompt, history, userText);
      if (result) return result;
    }
  }
  const freePrompt = buildFreePrompt(systemPrompt, history, userText);
  const chAtResult = await Promise.race([
    callChAt(freePrompt),
    new Promise(r => setTimeout(() => r(null), 14000)),
  ]);
  if (chAtResult) return chAtResult;
  return await callPollinations(freePrompt);
}

// ─── Helpers ──────────────────────────────────────────────────
const THINKING_REACTS = [
  "🤔","💭","⏳","🔍","✨","🧠","🌀","⚙️","🔄","💡",
  "🕵️","📡","🛸","🔬","🧩","🌊","🎯","🔮","💫","🌙",
  "🤖","📟","🧬","🔭","💻","⌛","🕐","🧪","🗂️","📊",
  "🌐","📡","🎲","🧿","🔑","🗺️","📌","🏹","🌌","🔒",
  "⚗️","🧲","💠","🔵","🟣","🌀","🎴","🀄","🎮","🕹️",
];

const REPLY_REACTS = [
  "❤️","🔥","😊","👍","💫","🌟","🎯","⚡","🥰","💕",
  "😍","🤩","💯","🏆","👑","✅","🎉","🎊","🙌","👏",
  "💪","🚀","✨","🌈","💎","🦋","🌸","🌺","🌻","🌹",
  "🍀","🎀","🎁","🎵","🎶","🎸","🥳","🤗","😎","🦁",
  "🐯","🦊","🦄","🐉","⭐","🌠","💥","🎆","🎇","🪄",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
async function react(conn, mek, emoji) {
  try { await conn.sendMessage(mek.key.remoteJid, { react: { text: emoji, key: mek.key } }); } catch (_) {}
}
function failMsg(lang) {
  if (lang === "si")       return "❌ AI service unavailable. ටිකක් wait කරලා try කරන්න. 🙏\n> MALIYA-MD ❤️";
  if (lang === "singlish") return "❌ AI service epa wela. Tikak wait karala try karanna 🙏\n> MALIYA-MD ❤️";
  if (lang === "ta")       return "❌ AI சேவை இல்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும் 🙏\n> MALIYA-MD ❤️";
  return "❌ AI unavailable right now. Try again later 🙏\n> MALIYA-MD ❤️";
}

// ─── Is sender the bot owner? ─────────────────────────────────
function isOwner(phone, sessionOwnerPhone) {
  const clean = String(phone || "").replace(/\D/g, "");
  if (OWNER_NUMBER && clean === OWNER_NUMBER)      return true;
  if (sessionOwnerPhone && clean === String(sessionOwnerPhone).replace(/\D/g, "")) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
//  COMMANDS
// ══════════════════════════════════════════════════════════════

// .setkey — optional Gemini upgrade
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
    return m.reply(
      "❌ Invalid key.\n*.setkey <your_key>*\nFree: https://aistudio.google.com/apikey\n> MALIYA-MD ❤️"
    );
  }
  const result = await addUserKey(phone, key, pushName || phone);
  if (!result.ok) {
    const msgs = {
      key_taken:      "❌ Key is registered to another user.\n> MALIYA-MD ❤️",
      already_exists: "⚠️ Key already saved.\n> MALIYA-MD ❤️",
      limit_reached:  "❌ Max 3 keys. Use *.removekey <n>* first.\n> MALIYA-MD ❤️",
    };
    return m.reply(msgs[result.reason] || "❌ Error saving key.\n> MALIYA-MD ❤️");
  }
  m.reply("✅ *Gemini API key saved!*\n🚀 AI upgraded to Gemini.\n> MALIYA-MD ❤️");
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
  if (!num || num < 1 || num > 3) return m.reply("Usage: *.removekey <1-3>*\n> MALIYA-MD ❤️");
  const ok = await removeUserKey(phone, num);
  m.reply(ok ? "✅ Key removed.\n> MALIYA-MD ❤️" : "❌ Key not found.\n> MALIYA-MD ❤️");
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
  if (!keys.length) {
    return m.reply("ℹ️ No Gemini keys.\nFree AI is active.\n*.setkey <key>* — Upgrade\n> MALIYA-MD ❤️");
  }
  const list = keys.map((k, i) => `*${i + 1}.* \`${k.slice(0, 8)}...${k.slice(-4)}\``).join("\n");
  m.reply(`🔑 *Gemini Keys (${keys.length}/3)*\n\n${list}\n\n> MALIYA-MD ❤️`);
});

// .msg on | on all | off | global off | status | clear | mute | unmute
cmd({
  pattern: "msg",
  desc:    "AI auto-reply — oma eka on/off karanna",
  type:    "all",
  react:   "🤖",
}, async (conn, mek, m, { args, sender, sessionOwnerPhone }) => {
  const phone         = sender.split("@")[0].replace(/\D/g, "");
  const sub           = (args[0] || "").toLowerCase().trim();
  const sub2          = (args[1] || "").toLowerCase().trim();
  const senderIsOwner = isOwner(phone, sessionOwnerPhone || "");
  // scope everything to THIS session's connected owner number — this is
  // the value that must match what handleAutoMsg() passes in, or the
  // toggle silently writes to a doc that resolveShouldReply() never reads.
  const scopePhone = sessionOwnerPhone || OWNER_NUMBER || phone;

  // ── .msg on all → owner-only: private + group AI on for THIS bot ──
  if (sub === "on" && sub2 === "all") {
    if (!senderIsOwner) {
      return m.reply("❌ *.msg on all* is an owner-only command.\n> MALIYA-MD ❤️");
    }
    await setGlobalMode(true, true, scopePhone);
    return m.reply(
      `🌐 *Global AI Mode: ON (Private + Groups)* ✅\n\n` +
      `> Dan me bot ekata private ekakatawath, group ekakatawath ena hama msg ekakatama AI reply yanawa\n` +
      `> (kenek witharak mute karanna one nam eyata *.msg mute* danna)\n` +
      `> Off karanna: *.msg global off*\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // ── .msg on → OWNER turns AI on for THEIR bot (all private senders) ─
  if (sub === "on") {
    if (!senderIsOwner) {
      return m.reply("❌ *.msg on* is an owner-only command — oyage bot eka witharak affect wenawa.\n> MALIYA-MD ❤️");
    }
    await setAutoReply(scopePhone, true);
    const keys   = await getUserKeys(phone);
    const source = keys.length ? "🚀 Gemini AI" : "⚡ Free AI (ch.at + pollinations)";
    return m.reply(
      `✅ *AI Auto Reply ON — oyage bot ekata* 🤖\n` +
      `🧠 ${source}\n\n` +
      `> Dan oyage bot number ekata ena hama private msg ekakatama AI reply yanawa\n` +
      `> (wena bot owners ta me affect wenne na)\n` +
      `> Off karanna: *.msg off*\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // ── .msg global off → owner-only HARD stop (private + group) ─
  if (sub === "global" && sub2 === "off") {
    if (!senderIsOwner) {
      return m.reply("❌ *.msg global off* is an owner-only command.\n> MALIYA-MD ❤️");
    }
    await setGlobalHardOff(scopePhone);
    return m.reply(
      `⛔ *Global AI Mode: OFF (Private + Groups)*\n\n` +
      `> Me bot eke AI auto-reply okkoma hard-stop karala thiyenne.\n` +
      `> Wapas on karanna: *.msg on* / *.msg on all*\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // ── .msg off → owner turns AI off for THEIR bot ──────────────
  if (sub === "off") {
    if (!senderIsOwner) {
      return m.reply("❌ *.msg off* is an owner-only command.\n> MALIYA-MD ❤️");
    }
    await setAutoReply(scopePhone, false);
    return m.reply(
      `⛔ *AI Auto Reply OFF — oyage bot ekata*\n\n` +
      `> Wapas on karanna: *.msg on*\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // ── .msg mute / unmute → an individual sender opts out of AI ──
  // replies just for themselves, without the owner disabling it globally.
  if (sub === "mute") {
    await setSenderOptOut(phone, true);
    return m.reply("🔕 AI won't auto-reply to you anymore on this bot.\n*.msg unmute* to undo.\n> MALIYA-MD ❤️");
  }
  if (sub === "unmute") {
    await setSenderOptOut(phone, false);
    return m.reply("🔔 AI auto-replies re-enabled for you.\n> MALIYA-MD ❤️");
  }

  // ── .msg clear ────────────────────────────────────────────
  if (sub === "clear") {
    await clearHistory(phone);
    return m.reply("🗑️ Chat history cleared.\n> MALIYA-MD ❤️");
  }

  // ── .msg status ───────────────────────────────────────────
  if (sub === "status") {
    const global    = await getGlobalMode(scopePhone);
    const keys      = await getUserKeys(phone);
    const ownerOn   = await isAutoReplyEnabled(scopePhone);
    const optedOut  = await isSenderOptedOut(phone);
    const history   = await getHistory(phone);
    const source    = keys.length ? `🚀 Gemini (${keys.length} key/s)` : "⚡ Free AI (ch.at + pollinations)";

    let myStatus;
    if (global.hardOff)                   myStatus = "OFF ⛔ (global hard-off)";
    else if (optedOut)                    myStatus = "OFF ⛔ (you muted yourself)";
    else if (global.enabled)              myStatus = "ON ✅ (via global mode)";
    else if (ownerOn)                     myStatus = "ON ✅ (bot owner enabled it)";
    else                                  myStatus = "OFF ⛔";

    return m.reply(
      `📊 *AI Status (this bot)*\n\n` +
      `🌐 Global Mode : ${global.hardOff ? "HARD OFF ⛔" : (global.enabled ? "ON ✅" : "OFF ⛔")}\n` +
      `👥 Groups      : ${global.includeGroups ? "ON ✅" : "OFF ⛔"}\n` +
      `🤖 Bot AI      : ${ownerOn ? "ON ✅" : "OFF ⛔"} (owner toggle)\n` +
      `🙋 Your status : ${myStatus}\n` +
      `🧠 AI Source   : ${source}\n` +
      `💬 History     : ${history.length} turns\n` +
      `> MALIYA-MD ❤️`
    );
  }

  // ── Help ──────────────────────────────────────────────────
  m.reply(
    `🤖 *AI Chat Commands*\n\n` +
    `*.msg on*          — (owner) Turn AI on for THIS bot — all private senders 🤖\n` +
    `*.msg on all*      — (owner) Turn AI on for private + groups 🌐\n` +
    `*.msg off*         — (owner) Turn AI off for THIS bot\n` +
    `*.msg global off*  — (owner) Hard off (private+group) 🌐\n` +
    `*.msg mute*        — Mute AI replies just for yourself\n` +
    `*.msg unmute*      — Undo *.msg mute*\n` +
    `*.msg clear*       — Clear your chat history\n` +
    `*.msg status*      — Status check\n\n` +
    `*.setkey <key>*    — Gemini key add (optional upgrade)\n` +
    `*.mykeys*          — Keys list\n` +
    `*.removekey <n>*   — Key remove\n\n` +
    `💡 API key nathi wath free AI (ch.at + pollinations) use weyyi.\n` +
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
    if (!body || body.startsWith(".")) return false;

    const phone = String(sender || "").split("@")[0].replace(/\D/g, "");
    if (!phone) return false;

    const botJidPhone = (conn.user?.id || "").split(":")[0].split("@")[0].replace(/\D/g, "");
    if (botJidPhone && phone === botJidPhone) return false;
    if (mek?.key?.fromMe)                    return false;

    const senderIsOwner = isOwner(phone, sessionOwnerPhone);
    if (senderIsOwner) return false;

    const scopePhone = sessionOwnerPhone || OWNER_NUMBER || "default";

    let localToggleOn = true;
    try { localToggleOn = !!readSettings().auto_msg; } catch (_) {}
    if (!localToggleOn) return false;

    // Resolve using THIS bot's owner scope — never leaks across owners.
    const shouldReply = await resolveShouldReply(phone, isGroup, scopePhone);
    if (!shouldReply) return false;

    const cooldownKey = isGroup ? (mek.key?.remoteJid + phone) : phone;
    const now  = Date.now();
    const last = _cooldowns.get(cooldownKey) || 0;
    if (now - last < COOLDOWN_MS) return false;
    _cooldowns.set(cooldownKey, now);

    await react(conn, mek, pick(THINKING_REACTS));

    const lang = detectLang(body);

    const effectivePushName =
      (pushName && pushName.trim())          ? pushName.trim()     :
      (mek?.pushName && mek.pushName.trim()) ? mek.pushName.trim() : "";

    const storedOwner  = await getUserOwnerName(phone);
    const ownerName    = sessionOwnerName || storedOwner || "Bot Owner";
    const systemPrompt = buildSystemPrompt(ownerName, effectivePushName, lang);
    const history      = await getHistory(phone);

    const result = await askAI(phone, systemPrompt, history, body);

    if (!result) {
      await react(conn, mek, "❌");
      await conn.sendMessage(m.chat, { text: failMsg(lang) }, { quoted: mek });
      return true;
    }

    await appendHistory(phone, "user",  body);
    await appendHistory(phone, "model", result.text);
    await react(conn, mek, pick(REPLY_REACTS));

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

// ══════════════════════════════════════════════════════════════
//  SEEN ALL MSG — independent of AI toggle
// ══════════════════════════════════════════════════════════════
async function handleSeenAllMsg(conn, mek) {
  try {
    if (!mek?.key) return false;
    if (mek.key.fromMe) return false;

    let seenAllOn = false;
    try { seenAllOn = !!readSettings().seen_all_msg; } catch (_) {}
    if (!seenAllOn) return false;

    await conn.readMessages([mek.key]);
    return true;
  } catch (e) {
    console.log("⚠️ handleSeenAllMsg error:", e?.message || e);
    return false;
  }
}

module.exports = { handleAutoMsg, handleSeenAllMsg };

// ══════════════════════════════════════════════════════════════
//  HOW TO INTEGRATE IN index.js
//  -----------------------------------------------------------
//  1. Set owner number in your bot config/env:
//       process.env.OWNER_NUMBER = "94711234567"  // digits only
//
//  2. Set ImageKit env vars (recommended over hardcoding):
//       process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/edusmart"
//       process.env.IMAGEKIT_PUBLIC_KEY   = "public_xxx"
//       process.env.IMAGEKIT_PRIVATE_KEY  = "private_xxx"
//
//  3. `npm install form-data` (needed for the ImageKit multipart upload)
//
//  4. Import at top of index.js:
//       const { handleAutoMsg, handleSeenAllMsg } = require("./plugins/auto_msg");
//
//  5. Inside messages.upsert handler, right after mek.message is
//     normalized (before command parsing), call:
//       await handleSeenAllMsg(sock, mek);
//
//  6. After command processing (non-command branch):
//       const handled = await handleAutoMsg({
//         conn, mek, m, sender, pushName, body,
//         isGroup, sessionOwnerPhone, sessionOwnerName,
//       });
//       if (handled) return;
// ══════════════════════════════════════════════════════════════
