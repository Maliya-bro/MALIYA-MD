const { cmd } = require('../command');
const config = require('../config');

cmd({
    pattern: "edu",
    alias: ["pp", "pastpaper"],
    react: "📚",
    desc: "Educational Zone | Download term tests and past papers.",
    category: "education",
    filename: __filename
},
async (conn, mek, m, {
    from, reply
}) => {
    try {
        const bannerImg = 'https://github.com/DANUWA-MD/DANUWA-BOT/blob/main/images/educational__zone.png?raw=true';

        const caption = `
╭─────── ⭓ ⭓ ⭓  ─────────╮
│   🎓 𝗘𝗗𝗨𝗖𝗔𝗧𝗜𝗢𝗡𝗔𝗟 𝗭𝗢𝗡𝗘 🎓   │
╰──────────────⟡───────╯
│ 📘 *Term Test Papers (Grades 6–11)*
│    └ Use: *.termtest grade subject*
│    └ Ex: *.termtest grade 10 history*
│──────────────────────⬣
│ 📕 *O/L Past Papers*
│    └ Use: *.ol subject*
│    └ Ex: *.ol maths*
│──────────────────────⬣
│ 📗 *A/L Past Papers*
│    └ Use: *.al physics*
│    └ Short Forms: sft, et, bst
│    └ Ex: *.al bst*
│──────────────────────⬣
│ 📙 *O/L & A/L Model Papers*
│    └ Use: *.model ol/al subject*
│    └ Ex: *.model o/l science*
│──────────────────────⬣
│ 📚 *School Textbooks (Grade 1–13)*
│    └ Use: *.textbook grade*
│    └ Ex: *.textbook 6*
│──────────────────────⬣
│ 🎥 *Subject Video Playlists*
│    └ Use: *.subjectvideos al/ol subject*
│    └ Ex: *.subjectvideos a/l biology*
│──────────────────────⬣
│ 📑 *Syllabus*
│    └ Use: *.syllabus grade*
│    └ Ex: *.syllabus 11*
│──────────────────────⬣
│ 📑 *Teachers' Guides*
│    └ Use: *.tguide grade*
│    └ Ex: *.tguide 11*
│──────────────────────⬣
│ 📰 *Government Gazette Downloads*
│    └ Use: *.gazette*
│    └ Ex: *.gazette*
╰──────────────────────╯
⚙️ Made with ❤️ by
╰🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥`;
        await conn.sendMessage(from, {
            image: { url: bannerImg },
            caption,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: channelJid,
                    newsletterName: channelName,
                    serverMessageId: -1
                }
            }
        }, { quoted: mek });

    } catch (err) {
        console.error(err);
        reply(`❌ Error: ${err.message}`);
    }
});
