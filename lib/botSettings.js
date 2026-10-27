const { MongoClient } = require("mongodb");
const config = require("../config");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";

const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const SETTINGS_COLLECTION = process.env.SETTINGS_COLLECTION || "bot_settings";
const IMAGES_COLLECTION = process.env.IMAGES_COLLECTION || "bot_images";

let cachedClient = null;
let cachedDb = null;

// Micro-Cache (TTL: 15 seconds පමණක් තබා Settings ක්ෂණිකව Sync වීමට සැලැස්වීම)
const settingsCache = new Map();

function getFromCache(key) {
  const item = settingsCache.get(key);
  if (item && Date.now() - item.time < 15000) {
    return item.data;
  }
  return null;
}

function saveToCache(key, data) {
  if (settingsCache.size > 200) settingsCache.clear();
  settingsCache.set(key, { data, time: Date.now() });
}

function clearAllCache() {
  settingsCache.clear();
}

async function getDb() {
  if (cachedDb) return cachedDb;
  cachedClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  return cachedDb;
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

function cleanPhoneString(p) {
  let cleaned = String(p || "").replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "94" + cleaned.slice(1);
  return cleaned;
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
    anti_edit: true,
    auto_reject_calls: toBool(config.AUTO_REJECT_CALLS, false),
    always_presence: String(config.ALWAYS_PRESENCE || "off").toLowerCase(),
    bot_name: String(config.BOT_NAME || "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸").trim(),
    btns_enabled: false,
    anti_spam: false,
    silent_automation: false,
    custom_auto_reply: false,
    custom_reply_rules: [],
    group_management: false,
  };
}

async function getSessionOwnerPhone(sessionId) {
  if (!sessionId || sessionId === "default") return null;
  try {
    const db = await getDb();
    const doc = await db.collection("wa_sessions").findOne({ 
      sessionId: String(sessionId).trim() 
    });
    if (!doc) return null;
    if (doc.phone) return cleanPhoneString(doc.phone);
    if (doc.botJid) return cleanPhoneString(doc.botJid);
    return null;
  } catch (e) {
    return null;
  }
}

async function getSettingId(sessionId) {
  const id = String(sessionId || "default").trim() || "default";
  if (id === "default") return id;
  if (id.startsWith("PHONE::")) return id;

  try {
    const phone = await getSessionOwnerPhone(id);
    if (phone) return `PHONE::${phone}`;
  } catch (e) {}

  return id;
}

async function readSettings(sessionId) {
  const originalId = String(sessionId || "default").trim() || "default";
  const targetId = await getSettingId(originalId);

  const cached = getFromCache(targetId) || getFromCache(originalId);
  if (cached) return cached;

  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    
    // TargetId හෝ OriginalId යන දෙකෙන්ම සොයාගැනීම
    let doc = await col.findOne({
      $or: [{ sessionId: targetId }, { sessionId: originalId }]
    });

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

    saveToCache(targetId, settings);
    saveToCache(originalId, settings);
    return settings;
  } catch (e) {
    return defaultSettings();
  }
}

async function writeSettings(sessionId, data) {
  const originalId = String(sessionId || "default").trim() || "default";
  const targetId = await getSettingId(originalId);

  // Settings update වූ සැණින් සියලු cache ඉවත් කිරීම
  clearAllCache();

  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);
    
    // Target සහ Original ID දෙකටම sync වන සේ ලිවීම
    await col.updateOne(
      { $or: [{ sessionId: targetId }, { sessionId: originalId }] },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.log(`⚠️ Settings write error:`, e?.message || e);
  }
}

async function setSetting(sessionId, key, value) {
  const id = String(sessionId || "default").trim() || "default";
  const current = await readSettings(id);
  current[key] = value;
  await writeSettings(id, current);
  return current;
}

async function getSetting(sessionId, key) {
  const db = await readSettings(sessionId);
  return db[key];
}

async function toggleSetting(sessionId, key) {
  const id = String(sessionId || "default").trim() || "default";
  const db = await readSettings(id);
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

// ── Web Panel Login Verification Fix (දුරකථන අංකයෙන් Session සෙවීම) ──
async function getSessionIdByPhone(phone) {
  if (!phone) return null;
  const cleaned = cleanPhoneString(phone);
  try {
    const db = await getDb();
    const col = db.collection("wa_sessions");
    
    // Cleaned phone, regex match, හෝ botJid මඟින් සෙවීම
    const doc = await col.findOne({
      $or: [
        { phone: cleaned },
        { phone: phone },
        { phone: { $regex: cleaned.slice(-9) } },
        { botJid: { $regex: cleaned.slice(-9) } }
      ]
    });
    return doc?.sessionId || null;
  } catch (e) {
    return null;
  }
}

// ── Custom Images (Bot Profile/Alive Images) Fix ──
async function getCustomImage(sessionId, key) {
  if (!sessionId || !key) return null;
  const originalId = String(sessionId).trim();
  const targetId = await getSettingId(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const doc = await col.findOne({
      key,
      $or: [{ sessionId: targetId }, { sessionId: originalId }]
    });
    if (!doc) return null;
    return {
      data: doc.data,
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
    };
  } catch (e) {
    return null;
  }
}

async function setCustomImage(sessionId, key, dataUrl) {
  if (!sessionId || !key || !dataUrl) throw new Error("sessionId, key, and dataUrl are required");
  const originalId = String(sessionId).trim();
  const targetId = await getSettingId(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    await col.updateOne(
      { key, $or: [{ sessionId: targetId }, { sessionId: originalId }] },
      {
        $set: {
          sessionId: targetId,
          key,
          data: dataUrl,
          mimeType: "url",
          size: dataUrl.length,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    return { ok: true, size: dataUrl.length };
  } catch (e) {
    throw e;
  }
}

async function deleteCustomImage(sessionId, key) {
  if (!sessionId || !key) return false;
  const originalId = String(sessionId).trim();
  const targetId = await getSettingId(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const result = await col.deleteOne({
      key,
      $or: [{ sessionId: targetId }, { sessionId: originalId }]
    });
    return result.deletedCount > 0;
  } catch (e) {
    return false;
  }
}

async function listCustomImages(sessionId) {
  if (!sessionId) return [];
  const originalId = String(sessionId).trim();
  const targetId = await getSettingId(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const docs = await col.find({
      $or: [{ sessionId: targetId }, { sessionId: originalId }]
    }).toArray();
    return docs.map((doc) => ({
      key: doc.key,
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
      data: doc.data,
    }));
  } catch (e) {
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
  getDb,
};
