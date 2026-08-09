const fs = require("fs");

// ============================================================
// LOAD ENV FILE
// ============================================================

if (fs.existsSync("config.env")) {
  require("dotenv").config({
    path: "./config.env",
  });
}

// ============================================================
// STRING -> BOOLEAN
// ============================================================

function toBool(value, def = true) {
  if (value === undefined) {
    return def;
  }

  return String(value).toLowerCase() === "true";
}

// ============================================================
// CONFIG
// ============================================================

module.exports = {

  // ==========================================================
  // SESSION
  // ==========================================================

  SESSION_ID: process.env.SESSION_ID || "",

  // ==========================================================
  // ALIVE
  // ==========================================================

  ALIVE_IMG:
    process.env.ALIVE_IMG ||
    "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/WhatsApp%20Image%202026-01-18%20at%2012.37.23.jpeg?raw=true",

  ALIVE_MSG:
    process.env.ALIVE_MSG ||
    "*Hello👋 MALIYA-MD Is Alive Now!😍😍😍.*",

  // ==========================================================
  // OWNER
  // ==========================================================

  BOT_OWNER:
    process.env.BOT_OWNER ||
    "94702135392",

  // ==========================================================
  // STATUS SETTINGS
  // ==========================================================

  AUTO_STATUS_SEEN:
    toBool(
      process.env.AUTO_STATUS_SEEN,
      true
    ),

  AUTO_STATUS_REACT:
    toBool(
      process.env.AUTO_STATUS_REACT,
      true
    ),

  AUTO_DOWNLOAD_STATUS:
    toBool(
      process.env.AUTO_DOWNLOAD_STATUS,
      false
    ),

  // ==========================================================
  // BOT MODE
  // ==========================================================

  MODE:
    process.env.MODE ||
    "public",

  // ==========================================================
  // WORK SCOPE
  // ==========================================================
  //
  // DEFAULT:
  // private chats only
  //
  // Possible:
  // private
  // group
  // all
  //
  // ==========================================================

  WORK_SCOPE:
    process.env.WORK_SCOPE ||
    "private",

  // ==========================================================
  // ANTI DELETE
  // ==========================================================

  ANTI_DELETE:
    toBool(
      process.env.ANTI_DELETE,
      true
    ),

  // ==========================================================
  // AUTO MESSAGE
  // ==========================================================

  AUTO_MSG:
    toBool(
      process.env.AUTO_MSG,
      false
    ),

  // ==========================================================
  // AUTO MESSAGE REACT
  // ==========================================================

  AUTO_REACT_MSG:
    toBool(
      process.env.AUTO_REACT_MSG,
      false
    ),

  // ==========================================================
  // AUTO REACT MODE
  // ==========================================================

  AUTO_REACT_MODE:
    process.env.AUTO_REACT_MODE ||
    "all",

  // ==========================================================
  // AUTO REJECT CALLS
  // ==========================================================

  AUTO_REJECT_CALLS:
    toBool(
      process.env.AUTO_REJECT_CALLS,
      false
    ),

  // ==========================================================
  // ALWAYS PRESENCE
  // ==========================================================

  ALWAYS_PRESENCE:
    process.env.ALWAYS_PRESENCE ||
    "off",
};
