const { cmd, commands } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = {};
const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const PREFIX = ".";
const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

function cleanKey(jid) {
  return String(jid || "").split("@")[0].split(":")[0];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((c) => {
    const i = normal.indexOf(c);
    return i !== -1 ? small[i] : c;
  }).join("");
}

function getCategoryEmoji(cat) {
  const c = String(cat || "").toUpperCase();
  if (c.includes("DOWNLOAD")) return "📥";
  if (c.includes("AI")) return "🤖";
  if (c.includes("ANIME")) return "🍥";
  if (c.includes("ADMIN")) return "🛡️";
  if (c.includes("GROUP")) return "👥";
  if (c.includes("OWNER")) return "👑";
  if (c.includes("TOOLS")) return "🛠️";
  if (c.includes("FUN")) return "🎉";
  if (c.includes("GAME")) return "🎮";
  if (c.includes("SEARCH")) return "🔎";
  if (c.includes("NEWS")) return "📰";
  if (c.includes("MEDIA")) return "🎬";
  if (c.includes("CONFIG")) return "🛠️";
  if (c.includes("MAIN")) return "📜";
  if (c.includes("EDUCATION")) return "📚";
  if (c.includes("MOVIE")) return "🎬";
  if (c.includes("STICKER")) return "🖼️";
  if (c.includes("UTILITY")) return "🧰";
  return "✨";
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data)).resize(800, 800, { fit: "contain", background: { r: 18, g: 18, b: 24, alpha: 1 } }).jpeg({ quality: 80 }).toBuffer();
  } catch (e) {
    return url;
  }
}

/* ================= 1. .menu COMMAND ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help"],
    react: "📜",
    desc: "Main menu",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const commandMap = {};
      for (const command of commands) {
        if (command.dontAddCommandList) continue;
        const category = (command.category || "MISC").toUpperCase();
        if (!commandMap[category]) commandMap[category] = [];
        commandMap[category].push(command);
      }
      const categories = Object.keys(commandMap).sort();
      if (!categories.length) return reply("❌ Commands හමු නොවීය!");

      let botDisplayName = DEFAULT_BOT_NAME;
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        if (settings && typeof settings.btns_enabled !== "undefined") btnsOn = Boolean(settings.btns_enabled);
      } catch (e) {}

      let headerImg = DEFAULT_HEADER_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom && custom.data) headerImg = custom.data;
        } catch (e) {}
      }

      let menuText = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n`;
      menuText += `✨ 👋 *ʜɪ, ${toSmallCaps(pushname || "User")}!*\n\n`;
      menuText += `╔═════. .★.══════════╗\n🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n╚══════════. .★.═════╝\n\n`;

      categories.forEach((cat, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        menuText += `*[ ${numStr} ]* ➔ ${getCategoryEmoji(cat)} *${toSmallCaps(cat)}* _(${commandMap[cat].length})_\n`;
      });
      menuText += `\n⊱━━━━━━━━━━━━━━━⊰\n> 💬 *කැමති Category එකේ අංකය Reply කරන්න...*`;

      // 🔘 BUTTONS SETUP
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const listRows = categories.map((cat, i) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${commandMap[cat].length} commands available`,
            id: `.menu_pick ${i + 1}`, // Button එකෙන් command එකක් විදිහට යැවීම
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuText)
            .setFooter(`© 2026 ${BRAND_BASE}`)
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: "menu_list_main",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Select Category ↯",
                sections: [{ title: "Command Categories", rows: listRows }],
              }),
            },
          });

          btn.addButton("📊 Ping", ".ping");
          await btn.send(from, { quoted: mek });
        } catch (err) {
          await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
        }
      } else {
        await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
      }

      // Memory Store: LID, sender, from යන සියල්ලෙන්ම Save කර තැබීම
      const stateData = {
        step: "category",
        commandMap,
        categories,
        botDisplayName,
        sessionId,
        userName: pushname || "User",
      };

      pendingMenu[from] = stateData;
      pendingMenu[sender] = stateData;
      pendingMenu[cleanKey(sender)] = stateData;
      pendingMenu[cleanKey(from)] = stateData;

    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Menu එක යැවීමේදී දෝෂයක් සිදුවිය.");
    }
  }
);

/* ================= 2. BUTTON CLICK COMMAND HANDLER (.menu_pick) ================= */
cmd(
  {
    pattern: "menu_pick",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, pushname, sessionId }) => {
    const index = parseInt(String(q || "").trim(), 10) - 1;
    const commandMap = {};
    for (const command of commands) {
      if (command.dontAddCommandList) continue;
      const category = (command.category || "MISC").toUpperCase();
      if (!commandMap[category]) commandMap[category] = [];
      commandMap[category].push(command);
    }
    const categories = Object.keys(commandMap).sort();

    if (isNaN(index) || index < 0 || index >= categories.length) return;

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const selectedCategory = categories[index];
    const cmdsInCategory = commandMap[selectedCategory] || [];

    const emo = getCategoryEmoji(selectedCategory);
    const styledCat = toSmallCaps(selectedCategory);
    let cmdText = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n👤 *\`ᴜsᴇʀ\` :* ${toSmallCaps(pushname || "User")}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${cmdsInCategory.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

    cmdsInCategory.forEach((c) => {
      const primary = c.pattern ? `${PREFIX}${toSmallCaps(c.pattern)}` : "No Pattern";
      const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${toSmallCaps(a)}`);
      cmdText += `🔹 *${primary}*\n`;
      if (aliases.length) cmdText += `  ├ 💬 *\`ᴀʟɪᴀs\` :* \`${aliases.join(", ")}\`\n`;
      cmdText += `  ╰ 📌 *\`ᴅᴇsᴄ\` :* _${c.desc || "No description"}_\n\n`;
    });

    cmdText += `────━──✦❘•❘✦──━───\n> 👑 ${DEFAULT_BOT_NAME} | ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;

    let headerImg = DEFAULT_HEADER_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "menu_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    try {
      await sock.sendMessage(from, { image: { url: headerImg }, caption: cmdText }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(from, { text: cmdText }, { quoted: mek });
    }
  }
);

/* ================= 3. NUMBER REPLY HANDLER (SUDDA STYLE) ================= */
cmd(
  {
    filter: (text, { from, sender }) => {
      const targetState = pendingMenu[from] || pendingMenu[sender] || pendingMenu[cleanKey(sender)] || pendingMenu[cleanKey(from)];
      return Boolean(targetState && targetState.step === "category" && /^[1-9][0-9]*$/.test(String(text || "").trim()));
    },
  },
  async (sock, mek, m, { from, body, sender, reply }) => {
    const stateKey = pendingMenu[from] ? from : (pendingMenu[sender] ? sender : (pendingMenu[cleanKey(sender)] ? cleanKey(sender) : cleanKey(from)));
    const state = pendingMenu[stateKey];
    if (!state) return;

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const { commandMap, categories, botDisplayName, sessionId, userName } = state;
    const index = parseInt(String(body || "").trim(), 10) - 1;

    if (index < 0 || index >= categories.length) return reply("❌ වැරදි අංකයක්.");

    const selectedCategory = categories[index];
    const cmdsInCategory = commandMap[selectedCategory] || [];

    const emo = getCategoryEmoji(selectedCategory);
    const styledCat = toSmallCaps(selectedCategory);
    let cmdText = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n👤 *\`ᴜsᴇʀ\` :* ${toSmallCaps(userName)}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${cmdsInCategory.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

    cmdsInCategory.forEach((c) => {
      const primary = c.pattern ? `${PREFIX}${toSmallCaps(c.pattern)}` : "No Pattern";
      const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${toSmallCaps(a)}`);
      cmdText += `🔹 *${primary}*\n`;
      if (aliases.length) cmdText += `  ├ 💬 *\`ᴀʟɪᴀs\` :* \`${aliases.join(", ")}\`\n`;
      cmdText += `  ╰ 📌 *\`ᴅᴇsᴄ\` :* _${c.desc || "No description"}_\n\n`;
    });

    cmdText += `────━──✦❘•❘✦──━───\n> 👑 ${botDisplayName} | ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;

    let headerImg = DEFAULT_HEADER_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "menu_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    try {
      await sock.sendMessage(from, { image: { url: headerImg }, caption: cmdText }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(from, { text: cmdText }, { quoted: mek });
    }

    delete pendingMenu[from];
    delete pendingMenu[sender];
    delete pendingMenu[cleanKey(sender)];
    delete pendingMenu[cleanKey(from)];
  }
);

module.exports = {};
