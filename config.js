const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "Ggpm1bgI#ia96pY5ZAOp_zWlTr5V4Sd-iLCv2fhyayf9boiXs6cw",
ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_unjbleunjbleunjb.png?raw=true",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hello👋 MALIYA-MD BOT Is Alive Now😍*",
BOT_OWNER: '94771698234',  // Replace with the owner's phone number



};
