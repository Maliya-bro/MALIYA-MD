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
    if (item && String(item).trim() && !/^\+?\d+$/.test(String(item).trim())) {
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

function getCategoryReact(cat) {
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

  return "📂";
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

function categoryInfoCaption(cat, list, userName = "User") {
  const emo = getCategoryReact(cat);
  return `👋 HI ${userName}

┏━〔 ${emo} ${cat} MENU 〕━⬣
┃ 📦 Total Commands : ${list.length}
┃ ✨ Prefix         : ${PREFIX}
┃ 👑 Owner          : ${OWNER_NUMBER}
┗━━━━━━━━━━━━⬣

Select an option below.`;
}

function commandListCaption(cat, list, userName = "User") {
  const emo = getCategoryReact(cat);
  let txt = `👋 HI ${userName}\n\n`;
  txt += `┏━〔 ${emo} ${cat} COMMANDS 〕━⬣\n`;
  txt += `┃ 📦 Total : ${list.length}\n`;
  txt += `┃ ✨ Prefix: ${PREFIX}\n`;
  txt += `┗━━━━━━━━━━━━⬣\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `${PREFIX}${c.pattern}` : "No Pattern";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${a}`);

    txt += `• *${primary}*\n`;
    if (aliases.length) {
      txt += `   ◦ Aliases: ${aliases.join(", ")}\n`;
    }
    txt += `   ⭕ ${c.desc || "No description"}\n\n`;
  });

  txt += `━━━━━━━━━━━━━━━━━━\n`;
  txt += `👑 Owner: ${OWNER_NUMBER}`;

  return txt;
}

function makeCategoryRows(map, categories) {
  return categories.map((cat) => {
    const emo = getCategoryReact(cat);
    return {
      title: `${emo} ${cat} MENU`,
      description: `${map[cat].length} commands available`,
      id: `menu_cat:${cat}`,
    };
  });
}

function makeRoleRows(cat) {
  const emo = getCategoryReact(cat);
  return [
    {
      title: `${emo} ${cat} Commands`,
      description: "View all commands with aliases and descriptions",
      id: `menu_view:${cat}`,
    },
    {
      title: "🏠 Back To Main Menu",
      description: "Return to the main menu",
      id: `menu_back:main`,
    },
    {
      title: "❌ Close Menu",
      description: "Close this menu session",
      id: `menu_close:now`,
    },
  ];
}

function resolveMenuAction(rawText, state) {
  const text = normalizeText(rawText || "");
  if (!text) return null;

  if (text.startsWith("MENU_CAT:")) {
    return { type: "category", cat: text.replace("MENU_CAT:", "").trim() };
  }

  if (text.startsWith("MENU_VIEW:")) {
    return { type: "view", cat: text.replace("MENU_VIEW:", "").trim() };
  }

  if (text === "MENU_BACK:MAIN") {
    return { type: "back" };
  }

  if (text === "MENU_CLOSE:NOW") {
    return { type: "close" };
  }

  for (const cat of state.categories || []) {
    const emo = normalizeText(getCategoryReact(cat));
    const menuTitle1 = `${cat} MENU`;
    const menuTitle2 = `${emo} ${cat} MENU`;
    const commandsTitle1 = `${cat} COMMANDS`;
    const commandsTitle2 = `${emo} ${cat} COMMANDS`;

    if (
      text.includes(menuTitle1) ||
      text.includes(menuTitle2) ||
      text === menuTitle1 ||
      text === menuTitle2
    ) {
      return { type: "category", cat };
    }

    if (
      text.includes(commandsTitle1) ||
      text.includes(commandsTitle2) ||
      text === commandsTitle1 ||
      text === commandsTitle2 ||
      text.includes("VIEW ALL COMMANDS")
    ) {
      return { type: "view", cat };
    }
  }

  if (text.includes("BACK TO MAIN MENU")) {
    return { type: "back" };
  }

  if (text.includes("CLOSE MENU")) {
    return { type: "close" };
  }

  return null;
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
            url: "https://example.com",
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

async function sendCategoryMenu(sock, from, mek, cat, list, userName) {
  return sendInteractiveMessage(
    sock,
    from,
    {
      image: { url: headerImage },
      text: categoryInfoCaption(cat, list, userName),
      footer: `${BOT_NAME} | ${cat} MENU`,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: `${getCategoryReact(cat)} ${cat} Roles ↯`,
            sections: [
              {
                title: `${cat} Options`,
                rows: makeRoleRows(cat),
              },
            ],
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
        step: "main",
        map,
        categories,
        userName,
        timestamp: Date.now(),
      };

      await sendMainMenu(sock, from, mek, pendingMenu[k], userName);
    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Menu eka send karanna බැරි වුණා.");
    }
  }
);

/* ================= HANDLE MENU BUTTON IDS / VISIBLE TEXT ================= */
cmd(
  {
    filter: (text, { sender, from }) => {
      const k = keyFor(sender, from);
      const state = pendingMenu[k];
      if (!state) return false;

      const raw = String(text || "").trim();
      if (!raw) return false;

      if (
        raw.startsWith("menu_") ||
        raw.includes("MENU") ||
        raw.includes("Back To Main Menu") ||
        raw.includes("Close Menu") ||
        raw.includes("Commands")
      ) {
        return !!resolveMenuAction(raw, state);
      }

      return false;
    },
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, from, sender, pushname, reply }) => {
    try {
      const k = keyFor(sender, from);
      const state = pendingMenu[k];

      if (!state) {
        return reply("⚠️ Menu session expired. Please send *.menu* again.");
      }

      const userName = state.userName || getUserName(pushname, m, mek, sender);
      const action = resolveMenuAction(body, state);

      if (!action) {
        return reply("⚠️ Invalid menu selection. Please use the menu buttons.");
      }

      if (action.type === "close") {
        delete pendingMenu[k];
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
        return reply("✅ Menu closed.");
      }

      if (action.type === "back") {
        state.step = "main";
        state.timestamp = Date.now();
        state.userName = userName;

        await sock.sendMessage(from, { react: { text: "↩️", key: mek.key } });
        return sendMainMenu(sock, from, mek, state, userName);
      }

      if (action.type === "category") {
        const cat = action.cat;
        const list = state.map[cat] || [];

        if (!list.length) {
          return reply("❌ No commands found in this category.");
        }

        state.step = "category";
        state.selectedCategory = cat;
        state.timestamp = Date.now();
        state.userName = userName;

        await sock.sendMessage(from, {
          react: { text: getCategoryReact(cat), key: mek.key },
        });

        return sendCategoryMenu(sock, from, mek, cat, list, userName);
      }

      if (action.type === "view") {
        const cat = action.cat || state.selectedCategory;
        const list = state.map[cat] || [];

        if (!list.length) {
          return reply("❌ No commands found in this category.");
        }

        state.step = "command_view";
        state.selectedCategory = cat;
        state.timestamp = Date.now();
        state.userName = userName;

        await sock.sendMessage(from, {
          react: { text: getCategoryReact(cat), key: mek.key },
        });

        return sendCommandsList(sock, from, mek, cat, list, userName);
      }
    } catch (e) {
      console.log("MENU ACTION ERROR:", e);
      reply("❌ Menu action eka process karanna බැරි වුණා.");
    }
  }
);

/* ================= AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000; // 2 minutes

  for (const k of Object.keys(pendingMenu)) {
    if (now - pendingMenu[k].timestamp > timeout) {
      delete pendingMenu[k];
    }
  }
}, 30 * 1000);

module.exports = { pendingMenu };
