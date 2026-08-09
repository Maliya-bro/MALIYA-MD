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

  if (typeof v === "string") {
    return v.toLowerCase() === "true";
  }

  return fallback;
}

/*
 * ============================================================
 * DEFAULT SETTINGS
 * ============================================================
 *
 * IMPORTANT:
 * work_scope default = "private"
 *
 * private = private chats only
 * group   = group chats only
 * all     = private + groups
 *
 * Every session gets its own JSON file.
 * ============================================================
 */

function defaultSettings() {
  return {
    // ========================================================
    // STATUS SETTINGS
    // ========================================================

    auto_status_seen: toBool(
      config.AUTO_STATUS_SEEN,
      true
    ),

    auto_status_react: toBool(
      config.AUTO_STATUS_REACT,
      true
    ),

    auto_download_status: toBool(
      config.AUTO_DOWNLOAD_STATUS,
      false
    ),

    // ========================================================
    // AI & MESSAGE SETTINGS
    // ========================================================

    auto_msg: toBool(
      config.AUTO_MSG,
      false
    ),

    // ========================================================
    // AUTO REACT SETTINGS
    // ========================================================

    auto_react_msg: toBool(
      config.AUTO_REACT_MSG,
      false
    ),

    auto_react_mode: String(
      config.AUTO_REACT_MODE || "all"
    ).toLowerCase(),

    // ========================================================
    // BOT MODE
    // ========================================================

    mode:
      String(config.MODE || "public").toLowerCase() === "private"
        ? "private"
        : "public",

    // ========================================================
    // WORK SCOPE
    // ========================================================
    //
    // DEFAULT = PRIVATE
    //
    // private = private chats only
    // group   = groups only
    // all     = both
    //
    // ========================================================

    work_scope: String(
      config.WORK_SCOPE || "private"
    ).toLowerCase(),

    // ========================================================
    // SECURITY & UTILITIES
    // ========================================================

    anti_delete: toBool(
      config.ANTI_DELETE,
      true
    ),

    auto_reject_calls: toBool(
      config.AUTO_REJECT_CALLS,
      false
    ),

    always_presence: String(
      config.ALWAYS_PRESENCE || "off"
    ).toLowerCase(),
  };
}

/*
 * ============================================================
 * SAFE SESSION FILE NAME
 * ============================================================
 */

function safeSessionFileName(sessionId) {
  const id = String(sessionId || "default")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  return path.join(
    DATA_DIR,
    `${id}.json`
  );
}

/*
 * ============================================================
 * ENSURE SESSION STORE
 * ============================================================
 */

function ensureStore(sessionId) {
  ensureDir();

  const storePath = safeSessionFileName(sessionId);

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        defaultSettings(),
        null,
        2
      )
    );
  }

  return storePath;
}

/*
 * ============================================================
 * READ SETTINGS
 * ============================================================
 */

function readSettings(sessionId) {
  const storePath = ensureStore(sessionId);

  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        storePath,
        "utf8"
      )
    );

    return {
      ...defaultSettings(),
      ...parsed,
    };
  } catch (e) {
    console.log(
      `⚠️ Settings read error (${sessionId}):`,
      e?.message || e
    );

    return defaultSettings();
  }
}

/*
 * ============================================================
 * WRITE SETTINGS
 * ============================================================
 */

function writeSettings(sessionId, data) {
  const storePath = ensureStore(sessionId);

  fs.writeFileSync(
    storePath,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

/*
 * ============================================================
 * SET SETTING
 * ============================================================
 */

function setSetting(sessionId, key, value) {
  const db = readSettings(sessionId);

  // ----------------------------------------------------------
  // AUTO REACT MODE
  // ----------------------------------------------------------

  if (key === "auto_react_mode") {
    value = String(value || "").toLowerCase();

    const validModes = [
      "private",
      "group",
      "all",
    ];

    if (!validModes.includes(value)) {
      throw new Error(
        `Invalid auto_react_mode: ${value}. Must be one of: ${validModes.join(", ")}`
      );
    }
  }

  // ----------------------------------------------------------
  // WORK SCOPE
  // ----------------------------------------------------------

  if (key === "work_scope") {
    value = String(value || "").toLowerCase();

    const validScopes = [
      "private",
      "group",
      "all",
    ];

    if (!validScopes.includes(value)) {
      throw new Error(
        `Invalid work_scope: ${value}. Must be one of: ${validScopes.join(", ")}`
      );
    }
  }

  // ----------------------------------------------------------
  // ALWAYS PRESENCE
  // ----------------------------------------------------------

  if (key === "always_presence") {
    value = String(value || "").toLowerCase();

    const validPresence = [
      "off",
      "typing",
      "recording",
    ];

    if (!validPresence.includes(value)) {
      throw new Error(
        `Invalid always_presence: ${value}. Must be one of: ${validPresence.join(", ")}`
      );
    }
  }

  // ----------------------------------------------------------
  // BOT MODE
  // ----------------------------------------------------------

  if (key === "mode") {
    value = String(value || "").toLowerCase();

    const validModes = [
      "public",
      "private",
    ];

    if (!validModes.includes(value)) {
      throw new Error(
        `Invalid mode: ${value}. Must be one of: ${validModes.join(", ")}`
      );
    }
  }

  db[key] = value;

  writeSettings(
    sessionId,
    db
  );

  return db;
}

/*
 * ============================================================
 * GET SETTING
 * ============================================================
 */

function getSetting(sessionId, key) {
  const db = readSettings(sessionId);

  return db[key];
}

/*
 * ============================================================
 * TOGGLE BOOLEAN SETTING
 * ============================================================
 */

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

  if (!boolSettings.includes(key)) {
    throw new Error(
      `Cannot toggle non-boolean setting: ${key}`
    );
  }

  db[key] = !db[key];

  writeSettings(
    sessionId,
    db
  );

  return db;
}

/*
 * ============================================================
 * WORK SCOPE CHECK
 * ============================================================
 *
 * isGroup = true
 *     => WhatsApp group
 *
 * isGroup = false
 *     => private chat
 *
 * ============================================================
 */

function isWorkAllowed(sessionId, isGroup) {
  const db = readSettings(sessionId);

  const scope = String(
    db.work_scope || "private"
  ).toLowerCase();

  // ----------------------------------------------------------
  // PRIVATE ONLY
  // ----------------------------------------------------------

  if (scope === "private") {
    return !isGroup;
  }

  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (scope === "group") {
    return isGroup;
  }

  // ----------------------------------------------------------
  // ALL CHATS
  // ----------------------------------------------------------

  if (scope === "all") {
    return true;
  }

  // ----------------------------------------------------------
  // SAFETY FALLBACK
  // Unknown value => PRIVATE
  // ----------------------------------------------------------

  return !isGroup;
}

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  readSettings,
  writeSettings,
  setSetting,
  getSetting,
  toggleSetting,
  defaultSettings,
  isWorkAllowed,
};
