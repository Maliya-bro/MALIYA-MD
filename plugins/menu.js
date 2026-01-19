const { cmd, commands } = require("../command");

let cachedMenu = null; // cache

function generateMenu() {
  const categories = {};

  for (let cmdName in commands) {
    const cmdData = commands[cmdName];
    const cat = cmdData.category?.toLowerCase() || "other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({
      pattern: cmdData.pattern,
      desc: cmdData.desc || "No description"
    });
  }

  let menuText = "📜 *Available Commands!:*\n";

  for (const [cat, cmds] of Object.entries(categories)) {
    menuText += `\n⭕ *${cat.toUpperCase()}*\n`;
    cmds.forEach(c => {
      menuText += `- .${c.pattern} : ${c.desc}\n`;
    });
  }

  return menuText.trim();
}

cmd(
  {
    pattern: "menu",
    desc: "Displays all available commands to use MALIYA-MD",
    category: "main",
    filename: __filename,
  },
  async (bot, mek, m, { from, reply }) => {
    try {

      // Generate once only
      if (!cachedMenu) cachedMenu = generateMenu();

      // React
      await bot.sendMessage(from, { react: { text: "📜", key: mek.key } });

      // Image + Cached Menu send
      await bot.sendMessage(
        from,
        {
          image: {
            url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png?raw=true",
          },
          caption: cachedMenu,
        },
        { quoted: mek }
      );

    } catch (err) {
      console.error(err);
      reply("❌ Error generating menu.");
    }
  }
);

