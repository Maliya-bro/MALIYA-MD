const { cmd, commands, replyHandlers } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingMenu = {};
const lastProcessedMsg = {};

/* ================= 1. HELPERS (EXACTLY FROM APK.JS) ================= */

// 🔥 100% Copy from apk.js (Solves the @lid problem)
function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingMenu[k];
}

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

// 🔥 100% Copy from apk.js
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

// 🔥 100% Copy from apk.js
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
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

/* ================= 2. MENU UI HELPERS ================= */

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
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
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, { fit: "contain", background: { r: 18, g: 18, b: 24, alpha: 1 } })
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

function commandListCaption(cat, list, botDisplayName) {
  const emo = getCategoryEmoji(cat);
  const styledCat = toSmallCaps(cat);
  let txt = `╭─── ⋆ ⋅ 𖤐 ⋅ ⋆ ━─┈➤\n${emo} *${styledCat} ᴄᴏᴍᴍᴀɴᴅs*\n╰──━ ⋆ ⋅ 𖤐 ⋅ ⋆ ──┈➤\n\n📦 *\`ᴛᴏᴛᴀʟ\` :* ${list.length} Commands\n🎯 *\`ᴘʀᴇғɪx\` :* [ . ]\n\n`;

  list.forEach((c) => {
    const primary = c.pattern ? `.${toSmallCaps(c.pattern)}` : "No Pattern";
    const aliases = (c.alias || []).filter(Boolean).map((a) => `.${toSmallCaps(a)}`);
    txt += `🔹 *${primary}*\n`;
    if (aliases.length) txt += `  ├ 💬 *\`ᴀʟɪᴀs\` :* \`${aliases.join(", ")}\`\n`;
    txt += `  ╰ 📌 *\`ᴅᴇsᴄ\` :* _${c.desc || "No description"}_\n\n`;
  });

  txt += `────━──✦❘•❘✦──━───\n> 👑 ${botDisplayName} | ᴘᴏᴡᴇʀᴇᴅ ʙʏ MALIYA-MD`;
  return txt;
}

/* ================= 3. MAIN MENU COMMAND ================= */

cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help"],
    react: "📜",
    desc: "Show styled command categories with popup list",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, q, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const { map, categories } = buildCommandMapCached();
      if (!categories.length) return reply("❌ No commands found!");

      const k = keyFor(sender, from);
      clearUserSession(k);

      let botDisplayName = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        if (settings && typeof settings.btns_enabled !== "undefined") {
          btnsOn = !!settings.btns_enabled;
        }
      } catch (e) {}

      const headerImg = await getHeaderImage(sessionId);

      // BUTTON UI
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          // 🔥 apk.js එකේ .apk_dl <num> වගේම .menu_dl <num> පාවිච්චි කරමු.
          const menuRows = categories.map((cat, index) => ({
            title: `${String(index + 1).padStart(2, "0")}. ${toSmallCaps(cat)} MENU`,
            description: `${map[cat].length} commands available`,
            id: `.menu_dl ${index + 1}`
          }));

          const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n📜 *${toSmallCaps(botDisplayName)} MENU*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Available Categories :* ${categories.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: "menu_search_list",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Select Category ↯",
                sections: [
                  {
                    title: "📜 Categories",
                    rows: menuRows
                  }
                ]
              }),
            },
          });

          // Ping Button (This will just trigger .ping naturally)
          btn.addButton("📊 Ping", ".ping");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pendingMenu[k] = {
              expectedMsgId: sentMsg.key.id,
              categories,
              map,
              botDisplayName,
              sessionId,
              timestamp: Date.now(),
              isProcessing: false,
            };
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (err) {
          console.log("MENU BUTTONV2 ERROR:", err?.message || err);
        }
      }

      // TEXT / NUMBER REPLY FALLBACK
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n📜 *${toSmallCaps(botDisplayName)} MENU*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      categories.forEach((cat, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* ➔ ${getCategoryEmoji(cat)} *${toSmallCaps(cat)}*\n`;
      });
      text += `\n⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Swipe & Reply this message with a number...*`;

      const menuMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: text,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pendingMenu[k] = {
        expectedMsgId: menuMsg.key.id,
        categories,
        map,
        botDisplayName,
        sessionId,
        timestamp: Date.now(),
        isProcessing: false,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Cannot send menu.");
    }
  }
);


/* ================= 4. REPLY HANDLER (EXACTLY LIKE APK.JS) ================= */

const menuReplyHandler = {
  filter: (text, { from, sender, mek, m }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state) return false;

    // 🔥 100% apk.js style detection
    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".menu_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.categories.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, from, sender }) => {
    const k = keyFor(sender, from);
    const state = pendingMenu[k];
    if (!state || state.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    // 🔥 Check if button payload was sent
    for (const t of texts) {
      if (t.startsWith(".menu_dl ")) {
        choice = parseInt(t.replace(".menu_dl ", "").trim(), 10);
        break;
      }
    }

    // 🔥 Fallback to typed number
    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num) && num > 0 && num <= state.categories.length) {
        choice = num;
      }
    }

    if (!choice || choice < 1 || choice > state.categories.length) return;

    // 🔥 Cooldown Check
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === String(choice) && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    state.isProcessing = true;
    const selectedCategory = state.categories[choice - 1];
    const list = state.map[selectedCategory] || [];

    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    try {
      const headerImg = await getHeaderImage(state.sessionId);
      const caption = commandListCaption(selectedCategory, list, state.botDisplayName);

      // Reply using image
      await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: caption,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      clearUserSession(k);
    } catch (err) {
      clearUserSession(k);
      console.log("MENU REPLY ERROR:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(menuReplyHandler);

/* ================= 5. CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  for (const k in pendingMenu) {
    if (now - pendingMenu[k].timestamp > SESSION_TIMEOUT) delete pendingMenu[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
