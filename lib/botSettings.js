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
    bot_name: String(config.BOT_NAME || "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸").trim(),
    btns_enabled: false,
    anti_spam: false,
    silent_automation: false,
    custom_auto_reply: false,     // 🔥 අලුත්: Custom Auto Reply On/Off
    custom_reply_rules: []        // 🔥 අලුත්: Rules සේව් වෙන Array එක
  };
}

// 🔥 ROOT CAUSE FIXED: QR/Bot Pair වලදී phone එක null වුණත් botJid එකෙන් Number එක ගන්නවා
async function getSessionOwnerPhone(sessionId) {
  if (!sessionId || sessionId === "default") return null;
  try {
    const db = await getDb();
    const doc = await db.collection("wa_sessions").findOne({ sessionId });
    if (!doc) return null;
    
    // 1. Site Pair Code වලින් ලොග් වුණානම් (phone field එක තියෙනවා)
    if (doc.phone) {
        return String(doc.phone).replace(/\D/g, "");
    }
    // 2. QR හරි Bot Pair වලින් ලොග් වුණානම් (botJid එකෙන් ගන්නවා)
    if (doc.botJid) {
        return String(doc.botJid).split(":")[0].split("@")[0].replace(/\D/g, "");
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

async function getSettingId(sessionId) {
  const id = String(sessionId || "default").trim() || "default";
  if (id === "default") return id;
  if (id.startsWith("PHONE::")) return id; // Web එකෙන් එන කෙලින්ම Phone Number එකක් නම්

  // wa_sessions එකෙන් හරියටම Phone Number එක හොයාගන්නවා
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

    // Web එකයි Bot එකයි Sync වෙන්න පරණ Session ID වලින් තිබුණු ඒවත් Migrate කරනවා
    if (!doc && targetId !== originalId) {
      doc = await col.findOne({ sessionId: originalId });
      if (doc) {
        await col.updateOne({ sessionId: originalId }, { $set: { sessionId: targetId } });
        doc.sessionId = targetId;
        console.log(`✅ Migrated old settings from ${originalId} to ${targetId}`);
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
  if (key === "bot_name") {
    value = String(value || "").trim().slice(0, 40) || "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
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
    "auto_reject_calls", "btns_enabled", "anti_spam", "silent_automation", "custom_auto_reply"
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
// Custom Image URLs Logic 
// ============================================================================

async function getCustomImage(sessionId, key) {
  if (!sessionId || !key) return null;
  const targetId = await getSettingId(sessionId);
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const doc = await col.findOne({ sessionId: targetId, key });
    if (!doc) return null;
    return {
      data: doc.data,
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
    };
  } catch (e) {
    console.log(`⚠️ getCustomImage error (${targetId}, ${key}):`, e?.message || e);
    return null;
  }
}

async function setCustomImage(sessionId, key, dataUrl) {
  if (!sessionId || !key || !dataUrl) throw new Error("sessionId, key, and dataUrl are required");
  const targetId = await getSettingId(sessionId);
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    await col.updateOne(
      { sessionId: targetId, key },
      {
        $set: {
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
    console.log(`⚠️ setCustomImage error (${targetId}, ${key}):`, e?.message || e);
    throw e;
  }
}

async function deleteCustomImage(sessionId, key) {
  if (!sessionId || !key) return false;
  const targetId = await getSettingId(sessionId);
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const result = await col.deleteOne({ sessionId: targetId, key });
    return result.deletedCount > 0;
  } catch (e) {
    console.log(`⚠️ deleteCustomImage error (${targetId}, ${key}):`, e?.message || e);
    return false;
  }
}

async function listCustomImages(sessionId) {
  if (!sessionId) return [];
  const targetId = await getSettingId(sessionId);
  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const docs = await col.find({ sessionId: targetId }).toArray();
    return docs.map((doc) => ({
      key: doc.key,
      mimeType: doc.mimeType,
      size: doc.size,
      updatedAt: doc.updatedAt,
      data: doc.data
    }));
  } catch (e) {
    console.log(`⚠️ listCustomImages error (${targetId}):`, e?.message || e);
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
