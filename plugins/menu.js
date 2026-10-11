const { cmd, commands, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

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

const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";

// 🔥 video.js එකේ exact pending store එක
const pendingMenuSelection = Object.create(null);

// 🔥 video.js එකේ exact key හදන function එක (Multi-device safe)
function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

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

function buildCommandMapCached() {
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
  return { map, categories };
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data)).resize(800, 800, { fit: "contain", background: { r: 18, g: 18, b: 24, alpha: 1 } }).jpeg({ quality: 80 }).toBuffer();
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

// 🔥 video.js එකේ exact extractTexts function එක
function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body,
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    mek?.message?.interactiveResponseMessage?.body?.text,
  ];
  for (const item of direct) if (item) texts.push(String(item).trim());

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id) texts.push(String(parsed.id).trim());
      if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
    } catch (e) {}
  }

  return [...new Set(texts.filter(Boolean))];
}

// 🔥 Choice එක අංකයක්ද නැත්නම් Button එකෙන් ආපු action එකක්ද කියලා අල්ලන helper එක
function extractChoiceFromTexts(texts, maxLen) {
  for (const t of texts) {
    const str = String(t).trim();
    if (str.startsWith("menucat:")) {
      const n = parseInt(str.replace("menucat:", "").trim(), 10);
      if (!isNaN(n) && n > 0 && n <= maxLen) return n;
    }
    const pureNum = parseInt(str, 10);
    if (!isNaN(pureNum) && pureNum > 0 && pureNum <= maxLen && /^\d+$/.test(str)) {
      return pureNum;
    }
  }
  return null;
}

function commandListCaption(cat, list, userName, botDisplayName) {
  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  let txt = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n👤 *\`ᴜsᴇʀ\` :* ${toSmallCaps(userName)}\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${list.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n\n`;

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

/* ================= 1. .menu COMMAND ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help"],
    react: "📜",
    desc: "Main menu",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const key = makePendingKey(sender, from);
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
      const { time, date } = nowLK();
      const userName = pushname || "User";

      let menuText = `┏━━━━━━◥◣◆◢◤━━━━━━┓\n★彡 *${botDisplayName}* 彡★\n┗━━━━━━◢◤◆◥◣━━━━━━┛\n\n`;
      menuText += `✨ 👋 *ʜɪ, ${toSmallCaps(userName)}!*\n\n`;
      menuText += `╔═════. .★.══════════╗\n🤖 *\`ʙᴏᴛ\` :* ${botDisplayName}\n🕒 *\`ᴛɪᴍᴇ\` :* ${time}\n📅 *\`ᴅᴀᴛᴇ\` :* ${date}\n🎯 *\`ᴘʀᴇғɪx\` :* [ ${PREFIX} ]\n╚══════════. .★.═════╝\n\n`;
      menuText += `👇 *Select a command category below:*\n\n`;

      categories.forEach((cat, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        menuText += `*[ ${numStr} ]* ➔ ${getCategoryEmoji(cat)} *${toSmallCaps(cat)}* _(${map[cat].length})_\n`;
      });
      menuText += `\n⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Reply with a number (e.g. 1, 2)...*`;

      // 🔥 video.js විදිහටම Memory Save කිරීම (Quoted checks කිසිවක් නැත)
      pendingMenuSelection[key] = {
        from,
        categories,
        map,
        botDisplayName,
        sessionId,
        userName,
        createdAt: Date.now(),
        isProcessing: false,
      };

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const listRows = categories.map((cat, i) => ({
            title: `${getCategoryEmoji(cat)} ${toSmallCaps(cat)} MENU`,
            description: `${map[cat].length} commands available`,
            id: `menucat:${i + 1}`, // video.js quality:360 වගේම clean ID එකක්
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuText)
            .setFooter(`© 2026 ${BRAND_BASE}`)
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: "menu_list_main",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Select Category ↯",
                sections: [{ title: "Command Categories", rows: listRows }],
              }),
            },
          });

          btn.addButton("📊 Ping", ".ping");
          await btn.send(from, { quoted: mek });
          return;
        } catch (err) {
          console.log("MENU BUTTON ERROR:", err?.message);
        }
      }

      // Button නැත්නම් Image + Caption යවන්න
      await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText, contextInfo: channelContextInfo() }, { quoted: mek });

    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Error sending menu: " + e.message);
    }
  }
);

/* ================= 2. EXACT VIDEO.JS STYLE REPLY HANDLER ================= */
// 🔥 කිසිම Quoted Message Check එකක් නැහැ! Key එක තිබේ නම් කෙලින්ම Execute වේ.
replyHandlers.push({
  filter: (_body, { sender, from }) => !!pendingMenuSelection[makePendingKey(sender, from)],
  function: async (sock, mek, m, { from, body, sender }) => {
    const key = makePendingKey(sender, from);
    const pending = pendingMenuSelection[key];
    if (!pending || pending.isProcessing) return;

    // Button payload එකෙන් හෝ කෙලින්ම text එකෙන් number එක ගැනීම
    let choice = extractChoiceFromTexts(extractTexts(body, mek, m), pending.categories.length);
    if (!choice && /^[1-9][0-9]*$/.test(String(body || "").trim())) {
      const n = parseInt(String(body || "").trim(), 10);
      if (n > 0 && n <= pending.categories.length) choice = n;
    }

    if (!choice) return;

    pending.isProcessing = true;

    try {
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

      const selectedCategory = pending.categories[choice - 1];
      const list = pending.map[selectedCategory] || [];

      const caption = commandListCaption(selectedCategory, list, pending.userName, pending.botDisplayName);
      const headerImg = await getHeaderImage(pending.sessionId);

      try {
        await sock.sendMessage(from, { image: { url: headerImg }, caption, contextInfo: channelContextInfo() }, { quoted: mek });
      } catch (err) {
        await sock.sendMessage(from, { text: caption, contextInfo: channelContextInfo() }, { quoted: mek });
      }

    } catch (err) {
      console.log("MENU EXECUTION ERROR:", err?.message);
    } finally {
      delete pendingMenuSelection[key];
    }
  },
});

/* ================= 3. AUTO CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingMenuSelection)) {
    if (now - pendingMenuSelection[key].createdAt > 3 * 60 * 1000) {
      delete pendingMenuSelection[key];
    }
  }
}, 30000);

module.exports = {};
