// ╔══════════════════════════════════════════════════════════════╗
// ║                 MALIYA-MD — MENU PLUGIN                    ║
// ║        Web / Desktop / Android Compatible Menu             ║
// ║                                                              ║
// ║  FIXED:                                                      ║
// ║  - Removed gifted-btns                                       ║
// ║  - Uses @itsliaaa/baileys native interactive messages       ║
// ║  - Web/Desktop compatible native flow                       ║
// ║  - Main menu + category selector                            ║
// ║  - Official Website button                                  ║
// ║  - Copy Owner Number button                                 ║
// ║  - Reply handler supports nativeFlowResponseMessage         ║
// ╚══════════════════════════════════════════════════════════════╝

const { cmd, commands } = require("../command");
const config = require("../config");

// ============================================================
// CONFIG
// ============================================================

const BOT_NAME = "MALIYA-MD";
const PREFIX = ".";
const TZ = "Asia/Colombo";

const WEBSITE = "https://maliya-md.replit.app";

const OWNER_NUMBER_RAW = String(config.BOT_OWNER || "").trim();

const OWNER_NUMBER = OWNER_NUMBER_RAW.startsWith("+")
  ? OWNER_NUMBER_RAW
  : OWNER_NUMBER_RAW
    ? `+${OWNER_NUMBER_RAW}`
    : "Not Set";

const OWNER_NAME =
  String(
    config.OWNER_NAME ||
    config.BOT_NAME ||
    "Owner"
  ).trim() || "Owner";

const headerImage =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png";

// ============================================================
// STATE
// ============================================================

const pendingMenu = Object.create(null);

// ============================================================
// CACHE
// ============================================================

let cachedMenu = null;
let cacheTime = 0;

const MENU_CACHE_MS = 60 * 1000;

// ============================================================
// HELPERS
// ============================================================

function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

// ------------------------------------------------------------

function cleanPhone(num = "") {
  return String(num).replace(/[^\d]/g, "");
}

// ------------------------------------------------------------

function sameNumber(a = "", b = "") {
  return cleanPhone(a) === cleanPhone(b);
}

// ------------------------------------------------------------

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

  if (
    sameNumber(
      sender.split("@")[0].split(":")[0],
      OWNER_NUMBER
    )
  ) {
    return OWNER_NAME;
  }

  const num = String(sender || "")
    .split("@")[0]
    .split(":")[0];

  return num || "User";
}

// ------------------------------------------------------------

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

  return {
    time,
    date,
  };
}

// ------------------------------------------------------------

function normalizeText(s = "") {
  return String(s)
    .replace(/\r/g, "")
    .replace(/\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// ============================================================
// CATEGORY EMOJIS
// ============================================================

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

// ============================================================
// COMMAND MAP
// ============================================================

function buildCommandMapCached() {
  const now = Date.now();

  if (
    cachedMenu &&
    now - cacheTime < MENU_CACHE_MS
  ) {
    return cachedMenu;
  }

  const map = Object.create(null);

  for (const c of commands) {
    if (c.dontAddCommandList) continue;

    const cat = (
      c.category ||
      "MISC"
    ).toUpperCase();

    (map[cat] ||= []).push(c);
  }

  const categories = Object.keys(map).sort(
    (a, b) => a.localeCompare(b)
  );

  for (const cat of categories) {
    map[cat].sort(
      (a, b) =>
        (a.pattern || "").localeCompare(
          b.pattern || ""
        )
    );
  }

  cachedMenu = {
    map,
    categories,
  };

  cacheTime = now;

  return cachedMenu;
}

// ============================================================
// MAIN MENU TEXT
// ============================================================

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

// ============================================================
// CATEGORY LIST
// ============================================================

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

// ============================================================
// COMMAND LIST CAPTION
// ============================================================

function commandListCaption(
  cat,
  list,
  userName = "User"
) {
  const emo = getCategoryEmoji(cat);

  let txt = `👋 HI ${userName}\n\n`;

  txt += `┏━〔 ${emo} ${cat} COMMANDS 〕━⬣\n`;
  txt += `┃ 📦 Total : ${list.length}\n`;
  txt += `┃ ✨ Prefix: ${PREFIX}\n`;
  txt += `┗━━━━━━━━━━━━⬣\n\n`;

  list.forEach((c) => {
    const primary = c.pattern
      ? `${PREFIX}${c.pattern}`
      : "No Pattern";

    const aliases = (c.alias || [])
      .filter(Boolean)
      .map((a) => `${PREFIX}${a}`);

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

// ============================================================
// JSON PARSER
// ============================================================

function tryParseJsonString(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ============================================================
// EXTRACT BUTTON RESPONSES
// ============================================================

function extractTexts(body, mek, m) {
  const texts = [];

  const direct = [
    body,

    // Normal text
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,

    // Old buttons
    m?.message?.buttonsResponseMessage
      ?.selectedButtonId,

    m?.message?.buttonsResponseMessage
      ?.selectedDisplayText,

    // Template
    m?.message?.templateButtonReplyMessage
      ?.selectedId,

    m?.message?.templateButtonReplyMessage
      ?.selectedDisplayText,

    // List
    m?.message?.listResponseMessage
      ?.title,

    m?.message?.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId,

    // Native Flow
    m?.message?.interactiveResponseMessage
      ?.body?.text,

    m?.message?.interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson,

    // MEK
    mek?.message?.conversation,

    mek?.message?.extendedTextMessage?.text,

    mek?.message?.buttonsResponseMessage
      ?.selectedButtonId,

    mek?.message?.buttonsResponseMessage
      ?.selectedDisplayText,

    mek?.message?.templateButtonReplyMessage
      ?.selectedId,

    mek?.message?.templateButtonReplyMessage
      ?.selectedDisplayText,

    mek?.message?.listResponseMessage
      ?.title,

    mek?.message?.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId,

    mek?.message?.interactiveResponseMessage
      ?.body?.text,

    mek?.message?.interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson,
  ];

  for (const item of direct) {
    if (item) {
      texts.push(String(item).trim());
    }
  }

  const p1 =
    m?.message?.interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson;

  const p2 =
    mek?.message?.interactiveResponseMessage
      ?.nativeFlowResponseMessage
      ?.paramsJson;

  for (const raw of [p1, p2]) {
    if (!raw) continue;

    const parsed =
      tryParseJsonString(raw);

    if (!parsed) continue;

    const vals = [
      parsed.id,
      parsed.selectedId,
      parsed.selectedRowId,
      parsed.title,
      parsed.display_text,
      parsed.text,
      parsed.name,
      parsed.description,
    ];

    for (const v of vals) {
      if (v) {
        texts.push(String(v).trim());
      }
    }
  }

  return [
    ...new Set(
      texts.filter(Boolean)
    ),
  ];
}

// ============================================================
// RESOLVE MENU ACTION
// ============================================================

function resolveMenuAction(
  texts,
  state
) {
  const normalized = texts
    .map((t) => normalizeText(t))
    .filter(Boolean);

  for (const text of normalized) {
    // ------------------------------------------
    // Native flow ID
    // ------------------------------------------

    if (text.startsWith("MENU_VIEW:")) {
      return {
        type: "view",
        cat: text
          .replace("MENU_VIEW:", "")
          .trim(),
      };
    }

    // ------------------------------------------
    // Category matching
    // ------------------------------------------

    for (const cat of state.categories || []) {
      const catText =
        normalizeText(cat);

      if (
        text === `${catText} MENU` ||
        text.includes(`${catText} MENU`) ||
        text === `${catText} COMMANDS` ||
        text.includes(`${catText} COMMANDS`)
      ) {
        return {
          type: "view",
          cat,
        };
      }
    }
  }

  return null;
}

// ============================================================
// DUPLICATE ACTION PROTECTION
// ============================================================

function isDuplicateAction(
  state,
  action
) {
  const now = Date.now();

  const sig =
    `${action.type}:${action.cat || ""}`;

  if (
    state.lastActionSig === sig &&
    now -
      (state.lastActionAt || 0) <
      2500
  ) {
    return true;
  }

  state.lastActionSig = sig;
  state.lastActionAt = now;

  return false;
}

// ============================================================
// MAIN MENU
//
// IMPORTANT:
// No gifted-btns here.
//
// This uses @itsliaaa/baileys nativeFlow
// directly through sock.sendMessage().
// ============================================================

async function sendMainMenu(
  sock,
  from,
  mek,
  state,
  userName
) {
  const categoryRows =
    makeCategoryRows(
      state.map,
      state.categories
    );

  // ----------------------------------------------------------
  // Native flow category selector
  // ----------------------------------------------------------

  const nativeFlow = [
    {
      text: "📋 Click Here ↯",

      sections: [
        {
          title: "Command Categories",

          rows: categoryRows,
        },
      ],
    },

    // --------------------------------------------------------
    // Official website
    // --------------------------------------------------------

    {
      text: "🌐 Official Website",

      url: WEBSITE,

      // Keeps it as a WhatsApp webview-style CTA
      useWebview: true,
    },

    // --------------------------------------------------------
    // Copy owner number
    // --------------------------------------------------------

    {
      text: "📋 Copy Owner Number",

      copy: OWNER_NUMBER,
    },
  ];

  // ----------------------------------------------------------
  // Send using Baileys native interactive support
  // ----------------------------------------------------------

  return await sock.sendMessage(
    from,
    {
      image: {
        url: headerImage,
      },

      caption: menuHeader(userName),

      footer:
        `${BOT_NAME} | Interactive Menu`,

      nativeFlow,

      // Do NOT wrap native flow into another
      // select/list container.
      interactiveAsTemplate: false,
    },
    {
      quoted: mek,
    }
  );
}

// ============================================================
// SEND CATEGORY COMMAND LIST
// ============================================================

async function sendCommandsList(
  sock,
  from,
  mek,
  cat,
  list,
  userName
) {
  return await sock.sendMessage(
    from,
    {
      image: {
        url: headerImage,
      },

      caption:
        commandListCaption(
          cat,
          list,
          userName
        ),
    },
    {
      quoted: mek,
    }
  );
}

// ============================================================
// COMMAND: .menu
// ============================================================

cmd(
  {
    pattern: "menu",

    react: "📜",

    desc:
      "Show command categories",

    category: "main",

    filename: __filename,
  },

  async (
    sock,
    mek,
    m,
    {
      from,
      sender,
      pushname,
      reply,
    }
  ) => {
    try {
      // ------------------------------------------------------
      // React
      // ------------------------------------------------------

      await sock.sendMessage(
        from,
        {
          react: {
            text: "📜",
            key: mek.key,
          },
        }
      );

      // ------------------------------------------------------
      // Get commands
      // ------------------------------------------------------

      const {
        map,
        categories,
      } =
        buildCommandMapCached();

      if (!categories.length) {
        return reply(
          "❌ No commands found!"
        );
      }

      // ------------------------------------------------------
      // Username
      // ------------------------------------------------------

      const userName =
        getUserName(
          pushname,
          m,
          mek,
          sender
        );

      // ------------------------------------------------------
      // User/chat state
      // ------------------------------------------------------

      const k =
        keyFor(
          sender,
          from
        );

      pendingMenu[k] = {
        map,

        categories,

        userName,

        timestamp:
          Date.now(),

        lastActionSig: "",

        lastActionAt: 0,
      };

      // ------------------------------------------------------
      // Send menu
      // ------------------------------------------------------

      await sendMainMenu(
        sock,
        from,
        mek,
        pendingMenu[k],
        userName
      );

    } catch (e) {
      console.log(
        "MENU ERROR:",
        e?.stack ||
          e?.message ||
          e
      );

      return reply(
        "❌ Menu eka send karanna bari una."
      );
    }
  }
);

// ============================================================
// REPLY HANDLER
// ============================================================

cmd(
  {
    filter: (
      _text,
      { sender, from }
    ) => {
      const k =
        keyFor(
          sender,
          from
        );

      return !!pendingMenu[k];
    },

    dontAddCommandList: true,

    filename: __filename,
  },

  async (
    sock,
    mek,
    m,
    {
      body,
      from,
      sender,
      pushname,
      reply,
    }
  ) => {
    try {
      // ------------------------------------------------------
      // Get state
      // ------------------------------------------------------

      const k =
        keyFor(
          sender,
          from
        );

      const state =
        pendingMenu[k];

      if (!state) {
        return;
      }

      // ------------------------------------------------------
      // Extract response
      // ------------------------------------------------------

      const texts =
        extractTexts(
          body,
          mek,
          m
        );

      // Debug if needed
      // console.log("MENU RESPONSE:", texts);

      // ------------------------------------------------------
      // Resolve action
      // ------------------------------------------------------

      const action =
        resolveMenuAction(
          texts,
          state
        );

      if (!action) {
        return;
      }

      // ------------------------------------------------------
      // Duplicate protection
      // ------------------------------------------------------

      if (
        isDuplicateAction(
          state,
          action
        )
      ) {
        return;
      }

      // ------------------------------------------------------
      // Category
      // ------------------------------------------------------

      const userName =
        state.userName ||
        getUserName(
          pushname,
          m,
          mek,
          sender
        );

      const cat =
        action.cat;

      const list =
        state.map[cat] || [];

      // ------------------------------------------------------
      // Empty category
      // ------------------------------------------------------

      if (!list.length) {
        return reply(
          "❌ No commands found in this category."
        );
      }

      // ------------------------------------------------------
      // Update timeout
      // ------------------------------------------------------

      state.timestamp =
        Date.now();

      // ------------------------------------------------------
      // Reaction
      // ------------------------------------------------------

      await sock.sendMessage(
        from,
        {
          react: {
            text:
              getCategoryEmoji(
                cat
              ),

            key: mek.key,
          },
        }
      );

      // ------------------------------------------------------
      // Send commands
      // ------------------------------------------------------

      return await sendCommandsList(
        sock,
        from,
        mek,
        cat,
        list,
        userName
      );

    } catch (e) {
      console.log(
        "MENU ACTION ERROR:",
        e?.stack ||
          e?.message ||
          e
      );
    }
  }
);

// ============================================================
// AUTO CLEANUP
// ============================================================

setInterval(() => {
  const now =
    Date.now();

  const timeout =
    2 * 60 * 1000;

  for (
    const k of Object.keys(
      pendingMenu
    )
  ) {
    if (
      now -
        pendingMenu[k]
          .timestamp >
      timeout
    ) {
      delete pendingMenu[k];
    }
  }
}, 30 * 1000);

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  pendingMenu,
};
