const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = Object.create(null);
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2500;

/* ============ PERMANENT BRANDING (DO NOT CHANGE) ============ */
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

const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

/* ============ CACHE ============ */
let cachedMenu = null;
let cacheTime = 0;
const MENU_CACHE_MS = 60 * 1000;

/* ================= HELPERS ================= */
function keyFor(sender, from) {
  return `${from || ""}`;
}

function getQuotedId(m, mek) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    m?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

function cleanPhone(num = "") {
  return String(num).replace(/[^\d]/g, "");
}

function sameNumber(a = "", b = "") {
  return cleanPhone(a) === cleanPhone(b);
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

function getUserName(pushname, m, mek, sender = "") {
  const candidates = [
    pushname,
    m?.pushName,
    mek?.pushName,
    m?.name,
    mek?.name,
    m?.notifyName,
    mek?.notifyName,
    m?.chatName,
    mek?.chatName,
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

function normalizeText(s = "") {
  return String(s)
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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
    const inputBuf = Buffer.from(res.data);
    return await sharp(inputBuf)
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return url;
  }
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
🌸 *Video* https://youtube.com/shorts/sxWbUypZG64?si=ZNPWj8kLWEjRM1tf`;
}

function buildStyledMainMenu(state, userName, latency = "0ms", botDisplayName = DEFAULT_BOT_NAME) {
  const { categories } = state;
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
    msg += `*[ ${numStr} ]*  ${emo}  *${styledCat}*  _(${state.map[cat].length})_\n`;
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

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body,
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
  ];
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id) texts.push(String(parsed.id).trim());
      if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
      if (parsed.title) texts.push(String(parsed.title).trim());
      if (parsed.name) texts.push(String(parsed.name).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

function resolveMenuAction(texts, state) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);
  for (const text of normalized) {
    if (text === "≡ LIST MENU" || text === ".MENU_ALL" || text === "MENU_VIEW:ALL") {
      return { type: "all" };
    }
    if (text.startsWith("MENU_VIEW:")) {
      return { type: "view", cat: text.replace("MENU_VIEW:", "").trim() };
    }
    if (text.startsWith(".MENU_VIEW")) {
      return { type: "view", cat: text.replace(".MENU_VIEW", "").trim() };
    }
    for (const cat of state.categories || []) {
      const catText = normalizeText(cat);
      if (
        text === `${catText} MENU` ||
        text.includes(`${catText} MENU`) ||
        text === `${catText} COMMANDS` ||
        text.includes(`${catText} COMMANDS`)
      ) {
        return { type: "view", cat };
      }
    }
  }
  return null;
}

function isDuplicateAction(state, action) {
  const now = Date.now();
  const sig = `${action.type}:${action.cat || ""}`;
  if (state.lastActionSig === sig && now - (state.lastActionAt || 0) < 2500) {
    return true;
  }
  state.lastActionSig = sig;
  state.lastActionAt = now;
  return false;
}

async function safeSendImageOrText(sock, from, imgUrl, caption, mek) {
  try {
    return await sock.sendMessage(
      from,
      {
        image: { url: imgUrl },
        caption: caption,
        contextInfo: channelContextInfo(),
      },
      { quoted: mek }
    );
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
      if (custom && custom.data) headerImg = custom.data;
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
      const latencyStr = `${latencyMs}ms`;

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      // 🔥 Settings වලින් User ගේ Custom Bot Name එක කියවමු
      let botDisplayName = DEFAULT_BOT_NAME;
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) {
          botDisplayName = String(settings.bot_name).trim();
        }
        if (settings && typeof settings.btns_enabled !== "undefined") {
          btnsOn = !!settings.btns_enabled;
        }
      } catch (e) {}

      const state = {
        expectedMsgId: null,
        map,
        categories,
        userName,
        sessionId,
        botDisplayName,
        timestamp: Date.now(),
        lastActionSig: "",
        lastActionAt: 0,
      };

      let headerImg = DEFAULT_HEADER_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom && custom.data) headerImg = custom.data;
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
            .setFooter(`© 2026 ${BRAND_BASE} SYSTEM`)
            .setThumbnail(fittedThumb);

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

          if (sentMsg?.key?.id) {
            state.expectedMsgId = sentMsg.key.id;
            pendingMenu[k] = state;
            return;
          }
        } catch (err) {
          console.log("BUTTONV2 SEND ERROR:", err?.message || err);
        }
      }

      const sentMsg = await safeSendImageOrText(
        sock,
        from,
        headerImg,
        buildStyledMainMenu(state, userName, latencyStr, botDisplayName),
        mek
      );

      if (sentMsg?.key?.id) {
        state.expectedMsgId = sentMsg.key.id;
        pendingMenu[k] = state;
      }
    } catch (e) {
      console.log("MENU ERROR:", e?.message || e);
      reply("❌ Cannot send menu: " + (e?.message || e));
    }
  }
);

/* ================= COMMAND: .menu_all ================= */
cmd(
  {
    pattern: "menu_all",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, sessionId }) => {
    try {
      const startTimestamp = Date.now();
      const latencyStr = `${Date.now() - startTimestamp}ms`;

      const { map, categories } = buildCommandMapCached();
      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      let headerImg = DEFAULT_HEADER_IMAGE;
      let botDisplayName = DEFAULT_BOT_NAME;
      if (sessionId) {
        try {
          const settings = await readSettings(sessionId);
          if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom && custom.data) headerImg = custom.data;
        } catch (e) {}
      }

      const state = pendingMenu[k] || {
        expectedMsgId: null,
        map,
        categories,
        userName,
        sessionId,
        botDisplayName,
        timestamp: Date.now(),
      };

      const sentMsg = await safeSendImageOrText(
        sock,
        from,
        headerImg,
        buildStyledMainMenu(state, userName, latencyStr, botDisplayName),
        mek
      );

      if (sentMsg?.key?.id) {
        state.expectedMsgId = sentMsg.key.id;
        pendingMenu[k] = state;
      }
    } catch (e) {
      console.log("MENU ALL ERROR:", e);
    }
  }
);

/* ================= COMMAND: .menu_view ================= */
cmd(
  {
    pattern: "menu_view",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, pushname, reply, sessionId }) => {
    try {
      const cat = String(q || "").trim().toUpperCase();
      const { map } = buildCommandMapCached();
      const list = map[cat] || [];
      if (!list.length) return reply("❌ No commands found in this category.");

      const userName = getUserName(pushname, m, mek, sender);
      let botDisplayName = DEFAULT_BOT_NAME;
      if (sessionId) {
        try {
          const settings = await readSettings(sessionId);
          if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        } catch (e) {}
      }

      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(cat), key: mek.key },
      });

      await sendCommandsList(sock, from, mek, cat, list, userName, sessionId, botDisplayName);
    } catch (e) {
      console.log("MENU VIEW ERROR:", e);
    }
  }
);

/* ================= REPLY HANDLER ================= */
const menuReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return false;

    // Quoted message එකේ ID එක සහ checks
    const quotedId = getQuotedId(m, mek);
    const isQuoted = !!(quotedId && state.expectedMsgId && quotedId === state.expectedMsgId);

    // Interactive button / list clicks සඳහා
    const texts = extractTexts(text, mek, m);
    const action = resolveMenuAction(texts, state);
    if (action) return true;

    // Number එකක් ගහනවා නම් quote කරලා තිබීම අනිවාර්යයි
    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.categories.length;

    return isQuoted && isNum;
  },
  function: async (sock, mek, m, { from, body, sender, pushname, reply }) => {
    try {
      const k = keyFor(sender, from);
      const state = pendingMenu[k];
      if (!state) return;

      const inputStr = String(body || "").trim();
      const now = Date.now();
      const lastMsg = lastProcessedMsg[k];
      if (lastMsg && lastMsg.text === inputStr && (now - lastMsg.time) < LOOP_COOLDOWN) return;
      lastProcessedMsg[k] = { text: inputStr, time: now };

      const quotedId = getQuotedId(m, mek);
      const isQuoted = !!(quotedId && state.expectedMsgId && quotedId === state.expectedMsgId);

      const texts = extractTexts(body, mek, m);
      let action = resolveMenuAction(texts, state);

      // Action එකක් නැතිව number එකක් විදිහට එනවා නම් quote කරලා තියෙන එක අනිවාර්යයි
      if (!action) {
        if (!isQuoted) return;

        const num = parseInt(inputStr, 10);
        if (!isNaN(num) && num > 0 && num <= state.categories.length) {
          action = { type: "view", cat: state.categories[num - 1] };
        }
      }
      if (!action) return;

      if (isDuplicateAction(state, action)) return;

      const userName = state.userName || getUserName(pushname, m, mek, sender);
      const botDisplayName = state.botDisplayName || DEFAULT_BOT_NAME;

      if (action.type === "all") {
        let headerImg = DEFAULT_HEADER_IMAGE;
        if (state.sessionId) {
          try {
            const custom = await getCustomImage(state.sessionId, "menu_header");
            if (custom && custom.data) headerImg = custom.data;
          } catch (e) {}
        }
        const sent = await safeSendImageOrText(
          sock,
          from,
          headerImg,
          buildStyledMainMenu(state, userName, "0ms", botDisplayName),
          mek
        );
        if (sent?.key?.id) state.expectedMsgId = sent.key.id;
        return;
      }

      const cat = action.cat;
      const list = state.map[cat] || [];
      if (!list.length) {
        return reply("❌ No commands found in this category.");
      }

      state.timestamp = Date.now();

      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(cat), key: mek.key },
      });

      return await sendCommandsList(sock, from, mek, cat, list, userName, state.sessionId, botDisplayName);
    } catch (e) {
      console.log("MENU ACTION ERROR:", e?.message || e);
    }
  },
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(menuReplyHandler);
}

/* ================= AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const timeout = 3 * 60 * 1000;
  for (const k of Object.keys(pendingMenu)) {
    if (now - pendingMenu[k].timestamp > timeout) {
      delete pendingMenu[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 30 * 1000);

module.exports = { pendingMenu };
