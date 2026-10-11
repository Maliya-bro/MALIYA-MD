const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = Object.create(null);
const SESSION_TIMEOUT = 5 * 60 * 1000;

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

/* ============ CACHE ============ */
let cachedMenu = null;
let cacheTime = 0;
const MENU_CACHE_MS = 60 * 1000;

/* ================= HELPERS ================= */
function keyFor(sender, from) {
  return `${sender || "unknown"}_${from || "unknown"}`;
}

function getSafeMsgId(sentMsg) {
  if (!sentMsg) return null;
  if (typeof sentMsg === "string") return sentMsg;
  if (sentMsg.key && sentMsg.key.id) return sentMsg.key.id;
  return null;
}

function getQuotedId(m, mek) {
  if (m?.quoted?.id) return m.quoted.id;
  if (mek?.message?.extendedTextMessage?.contextInfo?.stanzaId) {
    return mek.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m?.message?.extendedTextMessage?.contextInfo?.stanzaId) {
    return m.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m?.message?.imageMessage?.contextInfo?.stanzaId) {
    return m.message.imageMessage.contextInfo.stanzaId;
  }
  return null;
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small =
    "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

function cleanPhone(num = "") {
  return String(num).replace(/[^\d]/g, "");
}

function sameNumber(a = "", b = "") {
  return cleanPhone(a) === cleanPhone(b);
}

function getUserName(pushname, m, mek, sender = "") {
  const candidates = [
    pushname, m?.pushName, mek?.pushName, m?.name, mek?.name,
    m?.notifyName, mek?.notifyName, m?.chatName, mek?.chatName,
  ];
  for (const item of candidates) {
    if (item && String(item).trim()) {
      return String(item).trim();
    }
  }
  if (sameNumber(sender.split("@")[0].split(":")[0], OWNER_NUMBER)) {
    return OWNER_NAME;
  }
  const num = String(sender || "").split("@")[0].split(":")[0];
  return num || "User";
}

function nowLK() {
  const d = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
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

function buildCommandMapCached() {
  const now = Date.now();
  if (cachedMenu && now - cacheTime < MENU_CACHE_MS) return cachedMenu;
  const map = Object.create(null);
  for (const c of commands) {
    if (c.dontAddCommandList) continue;
    const cat = (c.category || "MISC").toUpperCase();
    (map[cat] ||= []).push(c);
  }
  const categories = Object.keys(map).sort((a, b) => a.localeCompare(b));
  for (const cat of categories) {
    map[cat].sort((a, b) => (a.pattern || "").localeCompare(b.pattern || ""));
  }
  cachedMenu = { map, categories };
  cacheTime = now;
  return cachedMenu;
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 },
      })
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
  return `┏━━━━━━◥◣◆◢◤━━━━━━┓
★彡 *${botDisplayName}* 彡★
┗━━━━━━◢◤◆◥◣━━━━━━┛

✨ 👋 *ʜɪ, ${styledUser}!*

╔═════. .★.══════════╗
🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}
👤 *\`ᴜsᴇʀ\` :* ${styledUser}
👑 *\`ᴏᴡɴᴇʀ\` :* ${OWNER_NAME}
🕒 *\`ᴛɪᴍᴇ\` :* ${time}
📅 *\`ᴅᴀᴛᴇ\` :* ${date}
🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]
⚡ *\`ʟᴀᴛᴇɴᴄʏ\` :* ${latency}
╚══════════. .★.═════╝

👇 *Select a command category below to view commands:*

🌐 *Web:* https://maliya-md.vercel.app
🌸 *Video:* https://youtube.com/shorts/sxWbUypZG64?si=ZNPWj8kLWEjRM1tf`;
}

function buildStyledMainMenu(categories, map, userName, latency = "0ms", botDisplayName = DEFAULT_BOT_NAME) {
  const styledUser = toSmallCaps(userName);
  const { time, date } = nowLK();
  let msg = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n`;
  msg += `✨ 👋 *ʜɪ, ${styledUser}!*\n\n`;
  msg += `╔═════. .★.══════════╗\n`;
  msg += `🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n`;
  msg += `👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n`;
  msg += `👑 *\`ᴏᴡɴᴇʀ\` :* ${OWNER_NAME}\n`;
  msg += `🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n`;
  msg += `📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n`;
  msg += `🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n`;
  msg += `⚡ *\`ʟᴀᴛᴇɴᴄʏ\` :* ${latency}\n`;
  msg += `╚══════════. .★.═════╝\n\n`;

  categories.forEach((cat, idx) => {
    const emo = getCategoryEmoji(cat);
    const numStr = String(idx + 1).padStart(2, "0");
    const styledCat = toSmallCaps(cat);
    msg += `*[ ${numStr} ]*  ${emo}  *${styledCat}*  _(${map[cat]?.length || 0})_\n`;
  });
  msg += `\n━─ ⋆ ⋅ 𖤐 ⋅ ⋆ ─━┈➤\n> 💬 *Swipe & Reply this message with a number...*\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;
  return msg;
}

function commandListCaption(cat, list, userName = "User", botDisplayName = DEFAULT_BOT_NAME) {
  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  const styledUser = toSmallCaps(userName);
  let txt = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n`;
  txt += `👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${list.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

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

async function safeSendImageOrText(sock, from, imgUrl, caption, mek) {
  try {
    return await sock.sendMessage(
      from,
      { image: { url: imgUrl }, caption: caption, contextInfo: channelContextInfo() },
      { quoted: mek }
    );
  } catch (err) {
    return await sock.sendMessage(
      from,
      { text: caption, contextInfo: channelContextInfo() },
      { quoted: mek }
    );
  }
}

/* ================= 1. COMMAND: MAIN MENU ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu"],
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
      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      let botDisplayName = DEFAULT_BOT_NAME;
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        if (settings && typeof settings.btns_enabled !== "undefined") {
          btnsOn = Boolean(settings.btns_enabled);
        }
      } catch (e) {}

      const headerImg = await getHeaderImage(sessionId);

      // Create flat options for NUMBER reply fallback map
      const flatOpts = categories.map((cat) => ({ cat: cat }));

      const state = {
        createdAt: Date.now(),
        sessionId: sessionId,
        menuMsgId: null,
        categories: categories,
        options: flatOpts,
        map: map,
        userName: userName,
        botDisplayName: botDisplayName,
      };

      // BUTTONS MODE
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const listRows = categories.map((cat) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${map[cat].length} commands available`,
            id: `.menuview ${cat}`, // 🔥 Button sends command format
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

          const sentMsg = await btn.send(from, { quoted: mek });
          const msgId = getSafeMsgId(sentMsg);

          if (msgId) {
            state.menuMsgId = msgId;
            pendingMenu[k] = state;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (err) {
          console.log("MENU BUTTONV2 ERROR:", err?.message || err);
        }
      }

      // NUMBER REPLY FALLBACK
      const captionText = buildStyledMainMenu(categories, map, userName, latencyStr, botDisplayName);
      const sentMsg = await safeSendImageOrText(sock, from, headerImg, captionText, mek);
      
      const msgId = getSafeMsgId(sentMsg);
      if (msgId) {
        state.menuMsgId = msgId;
        pendingMenu[k] = state;
      }

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
      console.log("MENU ERROR:", e?.message || e);
      reply("❌ Cannot send menu: " + (e?.message || e));
    }
  }
);

/* ================= 2. COMMAND: BUTTON CLICK HANDLER (.menuview) ================= */
// 🔥 බොත්තම් click කළාම .menuview MAIN විදිහට එන නිසා මෙය කෙලින්ම command එකකින් අල්ලයි.
cmd(
  {
    pattern: "menuview",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, pushname, reply, sessionId }) => {
    try {
      const cat = String(q || "").trim().toUpperCase();
      if (!cat) return;

      const { map } = buildCommandMapCached();
      const list = map[cat] || [];
      if (!list.length) return reply("❌ No commands found in this category.");

      const userName = getUserName(pushname, m, mek, sender);
      let botDisplayName = DEFAULT_BOT_NAME;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
      } catch (e) {}

      const headerImg = await getHeaderImage(sessionId);
      const caption = commandListCaption(cat, list, userName, botDisplayName);

      await sock.sendMessage(from, { react: { text: getCategoryEmoji(cat), key: mek.key } });
      await safeSendImageOrText(sock, from, headerImg, caption, mek);
    } catch (e) {
      console.log("MENU VIEW ERROR:", e?.message);
    }
  }
);

/* ================= 3. REPLY HANDLER: NUMBER REPLY HANDLER ================= */
// 🔥 User Number 1, 2 වගේ type කළාම එය අල්ලගන්නේ මේ Handler එකෙනි.
const menuReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return false;

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.options.length;
    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.menuMsgId;

    // 🔥 User Quote කරලා අංකය දැම්මත්, නිකන්ම අංකය දැම්මත් අල්ලගන්නවා
    return Boolean(isQuoted || isNum);
  },

  function: async (sock, mek, m, { body, sender, from, pushname, sessionId }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return;

    const num = parseInt(String(body || "").trim(), 10);
    if (isNaN(num) || num < 1 || num > state.options.length) return;

    const selectedCategory = state.options[num - 1].cat;
    
    try {
      const list = state.map[selectedCategory] || [];
      const userName = state.userName || getUserName(pushname, m, mek, sender);
      const botDisplayName = state.botDisplayName || DEFAULT_BOT_NAME;

      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(selectedCategory), key: mek.key },
      });

      const headerImg = await getHeaderImage(sessionId || state.sessionId);
      const caption = commandListCaption(selectedCategory, list, userName, botDisplayName);

      await safeSendImageOrText(sock, from, headerImg, caption, mek);
    } catch (err) {
      console.log("MENU REPLY HANDLER ERROR:", err);
    }
  },
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(menuReplyHandler);
}

/* ================= 4. CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingMenu)) {
    if (now - pendingMenu[key].createdAt > SESSION_TIMEOUT) {
      delete pendingMenu[key];
    }
  }
}, 30000);

module.exports = {};
