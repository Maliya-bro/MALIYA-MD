const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = {}; // 🔥 Exactly like sudda
const LOOP_COOLDOWN = 2500;
const SESSION_TIMEOUT = 5 * 60 * 1000;
const lastProcessedMsg = {};

/* ============ PERMANENT BRANDING ============ */
const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const PREFIX = ".";
const TZ = "Asia/Colombo";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1,
    },
  };
}

const OWNER_NUMBER_RAW = String(config.BOT_OWNER || "").trim();
const OWNER_NUMBER = OWNER_NUMBER_RAW.startsWith("+") ? OWNER_NUMBER_RAW : OWNER_NUMBER_RAW ? `+${OWNER_NUMBER_RAW}` : "Not Set";
const OWNER_NAME = "MALINDU NADITH";
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

// 🔥 Native Flow Button IDs සහ සාමාන්‍ය Texts Extract කිරීම
function extractTexts(body, mek, m) {
  const texts = [];
  if (body) texts.push(String(body).trim());
  if (m?.body) texts.push(String(m.body).trim());
  if (m?.text) texts.push(String(m.text).trim());

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;

  [p1, p2].forEach(raw => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id) texts.push(String(parsed.id).trim()); // Button ID එක ගන්නවා
      } catch (e) {}
    }
  });
  return [...new Set(texts.filter(Boolean))];
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

      // Build command map
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

      let menuText = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n`;
      menuText += `✨ 👋 *ʜɪ, ${styledUser}!*\n\n`;
      menuText += `╔═════. .★.══════════╗\n🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n╚══════════. .★.═════╝\n\n`;
      menuText += `👇 *Select a command category below to view commands:*\n\n`;

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
            id: String(i + 1) // 🔥 MAGIC: Button ID is just the Number!
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
          await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText, contextInfo: channelContextInfo() }, { quoted: mek });
        }
      } else {
        await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText, contextInfo: channelContextInfo() }, { quoted: mek });
      }

      // 🔥 EXACTLY LIKE SUDDA: Save raw sender and from states
      const stateData = { 
        step: "category", 
        commandMap, 
        categories,
        botDisplayName,
        sessionId,
        userName
      };

      pendingMenu[sender] = stateData;
      pendingMenu[from] = stateData; // LID safe

    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Cannot send menu.");
    }
  }
);


/* ================= 2. REPLY HANDLER (SUDDA STYLE FOR NUMBERS & BUTTONS) ================= */
cmd(
  {
    filter: (text, { sender, from, m, mek }) => {
      // Check if memory state exists
      const hasSenderState = Boolean(pendingMenu[sender] && pendingMenu[sender].step === "category");
      const hasFromState = Boolean(pendingMenu[from] && pendingMenu[from].step === "category");
      if (!hasSenderState && !hasFromState) return false;

      // Extract all texts (includes Typed text and Button JSON IDs)
      const texts = extractTexts(text, mek, m);
      
      for (const t of texts) {
        const rawText = String(t).trim();
        // Check if any of the extracted texts is a valid number
        if (/^[1-9][0-9]*$/.test(rawText)) {
           return true; 
        }
      }
      return false;
    }
  },
  async (sock, mek, m, { body, sender, from }) => {
    const activeState = pendingMenu[sender] || pendingMenu[from];
    if (!activeState) return;

    // Extract choices to find the exact number
    const texts = extractTexts(body, mek, m);
    let choiceIndex = -1;

    for (const t of texts) {
      const rawText = String(t).trim();
      if (/^[1-9][0-9]*$/.test(rawText)) {
         choiceIndex = parseInt(rawText, 10) - 1;
         break;
      }
    }

    if (choiceIndex < 0 || choiceIndex >= activeState.categories.length) return;

    // Cooldown verification to prevent double responses
    const now = Date.now();
    const sig = `menu_${sender}_${choiceIndex}`;
    if (lastProcessedMsg[sig] && (now - lastProcessedMsg[sig] < LOOP_COOLDOWN)) return;
    lastProcessedMsg[sig] = now;

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const { commandMap, categories, botDisplayName, sessionId, userName } = activeState;
    const selectedCategory = categories[choiceIndex];
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

    const headerImg = await getHeaderImage(sessionId);

    try {
      await sock.sendMessage(from, { image: { url: headerImg }, caption: cmdText, contextInfo: channelContextInfo() }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(from, { text: cmdText, contextInfo: channelContextInfo() }, { quoted: mek });
    }

    // 🔥 Exact Sudda cleanup
    delete pendingMenu[sender];
    delete pendingMenu[from];
  }
);

/* ================= 3. MEMORY CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k] > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 30000);

module.exports = {};
