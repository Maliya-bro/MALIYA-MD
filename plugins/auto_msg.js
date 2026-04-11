const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { getCollection } = require("../mongo");

// ======================================================
// ENV
// ======================================================
const DEFAULT_GEMINI_API_KEY =
  process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY || "";

const DEFAULT_DEEPSEEK_API_KEY =
  process.env.DEEPSEEK_API_KEY || "";

const DEFAULT_OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || "";

const OWNER_NUMBERS = String(process.env.BOT_OWNER || "")
  .split(",")
  .map((x) => x.trim().replace(/\D+/g, ""))
  .filter(Boolean);

// ======================================================
// SETTINGS
// ======================================================
const PREFIXES = ["."];
const DATA_DIR = path.join(__dirname, "../data");
const LOGS_DIR = path.join(DATA_DIR, "auto_msg_logs");

const COOLDOWN_MS = 7000;
const BACKOFF_MS_ON_429 = 180000;
const MAX_REPLIES_PER_HOUR = 100;

const MEMORY_MAX_PER_CHAT = 400;
const MEMORY_TTL_DAYS = 120;
const CONTEXT_MAX_TURNS = 14;

const GLOBAL_CACHE_MAX_ITEMS = 2500;
const GLOBAL_CACHE_TTL_DAYS = 45;
const GLOBAL_CACHE_SIM_THRESHOLD = 0.92;

const PER_CHAT_SIM_THRESHOLD = 0.56;
const EXACT_THRESHOLD = 0.975;
const MIN_TOKEN_LEN = 3;

const MAX_ARCHIVE_MSGS_PER_CHAT = 500;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-pro-latest",
];

const DEEPSEEK_MODELS = ["deepseek-chat"];

// ======================================================
// IDENTITY / STYLE
// ======================================================
const IDENTITY_EN = "I am MALIYA-MD, an AI assistant bot.";
const IDENTITY_SI = "මම MALIYA-MD AI assistant bot එකක්.";

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

// ======================================================
// HELPERS
// ======================================================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeJsonWrite(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sanitizeChatId(chatId) {
  return String(chatId || "unknown").replace(/[^\w.-]+/g, "_").slice(0, 150);
}

function extractNumber(jid = "") {
  return String(jid).split("@")[0].replace(/\D+/g, "");
}

function isOwnerJid(jid = "") {
  const num = extractNumber(jid);
  return OWNER_NUMBERS.includes(num);
}

function nowTs() {
  return Date.now();
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

  const parts = [];
  let remaining = clean;

  while (remaining.length > chunkSize) {
    let cut = remaining.lastIndexOf("\n", chunkSize);
    if (cut < 1000) cut = remaining.lastIndexOf(". ", chunkSize);
    if (cut < 1000) cut = remaining.lastIndexOf(" ", chunkSize);
    if (cut < 1000) cut = chunkSize;

    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

async function sendLongMessage(conn, jid, text, quoted) {
  const parts = splitMessage(text, 3500);
  for (const part of parts) {
    await conn.sendMessage(jid, { text: part }, { quoted });
  }
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

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  const t = normalizeText(s);
  return t ? t.split(" ").filter(Boolean) : [];
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

// ======================================================
// LOCAL LOG FILES ONLY
// ======================================================
ensureDir(DATA_DIR);
ensureDir(LOGS_DIR);

function getChatLogFile(chatId) {
  return path.join(LOGS_DIR, `${sanitizeChatId(chatId)}.json`);
}

function appendChatLog(chatId, entry) {
  const file = getChatLogFile(chatId);
  const arr = safeJsonRead(file, []);
  arr.push({ ...entry, ts: entry.ts || nowTs() });

  if (arr.length > 1000) {
    arr.splice(0, arr.length - 1000);
  }

  safeJsonWrite(file, arr);
}

function getRecentLogs(chatId, limit = 20) {
  return safeJsonRead(getChatLogFile(chatId), []).slice(-limit);
}

// ======================================================
// COLLECTION HELPERS
// ======================================================
async function ensureIndexes() {
  try {
    const settings = await getCollection("auto_msg_settings");
    const profiles = await getCollection("auto_msg_profiles");
    const memory = await getCollection("auto_msg_memory");
    const context = await getCollection("auto_msg_context");
    const globalCache = await getCollection("auto_msg_global_cache");
    const archive = await getCollection("auto_msg_messages");
    const userKeys = await getCollection("auto_msg_user_keys");

    await settings.createIndex({ name: 1 }, { unique: true });
    await profiles.createIndex({ chatId: 1 }, { unique: true });
    await userKeys.createIndex({ number: 1 }, { unique: true });

    await memory.createIndex({ chatId: 1, ts: -1 });
    await context.createIndex({ chatId: 1, ts: -1 });
    await globalCache.createIndex({ ts: -1 });
    await archive.createIndex({ chatId: 1, ts: -1 });
  } catch (e) {
    console.log("Index ensure error:", e?.message || e);
  }
}

ensureIndexes().catch(() => {});

// ======================================================
// STORE
// ======================================================
async function readStore() {
  const col = await getCollection("auto_msg_settings");
  let doc = await col.findOne({ name: "global" });

  if (!doc) {
    doc = {
      name: "global",
      global: {
        enabled: false,
        last_sync: 0,
      },
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };

    await col.insertOne(doc);
  }

  if (!doc.global) doc.global = { enabled: false, last_sync: 0 };
  if (typeof doc.global.enabled !== "boolean") doc.global.enabled = false;
  if (typeof doc.global.last_sync !== "number") doc.global.last_sync = 0;

  return doc;
}

async function writeStore(doc) {
  const col = await getCollection("auto_msg_settings");
  doc.updatedAt = nowTs();

  await col.updateOne(
    { name: "global" },
    { $set: doc },
    { upsert: true }
  );
}

async function isGlobalEnabled() {
  return !!(await readStore()).global.enabled;
}

async function setGlobalEnabled(val) {
  const doc = await readStore();
  doc.global.enabled = !!val;
  await writeStore(doc);
}

// ======================================================
// PROFILES
// ======================================================
function newEmptyProfile() {
  return {
    chatId: "",
    lang: "en",
    userMessageCount: 0,
    botMessageCount: 0,
    avgUserMsgLen: 0,
    avgBotMsgLen: 0,
    topics: {},
    lastSeen: 0,
    createdAt: nowTs(),
    updatedAt: nowTs(),
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

async function getProfile(chatId) {
  const col = await getCollection("auto_msg_profiles");
  let doc = await col.findOne({ chatId });

  if (!doc) {
    doc = newEmptyProfile();
    doc.chatId = chatId;
    await col.insertOne(doc);
  }

  return doc;
}

async function writeProfile(doc) {
  const col = await getCollection("auto_msg_profiles");
  doc.updatedAt = nowTs();

  await col.updateOne(
    { chatId: doc.chatId },
    { $set: doc },
    { upsert: true }
  );
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

async function updateProfile(chatId, role, text, lang) {
  const p = await getProfile(chatId);
  const clean = String(text || "").trim();

  p.lang = lang || p.lang || "en";
  p.lastSeen = nowTs();

  if (role === "user") {
    p.userMessageCount += 1;
    p.avgUserMsgLen = rollingAvg(p.avgUserMsgLen, p.userMessageCount, clean.length);

    const toks = extractTopicTokens(clean, p.lang);
    for (const tk of toks) {
      p.topics[tk] = (p.topics[tk] || 0) + 1;
    }

    p.topics = trimTopTopics(p.topics, 30);

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

  await writeProfile(p);
}

async function getTopTopics(chatId, limit = 8) {
  const p = await getProfile(chatId);
  return Object.entries(p.topics || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

async function styleSummary(chatId) {
  const p = await getProfile(chatId);
  const s = p.style || {};

  const lengthStyle =
    s.shortPref >= 0.65 ? "short replies" :
    s.shortPref >= 0.45 ? "medium replies" :
    "slightly detailed replies";

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

// ======================================================
// MEMORY / CONTEXT
// ======================================================
async function pruneMemory(chatId) {
  const col = await getCollection("auto_msg_memory");
  const ttlMs = MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = nowTs() - ttlMs;

  await col.deleteMany({
    chatId,
    ts: { $lt: cutoff },
  });

  const count = await col.countDocuments({ chatId });
  if (count > MEMORY_MAX_PER_CHAT) {
    const overflow = count - MEMORY_MAX_PER_CHAT;
    const oldDocs = await col
      .find({ chatId })
      .sort({ ts: 1 })
      .limit(overflow)
      .toArray();

    if (oldDocs.length) {
      await col.deleteMany({
        _id: { $in: oldDocs.map((x) => x._id) },
      });
    }
  }
}

async function saveQA(chatId, q, a) {
  if (!q || !a) return;

  const col = await getCollection("auto_msg_memory");
  const qRaw = String(q).trim();
  const qNorm = normalizeText(qRaw);
  const qVec = buildSemanticVector(qRaw, detectLang(qRaw));

  await col.insertOne({
    chatId,
    qRaw,
    qNorm,
    qVec,
    a: String(a),
    ts: nowTs(),
  });

  await pruneMemory(chatId);
}

async function getChatMemory(chatId) {
  await pruneMemory(chatId);

  const col = await getCollection("auto_msg_memory");
  return await col.find({ chatId }).sort({ ts: 1 }).toArray();
}

async function saveTurn(chatId, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const col = await getCollection("auto_msg_context");

  await col.insertOne({
    chatId,
    role,
    text: clean,
    ts: nowTs(),
  });

  const count = await col.countDocuments({ chatId });
  if (count > CONTEXT_MAX_TURNS) {
    const overflow = count - CONTEXT_MAX_TURNS;
    const oldDocs = await col
      .find({ chatId })
      .sort({ ts: 1 })
      .limit(overflow)
      .toArray();

    if (oldDocs.length) {
      await col.deleteMany({
        _id: { $in: oldDocs.map((x) => x._id) },
      });
    }
  }
}

async function getContext(chatId) {
  const col = await getCollection("auto_msg_context");
  return await col.find({ chatId }).sort({ ts: 1 }).toArray();
}

async function clearChatMemory(chatId) {
  const memory = await getCollection("auto_msg_memory");
  const context = await getCollection("auto_msg_context");
  const profiles = await getCollection("auto_msg_profiles");
  const globalCache = await getCollection("auto_msg_global_cache");
  const archive = await getCollection("auto_msg_messages");

  await memory.deleteMany({ chatId });
  await context.deleteMany({ chatId });
  await globalCache.deleteMany({ chatId });
  await archive.deleteMany({ chatId });
  await profiles.deleteOne({ chatId });

  safeJsonWrite(getChatLogFile(chatId), []);
}

async function findBestMemoryAnswer(chatId, userText) {
  const qn = normalizeText(userText);
  if (!qn || qn.length < 3) return null;

  const lang = detectLang(userText);
  const qVec = buildSemanticVector(userText, lang);
  const items = await getChatMemory(chatId);
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

  if (best && bestScore >= PER_CHAT_SIM_THRESHOLD) {
    return {
      answer: best.a,
      score: bestScore,
      matchedQuestion: best.qRaw || best.qNorm,
      source: bestScore >= EXACT_THRESHOLD ? "exact_memory" : "semantic_memory",
    };
  }

  return null;
}

// ======================================================
// GLOBAL CACHE
// ======================================================
async function pruneGlobalCache() {
  const col = await getCollection("auto_msg_global_cache");
  const ttlMs = GLOBAL_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = nowTs() - ttlMs;

  await col.deleteMany({ ts: { $lt: cutoff } });

  const count = await col.countDocuments({});
  if (count > GLOBAL_CACHE_MAX_ITEMS) {
    const overflow = count - GLOBAL_CACHE_MAX_ITEMS;
    const oldDocs = await col.find({}).sort({ ts: 1 }).limit(overflow).toArray();

    if (oldDocs.length) {
      await col.deleteMany({
        _id: { $in: oldDocs.map((x) => x._id) },
      });
    }
  }
}

async function saveGlobalCache(chatId, q, a, lang) {
  if (!q || !a) return;

  const col = await getCollection("auto_msg_global_cache");

  await col.insertOne({
    chatId,
    qRaw: String(q),
    qNorm: normalizeText(q),
    qVec: buildSemanticVector(q, lang),
    a: String(a),
    lang,
    ts: nowTs(),
  });

  await pruneGlobalCache();
}

async function findGlobalCacheAnswer(userText, lang) {
  await pruneGlobalCache();

  const col = await getCollection("auto_msg_global_cache");
  const items = await col.find({}).sort({ ts: -1 }).limit(1200).toArray();

  const qNorm = normalizeText(userText);
  const qVec = buildSemanticVector(userText, lang);

  let best = null;
  let bestScore = 0;

  for (const it of items) {
    const sc = semanticSimilarityFromStored(qNorm, qVec, it.qNorm, it.qVec);
    if (sc > bestScore) {
      bestScore = sc;
      best = it;
      if (sc >= 0.99) break;
    }
  }

  if (best && bestScore >= GLOBAL_CACHE_SIM_THRESHOLD) {
    return {
      answer: best.a,
      score: bestScore,
      source: "global_cache",
    };
  }

  return null;
}

// ======================================================
// ALL MESSAGE ARCHIVE
// ======================================================
async function appendArchivedMessage(chatId, entry) {
  const col = await getCollection("auto_msg_messages");

  await col.insertOne({
    chatId,
    ...entry,
    ts: entry.ts || nowTs(),
  });

  const count = await col.countDocuments({ chatId });
  if (count > MAX_ARCHIVE_MSGS_PER_CHAT) {
    const overflow = count - MAX_ARCHIVE_MSGS_PER_CHAT;
    const oldDocs = await col
      .find({ chatId })
      .sort({ ts: 1 })
      .limit(overflow)
      .toArray();

    if (oldDocs.length) {
      await col.deleteMany({
        _id: { $in: oldDocs.map((x) => x._id) },
      });
    }
  }
}

// ======================================================
// PER USER API KEYS
// ======================================================
async function getUserKeys(number) {
  const col = await getCollection("auto_msg_user_keys");
  const doc = await col.findOne({ number });
  return doc?.keys || {};
}

async function setUserApiKey(number, provider, key) {
  const col = await getCollection("auto_msg_user_keys");

  await col.updateOne(
    { number },
    {
      $set: {
        [`keys.${provider}`]: String(key || "").trim(),
        updatedAt: nowTs(),
      },
      $setOnInsert: {
        number,
        createdAt: nowTs(),
      },
    },
    { upsert: true }
  );
}

async function clearUserApiKey(number, provider) {
  const col = await getCollection("auto_msg_user_keys");
  const doc = await col.findOne({ number });
  if (!doc) return false;

  await col.updateOne(
    { number },
    {
      $unset: {
        [`keys.${provider}`]: "",
      },
      $set: {
        updatedAt: nowTs(),
      },
    }
  );

  return true;
}

function maskKey(k = "") {
  if (!k) return "not set";
  if (k.length <= 10) return `${k.slice(0, 3)}***`;
  return `${k.slice(0, 5)}...${k.slice(-4)}`;
}

async function getResolvedApiKeys(jid) {
  const number = extractNumber(jid);
  const userKeys = await getUserKeys(number);

  return {
    gemini: userKeys.gemini || DEFAULT_GEMINI_API_KEY || "",
    deepseek: userKeys.deepseek || DEFAULT_DEEPSEEK_API_KEY || "",
    openai: userKeys.openai || DEFAULT_OPENAI_API_KEY || "",
    source: {
      gemini: userKeys.gemini ? "user" : "default",
      deepseek: userKeys.deepseek ? "user" : "default",
      openai: userKeys.openai ? "user" : "default",
    },
  };
}

// ======================================================
// HELP / PROMPTS
// ======================================================
function helpText(lang) {
  if (lang === "si") {
    return `🤖 *MALIYA-MD AI Help*

.msg on
.msg off
.msg status
.msg profile
.msg clear
.msg export

.setapi gemini YOUR_KEY
.setapi deepseek YOUR_KEY
.setapi openai YOUR_KEY

.myapi
.delapi gemini
.delapi deepseek
.delapi openai

> Private chats only for auto AI replies`;
  }

  return `🤖 *MALIYA-MD AI Help*

.msg on
.msg off
.msg status
.msg profile
.msg clear
.msg export

.setapi gemini YOUR_KEY
.setapi deepseek YOUR_KEY
.setapi openai YOUR_KEY

.myapi
.delapi gemini
.delapi deepseek
.delapi openai

> Private chats only for auto AI replies`;
}

function getIdentityReply(lang) {
  return lang === "si" ? IDENTITY_SI : IDENTITY_EN;
}

function isHelpQuestion(text) {
  const t = (text || "").toLowerCase();
  const keys = ["help", "menu", "commands", "cmd", "guide", "info", "use karanne", "kohomada use"];
  return keys.some((k) => t.includes(k));
}

function isIdentityQuestion(text) {
  const t = (text || "").toLowerCase();
  const siKeys = ["oya kawda", "kawda oya", "oyawa haduwe", "haduwe kawda", "me bot eka kawda"];
  const enKeys = ["who are you", "what are you", "who made you", "who created you"];
  return siKeys.some((k) => t.includes(k)) || enKeys.some((k) => t.includes(k));
}

function isFollowUp(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (t.length <= 18) return true;

  const keys = [
    "eka", "ehema", "ehama", "ow", "ai", "meka", "hari", "ok", "okay", "thawa",
    "then", "so", "why", "how", "more", "anith eka", "next", "detail", "explain"
  ];

  return keys.some((k) => t === k || t.includes(k));
}

async function buildUserProfileSummary(chatId) {
  const p = await getProfile(chatId);
  const topics = await getTopTopics(chatId, 8);
  const recent = getRecentLogs(chatId, 6)
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");

  const style = await styleSummary(chatId);

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

async function buildPrompt(userText, lang, chatId, userName) {
  const prof = await buildUserProfileSummary(chatId);
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ AI assistant bot එකක්.
User name: ${userName}

Reply එක natural Sinhala / Singlish mix එකෙන් දෙන්න.
Userට directly address කරන්න, හැබැයි every line එකේ name repeat කරන්න එපා.
"Malindu Nadith" mention කරන්න user creator ගැන අහුවොත් විතරයි.
Short question නම් short reply දෙන්න.
Detail question නම් clear complete reply දෙන්න.
Unnecessary intro / outro දාන්න එපා.

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
You are an AI assistant bot.
User name: ${userName}

Reply naturally and clearly.
Address the user naturally, but do not repeat the name in every line.
Mention "Malindu Nadith" only if the user asks about the creator.
Keep short questions short.
Give complete answers when needed.
Avoid unnecessary intro/outro.

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

async function buildPromptWithContext(userText, lang, chatId, userName, contextTurns) {
  const prof = await buildUserProfileSummary(chatId);
  const history = (contextTurns || [])
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
User name: ${userName}

User කලින් කියපු context බලලා reply කරන්න.
Reply එක natural Sinhala / Singlish mix එකෙන් දෙන්න.
Name occasionally use කරන්න. Overuse කරන්න එපා.
"Malindu Nadith" creator ගැන අහුවොත් විතරක් mention කරන්න.
Unnecessary repeat phrases එපා.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
  }

  return `
You are "MALIYA-MD" bot.
User name: ${userName}

Use previous context properly for follow-up messages.
Reply naturally and clearly.
Use the user's name occasionally, not excessively.
Mention "Malindu Nadith" only if asked about the creator.
Avoid repetitive phrases.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}
- Preferred style: ${prof.styleText}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
}

// ======================================================
// AI CALLS
// ======================================================
function isRetriableGeminiError(status) {
  return [429, 500, 502, 503, 504].includes(Number(status || 0));
}

function isRetriableDeepSeekError(status) {
  return [402, 429, 500, 502, 503, 504].includes(Number(status || 0));
}

async function testGeminiKey(apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const res = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: "Reply with only: OK" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 10 },
    },
    {
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
    }
  );
  return !!res?.data;
}

async function generateWithGemini(prompt, apiKey) {
  if (!apiKey) {
    const err = new Error("Missing Gemini key");
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
            "x-goog-api-key": apiKey,
          },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 1) {
        return { text: out, provider: "gemini", model };
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

async function testDeepSeekKey(apiKey) {
  const res = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Reply with only: OK" }],
      max_tokens: 10,
      temperature: 0,
    },
    {
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    }
  );
  return !!res?.data;
}

async function generateWithDeepSeek(prompt, apiKey) {
  if (!apiKey) {
    const err = new Error("Missing DeepSeek key");
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
          messages: [{ role: "user", content: prompt }],
          temperature: 0.75,
          top_p: 0.95,
          max_tokens: 900,
          stream: false,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
        }
      );

      const out = res?.data?.choices?.[0]?.message?.content?.trim();
      if (out && out.length > 1) {
        return { text: out, provider: "deepseek", model };
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

async function testOpenAIKey(apiKey) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with only: OK" }],
      max_tokens: 10,
      temperature: 0,
    },
    {
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    }
  );
  return !!res?.data;
}

async function generateWithOpenAI(prompt, apiKey) {
  if (!apiKey) {
    const err = new Error("Missing OpenAI key");
    err.provider = "openai";
    throw err;
  }

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      max_tokens: 900,
    },
    {
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    }
  );

  const out = res?.data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("Empty OpenAI response");

  return { text: out, provider: "openai", model: "gpt-4o-mini" };
}

async function generateText(prompt, resolvedKeys) {
  let geminiError = null;
  let deepseekError = null;

  try {
    if (resolvedKeys.gemini) {
      return await generateWithGemini(prompt, resolvedKeys.gemini);
    }
  } catch (e) {
    geminiError = e;
    console.log("GEMINI FAILED:", e?.response?.status || "", e?.message || e);
  }

  try {
    if (resolvedKeys.deepseek) {
      return await generateWithDeepSeek(prompt, resolvedKeys.deepseek);
    }
  } catch (e) {
    deepseekError = e;
    console.log("DEEPSEEK FAILED:", e?.response?.status || "", e?.message || e);
  }

  try {
    if (resolvedKeys.openai) {
      return await generateWithOpenAI(prompt, resolvedKeys.openai);
    }
  } catch (e) {
    console.log("OPENAI FAILED:", e?.response?.status || "", e?.message || e);
    const finalErr = new Error("All AI providers failed");
    finalErr.geminiError = geminiError;
    finalErr.deepseekError = deepseekError;
    finalErr.openaiError = e;
    throw finalErr;
  }

  const finalErr = new Error("No AI key available");
  finalErr.geminiError = geminiError;
  finalErr.deepseekError = deepseekError;
  throw finalErr;
}

// ======================================================
// RATE LIMIT / BACKOFF
// ======================================================
const lastReplyAt = new Map();
let hourWindowStart = nowTs();
let repliesThisHour = 0;
let backoffUntil = 0;
const busyChats = new Set();

function inCooldown(chatId) {
  const now = nowTs();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  lastReplyAt.set(chatId, now);
  return false;
}

function hitHourlyCap() {
  const now = nowTs();

  if (now - hourWindowStart > 3600000) {
    hourWindowStart = now;
    repliesThisHour = 0;
  }

  if (repliesThisHour >= MAX_REPLIES_PER_HOUR) return true;
  repliesThisHour++;
  return false;
}

function inBackoff() {
  return nowTs() < backoffUntil;
}

function startBackoff() {
  backoffUntil = nowTs() + BACKOFF_MS_ON_429;
}

function rateLimitMsg(lang) {
  return lang === "si"
    ? "⏳ දැන් requests ටිකක් වැඩියි. ටිකක් පස්සේ ආයෙ try කරන්න."
    : "⏳ Too many requests right now. Please try again in a moment.";
}

function serviceUnavailableMsg(lang) {
  return lang === "si"
    ? "❌ දැන් AI service unavailable. ටිකක් පස්සේ try කරන්න."
    : "❌ AI service unavailable right now. Please try again later.";
}

// ======================================================
// EXPORT / STATUS
// ======================================================
async function buildProfileText(chatId) {
  const p = await getProfile(chatId);
  const topTopics = await getTopTopics(chatId, 10);
  const recent = getRecentLogs(chatId, 10);
  const style = await styleSummary(chatId);

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
  : "No recent messages"}`;
}

function buildExportText(chatId) {
  const logs = getRecentLogs(chatId, 80);
  if (!logs.length) return "No chat logs found.";

  return logs.map((x) => {
    const dt = new Date(x.ts || nowTs()).toISOString();
    return `[${dt}] ${x.role.toUpperCase()}: ${x.text}`;
  }).join("\n");
}

// ======================================================
// COMMANDS
// ======================================================
cmd(
  {
    pattern: "msg",
    desc: "Auto AI settings",
    category: "AI",
    react: "💬",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      const arg = (q || "").trim().toLowerCase();
      const from = mek?.key?.remoteJid;

      if (!arg) {
        return reply(
          "Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export"
        );
      }

      if (arg === "on") {
        await setGlobalEnabled(true);
        return reply("✅ Auto Reply ON (private chats only)");
      }

      if (arg === "off") {
        await setGlobalEnabled(false);
        return reply("⛔ Auto Reply OFF");
      }

      if (arg === "status") {
        const db = await readStore();
        const syncTime = db.global.last_sync
          ? new Date(db.global.last_sync).toLocaleString()
          : "mongo live";

        return reply(
          `Auto Reply: ${db.global.enabled ? "ON" : "OFF"}\nStorage: MongoDB\nLast Update: ${syncTime}`
        );
      }

      if (arg === "profile") {
        if (!from) return reply("Chat not found.");
        return reply(await buildProfileText(from));
      }

      if (arg === "clear") {
        if (!from) return reply("Chat not found.");
        await clearChatMemory(from);
        return reply("🧹 මේ chat එකේ memory / logs / archive / cache clear කරලා ඉවරයි.");
      }

      if (arg === "export") {
        if (!from) return reply("Chat not found.");
        const txt = buildExportText(from);
        return reply(txt.length > 3900 ? txt.slice(0, 3900) + "\n\n...truncated" : txt);
      }

      return reply(
        "Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export"
      );
    } catch (e) {
      console.log("MSG COMMAND ERROR:", e?.message || e);
      return reply("❌ Command error");
    }
  }
);

cmd(
  {
    pattern: "setapi",
    desc: "Set your personal API key",
    category: "AI",
    react: "🔑",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      const from = mek?.key?.remoteJid;
      const number = extractNumber(from);
      if (!number) return reply("❌ User number not found.");

      const input = String(q || "").trim();
      if (!input) {
        return reply("Use:\n.setapi gemini YOUR_KEY\n.setapi deepseek YOUR_KEY\n.setapi openai YOUR_KEY");
      }

      const firstSpace = input.indexOf(" ");
      if (firstSpace === -1) {
        return reply("❌ Format:\n.setapi gemini YOUR_KEY");
      }

      const provider = input.slice(0, firstSpace).trim().toLowerCase();
      const key = input.slice(firstSpace + 1).trim();

      if (!["gemini", "deepseek", "openai"].includes(provider)) {
        return reply("❌ Provider must be: gemini / deepseek / openai");
      }

      if (!key || key.length < 10) {
        return reply("❌ Invalid key.");
      }

      try {
        if (provider === "gemini") await testGeminiKey(key);
        if (provider === "deepseek") await testDeepSeekKey(key);
        if (provider === "openai") await testOpenAIKey(key);
      } catch (e) {
        return reply(`❌ ${provider} key test failed: ${e?.response?.status || e.message || "invalid key"}`);
      }

      await setUserApiKey(number, provider, key);

      return reply(`✅ ${provider} key saved for your number.\nKey: ${maskKey(key)}`);
    } catch (e) {
      console.log("SETAPI ERROR:", e?.message || e);
      return reply("❌ Failed to save API key.");
    }
  }
);

cmd(
  {
    pattern: "myapi",
    desc: "Show your API key status",
    category: "AI",
    react: "🧾",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const from = mek?.key?.remoteJid;
      const number = extractNumber(from);
      if (!number) return reply("❌ User number not found.");

      const keys = await getUserKeys(number);
      return reply(
        `🔑 Your API key status

Gemini: ${maskKey(keys.gemini || "")}
DeepSeek: ${maskKey(keys.deepseek || "")}
OpenAI: ${maskKey(keys.openai || "")}`
      );
    } catch (e) {
      console.log("MYAPI ERROR:", e?.message || e);
      return reply("❌ Failed to read API keys.");
    }
  }
);

cmd(
  {
    pattern: "delapi",
    desc: "Delete your personal API key",
    category: "AI",
    react: "🗑️",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      const provider = String(q || "").trim().toLowerCase();
      if (!["gemini", "deepseek", "openai"].includes(provider)) {
        return reply("Use:\n.delapi gemini\n.delapi deepseek\n.delapi openai");
      }

      const from = mek?.key?.remoteJid;
      const number = extractNumber(from);
      const ok = await clearUserApiKey(number, provider);

      if (!ok) return reply(`❌ No ${provider} key found for your number.`);
      return reply(`✅ ${provider} key deleted.`);
    } catch (e) {
      console.log("DELAPI ERROR:", e?.message || e);
      return reply("❌ Failed to delete API key.");
    }
  }
);

cmd(
  {
    pattern: "allkeys",
    desc: "Owner only - show saved users",
    category: "OWNER",
    react: "📂",
    filename: __filename,
  },
  async (conn, mek, m, { reply }) => {
    try {
      const from = mek?.key?.remoteJid;
      if (!isOwnerJid(from)) return reply("❌ Owner only.");

      const col = await getCollection("auto_msg_user_keys");
      const docs = await col.find({}).limit(50).toArray();

      if (!docs.length) return reply("No saved user keys.");

      const lines = docs.map((u) => {
        const keys = u.keys || {};
        return `${u.number} | G:${keys.gemini ? "Y" : "N"} D:${keys.deepseek ? "Y" : "N"} O:${keys.openai ? "Y" : "N"}`;
      });

      return reply(lines.join("\n"));
    } catch (e) {
      console.log("ALLKEYS ERROR:", e?.message || e);
      return reply("❌ Failed.");
    }
  }
);

// ======================================================
// MAIN HOOK
// ======================================================
async function onMessage(conn, mek, m, ctx = {}) {
  let lang = "en";
  let from = null;

  try {
    from = mek?.key?.remoteJid;
    if (!from) return;
    if (String(from).endsWith("@g.us")) return;
    if (!(await isGlobalEnabled())) return;
    if (mek?.key?.fromMe) return;

    const body = String(
      ctx.body ||
      mek?.message?.conversation ||
      mek?.message?.extendedTextMessage?.text ||
      mek?.message?.imageMessage?.caption ||
      mek?.message?.videoMessage?.caption ||
      ""
    ).trim();

    if (!body) return;
    if (PREFIXES.some((p) => body.startsWith(p))) return;

    const pushName = mek?.pushName || "User";
    lang = detectLang(body);

    await appendArchivedMessage(from, {
      role: "user",
      senderName: pushName,
      senderNumber: extractNumber(from),
      text: body,
      ts: nowTs(),
    });

    await saveTurn(from, "user", body);
    appendChatLog(from, { role: "user", text: body, ts: nowTs() });
    await updateProfile(from, "user", body, lang);

    if (isHelpQuestion(body)) {
      const txt = helpText(lang);
      await sendLongMessage(conn, from, txt, mek);

      await appendArchivedMessage(from, {
        role: "bot",
        senderName: "MALIYA-MD",
        senderNumber: "bot",
        text: txt,
        ts: nowTs(),
      });

      await saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: nowTs() });
      await updateProfile(from, "bot", txt, lang);
      await saveQA(from, body, txt);
      await saveGlobalCache(from, body, txt, lang);
      return;
    }

    if (isIdentityQuestion(body)) {
      const txt = getIdentityReply(lang);
      await sendLongMessage(conn, from, txt, mek);

      await appendArchivedMessage(from, {
        role: "bot",
        senderName: "MALIYA-MD",
        senderNumber: "bot",
        text: txt,
        ts: nowTs(),
      });

      await saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: nowTs() });
      await updateProfile(from, "bot", txt, lang);
      await saveQA(from, body, txt);
      await saveGlobalCache(from, body, txt, lang);
      return;
    }

    if (inBackoff()) return;
    if (busyChats.has(from)) return;
    if (inCooldown(from)) return;
    if (hitHourlyCap()) return;

    const mem = await findBestMemoryAnswer(from, body);
    if (mem?.answer) {
      const reused = mem.answer;

      await sendLongMessage(conn, from, reused, mek);

      await appendArchivedMessage(from, {
        role: "bot",
        senderName: "MALIYA-MD",
        senderNumber: "bot",
        text: reused,
        ts: nowTs(),
      });

      await saveTurn(from, "bot", reused);
      appendChatLog(from, {
        role: "bot",
        text: reused,
        ts: nowTs(),
        meta: {
          source: mem.source,
          score: Number(mem.score || 0).toFixed(3),
          matchedQuestion: mem.matchedQuestion || "",
        },
      });

      await updateProfile(from, "bot", reused, lang);
      await saveGlobalCache(from, body, reused, lang);
      return;
    }

    const globalHit = await findGlobalCacheAnswer(body, lang);
    if (globalHit?.answer) {
      await sendLongMessage(conn, from, globalHit.answer, mek);

      await appendArchivedMessage(from, {
        role: "bot",
        senderName: "MALIYA-MD",
        senderNumber: "bot",
        text: globalHit.answer,
        ts: nowTs(),
      });

      await saveTurn(from, "bot", globalHit.answer);
      appendChatLog(from, {
        role: "bot",
        text: globalHit.answer,
        ts: nowTs(),
        meta: {
          source: globalHit.source,
          score: Number(globalHit.score || 0).toFixed(3),
        },
      });

      await updateProfile(from, "bot", globalHit.answer, lang);
      await saveQA(from, body, globalHit.answer);
      return;
    }

    busyChats.add(from);

    const resolvedKeys = await getResolvedApiKeys(from);
    const ctxTurns = await getContext(from);

    const prompt = isFollowUp(body)
      ? await buildPromptWithContext(body, lang, from, pushName, ctxTurns)
      : await buildPrompt(body, lang, from, pushName);

    const result = await generateText(prompt, resolvedKeys);
    const out = cleanAiText(result?.text || "");

    if (out) {
      await sendLongMessage(conn, from, out, mek);

      await appendArchivedMessage(from, {
        role: "bot",
        senderName: "MALIYA-MD",
        senderNumber: "bot",
        text: out,
        ts: nowTs(),
      });

      await saveQA(from, body, out);
      await saveGlobalCache(from, body, out, lang);

      await saveTurn(from, "bot", out);
      appendChatLog(from, {
        role: "bot",
        text: out,
        ts: nowTs(),
        meta: {
          source: "api",
          provider: result.provider || "unknown",
          model: result.model || "unknown",
          keySource: resolvedKeys.source[result.provider] || "unknown",
        },
      });

      await updateProfile(from, "bot", out, lang);

      const store = await readStore();
      store.global.last_sync = nowTs();
      await writeStore(store);
    }
  } catch (e) {
    const directStatus = e?.response?.status;

    if (directStatus === 429) {
      startBackoff();

      try {
        if (from && !String(from).endsWith("@g.us")) {
          const msg = rateLimitMsg(lang);
          await sendLongMessage(conn, from, msg, mek);

          await appendArchivedMessage(from, {
            role: "bot",
            senderName: "MALIYA-MD",
            senderNumber: "bot",
            text: msg,
            ts: nowTs(),
          });
        }
      } catch {}

      console.log("AUTO_MSG: rate limit hit (429) - backoff started");
      return;
    }

    console.log("AUTO_MSG ERROR:", directStatus || "", e?.message || e);

    try {
      if (from && !String(from).endsWith("@g.us")) {
        const msg = serviceUnavailableMsg(lang);
        await sendLongMessage(conn, from, msg, mek);

        await appendArchivedMessage(from, {
          role: "bot",
          senderName: "MALIYA-MD",
          senderNumber: "bot",
          text: msg,
          ts: nowTs(),
        });
      }
    } catch {}
  } finally {
    if (from) busyChats.delete(from);
  }
}

module.exports = { onMessage };
