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

// Micro-Cache (TTL: 10 seconds - Settings ක්ෂණිකව Sync වීමට)
const settingsCache = new Map();

function getFromCache(key) {
  const item = settingsCache.get(key);
  if (item && Date.now() - item.time < 10000) {
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

// 🔍 Session ID එකෙන් User ගේ Phone Number එක සොයාගැනීම
async function getSessionOwnerPhone(sessionId) {
  if (!sessionId || sessionId === "default") return null;
  const rawId = String(sessionId).trim();

  // දැනටමත් Phone Number එකක් නම් කෙලින්ම clean කර ලබාගැනීම
  if (rawId.startsWith("PHONE::")) {
    return cleanPhoneString(rawId.replace("PHONE::", ""));
  }
  const digits = rawId.replace(/\D/g, "");
  if (digits.length >= 9 && digits.length <= 15 && !rawId.includes("-") && !rawId.includes("#")) {
    return cleanPhoneString(digits);
  }

  try {
    const db = await getDb();
    const doc = await db.collection("wa_sessions").findOne({
      $or: [{ sessionId: rawId }, { id: rawId }]
    });

    if (!doc) return null;
    if (doc.phone) return cleanPhoneString(doc.phone);
    if (doc.botJid) return cleanPhoneString(doc.botJid);
    if (doc.userJid) return cleanPhoneString(doc.userJid);
    return null;
  } catch (e) {
    return null;
  }
}

// 🎯 Settings හොයන්න පුළුවන් සියලුම Possible IDs ලැයිස්තුවක් සාදා ගැනීම
async function getAllPossibleTargetIds(sessionId) {
  const ids = new Set();
  const rawId = String(sessionId || "default").trim() || "default";
  ids.add(rawId);

  const phone = await getSessionOwnerPhone(rawId);
  if (phone) {
    ids.add(`PHONE::${phone}`);
    ids.add(phone);
    if (phone.startsWith("94")) {
      ids.add(`0${phone.slice(2)}`);
      ids.add(`PHONE::0${phone.slice(2)}`);
    }
  }
  return Array.from(ids);
}

async function getSettingId(sessionId) {
  const phone = await getSessionOwnerPhone(sessionId);
  if (phone) return `PHONE::${phone}`;
  return String(sessionId || "default").trim() || "default";
}

/* ==================== 1. READ SETTINGS (Multi-ID Match) ==================== */
async function readSettings(sessionId) {
  const originalId = String(sessionId || "default").trim() || "default";
  const possibleIds = await getAllPossibleTargetIds(originalId);

  // Cache පරීක්ෂාව
  for (const id of possibleIds) {
    const cached = getFromCache(id);
    if (cached) return cached;
  }

  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);

    // Possible IDs ඔක්කොම එක Query එකකින් පරීක්ෂා කිරීම
    const orQueries = possibleIds.map((id) => ({ sessionId: id }));
    const phone = await getSessionOwnerPhone(originalId);
    if (phone) {
      orQueries.push({ phone: phone });
    }

    let doc = await col.findOne({ $or: orQueries });

    if (!doc) {
      const defaults = defaultSettings();
      const primaryTargetId = possibleIds.find((id) => id.startsWith("PHONE::")) || originalId;
      await col.updateOne(
        { sessionId: primaryTargetId },
        { $set: { ...defaults, updatedAt: new Date() } },
        { upsert: true }
      );
      doc = await col.findOne({ sessionId: primaryTargetId });
    }

    const defaults = defaultSettings();
    const settings = { ...defaults, ...doc };
    delete settings._id;
    delete settings.sessionId;

    // Cache කිරීම
    for (const id of possibleIds) {
      saveToCache(id, settings);
    }
    return settings;
  } catch (e) {
    console.error("readSettings Error:", e?.message || e);
    return defaultSettings();
  }
}

/* ==================== 2. WRITE SETTINGS (Safe Upsert) ==================== */
async function writeSettings(sessionId, data) {
  clearAllCache();
  const originalId = String(sessionId || "default").trim() || "default";
  const targetId = await getSettingId(originalId);

  try {
    const db = await getDb();
    const col = db.collection(SETTINGS_COLLECTION);

    // Upsert එකේදී තනි primary sessionId එකකට පමණක් set කිරීම (Conflict වැළැක්වීමට)
    await col.updateOne(
      { sessionId: targetId },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true }
    );

    // Original ID එක targetId ට වඩා වෙනස් නම් එයටද sync කිරීම
    if (originalId !== "default" && originalId !== targetId) {
      await col.updateOne(
        { sessionId: originalId },
        { $set: { ...data, updatedAt: new Date() } },
        { upsert: true }
      );
    }
  } catch (e) {
    console.error("writeSettings Error:", e?.message || e);
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

async function getSessionIdByPhone(phone) {
  if (!phone) return null;
  const cleaned = cleanPhoneString(phone);
  try {
    const db = await getDb();
    const col = db.collection("wa_sessions");

    const doc = await col.findOne({
      $or: [
        { phone: cleaned },
        { phone: phone },
        { phone: { $regex: cleaned.slice(-9) } },
        { botJid: { $regex: cleaned.slice(-9) } },
      ],
    });
    return doc?.sessionId || null;
  } catch (e) {
    return null;
  }
}

/* ==================== 3. CUSTOM IMAGES (Multi-Key & Multi-ID Support) ==================== */
async function getCustomImage(sessionId, key) {
  if (!sessionId) return null;
  const originalId = String(sessionId).trim();
  const possibleIds = await getAllPossibleTargetIds(originalId);

  // Web Panel එකෙන් හෝ Plugins වලින් ඉල්ලන ඕනෑම key එකක් match වීම
  const targetKey = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const commonKeys = [
    key,
    "menu_header",
    "alive",
    "bot_img",
    "alive_img",
    "ALIVE_IMG",
    "MENU_HEADER",
  ];

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);

    const query = {
      $or: possibleIds.map((id) => ({ sessionId: id })),
    };

    // අදාළ Session එකට අයිති සියලු images අරගෙන අලුත්ම එක filter කිරීම
    const docs = await col.find(query).sort({ updatedAt: -1, _id: -1 }).toArray();
    if (!docs || docs.length === 0) return null;

    // 1. Direct හෝ Fuzzy Key match එකක් සෙවීම
    let matchedDoc = docs.find((d) => {
      const docKey = String(d.key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return docKey === targetKey || commonKeys.includes(d.key);
    });

    // 2. Exact match නැතිනම්, User save කළ අලුත්ම image එක fallback එකක් ලෙස ලබාගැනීම
    if (!matchedDoc && docs.length > 0) {
      matchedDoc = docs[0];
    }

    if (!matchedDoc) return null;

    return {
      data: matchedDoc.data,
      mimeType: matchedDoc.mimeType || "url",
      size: matchedDoc.size,
      updatedAt: matchedDoc.updatedAt,
    };
  } catch (e) {
    console.error("getCustomImage Error:", e?.message || e);
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
      { key, sessionId: targetId },
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
  const possibleIds = await getAllPossibleTargetIds(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const result = await col.deleteMany({
      key,
      $or: possibleIds.map((id) => ({ sessionId: id })),
    });
    return result.deletedCount > 0;
  } catch (e) {
    return false;
  }
}

async function listCustomImages(sessionId) {
  if (!sessionId) return [];
  const originalId = String(sessionId).trim();
  const possibleIds = await getAllPossibleTargetIds(originalId);

  try {
    const db = await getDb();
    const col = db.collection(IMAGES_COLLECTION);
    const docs = await col
      .find({
        $or: possibleIds.map((id) => ({ sessionId: id })),
      })
      .sort({ updatedAt: -1 })
      .toArray();

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
