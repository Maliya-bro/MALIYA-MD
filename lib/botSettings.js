const fs = require("fs");
const path = require("path");
const config = require("../config");

const DATA_DIR = path.join(__dirname, "../data/settings");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

function defaultSettings() {
  return {
    // Status settings
    auto_status_seen: toBool(config.AUTO_STATUS_SEEN, true),
    auto_status_react: toBool(config.AUTO_STATUS_REACT, true),
    auto_download_status: toBool(config.AUTO_DOWNLOAD_STATUS, false),

    // AI & Message settings
    auto_msg: toBool(config.AUTO_MSG, false),

    // Auto react settings
    auto_react_msg: toBool(config.AUTO_REACT_MSG, false),
    auto_react_mode: String(config.AUTO_REACT_MODE || "all").toLowerCase(),

    // Bot mode (public/private owner-only mode)
    mode: String(config.MODE || "public").toLowerCase() === "private" ? "private" : "public",

    // ✅ NEW: WORK TYPE / WORK SCOPE — where the bot is allowed to work
    // "private" = private chats only (bot ignores groups)
    // "group"   = group chats only (bot ignores private chats)
    // "all"     = both private + group chats
    work_scope: String(config.WORK_SCOPE || "all").toLowerCase(),

    // Security & Utilities
    anti_delete: toBool(config.ANTI_DELETE, true),
    auto_reject_calls: toBool(config.AUTO_REJECT_CALLS, false),
    always_presence: String(config.ALWAYS_PRESENCE || "off").toLowerCase(),
  };
}

// 🔑 KEY FIX: safe PER-SESSION file name (this fixes the shared-settings bug)
function safeSessionFileName(sessionId) {
  const id = String(sessionId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${id}.json`);
}

function ensureStore(sessionId) {
  ensureDir();
  const storePath = safeSessionFileName(sessionId);
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultSettings(), null, 2));
  }
  return storePath;
}

// 🔑 sessionId is now REQUIRED (first arg) everywhere
function readSettings(sessionId) {
  const storePath = ensureStore(sessionId);
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return {
      ...defaultSettings(),
      ...parsed,
    };
  } catch {
    return defaultSettings();
  }
}

function writeSettings(sessionId, data) {
  const storePath = ensureStore(sessionId);
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function setSetting(sessionId, key, value) {
  const db = readSettings(sessionId);

  if (key === "auto_react_mode") {
    const validModes = ["private", "group", "all"];
    if (!validModes.includes(value)) {
      throw new Error(`Invalid auto_react_mode: ${value}. Must be one of: ${validModes.join(", ")}`);
    }
  }

  if (key === "work_scope") {
    const validScopes = ["private", "group", "all"];
    if (!validScopes.includes(value)) {
      throw new Error(`Invalid work_scope: ${value}. Must be one of: ${validScopes.join(", ")}`);
    }
  }

  if (key === "always_presence") {
    const validPresence = ["off", "typing", "recording"];
    if (!validPresence.includes(value)) {
      throw new Error(`Invalid always_presence: ${value}. Must be one of: ${validPresence.join(", ")}`);
    }
  }

  if (key === "mode") {
    const validModes = ["public", "private"];
    if (!validModes.includes(value)) {
      throw new Error(`Invalid mode: ${value}. Must be one of: ${validModes.join(", ")}`);
    }
  }

  db[key] = value;
  writeSettings(sessionId, db);
  return db;
}

function getSetting(sessionId, key) {
  const db = readSettings(sessionId);
  return db[key];
}

function toggleSetting(sessionId, key) {
  const db = readSettings(sessionId);

  const boolSettings = [
    "auto_status_seen",
    "auto_status_react",
    "auto_download_status",
    "auto_msg",
    "auto_react_msg",
    "anti_delete",
    "auto_reject_calls",
  ];

  if (boolSettings.includes(key)) {
    db[key] = !db[key];
    writeSettings(sessionId, db);
    return db;
  }

  throw new Error(`Cannot toggle non-boolean setting: ${key}`);
}

// ✅ NEW: helper — should the bot act in this chat, given work_scope?
// isGroup = true for group chats, false for private chats
function isWorkAllowed(sessionId, isGroup) {
  const db = readSettings(sessionId);
  const scope = db.work_scope || "all";

  if (scope === "private") return !isGroup; // only private chats
  if (scope === "group") return isGroup;    // only group chats
  return true;                              // "all" -> both
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
