










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
if (fs.existsSync("config.env")) require("dotenv").config({ path: "./config.env" });

function convertToBool(text, fault = "true") {
  return text === fault;
}

module.exports = {
  SESSION_ID:
    process.env.SESSION_ID || "3kZwDSiR#3bt8bSLZpPN_jfOkKacY9zqiAUsIFkfN7qnP4c3btaw", // replace with your session ID
  ALIVE_IMG:
    process.env.ALIVE_IMG || "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/WhatsApp%20Image%202026-01-18%20at%2012.37.23.jpeg?raw=true",
 ALIVE_MSG:
    process.env.ALIVE_MSG || "*Hello👋 MALIYA-MD Is Alive Now!😍😍😍.*",

  BOT_OWNER: process.env.BOT_OWNER || "94702135392", // Replace with your whtasapp number

  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN || "true",

  AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || "true",

  MODE: process.env.MODE || "public",

  ANTI_DELETE: process.env.ANTI_DELETE || "true",

  AUTO_MSG: process.env.AUTO_MSG || "true",

  AUTO_REJECT_CALLS: process.env.AUTO_REJECT_CALLS || "false",

  ALWAYS_PRESENCE: process.env.ALWAYS_PRESENCE || "off",


};








