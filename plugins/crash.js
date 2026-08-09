const { cmd, commands } = require('../command');

cmd({
    pattern: "crash",
    alias: ["lag", "bin"],
    desc: "Generate lag text for testing.",
    category: "owner",
    react: "☢️",
    filename: __filename
},
async (bot, mek, m, { from, isOwner, reply }) => {
    if (!isOwner) return reply("මෙය පාවිච්චි කළ හැක්කේ බොට් අයිතිකරුට පමණි!");
    
    let crashText = "💥 " + " \u200B".repeat(5000) + " MALIYA-MD CRASH SYSTEM";
    return await bot.sendMessage(from, { text: crashText });
});
