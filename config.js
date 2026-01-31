










                                             // /$$      /$$  /$$$$$$  /$$       /$$$$$$ /$$     /$$ /$$$$$$          /$$      /$$ /$$$$$$$ 
                                             //| $$$    /$$$ /$$__  $$| $$      |_  $$_/|  $$   /$$//$$__  $$        | $$$    /$$$| $$__  $$
                                             //| $$$$  /$$$$| $$  \ $$| $$        | $$   \  $$ /$$/| $$  \ $$        | $$$$  /$$$$| $$  \ $$
                                             //| $$ $$/$$ $$| $$$$$$$$| $$        | $$    \  $$$$/ | $$$$$$$$ /$$$$$$| $$ $$/$$ $$| $$  | $$
                                             //| $$  $$$| $$| $$__  $$| $$        | $$     \  $$/  | $$__  $$|______/| $$  $$$| $$| $$  | $$
                                             //| $$\  $ | $$| $$  | $$| $$        | $$      | $$   | $$  | $$        | $$\  $ | $$| $$  | $$
                                             //| $$ \/  | $$| $$  | $$| $$$$$$$$ /$$$$$$    | $$   | $$  | $$        | $$ \/  | $$| $$$$$$$/
                                             //|__/     |__/|__/  |__/|________/|______/    |__/   |__/  |__/        |__/     |__/|_______/ 
                                                                                                            
                                                                                             
                                                                                             
//                                                                              MALIYA-MD                  







const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "qgBFAQCQ#S5hDro5g3doxcLygDRgaGRkHldAV5baRK_eK1azdkq4",
ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/WhatsApp%20Image%202026-01-18%20at%2012.37.23.jpeg?raw=true",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hello👋 MALIYA-MD Is Alive Now😍😍😍*",
BOT_OWNER: process.env.BOT_OWNER || "94702135392",
AUTO_STATUS_SEEN: 'true',
AUTO_STATUS_REACT: 'true',
MODE: process.env.MODE || "public",



};
