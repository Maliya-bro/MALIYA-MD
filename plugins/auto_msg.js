const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ========= ENV =========
const GEMINI_API_KEY = process.env.GEMINI_API_KEY2;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!GEMINI_API_KEY) console.error("GEMINI_API_KEY2 is not set (auto_msg plugin)");
if (!DEEPSEEK_API_KEY) console.error("DEEPSEEK_API_KEY is not set (auto_msg plugin)");

// ========= MODELS =========
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

const DEEPSEEK_MODELS = [
  "deepseek-chat",
];

// ========= SETTINGS =========
const PREFIXES = ["."];
const DATA_DIR = path.join(__dirname, "../data");
const STORE = path.join(DATA_DIR, "auto_msg.json");
const MEMORY_STORE = path.join(DATA_DIR, "auto_msg_memory.json");
const PROFILE_STORE = path.join(DATA_DIR, "auto_msg_profiles.json");
const LOGS_DIR = path.join(DATA_DIR, "auto_msg_logs");
const CACHE_STORE = path.join(DATA_DIR, "auto_msg_cache.json");

// 🔒 RATE-LIMIT SAFETY
const COOLDOWN_MS = 12000;
const BACKOFF_MS_ON_429 = 180000;
const MAX_REPLIES_PER_HOUR = 60;

// 🧠 MEMORY SETTINGS
const MEMORY_MAX_PER_CHAT = 400;
const MEMORY_TTL_DAYS = 120;
const MEMORY_MIN_CHARS = 3;
const SIM_THRESHOLD = 0.56;
const EXACT_THRESHOLD = 0.975;

// 🧩 CONTEXT SETTINGS
const CONTEXT_MAX_TURNS = 14;

// ⚡ CACHE SETTINGS
const CACHE_MAX_ITEMS = 800;
const CACHE_TTL_DAYS = 30;
const CACHE_SIM_THRESHOLD = 0.93;

// 👤 PROFILE SETTINGS
const PROFILE_MAX_TOPICS = 30;
const MIN_TOKEN_LEN = 3;

// ========= IDENTITY =========
const IDENTITY_EN =
  "I am MALIYA-MD bot. I am an AI powered advanced bot made by Malindu Nadith.";
const IDENTITY_SI =
  "මම MALIYA-MD bot. මම Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.";

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

// ========= HELPERS =========
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

function cleanAiText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitMessage(text, chunkSize = 3500) {
  const clean = cleanAiText(text);
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
  if (!fs.existsSync(MEMORY_STORE)) {
    safeJsonWrite(MEMORY_STORE, { chats: {}, context: {} });
  }
  if (!fs.existsSync(PROFILE_STORE)) {
    safeJsonWrite(PROFILE_STORE, { chats: {} });
  }
  if (!fs.existsSync(CACHE_STORE)) {
    safeJsonWrite(CACHE_STORE, { items: [] });
  }
}

ensureBaseFiles();
console.log("AUTO_MSG DATA_DIR:", DATA_DIR);

// ========= USER MESSAGES =========
function rateLimitMsg(lang) {
  return lang === "si"
    ? "⏳ දැන් requests ටිකක් වැඩියි. ටිකක් පස්සේ ආයෙ try කරන්න.\n> MALIYA-MD ❤️"
    : "⏳ Too many requests right now. Please try again in a moment.\n> MALIYA-MD ❤️";
}

function serviceUnavailableMsg(lang) {
  return lang === "si"
    ? "❌ දැන් AI service දෙකම unavailable. ටිකක් පස්සේ ආයෙ try කරන්න.\n> MALIYA-MD ❤️"
    : "❌ Both AI services are unavailable right now. Please try again later.\n> MALIYA-MD ❤️";
}

function helpText(lang) {
  if (lang === "si") {
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

> MALIYA-MD ❤️`;
  }

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

> MALIYA-MD ❤️`;
}

// ========= GLOBAL STORE =========
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

// ========= MEMORY STORE =========
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

  items = (items || []).filter((x) => {
    const ts = x?.ts || now;
    return now - ts <= ttlMs;
  });

  if (items.length > MEMORY_MAX_PER_CHAT) {
    items = items.slice(items.length - MEMORY_MAX_PER_CHAT);
  }

  return items;
}

function saveQA(chatId, q, a) {
  if (!q || !a) return;
  const db = readMemory();
  if (!db.chats[chatId]) db.chats[chatId] = [];

  const qRaw = String(q).trim();
  const qNorm = normalizeText(qRaw);
  const qVec = buildSemanticVector(qRaw, detectLang(qRaw));

  db.chats[chatId].push({
    qRaw,
    qNorm,
    qVec,
    a: String(a),
    ts: Date.now(),
  });

  db.chats[chatId] = pruneQA(db.chats[chatId]);
  writeMemory(db);
}

function getChatMemory(chatId) {
  const db = readMemory();
  db.chats[chatId] = pruneQA(db.chats[chatId] || []);
  writeMemory(db);
  return db.chats[chatId];
}

// ========= CONTEXT =========
function saveTurn(chatId, role, text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  const db = readMemory();
  if (!db.context[chatId]) db.context[chatId] = [];

  db.context[chatId].push({
    role,
    text: cleanText,
    ts: Date.now(),
  });

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

  const c = readCache();
  c.items = (c.items || []).filter((x) => x.chatId !== chatId);
  writeCache(c);

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
  const arr = Object.entries(topicMap || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics);

  const out = {};
  for (const [k, v] of arr) out[k] = v;
  return out;
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
    for (const tk of toks) {
      p.topics[tk] = (p.topics[tk] || 0) + 1;
    }
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
  return Object.entries(p.topics || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

// ========= LOGGING =========
function getChatLogFile(chatId) {
  return path.join(LOGS_DIR, `${sanitizeChatId(chatId)}.json`);
}

function appendChatLog(chatId, entry) {
  const file = getChatLogFile(chatId);
  const arr = safeJsonRead(file, []);
  arr.push({ ...entry, ts: entry.ts || Date.now() });

  if (arr.length > 1000) {
    arr.splice(0, arr.length - 1000);
  }

  safeJsonWrite(file, arr);
}

function getRecentLogs(chatId, limit = 20) {
  return safeJsonRead(getChatLogFile(chatId), []).slice(-limit);
}

// ========= CACHE =========
function readCache() {
  ensureBaseFiles();
  const db = safeJsonRead(CACHE_STORE, { items: [] });
  if (!Array.isArray(db.items)) db.items = [];
  return db;
}

function writeCache(db) {
  ensureBaseFiles();
  safeJsonWrite(CACHE_STORE, db);
}

function pruneCache(items) {
  const now = Date.now();
  const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

  items = (items || []).filter((x) => now - (x.ts || now) <= ttlMs);

  if (items.length > CACHE_MAX_ITEMS) {
    items = items.slice(items.length - CACHE_MAX_ITEMS);
  }

  return items;
}

function saveCache(chatId, q, a, lang) {
  if (!q || !a) return;
  const db = readCache();
  db.items.push({
    chatId,
    qRaw: String(q),
    qNorm: normalizeText(q),
    qVec: buildSemanticVector(q, lang),
    a: String(a),
    lang,
    ts: Date.now(),
  });
  db.items = pruneCache(db.items);
  writeCache(db);
}

function findCacheAnswer(chatId, userText, lang) {
  const db = readCache();
  db.items = pruneCache(db.items);
  writeCache(db);

  const qNorm = normalizeText(userText);
  const qVec = buildSemanticVector(userText, lang);

  let best = null;
  let bestScore = 0;

  for (let i = db.items.length - 1; i >= 0; i--) {
    const it = db.items[i];
    if (it.chatId !== chatId) continue;

    const sc = semanticSimilarityFromStored(qNorm, qVec, it.qNorm, it.qVec);
    if (sc > bestScore) {
      bestScore = sc;
      best = it;
      if (sc >= 0.99) break;
    }
  }

  if (best && bestScore >= CACHE_SIM_THRESHOLD) {
    return {
      answer: best.a,
      score: bestScore,
      source: "cache",
    };
  }

  return null;
}

// ========= TEXT NORMALIZATION =========
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

function cosineSparse(mapA, mapB) {
  const keys = new Set([...Object.keys(mapA || {}), ...Object.keys(mapB || {})]);
  if (!keys.size) return 0;

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (const k of keys) {
    const a = mapA[k] || 0;
    const b = mapB[k] || 0;
    dot += a * b;
    na += a * a;
    nb += b * b;
  }

  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ========= TOPIC EXTRACTION =========
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

  return arr.filter((w) => {
    if (!w) return false;
    if (w.length < MIN_TOKEN_LEN) return false;
    if (/^\d+$/.test(w)) return false;
    if (stop.has(w)) return false;
    return true;
  });
}

// ========= SEMANTIC MEMORY =========
function buildSemanticVector(text, lang = "en") {
  const toks = tokens(text);
  const topToks = extractTopicTokens(text, lang);
  const grams = charNgrams(text, 3);

  const vec = {};

  for (const t of toks) vec[`tok:${t}`] = (vec[`tok:${t}`] || 0) + 1;
  for (const t of topToks) vec[`top:${t}`] = (vec[`top:${t}`] || 0) + 2;
  for (const g of grams) vec[`ng:${g}`] = (vec[`ng:${g}`] || 0) + 0.35;

  return vec;
}

function semanticSimilarityFromStored(qNorm, qVec, storedNorm, storedVec) {
  const tokenScore = jaccardFromArrays(tokens(qNorm), tokens(storedNorm));
  const ngramScore = jaccardFromArrays(charNgrams(qNorm, 3), charNgrams(storedNorm, 3));
  const vecScore = cosineSparse(qVec || {}, storedVec || {});
  return (tokenScore * 0.25) + (ngramScore * 0.20) + (vecScore * 0.55);
}

function findBestMemoryAnswer(chatId, userText) {
  const qn = normalizeText(userText);
  if (!qn || qn.length < MEMORY_MIN_CHARS) return null;

  const lang = detectLang(userText);
  const qVec = buildSemanticVector(userText, lang);
  const items = getChatMemory(chatId);
  if (!items.length) return null;

  let best = null;
  let bestScore = 0;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const sc = semanticSimilarityFromStored(
      qn,
      qVec,
      it.qNorm || normalizeText(it.qRaw || ""),
      it.qVec || {}
    );

    if (sc > bestScore) {
      bestScore = sc;
      best = it;
      if (bestScore >= EXACT_THRESHOLD) break;
    }
  }

  if (best && bestScore >= SIM_THRESHOLD) {
    return {
      answer: best.a,
      score: bestScore,
      matchedQuestion: best.qRaw || best.qNorm,
      source: bestScore >= EXACT_THRESHOLD ? "exact_memory" : "semantic_memory",
    };
  }

  return null;
}

// ========= COOLDOWN / HOURLY / BACKOFF =========
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

  if (now - hourWindowStart > 3600000) {
    hourWindowStart = now;
    repliesThisHour = 0;
  }

  if (repliesThisHour >= MAX_REPLIES_PER_HOUR) return true;
  repliesThisHour++;
  return false;
}

let backoffUntil = 0;
function inBackoff() {
  return Date.now() < backoffUntil;
}
function startBackoff() {
  backoffUntil = Date.now() + BACKOFF_MS_ON_429;
}

const busyChats = new Set();

// ========= FOLLOW-UP / DETECTORS =========
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
  const siKeys = ["help", "menu", "cmd", "commands", "use karanne", "kohomada use", "bot use", "guide", "info"];
  const enKeys = ["help", "menu", "commands", "cmd", "how to use", "guide", "info", "about"];
  return siKeys.some((k) => t.includes(k)) || enKeys.some((k) => t.includes(k));
}

function getIdentityReply(lang) {
  return lang === "si" ? IDENTITY_SI : IDENTITY_EN;
}

// ========= PROFILE / STYLE SUMMARY =========
function styleSummary(chatId) {
  const p = getProfile(chatId);
  const s = p.style || {};

  const lengthStyle = s.shortPref >= 0.65 ? "short replies" : s.shortPref >= 0.45 ? "medium replies" : "slightly detailed replies";
  const tone = s.casualRate >= 0.65 ? "casual" : "balanced";
  const emoji = s.emojiRate >= 0.35 ? "light emoji okay" : "minimal emoji";
  const language =
    p.lang === "si"
      ? (s.singlishRate >= 0.45 ? "Sinhala / Singlish mix" : "simple Sinhala")
      : "simple English";

  const examples = (p.examples || []).slice(-3).map((x) => `- ${x}`).join("\n") || "- none";

  return {
    text: `${language}, ${tone}, ${lengthStyle}, ${emoji}`,
    examples,
  };
}

function buildUserProfileSummary(chatId) {
  const p = getProfile(chatId);
  const topics = getTopTopics(chatId, 8);
  const recent = getRecentLogs(chatId, 6)
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");

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
function buildPrompt(userText, lang, chatId) {
  const prof = buildUserProfileSummary(chatId);
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.
ඔබ ගැන කතා කරද්දි "MALIYA-MD" සහ "Malindu Nadith" විතරක් භාවිතා කරන්න.
User ගේ style එකට ගැලපෙන විදිහට natural, friendly Sinhala / Singlish mix reply දෙන්න.
User short අහලා තියෙනවා නම් short reply දෙන්න.
User detail ඉල්ලුවොත් complete reply දෙන්න.
Unnecessary details දෙන්න එපා.
Same phrases නැවත නැවත use කරන්න එපා.
User style mimic කරන්න, හැබැයි over කරන්න එපා.
ඔබ දෙන reply වලට reacts use කරන්න. 

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Recent user style examples:
${prof.examples}

User: ${userText}
`.trim();
  }

  return `
You are "MALIYA-MD" bot.
You are made by Malindu Nadith.
Use only "MALIYA-MD" and "Malindu Nadith" when referring to yourself.
Reply naturally, clearly, and friendly.
If the user asks briefly, keep it short.
If the user asks for details, give a complete answer.
Match the user's style and tone without overdoing it.
Avoid repeating the bot name.
Avoid unnecessary details.
Use reactions to your replies.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Recent user style examples:
${prof.examples}

User: ${userText}
`.trim();
}

function buildPromptWithContext(userText, lang, chatId, contextTurns) {
  const prof = buildUserProfileSummary(chatId);
  const history = (contextTurns || [])
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.
ඔබ ගැන කතා කරද්දි "MALIYA-MD" සහ "Malindu Nadith" විතරක් භාවිතා කරන්න.
User කලින් කතා කරපු context එක බලලා reply කරන්න.
Follow-up එකට context එකට ගැලපෙන natural, clear Sinhala / Singlish reply දෙන්න.
User short අහලා තියෙනවා නම් short reply දෙන්න.
User detail අහලා තියෙනවා නම් complete reply දෙන්න.
User style mimic කරන්න, හැබැයි unnatural වෙන්න එපා.
නිතරම bot name repeat කරන්න එපා.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Recent user style examples:
${prof.examples}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
  }

  return `
You are "MALIYA-MD" bot, made by Malindu Nadith.
Use only "MALIYA-MD" and "Malindu Nadith" when referring to yourself.
Use previous context properly for follow-up messages.
Reply naturally, clearly, and friendly.
If the user asks briefly, keep it short.
If the user asks for details, give a complete answer.
Match the user's style without overdoing it.
Avoid unnecessary details and repeated phrases.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Recent user style examples:
${prof.examples}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
}

// ========= AI CALLS =========
function isRetriableGeminiError(status) {
  return [429, 500, 502, 503, 504].includes(Number(status || 0));
}

function isRetriableDeepSeekError(status) {
  return [402, 429, 500, 502, 503, 504].includes(Number(status || 0));
}

async function generateWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    const err = new Error("Missing GEMINI_API_KEY2");
    err.provider = "gemini";
    throw err;
  }

  let lastErr = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            maxOutputTokens: 900,
          },
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 1) {
        return {
          text: out,
          provider: "gemini",
          model,
        };
      }

      lastErr = new Error(`Empty Gemini response from ${model}`);
    } catch (e) {
      const status = e?.response?.status;
      lastErr = e;

      if (status === 404) continue;

      if (isRetriableGeminiError(status)) {
        e.provider = "gemini";
        throw e;
      }

      e.provider = "gemini";
      throw e;
    }
  }

  if (lastErr) {
    lastErr.provider = "gemini";
    throw lastErr;
  }

  const err = new Error("Gemini failed");
  err.provider = "gemini";
  throw err;
}

async function generateWithDeepSeek(prompt) {
  if (!DEEPSEEK_API_KEY) {
    const err = new Error("Missing DEEPSEEK_API_KEY");
    err.provider = "deepseek";
    throw err;
  }

  let lastErr = null;

  for (const model of DEEPSEEK_MODELS) {
    try {
      const res = await axios.post(
        "https://api.deepseek.com/chat/completions",
        {
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.75,
          top_p: 0.95,
          max_tokens: 900,
          stream: false,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
        }
      );

      const out = res?.data?.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 1) {
        return {
          text: out,
          provider: "deepseek",
          model,
        };
      }

      lastErr = new Error(`Empty DeepSeek response from ${model}`);
    } catch (e) {
      const status = e?.response?.status;
      lastErr = e;

      if (isRetriableDeepSeekError(status)) {
        e.provider = "deepseek";
        throw e;
      }

      e.provider = "deepseek";
      throw e;
    }
  }

  if (lastErr) {
    lastErr.provider = "deepseek";
    throw lastErr;
  }

  const err = new Error("DeepSeek failed");
  err.provider = "deepseek";
  throw err;
}

async function generateText(prompt) {
  let geminiError = null;

  try {
    return await generateWithGemini(prompt);
  } catch (e) {
    geminiError = e;
    console.log("GEMINI FAILED -> switching to DeepSeek:", e?.response?.status || "", e?.message || e);
  }

  try {
    return await generateWithDeepSeek(prompt);
  } catch (deepErr) {
    console.log("DEEPSEEK FAILED:", deepErr?.response?.status || "", deepErr?.message || deepErr);

    const finalErr = new Error("Both Gemini and DeepSeek failed");
    finalErr.geminiError = geminiError;
    finalErr.deepseekError = deepErr;
    throw finalErr;
  }
}

// ========= EXPORT / SUMMARY =========
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
${recent.length
  ? recent.map((x, i) => `${i + 1}. [${x.role}] ${String(x.text).slice(0, 120)}`).join("\n")
  : "No recent messages"}
`;
}

function buildExportText(chatId) {
  const logs = getRecentLogs(chatId, 50);
  if (!logs.length) return "No chat logs found.";

  return logs
    .map((x) => {
      const dt = new Date(x.ts || Date.now()).toISOString();
      return `[${dt}] ${x.role.toUpperCase()}: ${x.text}`;
    })
    .join("\n");
}

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

      if (!arg) {
        return reply("Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export");
      }

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

      if (arg === "profile") {
        if (!from) return reply("Chat not found.");
        return reply(buildProfileText(from));
      }

      if (arg === "clear") {
        if (!from) return reply("Chat not found.");
        clearChatMemory(from);
        return reply("🧹 මේ chat එකේ memory / profile / logs / cache clear කරලා ඉවරයි.");
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

// ========= MAIN HOOK =========
async function onMessage(conn, mek, m, ctx = {}) {
  let lang = "en";
  let from = null;

  try {
    from = mek?.key?.remoteJid;
    if (!from) return;

    if (String(from).endsWith("@g.us")) return;
    if (!isGlobalEnabled()) return;
    if (mek?.key?.fromMe) return;

    const body = String(ctx.body || "").trim();
    if (!body) return;

    if (PREFIXES.some((p) => body.startsWith(p))) return;

    lang = detectLang(body);

    saveTurn(from, "user", body);
    appendChatLog(from, { role: "user", text: body, ts: Date.now() });
    updateProfile(from, "user", body, lang);

    if (isHelpQuestion(body)) {
      const txt = helpText(lang);
      await sendLongMessage(conn, from, txt, mek);

      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      saveQA(from, body, txt);
      saveCache(from, body, txt, lang);
      return;
    }

    if (isIdentityQuestion(body)) {
      const txt = getIdentityReply(lang);
      await sendLongMessage(conn, from, txt, mek);

      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      saveQA(from, body, txt);
      saveCache(from, body, txt, lang);
      return;
    }

    if (inBackoff()) return;
    if (busyChats.has(from)) return;
    if (inCooldown(from)) return;
    if (hitHourlyCap()) return;

    const cacheHit = findCacheAnswer(from, body, lang);
    if (cacheHit?.answer) {
      await sendLongMessage(conn, from, cacheHit.answer, mek);

      saveTurn(from, "bot", cacheHit.answer);
      appendChatLog(from, {
        role: "bot",
        text: cacheHit.answer,
        ts: Date.now(),
        meta: {
          source: cacheHit.source,
          score: Number(cacheHit.score || 0).toFixed(3),
        },
      });
      updateProfile(from, "bot", cacheHit.answer, lang);
      return;
    }

    const mem = findBestMemoryAnswer(from, body);
    if (mem?.answer) {
      const reused = mem.answer;

      await sendLongMessage(conn, from, reused, mek);

      saveTurn(from, "bot", reused);
      appendChatLog(from, {
        role: "bot",
        text: reused,
        ts: Date.now(),
        meta: {
          source: mem.source,
          score: Number(mem.score || 0).toFixed(3),
          matchedQuestion: mem.matchedQuestion || "",
        },
      });
      updateProfile(from, "bot", reused, lang);
      saveCache(from, body, reused, lang);
      return;
    }

    busyChats.add(from);

    const ctxTurns = getContext(from);
    const prompt = isFollowUp(body)
      ? buildPromptWithContext(body, lang, from, ctxTurns)
      : buildPrompt(body, lang, from);

    const result = await generateText(prompt);
    const out = cleanAiText(result?.text || "");

    if (out) {
      await sendLongMessage(conn, from, out, mek);

      saveQA(from, body, out);
      saveCache(from, body, out, lang);

      saveTurn(from, "bot", out);
      appendChatLog(from, {
        role: "bot",
        text: out,
        ts: Date.now(),
        meta: {
          source: "api",
          provider: result.provider || "unknown",
          model: result.model || "unknown",
        },
      });
      updateProfile(from, "bot", out, lang);
    }
  } catch (e) {
    const geminiStatus = e?.geminiError?.response?.status;
    const deepseekStatus = e?.deepseekError?.response?.status;
    const directStatus = e?.response?.status;

    if (directStatus === 429) {
      startBackoff();
      try {
        if (from && !String(from).endsWith("@g.us")) {
          await sendLongMessage(conn, from, rateLimitMsg(lang), mek);
        }
      } catch {}
      console.log("AUTO_MSG: rate limit hit (429) - backoff started");
      return;
    }

    if (geminiStatus || deepseekStatus) {
      console.log(
        "AUTO_MSG FALLBACK ERROR:",
        "gemini =", geminiStatus || "-",
        "deepseek =", deepseekStatus || "-"
      );
    } else {
      console.log("AUTO_MSG ERROR:", directStatus || "", e?.message || e);
    }

    try {
      if (from && !String(from).endsWith("@g.us")) {
        await sendLongMessage(conn, from, serviceUnavailableMsg(lang), mek);
      }
    } catch {}
  } finally {
    if (from) busyChats.delete(from);
  }
}

module.exports = { onMessage };
