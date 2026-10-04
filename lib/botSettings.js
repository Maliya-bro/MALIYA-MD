const { MongoClient } = require("mongodb");
const config = require("../config");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";

const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const SETTINGS_COLLECTION = process.env.SETTINGS_COLLECTION || "bot_settings";
const IMAGES_COLLECTION = process.env.IMAGES_COLLECTION || "bot_images"; // Images collection එකත් මෙතනටම ගත්තා

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
    auto_msg: toBool(config.LOVELY_CHAT, false),
    seen_all_msg: false,
    auto_react_msg: toBool(config.AUTO_REACT_MSG, false),
    auto_react_mode: String(config.AUTO_REACT_MODE || "all").toLowerCase(),
    mode: String(config.MODE || "public").toLowerCase() === "private" ? "private" : "public",
    work_scope: String(config.WORK_SCOPE || "private").toLowerCase(),
    anti_delete: toBool(config.ANTI_DELETE, true),
    auto_reject_calls: toBool(config.AUTO_REJECT_CALLS, false),
    always_presence: String(config.ALWAYS_PRESENCE || "off").toLowerCase(),
    btns_enabled: false,
    anti_spam: false,
    silent_automation: false, // අලුතින් එකතු කරපු Silent Automation එක
  };
}

// ── Get session owner phone ──────────────────────────────────
async function getSessionOwnerPhone(sessionId) {
  if (!sessionId || sessionId === "default") return null;
  try {
    const db = await getDb();
    const col = db.collection("wa_sessions");
    const doc = await col.findOne({ sessionId });
    return doc?.phone || null;
  } catch (e) {
    return null;
  }
}

// 🔥 Get Universal Target ID (Uses Phone Number instead of Session ID)
async function getSettingId(sessionId) {
  const id = String(sessionId || "default").trim() || "default";
  if (id === "default") return id;
  try {
    const phone = await getSessionOwnerPhone(id);
    if (phone) return `PHONE::${phone}`;
  } catch (e) {}
  return id;
}

async function readSettings(sessionId) {
  const originalId = String(sessionId || "default").trim() || "default";
  const targetId = await getSettingId(originalId);
  
  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    
    let doc = await col.findOne({ sessionId: targetId });
    
    // Auto-Migrate Old Session Data to Phone Number format
    if (!doc && targetId !== originalId) {
      doc = await col.findOne({ sessionId: originalId });
      if (doc) {
        await col.updateOne({ sessionId: originalId }, { $set: { sessionId: targetId } });
        doc.sessionId = targetId;
      }
    }

    if (!doc) {
      const defaults = defaultSettings();
      await col.updateOne(
        { sessionId: targetId },
        { $set: { ...defaults, updatedAt: new Date() } },
        { upsert: true }
      );
      doc = await col.findOne({ sessionId: targetId });
    }
    const defaults = defaultSettings();
    const settings = { ...defaults, ...doc };
    delete settings._id;
    delete settings.sessionId;
    return settings;
  } catch (e) {
    console.log(`⚠️ Settings read error (${targetId}):`, e?.message || e);
    return defaultSettings();
  }
}

async function writeSettings(sessionId, data) {
  const targetId = await getSettingId(sessionId);
  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    await col.updateOne(
      { sessionId: targetId },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.log(`⚠️ Settings write error (${targetId}):`, e?.message || e);
  }
}

async function setSetting(sessionId, key, value) {
  const id = String(sessionId || "default").trim() || "default";
  const db = await readSettings(id);

  if (key === "auto_react_mode") {
    value = String(value || "").toLowerCase();
    const validModes = ["private", "group", "all"];
    if (!validModes.includes(value)) throw new Error(`Invalid auto_react_mode`);
  }
  if (key === "work_scope") {
    value = String(value || "").toLowerCase();
    const validScopes = ["private", "group", "all"];
    if (!validScopes.includes(value)) throw new Error(`Invalid work_scope`);
  }
  if (key === "always_presence") {
    value = String(value || "").toLowerCase();
    const validPresence = ["off", "typing", "recording"];
    if (!validPresence.includes(value)) throw new Error(`Invalid always_presence`);
  }
  if (key === "mode") {
    value = String(value || "").toLowerCase();
    const validModes = ["public", "private"];
    if (!validModes.includes(value)) throw new Error(`Invalid mode`);
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
    "auto_status_seen", "auto_status_react", "auto_download_status",
    "lovely_chat", "seen_all_msg", "auto_react_msg", "anti_delete",
    "auto_reject_calls", "btns_enabled", "anti_spam", "silent_automation"
  ];

  if (!boolSettings.includes(key)) {
    throw new Error(`Cannot toggle non-boolean setting: ${key}`);
  }

  db[key] = !db[key];
  await writeSettings(id, db);
  return db;
}

async function isWorkAllowed(sessionId, isGroup) {
  const db = await readSettings(sessionId);
  const scope = String(db.work_scope || "private").toLowerCase();

  if (scope === "private") return !isGroup;
  if (scope === "group") return isGroup;
  if (scope === "all") return true;
  return !isGroup;
}

// ── Get session ID by phone ──────────────────────────────────
async function getSessionIdByPhone(phone) {
  if (!phone) return null;
  try {
    const db = await getDb();
    const col = db.collection("wa_sessions");
    const doc = await col.findOne({ phone: String(phone).replace(/\D/g, "") });
    return doc?.sessionId || null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Image (URL) Management Functions 
// ============================================================================

// ── Get custom image URL for a session ──────────────────────────
async function getCustomImage(sessionId, key) {
  if (!sessionId || !key) return null;
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const doc = await col.findOne({ sessionId, key });
    if (!doc) return null;
    return {
      data: doc.data, // This is now a standard Image URL (e.g., https://...)
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
    };
  } catch (e) {
    console.log(`⚠️ getCustomImage error (${sessionId}, ${key}):`, e?.message || e);
    return null;
  }
}

// ── Set custom image URL for a session ──────────────────────────
async function setCustomImage(sessionId, key, dataUrl) {
  if (!sessionId || !key || !dataUrl) {
    throw new Error("sessionId, key, and dataUrl are required");
  }

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    await col.updateOne(
      { sessionId, key },
      {
        $set: {
          data: dataUrl,
          mimeType: "url", // Updated to reflect it's a URL
          size: dataUrl.length,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    return { ok: true, size: dataUrl.length };
  } catch (e) {
    console.log(`⚠️ setCustomImage error (${sessionId}, ${key}):`, e?.message || e);
    throw e;
  }
}

// ── Delete custom image URL ──────────────────────────────────────
async function deleteCustomImage(sessionId, key) {
  if (!sessionId || !key) return false;
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const result = await col.deleteOne({ sessionId, key });
    return result.deletedCount > 0;
  } catch (e) {
    console.log(`⚠️ deleteCustomImage error (${sessionId}, ${key}):`, e?.message || e);
    return false;
  }
}

// ── List all custom image URLs for a session ────────────────────
async function listCustomImages(sessionId) {
  if (!sessionId) return [];
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const docs = await col.find({ sessionId }).toArray();
    return docs.map((doc) => ({
      key: doc.key,
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
      data: doc.data // Returns the URL to populate the input boxes on the frontend
    }));
  } catch (e) {
    console.log(`⚠️ listCustomImages error (${sessionId}):`, e?.message || e);
    return [];
  }
}

module.exports = {
  readSettings,
  writeSettings,
  setSetting,
  getSetting,
  toggleSetting,
  defaultSettings,
  isWorkAllowed,
  getSessionOwnerPhone,
  getSessionIdByPhone,
  getCustomImage,
  setCustomImage,
  deleteCustomImage,
  listCustomImages,
};
