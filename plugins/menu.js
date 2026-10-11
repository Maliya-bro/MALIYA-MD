const { cmd, commands } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = {}; // 🔥 Exactly like sudda

/* ============ PERMANENT BRANDING ============ */
const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const PREFIX = ".";
const TZ = "Asia/Colombo";

const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

/* ================= UI HELPERS ================= */

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
    const idx = normal.indexOf(char);
    return idx !== -1 ? small[idx] : char;
  }).join("");
}

function nowLK() {
  const d = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return { time, date };
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
  if (c.includes("CONVERT")) return "♻️";
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

async function getHeaderImage(sessionId) {
  let headerImg = DEFAULT_HEADER_IMAGE;
  if (sessionId) {
    try {
      const custom = await getCustomImage(sessionId, "menu_header");
      if (custom && custom.data) headerImg = custom.data;
    } catch (e) {}
  }
  return headerImg;
}

/* ================= 1. MAIN COMMAND: .menu ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help"],
    react: "📜",
    desc: "Show styled command categories with popup list",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      // 🔥 Build command map (sudda style)
      const commandMap = {};
      for (const command of commands) {
        if (command.dontAddCommandList) continue;
        const category = (command.category || "MISC").toUpperCase();
        if (!commandMap[category]) commandMap[category] = [];
        commandMap[category].push(command);
      }
      const categories = Object.keys(commandMap).sort();

      if (!categories.length) return reply("❌ No commands found!");

      const userName = pushname || "User";
      let botDisplayName = DEFAULT_BOT_NAME;
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        if (settings && typeof settings.btns_enabled !== "undefined") btnsOn = Boolean(settings.btns_enabled);
      } catch (e) {}

      const headerImg = await getHeaderImage(sessionId);
      const { time, date } = nowLK();
      const styledUser = toSmallCaps(userName);

      // Build Menu Text
      let menuText = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n✨ 👋 *ʜɪ, ${styledUser}!*\n\n╔═════. .★.══════════╗\n🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n╚══════════. .★.═════╝\n\n👇 *Select a command category below to view commands:*\n\n`;

      categories.forEach((cat, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        menuText += `*[ ${numStr} ]* ➔ ${getCategoryEmoji(cat)} *${toSmallCaps(cat)}* _(${commandMap[cat].length})_\n`;
      });
      menuText += `\n⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Swipe & Reply this message with a number...*`;

      // 🔘 BUTTONS MODE
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          
          const listRows = categories.map((cat, i) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${commandMap[cat].length} commands available`,
            id: String(i + 1) // 🔥 MAGIC: ID is exactly the Number (1, 2, 3...)
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuText)
            .setFooter(`© 2026 ${BRAND_BASE} SYSTEM`)
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: "menu_list_main",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Click Here ↯",
                sections: [{ title: "Command Categories", rows: listRows }],
              }),
            },
          });

          btn.addButton("📊 Ping", ".ping");

          await btn.send(from, { quoted: mek });
        } catch (err) {
          // Fallback if ButtonV2 fails
          await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
        }
      } else {
        // Fallback to purely text
        await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
      }

      // 🔥 EXACTLY LIKE SUDDA: Save to pendingMenu
      pendingMenu[sender] = { 
        step: "category", 
        commandMap, 
        categories,
        botDisplayName,
        sessionId,
        userName
      };

    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Cannot send menu.");
    }
  }
);


/* ================= 2. REPLY HANDLER (EXACTLY LIKE SUDDA) ================= */

cmd(
  {
    // 🔥 Exact Sudda filter logic: check if pendingMenu[sender] exists AND text is a number!
    filter: (text, { sender }) => pendingMenu[sender] && pendingMenu[sender].step === "category" && /^[1-9][0-9]*$/.test(text.trim())
  },
  async (sock, mek, m, { from, body, sender, reply }) => {
    
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    // 🔥 Exact Sudda Logic
    const { commandMap, categories, botDisplayName, sessionId, userName } = pendingMenu[sender];
    const index = parseInt(body.trim()) - 1;

    if (index < 0 || index >= categories.length) return reply("❌ Invalid selection.");

    const selectedCategory = categories[index];
    const cmdsInCategory = commandMap[selectedCategory] || [];

    // Build the category commands caption
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

    const headerImg = await getHeaderImage(sessionId);

    // Send the resulting menu
    try {
      await sock.sendMessage(from, { image: { url: headerImg }, caption: cmdText }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(from, { text: cmdText }, { quoted: mek });
    }

    // 🔥 Exact Sudda memory deletion
    delete pendingMenu[sender];
  }
);

module.exports = {};
