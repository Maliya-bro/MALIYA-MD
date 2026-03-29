










                                             // /$$      /$$  /$$$$$$  /$$       /$$$$$$ /$$     /$$ /$$$$$$          /$$      /$$ /$$$$$$$ 
                                             //| $$$    /$$$ /$$__  $$| $$      |_  $$_/|  $$   /$$//$$__  $$        | $$$    /$$$| $$__  $$
                                             //| $$$$  /$$$$| $$  \ $$| $$        | $$   \  $$ /$$/| $$  \ $$        | $$$$  /$$$$| $$  \ $$
                                             //| $$ $$/$$ $$| $$$$$$$$| $$        | $$    \  $$$$/ | $$$$$$$$ /$$$$$$| $$ $$/$$ $$| $$  | $$
                                             //| $$  $$$| $$| $$__  $$| $$        | $$     \  $$/  | $$__  $$|______/| $$  $$$| $$| $$  | $$
                                             //| $$\  $ | $$| $$  | $$| $$        | $$      | $$   | $$  | $$        | $$\  $ | $$| $$  | $$
                                             //| $$ \/  | $$| $$  | $$| $$$$$$$$ /$$$$$$    | $$   | $$  | $$        | $$ \/  | $$| $$$$$$$/
                                             //|__/     |__/|__/  |__/|________/|______/    |__/   |__/  |__/        |__/     |__/|_______/ 
                                                                                                            
                                                                                             
                                                                                             
// //                                                                             MALIYA-MD                  

const fs = require("fs");

// load env file
if (fs.existsSync("config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

// string -> boolean convert
function toBool(value, def = true) {
  if (value === undefined) return def;
  return String(value).toLowerCase() === "true";
}

module.exports = {
  // 🔐 Session
  SESSION_ID: process.env.SESSION_ID || "",

  // 🖼️ Alive
  ALIVE_IMG:
    process.env.ALIVE_IMG ||
    "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/WhatsApp%20Image%202026-01-18%20at%2012.37.23.jpeg?raw=true",

  ALIVE_MSG:
    process.env.ALIVE_MSG ||
    "*Hello👋 MALIYA-MD Is Alive Now!😍😍😍.*",

  // 👑 Owner
  BOT_OWNER:
    process.env.BOT_OWNER || "94702135392",

  // ⚙️ Settings
  AUTO_STATUS_SEEN: toBool(process.env.AUTO_STATUS_SEEN, true),

  AUTO_STATUS_REACT: toBool(process.env.AUTO_STATUS_REACT, true),

  MODE:
    process.env.MODE || "public",

  ANTI_DELETE: toBool(process.env.ANTI_DELETE, true),

  AUTO_MSG: toBool(process.env.AUTO_MSG, true),

  AUTO_REJECT_CALLS: toBool(process.env.AUTO_REJECT_CALLS, false),

  ALWAYS_PRESENCE:
    process.env.ALWAYS_PRESENCE || "off",
};





