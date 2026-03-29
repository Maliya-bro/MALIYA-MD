const { cmd, commands } = require("../command");
const { sendInteractiveMessage } = require("gifted-btns");
const config = require("../config");

const pendingMenu = Object.create(null);

/* ============ CONFIG ============ */
const BOT_NAME = "MALIYA-MD";
const PREFIX = ".";
const TZ = "Asia/Colombo";

const OWNER_NUMBER_RAW = String(config.BOT_OWNER || "").trim();
const OWNER_NUMBER = OWNER_NUMBER_RAW.startsWith("+")
  ? OWNER_NUMBER_RAW
  : OWNER_NUMBER_RAW
  ? `+${OWNER_NUMBER_RAW}`
  : "Not Set";

const OWNER_NAME =
  String(config.OWNER_NAME || config.BOT_NAME || "Owner").trim() || "Owner";

const headerImage =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png";

/* ============ CACHE ============ */
let cachedMenu = null;
let cacheTime = 0;
const MENU_CACHE_MS = 60 * 1000;

/* ================= HELPERS ================= */
function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function cleanPhone(num = "") {
  return String(num).replace(/[^\d]/g, "");
}

function sameNumber(a = "", b = "") {
  return cleanPhone(a) === cleanPhone(b);
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
  if (cachedMenu && now - cacheTime < MENU_CACHE_MS) {
    return cachedMenu;
  }

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

  return `👋 HI ${userName}

┏━〔 BOT'S MENU 〕━⬣
┃ 🤖 Bot     : ${BOT_NAME}
┃ 👤 User    : ${userName}
┃ 👑 Owner   : ${OWNER_NUMBER}
┃ 🕒 Time    : ${time}
┃ 📅 Date    : ${date}
┃ ✨ Prefix  : ${PREFIX}
┗━━━━━━━━━━━━⬣

🎀 Select a Command List Below`;
}

function commandListCaption(cat, list, userName = "User") {
  const emo = getCategoryEmoji(cat);
  let txt = `👋 HI ${userName}\n\n`;
  txt += `┏━〔 ${emo} ${cat} COMMANDS 〕━⬣\n`;
  txt += `┃ 📦 Total : ${list.length}\n`;
  txt += `┃ ✨ Prefix: ${PREFIX}\n`;
  txt += `┗━━━━━━━━━━━━⬣\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `${PREFIX}${c.pattern}` : "No Pattern";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${a}`);

    txt += `• *${primary}*\n`;
    if (aliases.length) txt += `   ◦ Aliases: ${aliases.join(", ")}\n`;
    txt += `   ⭕ ${c.desc || "No description"}\n\n`;
  });

  txt += `━━━━━━━━━━━━━━━━━━\n`;
  txt += `👑 Owner: ${OWNER_NUMBER}`;

  return txt;
}

function makeCategoryRows(map, categories) {
  return categories.map((cat) => {
    const emo = getCategoryEmoji(cat);
    return {
      title: `${emo} ${cat} MENU`,
      description: `${map[cat].length} commands available`,
      id: `menu_view:${cat}`,
    };
  });
}

function tryParseJsonString(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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
    m?.message?.templateButtonReplyMessage?.selectedId,
    m?.message?.templateButtonReplyMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.buttonsResponseMessage?.selectedDisplayText,
    mek?.message?.templateButtonReplyMessage?.selectedId,
    mek?.message?.templateButtonReplyMessage?.selectedDisplayText,
    mek?.message?.listResponseMessage?.title,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ];

  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;

  for (const raw of [p1, p2]) {
    if (!raw) continue;
    const parsed = tryParseJsonString(raw);
    if (!parsed) continue;

    const vals = [
      parsed.id,
      parsed.selectedId,
      parsed.selectedRowId,
      parsed.title,
      parsed.display_text,
      parsed.text,
      parsed.name,
    ];

    for (const v of vals) {
      if (v) texts.push(String(v).trim());
    }
  }

  return [...new Set(texts.filter(Boolean))];
}

function resolveMenuAction(texts, state) {
  const normalized = texts.map((t) => normalizeText(t)).filter(Boolean);

  for (const text of normalized) {
    if (text.startsWith("MENU_VIEW:")) {
      return { type: "view", cat: text.replace("MENU_VIEW:", "").trim() };
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

async function sendMainMenu(sock, from, mek, state, userName) {
  return sendInteractiveMessage(
    sock,
    from,
    {
      image: { url: headerImage },
      text: menuHeader(userName),
      footer: `${BOT_NAME} | Interactive Menu`,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Click Here ↯",
            sections: [
              {
                title: "Command Categories",
                rows: makeCategoryRows(state.map, state.categories),
              },
            ],
          }),
        },
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "🌐 Official Website",
            url: "https://web-pair--sithmikavihara8.replit.app",
          }),
        },
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Owner Number",
            copy_code: OWNER_NUMBER,
          }),
        },
      ],
    },
    { quoted: mek }
  );
}

async function sendCommandsList(sock, from, mek, cat, list, userName) {
  return sock.sendMessage(
    from,
    {
      image: { url: headerImage },
      caption: commandListCaption(cat, list, userName),
    },
    { quoted: mek }
  );
}

/* ================= COMMAND: .menu ================= */
cmd(
  {
    pattern: "menu",
    react: "📜",
    desc: "Show command categories",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const userName = getUserName(pushname, m, mek, sender);
      const k = keyFor(sender, from);

      pendingMenu[k] = {
        map,
        categories,
        userName,
        timestamp: Date.now(),
        lastActionSig: "",
        lastActionAt: 0,
      };

      await sendMainMenu(sock, from, mek, pendingMenu[k], userName);
    } catch (e) {
      console.log("MENU ERROR:", e?.message || e);
      reply("❌ Menu eka send karanna බැරි වුණා.");
    }
  }
);

/* ================= REPLY HANDLER ================= */
cmd(
  {
    filter: (_text, { sender, from }) => {
      const k = keyFor(sender, from);
      return !!pendingMenu[k];
    },
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, from, sender, pushname, reply }) => {
    try {
      const k = keyFor(sender, from);
      const state = pendingMenu[k];
      if (!state) return;

      const texts = extractTexts(body, mek, m);
      const action = resolveMenuAction(texts, state);
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

      return sendCommandsList(sock, from, mek, cat, list, userName);
    } catch (e) {
      console.log("MENU ACTION ERROR:", e?.message || e);
    }
  }
);

/* ================= AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000;

  for (const k of Object.keys(pendingMenu)) {
    if (now - pendingMenu[k].timestamp > timeout) {
      delete pendingMenu[k];
    }
  }
}, 30 * 1000);

module.exports = { pendingMenu };
