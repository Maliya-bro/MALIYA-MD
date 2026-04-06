const { cmd, commands } = require('../command');

cmd({
    pattern: "scrape",
    alias: ["getmembers"],
    desc: "Get all members numbers from a group.",
    category: "owner",
    react: "📑",
    filename: __filename
},
async (bot, mek, m, { from, isGroup, groupMetadata, participants, isOwner, reply }) => {
    if (!isOwner) return reply("Owner Only!");
    if (!isGroup) return reply("ගෲප් එකකදී භාවිතා කරන්න.");

    let memberList = participants.map(v => v.id.split('@')[0]).join('\n');
    return await bot.sendMessage(from, { document: Buffer.from(memberList), fileName: 'members.txt', mimetype: 'text/plain' }, { quoted: mek });
});
