const { cmd, commands } = require("../command");

const pendingMenu = Object.create(null);
const numberEmojis = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

const headerImage =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function safeText(x) {
  return (x || "").toString();
}
function normKey(sender = "", from = "") {
  // sender can be: "9477xxx@s.whatsapp.net" or "9477xxx@s.whatsapp.net:xx"
  // from is chat jid: group/private
  const s = safeText(sender).split(":")[0];
  const f = safeText(from);
  // per-chat per-user key (works in groups too)
  return `${f}::${s}`;
}
function toEmojiNumber(n) {
  return String(n)
    .split("")
    .map(d => numberEmojis[d] || d)
    .join("");
}
function buildCommandMap() {
  const map = Object.create(null);
  for (const c of commands) {
    if (c.dontAddCommandList) continue;
    const cat = (c.category || "MISC").toUpperCase();
    (map[cat] ||= []).push(c);
  }
  const categories = Object.keys(map).sort((a, b) => a.localeCompare(b));
  return { map, categories };
}
function menuCaption(map, categories) {
  let txt = `*MAIN MENU — MALIYA-MD*\n`;
  txt += `───────────────────────\n`;

  categories.forEach((cat, i) => {
    const idx = i + 1;
    txt += `┃ ${toEmojiNumber(idx)} *${cat}* (${map[cat].length})\n`;
  });

  txt += `───────────────────────\n`;
  txt += `Reply with a number *1-${categories.length}*\n`;
  txt += `Reply *0* = Back (menu)\n`;
  txt += `Reply *cancel* = Close\n`;
  return txt;
}
function categoryCaption(category, list) {
  let txt = `*${category} COMMANDS*\n`;
  txt += `───────────────────────\n`;

  for (const c of list) {
    const patterns = [c.pattern, ...(c.alias || [])]
      .filter(Boolean)
      .map(p => `.${p}`);
    txt += `${patterns.join(", ")} - ${c.desc || "No description"}\n`;
  }

  txt += `───────────────────────\n`;
  txt += `Total Commands: ${list.length}\n`;
  txt += `Reply *0* = Back (menu)\n`;
  txt += `Reply *cancel* = Close\n`;
  return txt;
}

/**
 * 1) .menu -> show categories
 */
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
    if (!categories.length) return reply("❌ No commands found.");

    const key = normKey(sender, from);
    pendingMenu[key] = {
      step: "category",
      map,
      categories,
      timestamp: Date.now(),
    };

    await sock.sendMessage(
      from,
      {
        image: { url: headerImage },
        caption: menuCaption(map, categories),
      },
      { quoted: mek }
    );
  }
);

/**
 * 2) Plain replies handler: 1 / 2 / 0 / cancel
 *    This uses filter like your film plugin.
 */
cmd(
  {
    filter: (text, { sender, from }) => {
      const t = safeText(text).trim().toLowerCase();
      const key = normKey(sender, from);

      if (!pendingMenu[key]) return false;

      if (t === "cancel") return true;
      if (!/^\d+$/.test(t)) return false; // only numbers

      const n = parseInt(t, 10);
      // allow 0 for back + valid range for selection
      return n === 0 || (n > 0 && n <= pendingMenu[key].categories.length);
    },
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, reply }) => {
    const t = safeText(body).trim().toLowerCase();
    const key = normKey(sender, from);

    const state = pendingMenu[key];
    if (!state) return;

    // cancel
    if (t === "cancel") {
      delete pendingMenu[key];
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
        {
          image: { url: headerImage },
          caption: menuCaption(state.map, state.categories),
        },
        { quoted: mek }
      );
    }

    // number select -> show category commands
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const index = n - 1;
    const category = state.categories[index];
    const list = state.map[category] || [];

    state.step = "done";
    state.timestamp = Date.now();

    await sock.sendMessage(
      from,
      {
        image: { url: headerImage },
        caption: categoryCaption(category, list),
      },
      { quoted: mek }
    );

    // keep it open so user can press 0 to go back
    // auto-timeout will clear it
  }
);

// cleanup
setInterval(() => {
  const now = Date.now();
  for (const k of Object.keys(pendingMenu)) {
    if (now - pendingMenu[k].timestamp > TIMEOUT_MS) delete pendingMenu[k];
  }
}, 60 * 1000);

module.exports = { pendingMenu };
