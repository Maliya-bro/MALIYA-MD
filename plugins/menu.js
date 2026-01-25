const { cmd, commands } = require("../command");

const pendingMenu = Object.create(null);
const numberEmojis = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

/* ============ CONFIG (ඔයා කැමති නම් මෙතන change කරන්න) ============ */
const BOT_NAME = "MALIYA-MD";
const OWNER_NAME = "Malindu";     // owner name show කරන්න
const PREFIX = ".";               // bot prefix show කරන්න
const TZ = "Asia/Colombo";

const headerImage =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png";

/* ================= HELPERS ================= */
function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
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

function toEmojiNumber(n) {
  return String(n)
    .split("")
    .map((d) => numberEmojis[d] || d)
    .join("");
}

function buildCommandMap() {
  const map = Object.create(null);

  for (const c of commands) {
    if (c.dontAddCommandList) continue;
    const cat = (c.category || "MISC").toUpperCase();
    (map[cat] ||= []).push(c);
  }

  // categories A-Z
  const categories = Object.keys(map).sort((a, b) => a.localeCompare(b));

  // commands inside each category A-Z (by pattern)
  for (const cat of categories) {
    map[cat].sort((a, b) => (a.pattern || "").localeCompare(b.pattern || ""));
  }

  return { map, categories };
}

function menuHeader() {
  const { time, date } = nowLK();

  return (
`*${BOT_NAME} — MAIN MENU*
───────────────────────
👑 Owner  : *${OWNER_NAME}*
🎯 Prefix : *${PREFIX}*
🕒 Time   : *${time}*
📅 Date   : *${date}*
───────────────────────`
  );
}

function menuCaption(map, categories) {
  let txt = menuHeader() + "\n";

  categories.forEach((cat, i) => {
    const idx = i + 1;
    // 🍀.ai style
    const pretty = `🍀.${cat.toLowerCase()}`;
    txt += `┃ ${toEmojiNumber(idx)} *${pretty}* (${map[cat].length})\n`;
  });

  txt += `───────────────────────\n`;
  txt += `Reply with a number *1-${categories.length}*\n`;
  txt += `Reply *0* = Back (menu)\n`;
  txt += `Reply *cancel* = Close\n`;

  return txt;
}

function categoryCaption(cat, list) {
  const pretty = `🍀.${cat.toLowerCase()}`;
  let txt = `*${pretty} — COMMANDS*\n`;
  txt += `───────────────────────\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `${PREFIX}${c.pattern}` : "";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `${PREFIX}${a}`);

    txt += `• *${primary}*\n`;
    if (aliases.length) txt += `   ◦ Aliases: ${aliases.join(", ")}\n`;
    txt += `   ⭕ ${c.desc || "No description"}\n\n`;
  });

  txt += `───────────────────────\n`;
  txt += `Total Commands: ${list.length}\n`;
  txt += `Reply *0* = Back (menu)\n`;
  txt += `Reply *cancel* = Close\n`;

  return txt;
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
  async (sock, mek, m, { from, sender, reply }) => {
    await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

    const { map, categories } = buildCommandMap();
    if (!categories.length) return reply("❌ No commands found!");

    const k = keyFor(sender, from);
    pendingMenu[k] = { step: "category", map, categories, timestamp: Date.now() };

    await sock.sendMessage(
      from,
      { image: { url: headerImage }, caption: menuCaption(map, categories) },
      { quoted: mek }
    );
  }
);

/* ================= REPLIES: 1/2/3 , 0 , cancel ================= */
cmd(
  {
    filter: (text, { sender, from }) => {
      const k = keyFor(sender, from);
      if (!pendingMenu[k]) return false;

      const t = (text || "").trim().toLowerCase();
      if (t === "cancel") return true;
      if (!/^\d+$/.test(t)) return false;

      const n = parseInt(t, 10);
      return n === 0 || (n > 0 && n <= pendingMenu[k].categories.length);
    },
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, reply }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return;

    const t = (body || "").trim().toLowerCase();

    // close
    if (t === "cancel") {
      delete pendingMenu[k];
      return reply("✅ Menu closed.");
    }

    const n = parseInt(t, 10);

    // back -> show menu again
    if (n === 0) {
      state.step = "category";
      state.timestamp = Date.now();

      await sock.sendMessage(from, { react: { text: "↩️", key: mek.key } });

      return sock.sendMessage(
        from,
        { image: { url: headerImage }, caption: menuCaption(state.map, state.categories) },
        { quoted: mek }
      );
    }

    // show selected category commands
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const idx = n - 1;
    const cat = state.categories[idx];
    const list = state.map[cat] || [];

    state.step = "category_view";
    state.timestamp = Date.now();

    await sock.sendMessage(
      from,
      { image: { url: headerImage }, caption: categoryCaption(cat, list) },
      { quoted: mek }
    );
  }
);

/* ================= AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000; // 10 min
  for (const k of Object.keys(pendingMenu)) {
    if (now - pendingMenu[k].timestamp > timeout) delete pendingMenu[k];
  }
}, 60 * 1000);

module.exports = { pendingMenu };
