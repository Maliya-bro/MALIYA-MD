const { cmd, commands } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = {}; // 100% like your sudda command

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
const OWNER_NUMBER = OWNER_NUMBER_RAW.startsWith("+")
  ? OWNER_NUMBER_RAW
  : OWNER_NUMBER_RAW
  ? `+${OWNER_NUMBER_RAW}`
  : "Not Set";

const OWNER_NAME = "MALINDU NADITH";

const DEFAULT_HEADER_IMAGE =
  "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

/* ================= HELPERS ================= */

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

function buildCommandMap() {
  const map = {};
  for (const c of commands) {
    if (c.dontAddCommandList) continue;
    const cat = (c.category || "MISC").toUpperCase();
    if (!map[cat]) map[cat] = [];
    map[cat].push(c);
  }
  const categories = Object.keys(map).sort((a, b) => a.localeCompare(b));
  for (const cat of categories) {
    map[cat].sort((a, b) => (a.pattern || "").localeCompare(b.pattern || ""));
  }
  return { map, categories };
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, { fit: "contain", background: { r: 18, g: 18, b: 24, alpha: 1 } })
      .jpeg({ quality: 80 })
      .toBuffer();
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

function menuHeader(userName = "User", latency = "0ms", botDisplayName = DEFAULT_BOT_NAME) {
  const { time, date } = nowLK();
  const styledUser = toSmallCaps(userName);
  return `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n✨ 👋 *ʜɪ, ${styledUser}!*\n\n╔═════. .★.══════════╗\n🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n👑 *\`ᴏᴡɴᴇʀ\` :* ${OWNER_NAME}\n🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n⚡ *\`ʟᴀᴛᴇɴᴄʏ\` :* ${latency}\n╚══════════. .★.═════╝\n\n👇 *Select a command category below to view commands:*\n\n🌐 *Web:* https://maliya-md.vercel.app\n🌸 *Video:* https://youtube.com/shorts/sxWbUypZG64?si=ZNPWj8kLWEjRM1tf`;
}

function commandListCaption(cat, list, userName = "User", botDisplayName = DEFAULT_BOT_NAME) {
  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  const styledUser = toSmallCaps(userName);
  let txt = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${list.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `${PREFIX}${toSmallCaps(c.pattern)}` : "No Pattern";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${toSmallCaps(a)}`);
    txt += `🔹 *${primary}*\n`;
    if (aliases.length) txt += `  ├ 💬 *\`ᴀʟɪᴀs\` :* \`${aliases.join(", ")}\`\n`;
    txt += `  ╰ 📌 *\`ᴅᴇsᴄ\` :* _${c.desc || "No description"}_\n\n`;
  });

  txt += `────━──✦❘•❘✦──━───\n> 👑 ${botDisplayName} | ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;
  return txt;
}

// Extract texts accurately including Native Flow JSON buttons
function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, 
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.interactiveResponseMessage?.body?.text,
  ];
  direct.forEach((item) => { if (item) texts.push(String(item).trim()); });

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  [p1, p2].forEach((raw) => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id) texts.push(String(parsed.id).trim());
      } catch (e) {}
    }
  });
  return [...new Set(texts.filter(Boolean))];
}

/* ================= 1. MAIN COMMAND: .menu ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help", "sudda2"],
    react: "📜",
    desc: "Show styled command categories with popup list",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      const startTimestamp = Date.now();
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const latencyStr = `${Date.now() - startTimestamp}ms`;
      const { map, categories } = buildCommandMap();
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

      // Number list logic
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n📜 *${toSmallCaps(botDisplayName)} MENU*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      categories.forEach((cat, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* ➔ ${getCategoryEmoji(cat)} *${toSmallCaps(cat)}*\n`;
      });
      text += `\n⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Swipe & Reply this message with a number...*`;

      // 🔘 BUTTONS MODE
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          
          const listRows = categories.map((cat, index) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${map[cat].length} commands available`,
            id: `.menu_dl ${index + 1}`, // Button ID sends this text implicitly
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuHeader(userName, latencyStr, botDisplayName))
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
          console.log("MENU BUTTONV2 ERROR:", err?.message);
          // Fallback to text if error
          await sock.sendMessage(from, { image: { url: headerImg }, caption: text, contextInfo: channelContextInfo() }, { quoted: mek });
        }
      } else {
        // Fallback to purely text
        await sock.sendMessage(from, { image: { url: headerImg }, caption: text, contextInfo: channelContextInfo() }, { quoted: mek });
      }

      // 🔥 Memory saved exactly like your 'sudda' command
      pendingMenu[sender] = {
        step: "category",
        categories: categories,
        map: map,
        userName: userName,
        botDisplayName: botDisplayName,
        sessionId: sessionId
      };

    } catch (e) {
      console.log("MENU ERROR:", e?.message);
      reply("❌ Cannot send menu.");
    }
  }
);

/* ================= 2. REPLY HANDLER VIA cmd() (EXACTLY LIKE SUDDA) ================= */
// 🔥 මෙන්න ලොකුම වෙනස! `replyHandlers.push()` වෙනුවට කෙලින්ම `cmd()` හරහා filter එක pass කිරීම.
cmd(
  {
    filter: (text, { sender, from, m, mek }) => {
      // 1. Check if user is in memory
      if (!pendingMenu[sender] || pendingMenu[sender].step !== "category") return false;

      const texts = extractTexts(text, mek, m);
      
      for (const t of texts) {
        const str = String(t).trim();
        // Check if it's a valid Number
        if (/^[1-9][0-9]*$/.test(str)) {
          const num = parseInt(str, 10);
          if (num > 0 && num <= pendingMenu[sender].categories.length) return true;
        }
        // Check if it's the Button ID
        if (str.startsWith(".menu_dl ")) {
          return true;
        }
      }
      return false;
    }
  },
  async (sock, mek, m, { from, body, sender, pushname }) => {
    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    const state = pendingMenu[sender];
    const texts = extractTexts(body, mek, m);
    
    let choice = null;

    // Get the choice (Will work whether typed "1", quoted "1", or clicked Button)
    for (const t of texts) {
      const str = String(t).trim();
      if (str.startsWith(".menu_dl ")) {
        choice = parseInt(str.replace(".menu_dl ", ""), 10);
        break;
      } else if (/^[1-9][0-9]*$/.test(str)) {
        choice = parseInt(str, 10);
        break;
      }
    }

    if (!choice || choice < 1 || choice > state.categories.length) {
      return await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    }

    try {
      const selectedCategory = state.categories[choice - 1]; // Array is 0-indexed
      const list = state.map[selectedCategory] || [];

      const headerImg = await getHeaderImage(state.sessionId);
      const caption = commandListCaption(selectedCategory, list, state.userName, state.botDisplayName);

      // Send the category commands list
      try {
        await sock.sendMessage(from, { image: { url: headerImg }, caption: caption, contextInfo: channelContextInfo() }, { quoted: mek });
      } catch (err) {
        await sock.sendMessage(from, { text: caption, contextInfo: channelContextInfo() }, { quoted: mek });
      }

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

      // 🔥 Clear memory exactly like your sudda command
      delete pendingMenu[sender];

    } catch (err) {
      console.log("MENU REPLY HANDLER ERROR:", err);
      delete pendingMenu[sender];
    }
  }
);

module.exports = {};
