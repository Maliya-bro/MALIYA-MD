const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "scan",
    desc: "Scan website for basic info.",
    category: "tools",
    react: "🛡️",
    filename: __filename
},
async (bot, mek, m, { from, q, reply }) => {
    if (!q) return reply("ලින්ක් එකක් දෙන්න.");
    try {
        let res = await axios.get(`https://api.hackertarget.com/httpheaders/?q=${q}`);
        return reply(`🛡️ *MALIYA-MD VULN SCANNER*\n\n${res.data}`);
    } catch (e) {
        reply("ස්කෑන් කිරීම අසාර්ථකයි.");
    }
});
