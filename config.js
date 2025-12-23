const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "r84WxYYT#wgMBXoDmCpQK35Bdu2rZRZfXE7rEhp7Qc8D-1A6bmAQ",
ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/nadithmalindu-source/Malindu-AI-BOT/blob/main/image/Gemini_Generated_Image_unjbleunjbleunjb.png?raw=true",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hello👋 MALIYA-MD BOT Is Alive Now😍*",
BOT_OWNER: '94701369636',  // Replace with the owner's phone number



};
