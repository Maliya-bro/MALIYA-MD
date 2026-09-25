const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = Object.create(null);
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2500;

/* ============ CONFIG ============ */
const BOT_NAME = "𝕄𝔸𝕃𝕀𝕐𝔸-𝕄𝔻";
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

const OWNER_NAME =
  String(config.OWNER_NAME || config.BOT_NAME || "Owner").trim() || "Owner";

const DEFAULT_HEADER_IMAGE =
  "https://i.ibb.co/4pDNDk1/avatar.png";

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
  if (c.includes("CONFIG")) return "⚙️";
  if (c.includes("MAIN")) return "📜";
  if (c.includes("EDUCATION")) return "📚";
  if (c.includes("MOVIE")) return "🎞️";
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

function menuHeader(userName = "User") {
  const { time, date } = nowLK();
  const styledUser = toSmallCaps(userName);
  return `👋 *HI ${styledUser}*

╭─ 「 *BOT'S MENU* 」
│ 👾 *Bot :* ${BOT_NAME}
│ 👤 *User :* ${styledUser}
│ ☎️ *Owner :* ${OWNER_NUMBER}
│ 🕒 *Time :* ${time}
│ 📅 *Date :* ${date}
│ 🎯 *Prefix :* [ ${PREFIX} ]
╰───────────────┈➤

🎀 *≡ Select a Command List: ≡*

🌐 *Web:* https://maliya-md.replit.app`;
}

function commandListCaption(cat, list, userName = "User") {
  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  const styledUser = toSmallCaps(userName);
  let txt = `╭⊱─── ⋆ ⋅ 𖤐 ⋅ ⋆ ──⊰┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰⊱─── ⋆ ⋅ 𖤐 ⋅ ⋆ ──⊰┈➤\n\n`;
  txt += `👤 *ᴜsᴇʀ :* ${styledUser}\n📦 *ᴛᴏᴛᴀʟ :* ${list.length} Commands\n🎯 *ᴘʀᴇғɪx :* [ ${PREFIX} ]\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `${PREFIX}${toSmallCaps(c.pattern)}` : "No Pattern";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${toSmallCaps(a)}`);
    txt += `🔹 *${primary}*\n`;
    if (aliases.length) txt += `  ├ 💬 *ᴀʟɪᴀs:* \`${aliases.join(", ")}\`\n`;
    txt += `  ╰ 📌 *ᴅᴇsᴄ:* _${c.desc || "No description"}_\n\n`;
  });

  txt += `──────✦❘•❘✦──────\n> 👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BOT_NAME}`;
  return txt;
}

function buildStyledMainMenu(state, userName) {
  const { categories } = state;
  const styledUser = toSmallCaps(userName);
  let msg = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *${BOT_NAME}* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
  msg += `✨ 👋 *ʜɪ, ${styledUser}!*\n\n`;
  categories.forEach((cat, idx) => {
    const emo = getCategoryEmoji(cat);
    const numStr = String(idx + 1).padStart(2, "0");
    msg += `*[ ${numStr} ]*  ${emo}  *${toSmallCaps(cat)}*  _(${state.map[cat].length})_\n`;
  });
  msg += `\n⊱─── ⋆ ⋅ 𖤐 ⋅ ⋆ ──⊰┈➤\n> 💬 *Swipe & Reply this message with a number...*`;
  return msg;
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
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

function resolveMenuAction(texts, state) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);
  for (const text of normalized) {
    if (text.startsWith("MENU_VIEW:")) {
      return { type: "view", cat: text.replace("MENU_VIEW:", "").trim() };
    }
    if (text.startsWith(".MENU_VIEW")) {
      return { type: "view", cat: text.replace(".MENU_VIEW", "").trim() };
    }
    for (const cat of state.categories || []) {
      const catText = normalizeText(cat);
      if (
        text === catText ||
        text === `${catText} COMMANDS` ||
        text === `${catText} MENU` ||
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

async function sendCommandsList(sock, from, mek, cat, list, userName, sessionId) {
  let headerImg = DEFAULT_HEADER_IMAGE;
  if (sessionId) {
    try {
      const custom = await getCustomImage(sessionId, "menu_header");
      if (custom && custom.data) headerImg = custom.data;
    } catch (e) {}
  }

  return await sock.sendMessage(
    from,
    {
      image: { url: headerImg },
      caption: commandListCaption(cat, list, userName),
      contextInfo: channelContextInfo(),
    },
    { quoted: mek }
  );
}

/* ================= COMMAND: .menu ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu"],
    react: "📜",
    desc: "Show command categories with NativeFlow Asitha-MD layout",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      const state = {
        expectedMsgId: null,
        map,
        categories,
        userName,
        sessionId,
        timestamp: Date.now(),
        lastActionSig: "",
        lastActionAt: 0,
      };

      const settings = await readSettings(sessionId);
      const btnsOn = !!settings.btns_enabled;

      let headerImg = DEFAULT_HEADER_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom && custom.data) headerImg = custom.data;
        } catch (e) {}
      }

      if (btnsOn) {
        try {
          // @vanzxy/baileys හි NativeFlow builder ආයාත කර භාවිතය
          const vanzxy = await import("@vanzxy/baileys");
          const NativeFlow = vanzxy.NativeFlow || vanzxy.default?.NativeFlow;

          if (NativeFlow) {
            const listRows = categories.map((cat) => ({
              title: `${getCategoryEmoji(cat)} ${cat.charAt(0) + cat.slice(1).toLowerCase()} Commands`,
              description: `Show ${cat.toLowerCase()} command list`,
              id: `.menu_view ${cat}`,
            }));

            // NativeFlow මඟින් side-by-side List & Quick Reply buttons හැදීම
            const nf = new NativeFlow(sock)
              .setImage(headerImg)
              .setBody(menuHeader(userName))
              .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
              .addSingleSelect("≡ List Menu", "📁 Categories", listRows)
              .addReply("📊 Ping", ".ping");

            const sentMsg = await nf.send(from, { quoted: mek });
            if (sentMsg?.key?.id) state.expectedMsgId = sentMsg.key.id;
            pendingMenu[k] = state;
            return;
          }
        } catch (err) {
          console.log("NATIVE FLOW MENU ERROR:", err?.message || err);
        }
      }

      // Buttons Off විට Numbered Menu එක යැවීම
      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: headerImg },
          caption: buildStyledMainMenu(state, userName),
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );

      if (sentMsg?.key?.id) {
        state.expectedMsgId = sentMsg.key.id;
        pendingMenu[k] = state;
      }
    } catch (e) {
      console.log("MENU ERROR:", e?.message || e);
      reply("❌ Cannot send menu");
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
      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(cat), key: mek.key },
      });

      await sendCommandsList(sock, from, mek, cat, list, userName, sessionId);
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

    const texts = extractTexts(text, mek, m);
    const action = resolveMenuAction(texts, state);
    if (action) return true;

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.categories.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
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

      const texts = extractTexts(body, mek, m);
      let action = resolveMenuAction(texts, state);

      if (!action) {
        const num = parseInt(inputStr, 10);
        if (!isNaN(num) && num > 0 && num <= state.categories.length) {
          action = { type: "view", cat: state.categories[num - 1] };
        }
      }
      if (!action) return;

      if (isDuplicateAction(state, action)) return;

      const userName = state.userName || getUserName(pushname, m, mek, sender);
      const cat = action.cat;
      const list = state.map[cat] || [];
      if (!list.length) {
        return reply("❌ No commands found in this category.");
      }

      state.timestamp = Date.now();

      await sock.sendMessage(from, {
        react: { text: getCategoryEmoji(cat), key: mek.key },
      });

      return await sendCommandsList(sock, from, mek, cat, list, userName, state.sessionId);
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
