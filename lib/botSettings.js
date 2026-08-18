const { MongoClient } = require("mongodb");
const config = require("../config");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";

const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const SETTINGS_COLLECTION = process.env.SETTINGS_COLLECTION || "bot_settings";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  cachedClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  console.log("✅ Settings: Connected to MongoDB");
  return cachedDb;
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    return v.toLowerCase() === "true";
  }
  return fallback;
}

function defaultSettings() {
  return {
    auto_status_seen: toBool(config.AUTO_STATUS_SEEN, true),
    auto_status_react: toBool(config.AUTO_STATUS_REACT, true),
    auto_download_status: toBool(config.AUTO_DOWNLOAD_STATUS, false),
    auto_msg: toBool(config.AUTO_MSG, false),
    seen_all_msg: false,
    auto_react_msg: toBool(config.AUTO_REACT_MSG, false),
    auto_react_mode: String(config.AUTO_REACT_MODE || "all").toLowerCase(),
    mode: String(config.MODE || "public").toLowerCase() === "private" ? "private" : "public",
    work_scope: String(config.WORK_SCOPE || "private").toLowerCase(),
    anti_delete: toBool(config.ANTI_DELETE, true),
    auto_reject_calls: toBool(config.AUTO_REJECT_CALLS, false),
    always_presence: String(config.ALWAYS_PRESENCE || "off").toLowerCase(),
    btns_enabled: false,
  };
}

async function readSettings(sessionId) {
  const id = String(sessionId || "default").trim() || "default";
  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    let doc = await col.findOne({ sessionId: id });
    if (!doc) {
      const defaults = defaultSettings();
      await col.updateOne(
        { sessionId: id },
        { $set: { ...defaults, updatedAt: new Date() } },
        { upsert: true }
      );
      doc = await col.findOne({ sessionId: id });
    }
    const defaults = defaultSettings();
    const settings = { ...defaults, ...doc };
    delete settings._id;
    delete settings.sessionId;
    return settings;
  } catch (e) {
    console.log(`⚠️ Settings read error (${id}):`, e?.message || e);
    return defaultSettings();
  }
}

async function writeSettings(sessionId, data) {
  const id = String(sessionId || "default").trim() || "default";
  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    await col.updateOne(
      { sessionId: id },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.log(`⚠️ Settings write error (${id}):`, e?.message || e);
  }
}

async function setSetting(sessionId, key, value) {
  const id = String(sessionId || "default").trim() || "default";
  const db = await readSettings(id);

  if (key === "auto_react_mode") {
    value = String(value || "").toLowerCase();
    const validModes = ["private", "group", "all"];
    if (!validModes.includes(value)) {
      throw new Error(`Invalid auto_react_mode: ${value}. Must be one of: ${validModes.join(", ")}`);
    }
  }
  if (key === "work_scope") {
    value = String(value || "").toLowerCase();
    const validScopes = ["private", "group", "all"];
    if (!validScopes.includes(value)) {
      throw new Error(`Invalid work_scope: ${value}. Must be one of: ${validScopes.join(", ")}`);
    }
  }
  if (key === "always_presence") {
    value = String(value || "").toLowerCase();
    const validPresence = ["off", "typing", "recording"];
    if (!validPresence.includes(value)) {
      throw new Error(`Invalid always_presence: ${value}. Must be one of: ${validPresence.join(", ")}`);
    }
  }
  if (key === "mode") {
    value = String(value || "").toLowerCase();
    const validModes = ["public", "private"];
    if (!validModes.includes(value)) {
      throw new Error(`Invalid mode: ${value}. Must be one of: ${validModes.join(", ")}`);
    }
  }

  db[key] = value;
  await writeSettings(id, db);
  return db;
}

async function getSetting(sessionId, key) {
  const db = await readSettings(sessionId);
  return db[key];
}

async function toggleSetting(sessionId, key) {
  const id = String(sessionId || "default").trim() || "default";
  const db = await readSettings(id);

  const boolSettings = [
    "auto_status_seen",
    "auto_status_react",
    "auto_download_status",
    "auto_msg",
    "seen_all_msg",
    "auto_react_msg",
    "anti_delete",
    "auto_reject_calls",
    "btns_enabled",
  ];

  if (!boolSettings.includes(key)) {
    throw new Error(`Cannot toggle non-boolean setting: ${key}`);
  }

  db[key] = !db[key];
  await writeSettings(id, db);
  return db;
}

// ✅ FIXED: work scope logic - හරියට වැඩ කරනවා
async function isWorkAllowed(sessionId, isGroup) {
  const db = await readSettings(sessionId);
  const scope = String(db.work_scope || "private").toLowerCase();

  console.log(`🔍 Work scope check: session=${sessionId}, isGroup=${isGroup}, scope=${scope}`);

  if (scope === "private") {
    return !isGroup; // private chats only
  }
  if (scope === "group") {
    return isGroup; // group chats only
  }
  if (scope === "all") {
    return true; // both private and group
  }
  // fallback: private only
  return !isGroup;
}

module.exports = {
  readSettings,
  writeSettings,
  setSetting,
  getSetting,
  toggleSetting,
  defaultSettings,
  isWorkAllowed,
};
