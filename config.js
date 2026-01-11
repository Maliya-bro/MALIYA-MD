const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "OgJXHZYb#a4r17d9fPuLJueHFnlygpQceKYX_QDldkFFbMf6BPW8",
ALIVE_IMG: process.env.ALIVE_IMG || "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_unjbleunjbleunjb.png",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hello👋 MALIYA-MD BOT Is Alive Now😍*",
BOT_OWNER: '94701369636',  // Replace with the owner's phone number



};
