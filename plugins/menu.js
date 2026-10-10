const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = Object.create(null);
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2000;

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

let OWNER_NUMBER_RAW = "";
if (config.BOT_OWNER) {
  OWNER_NUMBER_RAW = String(config.BOT_OWNER).trim();
}

let OWNER_NUMBER = "Not Set";
if (OWNER_NUMBER_RAW.startsWith("+")) {
  OWNER_NUMBER = OWNER_NUMBER_RAW;
} else if (OWNER_NUMBER_RAW.length > 0) {
  OWNER_NUMBER = "+" + OWNER_NUMBER_RAW;
}

const OWNER_NAME = "MALINDU NADITH";
const DEFAULT_HEADER_IMAGE =
  "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

/* ============ CACHE ============ */
let cachedMenu = null;
let cacheTime = 0;
const MENU_CACHE_MS = 60 * 1000;

/* ================= HELPERS ================= */
function keyFor(sender, from) {
  let s = "unknown";
  if (sender) {
    s = sender;
  }
  let f = "unknown";
  if (from) {
    f = from;
  }
  return s + "_" + f;
}

function getQuotedId(m, mek) {
  if (m && m.quoted && m.quoted.id) {
    return m.quoted.id;
  }
  if (mek && mek.message && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.stanzaId) {
    return mek.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m && m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.stanzaId) {
    return m.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m && m.message && m.message.imageMessage && m.message.imageMessage.contextInfo && m.message.imageMessage.contextInfo.stanzaId) {
    return m.message.imageMessage.contextInfo.stanzaId;
  }
  if (m && m.message && m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.contextInfo && m.message.interactiveResponseMessage.contextInfo.stanzaId) {
    return m.message.interactiveResponseMessage.contextInfo.stanzaId;
  }
  if (mek && mek.message && mek.message.imageMessage && mek.message.imageMessage.contextInfo && mek.message.imageMessage.contextInfo.stanzaId) {
    return mek.message.imageMessage.contextInfo.stanzaId;
  }
  if (mek && mek.message && mek.message.interactiveResponseMessage && mek.message.interactiveResponseMessage.contextInfo && mek.message.interactiveResponseMessage.contextInfo.stanzaId) {
    return mek.message.interactiveResponseMessage.contextInfo.stanzaId;
  }
  return null;
}

function cleanPhone(num) {
  let str = "";
  if (num) {
    str = String(num);
  }
  return str.replace(/[^\d]/g, "");
}

function sameNumber(a, b) {
  return cleanPhone(a) === cleanPhone(b);
}

function toSmallCaps(str) {
  let s = "";
  if (str) {
    s = String(str);
  }
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return s
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      if (idx !== -1) {
        return small[idx];
      } else {
        return char;
      }
    })
    .join("");
}

function getUserName(pushname, m, mek, sender) {
  const candidates = [
    pushname,
    m ? m.pushName : null,
    mek ? mek.pushName : null,
    m ? m.name : null,
    mek ? mek.name : null,
    m ? m.notifyName : null,
    mek ? mek.notifyName : null,
    m ? m.chatName : null,
    mek ? mek.chatName : null,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (item) {
      const trimmed = String(item).trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  let snd = "";
  if (sender) {
    snd = String(sender);
  }
  const parts = snd.split("@")[0].split(":");
  if (sameNumber(parts[0], OWNER_NUMBER)) {
    return OWNER_NAME;
  }
  if (parts[0]) {
    return parts[0];
  }
  return "User";
}

function nowLK() {
  const d = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return { time, date };
}

function normalizeText(s) {
  let str = "";
  if (s) {
    str = String(s);
  }
  return str
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getCategoryEmoji(cat) {
  let c = "";
  if (cat) {
    c = String(cat).toUpperCase();
  }
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
  if (cachedMenu) {
    if (now - cacheTime < MENU_CACHE_MS) {
      return cachedMenu;
    }
  }

  const map = Object.create(null);
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.dontAddCommandList) {
      continue;
    }
    let cat = "MISC";
    if (c.category) {
      cat = String(c.category).toUpperCase();
    }
    if (!map[cat]) {
      map[cat] = [];
    }
    map[cat].push(c);
  }

  const categories = Object.keys(map).sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    map[cat].sort((a, b) => {
      let patA = "";
      if (a.pattern) patA = a.pattern;
      let patB = "";
      if (b.pattern) patB = b.pattern;
      return patA.localeCompare(patB);
    });
  }

  cachedMenu = { map, categories };
  cacheTime = now;
  return cachedMenu;
}

async function getFittedImageBuffer(url) {
  try {
    let rawUrl = "";
    if (url) {
      rawUrl = String(url)
        .replace("github.com", "raw.githubusercontent.com")
        .replace("/blob/", "/");
    }
    const res = await axios.get(rawUrl, { responseType: "arraybuffer", timeout: 12000 });
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 },
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return null;
  }
}

function menuHeader(userName, latency, botDisplayName) {
  let uName = "User";
  if (userName) uName = userName;
  let lat = "0ms";
  if (latency) lat = latency;
  let bName = DEFAULT_BOT_NAME;
  if (botDisplayName) bName = botDisplayName;

  const { time, date } = nowLK();
  const styledUser = toSmallCaps(uName);

  return `┏━━━━━━◥◣◆◢◤━━━━━━┓
★彡 *${bName}* 彡★
┗━━━━━━◢◤◆◥◣━━━━━━┛

✨ 👋 *ʜɪ, ${styledUser}!*

╔═════. .★.══════════╗
🤖 *\`ʙᴏᴛ\` :* ${bName}
👤 *\`ᴜsᴇʀ\` :* ${styledUser}
👑 *\`ᴏᴡɴᴇʀ\` :* ${OWNER_NAME}
🕒 *\`ᴛɪᴍᴇ\` :* ${time}
📅 *\`ᴅᴀᴛᴇ\` :* ${date}
🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]
⚡ *\`ʟᴀᴛᴇɴᴄʏ\` :* ${lat}
╚══════════. .★.═════╝

👇 *Select a command category below to view commands:*

🌐 *Web:* https://maliya-md.vercel.app
🌸 *Video:* https://youtube.com/shorts/sxWbUypZG64?si=ZNPWj8kLWEjRM1tf`;
}

function buildStyledMainMenu(state, userName, latency, botDisplayName) {
  let lat = "0ms";
  if (latency) lat = latency;
  let bName = DEFAULT_BOT_NAME;
  if (botDisplayName) bName = botDisplayName;

  const { categories } = state;
  const styledUser = toSmallCaps(userName);
  const { time, date } = nowLK();

  let msg = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${bName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n`;
  msg += `✨ 👋 *ʜɪ, ${styledUser}!*\n\n`;
  msg += `╔═════. .★.══════════╗\n`;
  msg += `🤖 *\`ʙᴏᴛ\` :* ${bName}\n`;
  msg += `👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n`;
  msg += `👑 *\`ᴏᴡɴᴇʀ\` :* ${OWNER_NAME}\n`;
  msg += `🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n`;
  msg += `📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n`;
  msg += `🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n`;
  msg += `⚡ *\`ʟᴀᴛᴇɴᴄʏ\` :* ${lat}\n`;
  msg += `╚══════════. .★.═════╝\n\n`;

  categories.forEach((cat, idx) => {
    const emo = getCategoryEmoji(cat);
    const numStr = String(idx + 1).padStart(2, "0");
    const styledCat = toSmallCaps(cat);
    msg += `*[ ${numStr} ]*  ${emo}  *${styledCat}*  _(${state.map[cat].length})_\n`;
  });
  msg += `\n━─ ⋆ ⋅ 𖤐 ⋅ ⋆ ─━┈➤\n> 💬 *Swipe & Reply this message with a number...*\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;
  return msg;
}

function commandListCaption(cat, list, userName, botDisplayName) {
  let uName = "User";
  if (userName) uName = userName;
  let bName = DEFAULT_BOT_NAME;
  if (botDisplayName) bName = botDisplayName;

  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  const styledUser = toSmallCaps(uName);

  let txt = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n`;
  txt += `👤 *\`ᴜsᴇʀ\` :* ${styledUser}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${list.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

  list.forEach((c) => {
    let primary = "No Pattern";
    if (c.pattern) {
      primary = PREFIX + toSmallCaps(c.pattern);
    }
    let aliasList = [];
    if (c.alias) {
      aliasList = c.alias.filter(Boolean).map((a) => PREFIX + toSmallCaps(a));
    }

    txt += `🔹 *${primary}*\n`;
    if (aliasList.length > 0) {
      txt += `  ├ 💬 *\`ᴀʟɪᴀs\` :* \`${aliasList.join(", ")}\`\n`;
    }
    let desc = "No description";
    if (c.desc) {
      desc = c.desc;
    }
    txt += `  ╰ 📌 *\`ᴅᴇsᴄ\` :* _${desc}_\n\n`;
  });

  txt += `────━──✦❘•❘✦──━───\n> 👑 ${bName} | ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;
  return txt;
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body,
    m ? m.body : null,
    m ? m.text : null,
    m && m.message ? m.message.conversation : null,
    m && m.message && m.message.extendedTextMessage ? m.message.extendedTextMessage.text : null,
    m && m.message && m.message.buttonsResponseMessage ? m.message.buttonsResponseMessage.selectedButtonId : null,
    m && m.message && m.message.buttonsResponseMessage ? m.message.buttonsResponseMessage.selectedDisplayText : null,
    m && m.message && m.message.listResponseMessage ? m.message.listResponseMessage.title : null,
    m && m.message && m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply ? m.message.listResponseMessage.singleSelectReply.selectedRowId : null,
    m && m.message && m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.body ? m.message.interactiveResponseMessage.body.text : null,
    mek && mek.message ? mek.message.conversation : null,
    mek && mek.message && mek.message.extendedTextMessage ? mek.message.extendedTextMessage.text : null,
    mek && mek.message && mek.message.buttonsResponseMessage ? mek.message.buttonsResponseMessage.selectedButtonId : null,
    mek && mek.message && mek.message.listResponseMessage && mek.message.listResponseMessage.singleSelectReply ? mek.message.listResponseMessage.singleSelectReply.selectedRowId : null,
  ];

  direct.forEach((item) => {
    if (item) {
      texts.push(String(item).trim());
    }
  });

  let p1 = null;
  if (m && m.message && m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.nativeFlowResponseMessage) {
    p1 = m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }
  let p2 = null;
  if (mek && mek.message && mek.message.interactiveResponseMessage && mek.message.interactiveResponseMessage.nativeFlowResponseMessage) {
    p2 = mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }

  [p1, p2].forEach((raw) => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id) texts.push(String(parsed.id).trim());
        if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
        if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
        if (parsed.title) texts.push(String(parsed.title).trim());
        if (parsed.name) texts.push(String(parsed.name).trim());
      } catch (e) {}
    }
  });

  return [...new Set(texts.filter(Boolean))];
}

function resolveMenuAction(texts, state) {
  for (let i = 0; i < texts.length; i++) {
    const rawText = texts[i];
    const text = normalizeText(rawText);

    if (text === "≡ LIST MENU") return { type: "all" };
    if (text === ".MENU_ALL") return { type: "all" };
    if (text === "MENU_VIEW:ALL") return { type: "all" };

    if (rawText.startsWith(".menu_view ")) {
      return { type: "view", cat: rawText.replace(".menu_view ", "").trim().toUpperCase() };
    }
    if (text.startsWith("MENU_VIEW:")) {
      return { type: "view", cat: text.replace("MENU_VIEW:", "").trim() };
    }

    const categories = state.categories;
    if (categories) {
      for (let j = 0; j < categories.length; j++) {
        const cat = categories[j];
        const catText = normalizeText(cat);
        if (text === catText + " MENU") return { type: "view", cat: cat };
        if (text === catText + " COMMANDS") return { type: "view", cat: cat };
        if (text === catText) return { type: "view", cat: cat };
      }
    }
  }
  return null;
}

async function safeSendImageOrText(sock, from, imgUrl, caption, mek) {
  try {
    const buffer = await getFittedImageBuffer(imgUrl);
    if (buffer) {
      return await sock.sendMessage(
        from,
        {
          image: buffer,
          caption: caption,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );
    } else {
      throw new Error("Buffer conversion failed");
    }
  } catch (err) {
    return await sock.sendMessage(
      from,
      {
        text: caption,
        contextInfo: channelContextInfo(),
      },
      { quoted: mek }
    );
  }
}

async function sendCommandsList(sock, from, mek, cat, list, userName, sessionId, botDisplayName) {
  let headerImg = DEFAULT_HEADER_IMAGE;
  if (sessionId) {
    try {
      const custom = await getCustomImage(sessionId, "menu_header");
      if (custom) {
        if (custom.data) {
          headerImg = custom.data;
        }
      }
    } catch (e) {}
  }
  return await safeSendImageOrText(
    sock,
    from,
    headerImg,
    commandListCaption(cat, list, userName, botDisplayName),
    mek
  );
}

/* ================= COMMAND: .menu ================= */
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

      const latencyMs = Date.now() - startTimestamp;
      const latencyStr = latencyMs + "ms";

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) {
        return reply("❌ No commands found!");
      }

      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      let botDisplayName = DEFAULT_BOT_NAME;
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings) {
          if (settings.bot_name) {
            botDisplayName = String(settings.bot_name).trim();
          }
          if (typeof settings.btns_enabled !== "undefined") {
            btnsOn = Boolean(settings.btns_enabled);
          }
        }
      } catch (e) {}

      const state = {
        menuMsgId: null,
        map: map,
        categories: categories,
        userName: userName,
        sessionId: sessionId,
        botDisplayName: botDisplayName,
        createdAt: Date.now(),
      };

      let headerImg = DEFAULT_HEADER_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom) {
            if (custom.data) {
              headerImg = custom.data;
            }
          }
        } catch (e) {}
      }

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const listRows = categories.map((cat) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${state.map[cat].length} commands available`,
            id: `.menu_view ${cat}`,
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuHeader(userName, latencyStr, botDisplayName))
            .setFooter(`© 2026 ${BRAND_BASE} SYSTEM`);

          if (fittedThumb) {
            btn.setThumbnail(fittedThumb);
          }

          btn.addRawButton({
            buttonId: ".menu_all",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Click Here ↯",
                sections: [
                  {
                    title: "Command Categories",
                    rows: listRows,
                  },
                ],
              }),
            },
          });

          btn.addButton("📊 Ping", ".ping");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg) {
            if (sentMsg.key) {
              if (sentMsg.key.id) {
                state.menuMsgId = sentMsg.key.id;
                pendingMenu[k] = state;
                return;
              }
            }
          }
        } catch (err) {
          console.log("BUTTONV2 SEND ERROR:", err ? err.message : err);
        }
      }

      const sentMsg = await safeSendImageOrText(
        sock,
        from,
        headerImg,
        buildStyledMainMenu(state, userName, latencyStr, botDisplayName),
        mek
      );

      if (sentMsg) {
        if (sentMsg.key) {
          if (sentMsg.key.id) {
            state.menuMsgId = sentMsg.key.id;
            pendingMenu[k] = state;
          }
        }
      }
    } catch (e) {
      console.log("MENU ERROR:", e ? e.message : e);
      let errMsg = "";
      if (e) {
        if (e.message) {
          errMsg = e.message;
        } else {
          errMsg = e;
        }
      }
      reply("❌ Cannot send menu: " + errMsg);
    }
  }
);

/* ================= REPLY HANDLER ================= */
const menuReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    if (resolveMenuAction(texts, state)) {
      return true;
    }

    let input = "";
    if (text) {
      input = String(text).trim();
    }
    const num = parseInt(input, 10);
    let isNum = false;
    if (!isNaN(num)) {
      if (num > 0) {
        if (num <= state.categories.length) {
          isNum = true;
        }
      }
    }

    const quotedId = getQuotedId(m, mek);
    let isQuoted = false;
    if (quotedId) {
      if (quotedId === state.menuMsgId) {
        isQuoted = true;
      }
    }

    if (isQuoted) {
      if (isNum) {
        return true;
      }
    }
    return false;
  },
  function: async (sock, mek, m, { from, body, sender, pushname, reply, sessionId }) => {
    try {
      const k = keyFor(sender, from);
      const state = pendingMenu[k];
      if (!state) return;

      const texts = extractTexts(body, mek, m);
      let action = resolveMenuAction(texts, state);

      if (!action) {
        let input = "";
        if (body) {
          input = String(body).trim();
        }
        const num = parseInt(input, 10);
        if (!isNaN(num)) {
          if (num > 0) {
            if (num <= state.categories.length) {
              action = { type: "view", cat: state.categories[num - 1] };
            }
          }
        }
      }

      if (!action) return;

      const now = Date.now();
      let catSig = "";
      if (action.cat) {
        catSig = action.cat;
      }
      const sig = action.type + "_" + catSig;
      const lastMsg = lastProcessedMsg[k];

      if (lastMsg) {
        if (lastMsg.text === sig) {
          if (now - lastMsg.time < LOOP_COOLDOWN) {
            return;
          }
        }
      }
      lastProcessedMsg[k] = { text: sig, time: now };

      let userName = state.userName;
      if (!userName) {
        userName = getUserName(pushname, m, mek, sender);
      }

      let botDisplayName = state.botDisplayName;
      if (!botDisplayName) {
        botDisplayName = DEFAULT_BOT_NAME;
      }

      let sid = sessionId;
      if (!sid) {
        sid = state.sessionId;
      }

      if (action.type === "all") {
        let headerImg = DEFAULT_HEADER_IMAGE;
        if (sid) {
          try {
            const custom = await getCustomImage(sid, "menu_header");
            if (custom) {
              if (custom.data) {
                headerImg = custom.data;
              }
            }
          } catch (e) {}
        }
        const sent = await safeSendImageOrText(
          sock,
          from,
          headerImg,
          buildStyledMainMenu(state, userName, "0ms", botDisplayName),
          mek
        );
        if (sent) {
          if (sent.key) {
            if (sent.key.id) {
              state.menuMsgId = sent.key.id;
            }
          }
        }
        return;
      }

      const cat = action.cat;
      let list = [];
      if (state.map[cat]) {
        list = state.map[cat];
      }

      if (!list.length) {
        return reply("❌ No commands found in this category.");
      }

      state.createdAt = Date.now();

      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(cat), key: mek.key },
      });

      return await sendCommandsList(sock, from, mek, cat, list, userName, sid, botDisplayName);
    } catch (e) {
      console.log("MENU ACTION ERROR:", e ? e.message : e);
    }
  },
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(menuReplyHandler);
}

/* ================= AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const keys = Object.keys(pendingMenu);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (now - pendingMenu[k].createdAt > 3 * 60 * 1000) {
      delete pendingMenu[k];
    }
  }
  const lastKeys = Object.keys(lastProcessedMsg);
  for (let i = 0; i < lastKeys.length; i++) {
    const k = lastKeys[i];
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 30000);

module.exports = { pendingMenu };
