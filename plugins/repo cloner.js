const { cmd, commands } = require('../command');

cmd({
    pattern: "gitclone",
    alias: ["gitzip"],
    desc: "Download GitHub repository as a ZIP file.",
    category: "tools",
    react: "📂",
    filename: __filename
},
async (bot, mek, m, { from, q, reply }) => {
    if (!q) return reply("GitHub Link එකක් ලබා දෙන්න.");
    if (!q.includes("github.com")) return reply("වැරදි ලින්ක් එකක්!");

    try {
        let regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
        let [, user, repo] = q.match(regex) || [];
        repo = repo.replace(/.git$/, '');
        let zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

        await bot.sendMessage(from, { document: { url: zipUrl }, fileName: `${repo}.zip`, mimetype: 'application/zip' }, { quoted: mek });
    } catch (e) {
        reply("ZIP එක ලබා ගැනීමට නොහැකි විය.");
    }
});
