const { cmd } = require("../command");

cmd({
    pattern: "clear",
    react: "🗑️",
    desc: "Clear the entire chat directly.",
    category: "owner",
    filename: __filename
}, async (sock, mek, m, { from, q, reply }) => {
    try {
        if (!q) return reply("කරුණාකර Number එක සහ PIN එක ඇතුලත් කරන්න.\n*උදා: .clear 94702135392 279221*");

        const args = q.split(" ");
        if (args.length < 2) return reply("❌ Number එක සහ PIN එක නිවැරදිව ලබා දෙන්න.");

        const targetNumber = args[0].replace(/[^0-9]/g, "");
        const pin = args[1];

        // PIN එක පරීක්ෂා කිරීම (අනිවාර්යයයි)
        if (pin !== "279221") return reply("❌ PIN එක වැරදියි! ඔබට මෙම Command එක භාවිතා කළ නොහැක.");

        const targetJid = targetNumber + "@s.whatsapp.net";

        await reply(`⏳ *${targetNumber}* හි සම්පූර්ණ Chat එකම Clear කිරීම ආරම්භ කරමින් පවතී...`);

        // Memory Store එකක් නොමැතිව කෙලින්ම සම්පූර්ණ Chat එකම Clear කිරීම
        await sock.chatModify({ clear: 'all' }, targetJid, []);

        await reply(`✅ සාර්ථකව *${targetNumber}* හි සම්පූර්ණ Chat එකම Clear කරන ලදී!`);

    } catch (e) {
        console.error(e);
        reply("❌ දෝෂයක් මතු විය: " + e.message);
    }
});
