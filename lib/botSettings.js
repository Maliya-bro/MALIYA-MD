const fs = require("fs");
const path = require("path");
const config = require("../config");

const DATA_DIR = path.join(__dirname, "../data");
const STORE = path.join(DATA_DIR, "bot_settings.json");

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
    auto_status_seen: toBool(config.AUTO_STATUS_SEEN, true),
    auto_status_react: toBool(config.AUTO_STATUS_REACT, true),
    auto_download_status: toBool(config.AUTO_DOWNLOAD_STATUS, false),
    auto_msg: toBool(config.AUTO_MSG, true),
    mode:
      String(config.MODE || "public").toLowerCase() === "private"
        ? "private"
        : "public",
    anti_delete: toBool(config.ANTI_DELETE, true),
    auto_reject_calls: toBool(config.AUTO_REJECT_CALLS, false),
    always_presence: String(config.ALWAYS_PRESENCE || "off").toLowerCase(),
  };
}

function ensureStore() {
  ensureDir();

  if (!fs.existsSync(STORE)) {
    fs.writeFileSync(STORE, JSON.stringify(defaultSettings(), null, 2));
  }
}

function readSettings() {
  ensureStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE, "utf8"));
    return {
      ...defaultSettings(),
      ...parsed,
    };
  } catch {
    return defaultSettings();
  }
}

function writeSettings(data) {
  ensureStore();
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

function setSetting(key, value) {
  const db = readSettings();
  db[key] = value;
  writeSettings(db);
  return db;
}

function getSetting(key) {
  const db = readSettings();
  return db[key];
}

function toggleSetting(key) {
  const db = readSettings();
  db[key] = !db[key];
  writeSettings(db);
  return db;
}

module.exports = {
  readSettings,
  writeSettings,
  setSetting,
  getSetting,
  toggleSetting,
  defaultSettings,
};
