const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

// ========= ENV =========
const GEMINI_API_KEY = process.env.GEMINI_API_KEY2;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://MALIYA-MD:279221@maliya-md.uzal3aa.mongodb.net/?appName=maliya-md";

if (!GEMINI_API_KEY) console.error("⚠️ GEMINI_API_KEY2 is not set (auto_msg plugin)");
if (!DEEPSEEK_API_KEY) console.error("⚠️ DEEPSEEK_API_KEY is not set (auto_msg plugin)");

// ========= MODELS =========
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
];

const DEEPSEEK_MODELS = ["deepseek-chat"];

// ========= SETTINGS =========
const PREFIXES = ["."];
const DATA_DIR = path.join(__dirname, "../data");
const STORE = path.join(DATA_DIR, "auto_msg.json");
const MEMORY_STORE = path.join(DATA_DIR, "auto_msg_memory.json");
const PROFILE_STORE = path.join(DATA_DIR, "auto_msg_profiles.json");
const LOGS_DIR = path.join(DATA_DIR, "auto_msg_logs");

const COOLDOWN_MS = 12000;
const BACKOFF_MS_ON_429 = 180000;
const MAX_REPLIES_PER_HOUR = 60;
const MEMORY_MAX_PER_CHAT = 400;
const MEMORY_TTL_DAYS = 120;
const MEMORY_MIN_CHARS = 3;
const SIM_THRESHOLD = 0.56;
const EXACT_THRESHOLD = 0.975;
const CONTEXT_MAX_TURNS = 14;
const MONGO_CACHE_SIM_THRESHOLD = 0.70;
const PROFILE_MAX_TOPICS = 30;
const MIN_TOKEN_LEN = 3;

// ========= IDENTITY =========
const IDENTITY_EN =
  "I am MALIYA-MD bot. I am an AI powered advanced bot made by Malindu Nadith.";
const IDENTITY_SI =
  "මම MALIYA-MD bot. මම Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.";

// ========= FORBIDDEN WORDS =========
const FORBIDDEN_WORDS = ["gemini", "google", "chatgpt", "openai", "gpt"];

function cleanAiOutput(text) {
  let out = String(text || "");
  for (const word of FORBIDDEN_WORDS) {
    const re = new RegExp(word, "gi");
    out = out.replace(re, "MALIYA-MD");
  }
  return out.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ========= STOPWORDS =========
const STOPWORDS_EN = new Set([
  "the", "and", "for", "are", "you", "your", "with", "this", "that", "have",
  "what", "how", "why", "was", "were", "will", "from", "they", "them", "then",
  "can", "could", "would", "should", "about", "into", "than", "when", "where",
  "who", "whom", "which", "also", "just", "like", "want", "need", "make", "made",
  "does", "did", "not", "yes", "no", "all", "any", "but", "too", "very", "more",
  "some", "much", "many", "our", "out", "use", "using", "used", "give", "tell",
  "help", "menu", "guide", "info", "please", "pls", "bro", "machan", "okay", "ok"
]);

const STOPWORDS_SI = new Set([
  "මට", "මගේ", "මම", "ඔයා", "ඔබ", "එක", "මේ", "ඒ", "ඒක", "මෙක", "ඔනෙ", "one",
  "denna", "mata", "mage", "oya", "mokak", "mokada", "kohomada", "karanna",
  "puluwan", "hari", "thawa", "kiyala", "kiyanne", "weda", "wada", "balanna",
  "ane", "ai", "ne", "da", "eka", "ehema", "ehama", "meka", "api",
  "onn", "anith", "tikak", "godak", "hodata", "hoda", "ewage", "wagema"
]);

// ========= MONGODB =========
let mongoClient = null;
let mongoDb = null;

async function getMongoDB() {
  if (mongoDb) return mongoDb;
  mongoClient = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
  await mongoClient.connect();
  mongoDb = mongoClient.db("maliya_md");
  console.log("✅ auto_msg: Connected to MongoDB");
  return mongoDb;
}

async function getGlobalCacheCol() {
  const db = await getMongoDB();
  return db.collection("global_ai_cache");
}

async function getUserKeysCol() {
  const db = await getMongoDB();
  return db.collection("user_keys");
}

async function getUserSettingsCol() {
  const db = await getMongoDB();
  return db.collection("user_settings");
}

// ========= PER-OWNER AUTO-MSG TOGGLE =========
function extractOwnerPhone(conn) {
  return String(conn?.user?.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

async function setAutoMsg(conn, value) {
  try {
    const phone = extractOwnerPhone(conn);
    if (!phone) return;
    const col = await getUserSettingsCol();
    await col.updateOne(
      { phone },
      { $set: { phone, autoMsg: !!value, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.log("setAutoMsg error:", e?.message || e);
  }
}

async function isAutoMsgOn(conn) {
  try {
    const phone = extractOwnerPhone(conn);
    if (!phone) return true;
    const col = await getUserSettingsCol();
    const doc = await col.findOne({ phone });
    if (!doc) return true;
    return doc.autoMsg !== false;
  } catch {
    return true;
  }
}

// ========= MULTI-OWNER API KEY =========
async function getOwnerApiKey(ownerPhone) {
  try {
    if (!ownerPhone) return null;
    const col = await getUserKeysCol();
    const doc = await col.findOne({ phone: String(ownerPhone) });
    return doc?.apiKey || null;
  } catch {
    return null;
  }
}

async function setOwnerApiKey(ownerPhone, apiKey) {
  const col = await getUserKeysCol();
  await col.updateOne(
    { phone: String(ownerPhone) },
    { $set: { phone: String(ownerPhone), apiKey: String(apiKey), updatedAt: new Date() } },
    { upsert: true }
  );
}

// ========= MONGO CACHE =========
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  const t = normalizeText(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
}

function charNgrams(s, n = 3) {
  const t = normalizeText(s).replace(/\s+/g, " ");
  if (!t) return [];
  if (t.length <= n) return [t];
  const out = [];
  for (let i = 0; i <= t.length - n; i++) out.push(t.slice(i, i + n));
  return out;
}

function jaccardFromArrays(a1, a2) {
  const A = new Set(a1);
  const B = new Set(a2);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function textSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const tokenScore = jaccardFromArrays(tokens(na), tokens(nb));
  const ngramScore = jaccardFromArrays(charNgrams(na, 3), charNgrams(nb, 3));
  return (tokenScore * 0.5) + (ngramScore * 0.5);
}

async function findMongoCache(userText) {
  try {
    const col = await getGlobalCacheCol();
    const qNorm = normalizeText(userText);

    const exact = await col.findOne({ q: qNorm });
    if (exact) return { answer: exact.a, source: "exact_cache" };

    const recent = await col.find({}).sort({ ts: -1 }).limit(500).toArray();
    let best = null;
    let bestScore = 0;

    for (const item of recent) {
      const score = textSimilarity(qNorm, item.q || "");
      if (score > bestScore) {
        bestScore = score;
        best = item;
        if (score >= 0.99) break;
      }
    }

    if (best && bestScore >= MONGO_CACHE_SIM_THRESHOLD) {
      return { answer: best.a, score: bestScore, source: "similar_cache" };
    }

    return null;
  } catch {
    return null;
  }
}

async function saveMongoCache(userText, answer) {
  try {
    if (!userText || !answer) return;
    if (answer.length >= 400) return;

    const col = await getGlobalCacheCol();
    const qNorm = normalizeText(userText);

    await col.updateOne(
      { q: qNorm },
      {
        $set: {
          q: qNorm,
          raw: String(userText).slice(0, 500),
          a: String(answer),
          ts: new Date(),
        },
      },
      { upsert: true }
    );
  } catch {}
}

// ========= FILE HELPERS =========
function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeJsonWrite(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sanitizeChatId(chatId) {
  return String(chatId || "unknown").replace(/[^\w.-]+/g, "_").slice(0, 120);
}

function splitMessage(text, chunkSize = 3500) {
  const clean = cleanAiOutput(text);
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks = [];
  let remaining = clean;

  while (remaining.length > chunkSize) {
    let cut = remaining.lastIndexOf("\n", chunkSize);
    if (cut < 1000) cut = remaining.lastIndexOf(". ", chunkSize);
    if (cut < 1000) cut = remaining.lastIndexOf(" ", chunkSize);
    if (cut < 1000) cut = chunkSize;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

async function sendLongMessage(conn, jid, text, quoted) {
  const parts = splitMessage(text, 3500);
  for (const part of parts) {
    await conn.sendMessage(jid, { text: part }, { quoted });
  }
}

function ensureBaseFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  if (!fs.existsSync(STORE)) safeJsonWrite(STORE, { global: { enabled: false } });
  if (!fs.existsSync(MEMORY_STORE)) safeJsonWrite(MEMORY_STORE, { chats: {}, context: {} });
  if (!fs.existsSync(PROFILE_STORE)) safeJsonWrite(PROFILE_STORE, { chats: {} });
}

ensureBaseFiles();
console.log("✅ auto_msg plugin loaded | DATA_DIR:", DATA_DIR);

// ========= GLOBAL ENABLE/DISABLE =========
function readStore() {
  ensureBaseFiles();
  const db = safeJsonRead(STORE, { global: { enabled: false } });
  if (!db.global) db.global = { enabled: false };
  return db;
}

function writeStore(db) {
  ensureBaseFiles();
  safeJsonWrite(STORE, db);
}

function setGlobalEnabled(val) {
  const db = readStore();
  db.global.enabled = !!val;
  writeStore(db);
}

function isGlobalEnabled() {
  return !!readStore().global.enabled;
}

// ========= MEMORY (FILE-BASED PER-CHAT) =========
function readMemory() {
  ensureBaseFiles();
  const db = safeJsonRead(MEMORY_STORE, { chats: {}, context: {} });
  if (!db.chats) db.chats = {};
  if (!db.context) db.context = {};
  return db;
}

function writeMemory(db) {
  ensureBaseFiles();
  safeJsonWrite(MEMORY_STORE, db);
}

function pruneQA(items) {
  const now = Date.now();
  const ttlMs = MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
  items = (items || []).filter((x) => now - (x?.ts || now) <= ttlMs);
  if (items.length > MEMORY_MAX_PER_CHAT) items = items.slice(items.length - MEMORY_MAX_PER_CHAT);
  return items;
}

function saveQA(chatId, q, a) {
  if (!q || !a) return;
  const db = readMemory();
  if (!db.chats[chatId]) db.chats[chatId] = [];
  const qRaw = String(q).trim();
  const qNorm = normalizeText(qRaw);
  db.chats[chatId].push({ qRaw, qNorm, a: String(a), ts: Date.now() });
  db.chats[chatId] = pruneQA(db.chats[chatId]);
  writeMemory(db);
}

function getChatMemory(chatId) {
  const db = readMemory();
  db.chats[chatId] = pruneQA(db.chats[chatId] || []);
  writeMemory(db);
  return db.chats[chatId];
}

function saveTurn(chatId, role, text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;
  const db = readMemory();
  if (!db.context[chatId]) db.context[chatId] = [];
  db.context[chatId].push({ role, text: cleanText, ts: Date.now() });
  if (db.context[chatId].length > CONTEXT_MAX_TURNS) {
    db.context[chatId] = db.context[chatId].slice(-CONTEXT_MAX_TURNS);
  }
  writeMemory(db);
}

function getContext(chatId) {
  return readMemory().context[chatId] || [];
}

function clearChatMemory(chatId) {
  const db = readMemory();
  db.chats[chatId] = [];
  db.context[chatId] = [];
  writeMemory(db);

  const p = readProfiles();
  p.chats[chatId] = newEmptyProfile();
  writeProfiles(p);

  const logFile = getChatLogFile(chatId);
  safeJsonWrite(logFile, []);
}

// ========= PROFILE STORE =========
function newEmptyProfile() {
  return {
    lang: "en",
    userMessageCount: 0,
    botMessageCount: 0,
    avgUserMsgLen: 0,
    avgBotMsgLen: 0,
    topics: {},
    lastSeen: 0,
    createdAt: Date.now(),
    style: {
      shortPref: 0.5,
      emojiRate: 0,
      punctuationLight: 0,
      singlishRate: 0,
      asksDirectly: 0.5,
      casualRate: 0.5,
    },
    examples: [],
  };
}

function readProfiles() {
  ensureBaseFiles();
  const db = safeJsonRead(PROFILE_STORE, { chats: {} });
  if (!db.chats) db.chats = {};
  return db;
}

function writeProfiles(db) {
  ensureBaseFiles();
  safeJsonWrite(PROFILE_STORE, db);
}

function getProfile(chatId) {
  const db = readProfiles();
  if (!db.chats[chatId]) {
    db.chats[chatId] = newEmptyProfile();
    writeProfiles(db);
  }
  return db.chats[chatId];
}

function rollingAvg(currentAvg, count, newVal) {
  if (count <= 1) return newVal || 0;
  return ((currentAvg * (count - 1)) + (newVal || 0)) / count;
}

function trimTopTopics(topicMap, maxTopics) {
  const arr = Object.entries(topicMap || {}).sort((a, b) => b[1] - a[1]).slice(0, maxTopics);
  const out = {};
  for (const [k, v] of arr) out[k] = v;
  return out;
}

function detectLang(text) {
  if (!text) return "en";
  const t = text.toLowerCase().trim();
  if (/[අ-෴]/.test(text)) return "si";
  const singlishHints = [
    "oya", "kawda", "mokada", "mokak", "kohomada", "karanna", "puluwan",
    "eka", "mage", "mata", "one", "nathi", "hari", "thawa", "denna",
    "kiyala", "kiyanne", "wedak", "wada", "balanna", "ai", "ne", "da",
    "thiyenne", "thiyanawa", "wenne", "ganna", "haduwe", "hadapu", "ehema",
    "bro", "machan", "hodai", "hodayi", "ane", "pls", "plz"
  ];
  if (singlishHints.some((w) => t.includes(w))) return "si";
  return "en";
}

function extractTopicTokens(text, lang = "en") {
  const arr = tokens(text);
  const stop = lang === "si" ? STOPWORDS_SI : STOPWORDS_EN;
  return arr.filter((w) => w && w.length >= MIN_TOKEN_LEN && !/^\d+$/.test(w) && !stop.has(w));
}

function detectStyleSignals(text = "", lang = "en") {
  const t = String(text || "");
  const lower = t.toLowerCase();
  const len = t.trim().length || 1;
  const emojiCount = (t.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  const punctLight = (t.match(/[!?]/g) || []).length;
  const singlishHints = [
    "oya", "mata", "mage", "mokak", "mokada", "kohomada", "karanna", "puluwan",
    "hari", "ane", "machan", "bro", "thiyenawa", "wenawa", "kiyala", "ganna"
  ];
  return {
    shortPref: len <= 80 ? 1 : 0,
    emojiRate: Math.min(1, emojiCount / 3),
    punctuationLight: Math.min(1, punctLight / 3),
    singlishRate: singlishHints.some((w) => lower.includes(w)) || lang === "si" ? 1 : 0,
    asksDirectly: /\?$/.test(t.trim()) ? 1 : 0.35,
    casualRate: /(bro|machan|ane|pls|plz|ok|okay|hari|hoda)/i.test(lower) ? 1 : 0.4,
  };
}

function updateProfile(chatId, role, text, lang) {
  const db = readProfiles();
  if (!db.chats[chatId]) db.chats[chatId] = newEmptyProfile();
  const p = db.chats[chatId];
  const clean = String(text || "").trim();
  p.lang = lang || p.lang || "en";
  p.lastSeen = Date.now();
  if (role === "user") {
    p.userMessageCount += 1;
    p.avgUserMsgLen = rollingAvg(p.avgUserMsgLen, p.userMessageCount, clean.length);
    const toks = extractTopicTokens(clean, p.lang);
    for (const tk of toks) p.topics[tk] = (p.topics[tk] || 0) + 1;
    p.topics = trimTopTopics(p.topics, PROFILE_MAX_TOPICS);
    const sig = detectStyleSignals(clean, p.lang);
    const n = p.userMessageCount;
    for (const k of Object.keys(p.style)) {
      p.style[k] = ((p.style[k] * (n - 1)) + (sig[k] || 0)) / n;
    }
    p.examples.push(clean.slice(0, 180));
    if (p.examples.length > 8) p.examples = p.examples.slice(-8);
  } else if (role === "bot") {
    p.botMessageCount += 1;
    p.avgBotMsgLen = rollingAvg(p.avgBotMsgLen, p.botMessageCount, clean.length);
  }
  writeProfiles(db);
}

function getTopTopics(chatId, limit = 8) {
  const p = getProfile(chatId);
  return Object.entries(p.topics || {}).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
}

// ========= LOGGING =========
function getChatLogFile(chatId) {
  return path.join(LOGS_DIR, `${sanitizeChatId(chatId)}.json`);
}

function appendChatLog(chatId, entry) {
  const file = getChatLogFile(chatId);
  const arr = safeJsonRead(file, []);
  arr.push({ ...entry, ts: entry.ts || Date.now() });
  if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  safeJsonWrite(file, arr);
}

function getRecentLogs(chatId, limit = 20) {
  return safeJsonRead(getChatLogFile(chatId), []).slice(-limit);
}

// ========= HEAVY REQUEST DETECTION =========
function isHeavyRequest(text) {
  const t = (text || "").toLowerCase();
  if (text.length > 80) return true;
  if (/(essay|rachana|composition|රචනා|ලිපිය)/.test(t)) return true;
  return false;
}

function getHeavyRequestReply(text, lang) {
  const t = (text || "").toLowerCase();
  const topicMatch = text.match(/(\w+)\s+(rachana|essay|composition)/i);
  const topic = topicMatch ? topicMatch[1] : "topic";
  const cmdLang = lang === "si" ? "si" : "en";

  if (/(rachana|රචනා|essay|composition)/.test(t)) {
    return `⚠️ Heavy request 😅\n👉 Use *.dec${cmdLang}*\n📌 Example: *.dec${cmdLang} ${topic}*\n\n> MALIYA-MD ❤️`;
  }

  if (/(voice|tts|read aloud|කියවන්න)/.test(t)) {
    return `⚠️ Heavy request 😅\n👉 Use *.tts${cmdLang}*\n📌 Example: *.tts${cmdLang} ${topic}*\n\n> MALIYA-MD ❤️`;
  }

  return lang === "si"
    ? `⚠️ ඒ request ටිකක් දිගයි 😅\nMENU: *.menu* type කරන්න\n\n> MALIYA-MD ❤️`
    : `⚠️ That request is too long 😅\nTry *.menu* to see available commands\n\n> MALIYA-MD ❤️`;
}

// ========= DETECTORS =========
function isFollowUp(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (t.length <= 18) return true;
  const keys = [
    "eka", "eeka", "ehema", "ehama", "ow", "an", "ai", "ehenam", "meka",
    "mokakda", "kohomada", "hari", "ok", "okay", "thawa", "then", "so",
    "why", "how", "what about", "explain", "detail", "more", "anith eka",
    "itapasse", "passe", "aye", "next"
  ];
  return keys.some((k) => t === k || t.includes(k));
}

function isIdentityQuestion(text) {
  const t = (text || "").toLowerCase();
  const siKeys = ["oya kawda", "kawda oya", "oyawa haduwe", "haduwe kawda", "me bot eka kawda"];
  const enKeys = ["who are you", "who made you", "who created you", "what are you"];
  return siKeys.some((k) => t.includes(k)) || enKeys.some((k) => t.includes(k));
}

function isHelpQuestion(text) {
  const t = (text || "").toLowerCase();
  const keys = ["help", "menu", "cmd", "commands", "guide", "info", "use karanne", "kohomada use"];
  return keys.some((k) => t.includes(k));
}

function getIdentityReply(lang) {
  return lang === "si" ? IDENTITY_SI : IDENTITY_EN;
}

function helpText(lang) {
  return `🤖 *MALIYA-MD BOT - Help / Guide*

✅ *Prefix:* .
✅ *Menu:* .menu
✅ *AI Auto Reply (Private chats only):*
   - ON:  .msg on
   - OFF: .msg off
   - Status: .msg status
   - Profile: .msg profile
   - Clear memory: .msg clear
   - Export logs: .msg export
✅ *Set your API key:* .setkey YOUR_KEY

> MALIYA-MD ❤️`;
}

// ========= STYLE / PROFILE SUMMARY =========
function styleSummary(chatId) {
  const p = getProfile(chatId);
  const s = p.style || {};
  const lengthStyle = s.shortPref >= 0.65 ? "short replies" : s.shortPref >= 0.45 ? "medium replies" : "slightly detailed replies";
  const tone = s.casualRate >= 0.65 ? "casual" : "balanced";
  const emoji = s.emojiRate >= 0.35 ? "light emoji okay" : "minimal emoji";
  const language = p.lang === "si"
    ? (s.singlishRate >= 0.45 ? "Sinhala / Singlish mix" : "simple Sinhala")
    : "simple English";
  const examples = (p.examples || []).slice(-3).map((x) => `- ${x}`).join("\n") || "- none";
  return { text: `${language}, ${tone}, ${lengthStyle}, ${emoji}`, examples };
}

function buildUserProfileSummary(chatId) {
  const p = getProfile(chatId);
  const topics = getTopTopics(chatId, 8);
  const recent = getRecentLogs(chatId, 6).map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`).join("\n");
  const style = styleSummary(chatId);
  return {
    lang: p.lang || "en",
    userMessageCount: p.userMessageCount || 0,
    avgUserMsgLen: Math.round(p.avgUserMsgLen || 0),
    topics,
    recent,
    styleText: style.text,
    examples: style.examples,
  };
}

// ========= PROMPTS =========
function buildPrompt(userText, lang, chatId, senderName) {
  const prof = buildUserProfileSummary(chatId);
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";
  const name = senderName || "friend";

  if (lang === "si") {
    return `ඔබ smart, friendly chat friend කෙනෙක්.
ඔබේ name හෝ ඔබ හැදුවේ කවුද කියලා user DIRECTLY නොඅහෙනකල් කවදාවත් කියන්න එපා.
User ගේ name "${name}" - reply දෙද්දී ස්වභාවිකව name use කරන්න (හැමවිටම නෙවෙයි).
Natural, casual Sinhala/Singlish mix reply දෙන්න. Real friend කෙනෙක් වගේ කතා කරන්න.
User short ගැහුවා නම් short reply. Detail ඕනනම් complete reply.
Emoji naturally use කරන්න: 😄 🙂 🔥 🤔 😅
Same phrases repeat කරන්න එපා. Robotic ලෙස reply කරන්න එපා.
"MALIYA-MD" හෝ "Malindu Nadith" නිකම් reply වලට add කරන්න එපා.

User info:
- Name: ${name}
- Language: ${prof.lang}
- Common topics: ${topTopics}
- Style: ${prof.styleText}

${name}: ${userText}`.trim();
  }

  return `You are a smart, friendly chat companion.
NEVER mention your name or who created you UNLESS the user directly asks about your identity.
The user's name is "${name}" — use it naturally in replies (not in every message).
Talk like a real friend: casual, warm, short when the message is short, detailed when needed.
Use emojis naturally: 😄 🙂 🔥 🤔 😅
Do NOT repeat "MALIYA-MD" or "Malindu Nadith" in normal replies.
Do NOT sound robotic. Match the user's tone and energy.

User info:
- Name: ${name}
- Language: ${prof.lang}
- Common topics: ${topTopics}
- Style: ${prof.styleText}

${name}: ${userText}`.trim();
}

function buildPromptWithContext(userText, lang, chatId, contextTurns, senderName) {
  const prof = buildUserProfileSummary(chatId);
  const history = (contextTurns || []).map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`).join("\n");
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";
  const name = senderName || "friend";

  if (lang === "si") {
    return `ඔබ smart, friendly chat friend කෙනෙක්.
ඔබේ name හෝ ඔබ හැදුවේ කවුද කියලා user DIRECTLY නොඅහෙනකල් කවදාවත් කියන්න එපා.
User ගේ name "${name}" - reply දෙද්දී ස්වභාවිකව name use කරන්න (හැමවිටම නෙවෙයි).
කලින් conversation context බලලා natural follow-up reply දෙන්න.
Natural, casual Sinhala/Singlish mix. Real friend කෙනෙක් වගේ කතා කරන්න.
User short ගැහුවා නම් short. Detail ඕනනම් complete. Emoji naturally use කරන්න.
"MALIYA-MD" හෝ "Malindu Nadith" නිකම් add කරන්න එපා.

User info:
- Name: ${name}
- Language: ${prof.lang}
- Common topics: ${topTopics}
- Style: ${prof.styleText}

Previous conversation:
${history || "(none)"}

${name}: ${userText}`.trim();
  }

  return `You are a smart, friendly chat companion.
NEVER mention your name or who created you UNLESS the user directly asks about your identity.
The user's name is "${name}" — use it naturally in replies (not every time).
Use the previous conversation context to give natural follow-up replies.
Talk like a real friend: casual, warm, short when the message is short, detailed when needed.
Use emojis naturally: 😄 🙂 🔥 🤔 😅
Do NOT say "MALIYA-MD" or "Malindu Nadith" in normal replies. Do NOT sound robotic.

User info:
- Name: ${name}
- Language: ${prof.lang}
- Common topics: ${topTopics}
- Style: ${prof.styleText}

Previous conversation:
${history || "(none)"}

${name}: ${userText}`.trim();
}

// ========= RATE LIMITING =========
const lastReplyAt = new Map();

function inCooldown(chatId) {
  const now = Date.now();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  lastReplyAt.set(chatId, now);
  return false;
}

let hourWindowStart = Date.now();
let repliesThisHour = 0;

function hitHourlyCap() {
  const now = Date.now();
  if (now - hourWindowStart > 3600000) { hourWindowStart = now; repliesThisHour = 0; }
  if (repliesThisHour >= MAX_REPLIES_PER_HOUR) return true;
  repliesThisHour++;
  return false;
}

let backoffUntil = 0;
function inBackoff() { return Date.now() < backoffUntil; }
function startBackoff() { backoffUntil = Date.now() + BACKOFF_MS_ON_429; }

const busyChats = new Set();

// ========= USER MESSAGES =========
function rateLimitMsg(lang) {
  return lang === "si"
    ? "⏳ Requests ටිකක් වැඩියි. ටිකක් පස්සේ ආයෙ try කරන්න.\n> MALIYA-MD ❤️"
    : "⏳ Too many requests right now. Please try again in a moment.\n> MALIYA-MD ❤️";
}

function serviceUnavailableMsg(lang) {
  return lang === "si"
    ? "❌ AI service unavailable. ටිකක් පස්සේ ආයෙ try කරන්න.\n> MALIYA-MD ❤️"
    : "❌ AI service unavailable right now. Please try again later.\n> MALIYA-MD ❤️";
}

// ========= AI CALLS =========
async function generateWithGemini(prompt, apiKey) {
  const key = apiKey || GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("Missing Gemini API key"), { provider: "gemini" });

  let lastErr = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, topP: 0.95, maxOutputTokens: 900 },
        },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 1) return { text: out, provider: "gemini", model };

      lastErr = new Error(`Empty Gemini response from ${model}`);
    } catch (e) {
      const status = e?.response?.status;
      lastErr = e;
      if (status === 429) { e.provider = "gemini"; throw e; }
      if (status === 404) continue;
      e.provider = "gemini";
      throw e;
    }
  }

  if (lastErr) { lastErr.provider = "gemini"; throw lastErr; }
  throw Object.assign(new Error("Gemini failed"), { provider: "gemini" });
}

async function generateWithDeepSeek(prompt) {
  if (!DEEPSEEK_API_KEY) throw Object.assign(new Error("Missing DEEPSEEK_API_KEY"), { provider: "deepseek" });

  let lastErr = null;

  for (const model of DEEPSEEK_MODELS) {
    try {
      const res = await axios.post(
        "https://api.deepseek.com/chat/completions",
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.75,
          top_p: 0.95,
          max_tokens: 900,
          stream: false,
        },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
        }
      );

      const out = res?.data?.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 1) return { text: out, provider: "deepseek", model };
      lastErr = new Error(`Empty DeepSeek response from ${model}`);
    } catch (e) {
      e.provider = "deepseek";
      lastErr = e;
      if ([429, 402].includes(e?.response?.status)) throw e;
      throw e;
    }
  }

  if (lastErr) { lastErr.provider = "deepseek"; throw lastErr; }
  throw Object.assign(new Error("DeepSeek failed"), { provider: "deepseek" });
}

async function generateWithPuter(prompt) {
  try {
    const response = await fetch("https://api.puter.com/v2/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4-nano",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Puter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let out = null;

    // Extract response from different possible formats
    if (data?.message?.content?.[0]?.text) {
      out = data.message.content[0].text;
    } else if (data?.choices?.[0]?.message?.content) {
      out = data.choices[0].message.content;
    } else if (data?.text) {
      out = data.text;
    }

    if (out && out.trim().length > 1) {
      console.log("✅ Puter AI generated response");
      return {
        text: out.trim(),
        provider: "puter",
        model: "openai/gpt-5.4-nano"
      };
    }

    throw new Error("Empty or invalid response from Puter AI");
  } catch (error) {
    console.log("PUTER AI FAILED:", error.message || error);
    error.provider = "puter";
    throw error;
  }
}

async function generateText(prompt, ownerApiKey) {
  // Try Gemini first
  try {
    return await generateWithGemini(prompt, ownerApiKey);
  } catch (geminiError) {
    console.log("GEMINI FAILED → Trying DeepSeek:", geminiError?.response?.status || "", geminiError?.message || geminiError);
    if (geminiError?.response?.status === 429) startBackoff();
    
    // Try DeepSeek second
    try {
      return await generateWithDeepSeek(prompt);
    } catch (deepSeekError) {
      console.log("DEEPSEEK FAILED → Trying Puter AI:", deepSeekError?.response?.status || "", deepSeekError?.message || deepSeekError);
      if (deepSeekError?.response?.status === 429) startBackoff();
      
      // Try Puter AI third
      try {
        return await generateWithPuter(prompt);
      } catch (puterError) {
        console.log("PUTER AI FAILED as well:", puterError?.message || puterError);
        throw new Error("All AI services failed (Gemini, DeepSeek, Puter)");
      }
    }
  }
}

// ========= PROFILE / EXPORT =========
function buildProfileText(chatId) {
  const p = getProfile(chatId);
  const topTopics = getTopTopics(chatId, 10);
  const recent = getRecentLogs(chatId, 10);
  const style = styleSummary(chatId);

  return `👤 *Chat Profile*

• Language: ${p.lang || "en"}
• User messages: ${p.userMessageCount || 0}
• Bot replies: ${p.botMessageCount || 0}
• Avg user msg length: ${Math.round(p.avgUserMsgLen || 0)}
• Avg bot msg length: ${Math.round(p.avgBotMsgLen || 0)}
• Top topics: ${topTopics.length ? topTopics.join(", ") : "none"}
• Style: ${style.text}

🕘 *Recent messages:*
${recent.length ? recent.map((x, i) => `${i + 1}. [${x.role}] ${String(x.text).slice(0, 120)}`).join("\n") : "No recent messages"}
`;
}

function buildExportText(chatId) {
  const logs = getRecentLogs(chatId, 50);
  if (!logs.length) return "No chat logs found.";
  return logs.map((x) => `[${new Date(x.ts || Date.now()).toISOString()}] ${x.role.toUpperCase()}: ${x.text}`).join("\n");
}

// ========= COMMAND: .setkey =========
cmd(
  {
    pattern: "setkey",
    desc: "Set your personal Gemini API key",
    category: "AI",
    react: "🔑",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply, isOwner }) => {
    try {
      if (!isOwner) return reply("❌ Only the bot owner can set an API key.");
      const key = (q || "").trim();
      if (!key) return reply("Usage: .setkey YOUR_GEMINI_API_KEY");
      if (!key.startsWith("AI") && key.length < 30) return reply("❌ That doesn't look like a valid Gemini API key.");

      const ownerJid = mek?.key?.remoteJid || "";
      const ownerPhone = ownerJid.split("@")[0].split(":")[0].replace(/\D/g, "");
      if (!ownerPhone) return reply("❌ Could not detect your phone number.");

      await setOwnerApiKey(ownerPhone, key);
      return reply("✅ Your Gemini API key has been saved!\nThis key will now be used for AI replies on your bot.\n\n> MALIYA-MD ❤️");
    } catch (e) {
      console.log("SETKEY ERROR:", e?.message || e);
      return reply("❌ Failed to save API key. Try again later.");
    }
  }
);

// ========= COMMAND: .msg =========
cmd(
  {
    pattern: "msg",
    desc: "Auto Reply ON/OFF (Private chats only)",
    category: "AI",
    react: "💬",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      const arg = (q || "").trim().toLowerCase();
      const from = mek?.key?.remoteJid;

      if (!arg) return reply("Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export");

      if (arg === "on") {
        await setAutoMsg(conn, true);
        return reply("✅ Auto reply enabled\n\n> MALIYA-MD ❤️");
      }
      if (arg === "off") {
        await setAutoMsg(conn, false);
        return reply("❌ Auto reply disabled\n\n> MALIYA-MD ❤️");
      }
      if (arg === "status") {
        const on = await isAutoMsgOn(conn);
        return reply(`Auto Reply: ${on ? "✅ ON" : "❌ OFF"}\n\n> MALIYA-MD ❤️`);
      }
      if (arg === "profile") { if (!from) return reply("Chat not found."); return reply(buildProfileText(from)); }
      if (arg === "clear") {
        if (!from) return reply("Chat not found.");
        clearChatMemory(from);
        return reply("🧹 Memory, profile, and logs cleared for this chat.\n\n> MALIYA-MD ❤️");
      }
      if (arg === "export") {
        if (!from) return reply("Chat not found.");
        const txt = buildExportText(from);
        return reply(txt.length > 3900 ? txt.slice(0, 3900) + "\n\n...truncated" : txt);
      }

      return reply("Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export");
    } catch (e) {
      console.log("MSG COMMAND ERROR:", e?.message || e);
      return reply("❌ Command error");
    }
  }
);

// ========= MAIN onMessage HOOK =========
async function onMessage(conn, mek, m, ctx = {}) {
  let lang = "en";
  let from = null;

  try {
    from = mek?.key?.remoteJid;
    if (!from) return;
    if (String(from).endsWith("@g.us")) return;
    if (mek?.key?.fromMe) return;

    const autoMsgEnabled = await isAutoMsgOn(conn);
    if (!autoMsgEnabled) return;

    const body = String(ctx.body || "").trim();
    if (!body) return;
    if (PREFIXES.some((p) => body.startsWith(p))) return;

    const senderName = String(mek.pushName || ctx.sender || "").split(" ")[0].trim() || "friend";
    lang = detectLang(body);

    saveTurn(from, "user", body);
    appendChatLog(from, { role: "user", text: body, ts: Date.now() });
    updateProfile(from, "user", body, lang);

    // ── Identity / Help shortcuts ──────────────────────
    if (isIdentityQuestion(body)) {
      const txt = getIdentityReply(lang);
      await sendLongMessage(conn, from, txt, mek);
      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      return;
    }

    if (isHelpQuestion(body)) {
      const txt = helpText(lang);
      await sendLongMessage(conn, from, txt, mek);
      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      return;
    }

    // ── Heavy request detection ────────────────────────
    if (isHeavyRequest(body)) {
      const txt = getHeavyRequestReply(body, lang);
      await sendLongMessage(conn, from, txt, mek);
      return;
    }

    // ── Rate limiting ──────────────────────────────────
    if (inCooldown(from)) return;
    if (hitHourlyCap()) {
      await sendLongMessage(conn, from, rateLimitMsg(lang), mek);
      return;
    }
    if (inBackoff()) {
      await sendLongMessage(conn, from, rateLimitMsg(lang), mek);
      return;
    }
    if (busyChats.has(from)) return;

    busyChats.add(from);

    try {
      // ── MongoDB global cache lookup ────────────────────
      const cached = await findMongoCache(body);
      if (cached) {
        const reply = cleanAiOutput(cached.answer);
        await sendLongMessage(conn, from, reply, mek);
        saveTurn(from, "bot", reply);
        appendChatLog(from, { role: "bot", text: reply, ts: Date.now() });
        updateProfile(from, "bot", reply, lang);
        return;
      }

      // ── Get owner's custom API key ─────────────────────
      const ownerPhone = conn?.user?.id?.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || null;
      const ownerApiKey = ownerPhone ? await getOwnerApiKey(ownerPhone) : null;

      // ── Build prompt ───────────────────────────────────
      const contextTurns = getContext(from);
      const useContext = isFollowUp(body) && contextTurns.length > 0;
      const prompt = useContext
        ? buildPromptWithContext(body, lang, from, contextTurns, senderName)
        : buildPrompt(body, lang, from, senderName);

      // ── Generate AI response ───────────────────────────
      const result = await generateText(prompt, ownerApiKey);
      const rawText = result?.text || serviceUnavailableMsg(lang);
      const replyText = cleanAiOutput(rawText);

      await sendLongMessage(conn, from, replyText, mek);
      saveTurn(from, "bot", replyText);
      appendChatLog(from, { role: "bot", text: replyText, ts: Date.now() });
      updateProfile(from, "bot", replyText, lang);
      saveQA(from, body, replyText);

      // ── Save to MongoDB global cache ───────────────────
      await saveMongoCache(body, replyText);

    } catch (e) {
      console.log("AUTO_MSG AI ERROR:", e?.message || e);
      const errMsg = serviceUnavailableMsg(lang);
      try { await sendLongMessage(conn, from, errMsg, mek); } catch {}
    } finally {
      busyChats.delete(from);
    }

  } catch (e) {
    console.log("AUTO_MSG onMessage ERROR:", e?.message || e);
    if (from) busyChats.delete(from);
  }
}

module.exports = { onMessage };
