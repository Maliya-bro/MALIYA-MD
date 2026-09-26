const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_APK_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingApkSearch = {};
const lastProcessedMsg = {};

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingApkSearch[k];
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

// menu.js එකේ 100% වැඩ කරන Quoted ID Extraction Helper එක
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

// menu.js එකේ texts extract කරන exact helper එක
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

const UA = "Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const BASE = "https://apkpure.net";
const DL_BASE = "https://d.apkpure.net";
const HEADERS = { "User-Agent": UA, Referer: BASE };

function extractPkg(href) {
  const m = href?.match(/\/((?:com|org|net|io|co)\.[a-zA-Z0-9_.]+)(?:\/|$)/i);
  return m ? m[1] : "";
}

function extractPkgFromEl($, el) {
  const fromAttr = $(el).find("[data-dt-pkg]").attr("data-dt-pkg");
  if (fromAttr) return fromAttr;
  const href = $(el).find("a.top").first().attr("href") || "";
  return extractPkg(href);
}

async function apkSearch(query, limit = 8) {
  if (!query?.trim()) throw new Error("Query is empty");
  const { data } = await axios.get(`${BASE}/search?q=${encodeURIComponent(query)}`, {
    headers: HEADERS,
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const results = [];
  const seen = new Set();

  $(".search-brand-container").each((_, el) => {
    if (results.length >= limit) return false;
    const name = $(el).find("a.top").first().text().trim();
    const dev = $(el).find("a.developer").first().text().trim();
    const icon = $(el).find("img.app-icon-img").first().attr("data-original") || "";
    const pkg = extractPkgFromEl($, el);

    if (!name || !pkg || seen.has(pkg)) return;
    seen.add(pkg);

    results.push({
      name,
      developer: dev,
      pkg,
      icon,
      dlUrl: `${DL_BASE}/b/APK/${pkg}?version=latest`,
    });
  });

  if (!results.length) throw new Error("No results found");
  return results;
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

/* ================= COMMAND: .apk ================= */
cmd({
  pattern: "apk",
  alias: ["app", "playstore", "apkpure"],
  react: "📦",
  desc: "Search and download APK from APKPure",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n📦 *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.apk <name>\`\n💡 *Example:* \`.apk whatsapp\`\n\n⊱━━━━━━━━━━━━━━━⊰`,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const results = await apkSearch(q.trim(), 8);
    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let headerImg = DEFAULT_APK_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "apk_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const apkRows = results.map((item, index) => ({
          title: `${String(index + 1).padStart(2, "0")}. ${item.name.substring(0, 45)}`,
          description: `Dev: ${item.developer || "Unknown"} | ID: ${item.pkg.substring(0, 25)}`,
          id: `.apk_dl ${index + 1}`
        }));

        const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n📦 *𝐀𝐏𝐊 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${results.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(headerImg);

        btn.addRawButton({
          buttonId: "apk_search_list",
          buttonText: { displayText: "📦 Select APK" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "Available Applications ↯",
              sections: [
                {
                  title: "📱 Apps & Games",
                  rows: apkRows
                }
              ]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingApkSearch[k] = {
            expectedMsgId: sentMsg.key.id,
            results,
            timestamp: Date.now(),
            isProcessing: false,
          };
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.log("APK BUTTONV2 ERROR:", err?.message || err);
      }
    }

    // Numbered List Fallback
    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    text += `📦 *𝐀𝐏𝐊 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      text += `*[ ${numStr} ]* ➔ *${item.name}*\n`;
      text += `  ├ 👤 ${item.developer || "Unknown"}\n`;
      text += `  ╰ 🆔 \`${item.pkg}\`\n\n`;
    });
    text += `⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Swipe & Reply this message with a number to Download...*`;

    const menuMsg = await sock.sendMessage(from, {
      image: { url: headerImg },
      caption: text,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    pendingApkSearch[k] = {
      expectedMsgId: menuMsg.key.id,
      results,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, e.message || "Failed to search APK.");
  }
});

/* ================= EXACT MENU.JS STYLE REPLY HANDLER ================= */
const apkReplyHandler = {
  filter: (text, { from, sender, mek, m }) => {
    const k = keyFor(sender, from);
    const state = pendingApkSearch[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".apk_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.results.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    // Quoted reply නම් හෝ valid number එකක් නම් 100% allow කරයි
    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, from, sender }) => {
    const k = keyFor(sender, from);
    const state = pendingApkSearch[k];
    if (!state || state.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".apk_dl ")) {
        choice = parseInt(t.replace(".apk_dl ", "").trim(), 10);
        break;
      }
    }

    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num) && num > 0 && num <= state.results.length) {
        choice = num;
      }
    }

    if (!choice || choice < 1 || choice > state.results.length) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === String(choice) && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    state.isProcessing = true;
    const selected = state.results[choice - 1];

    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    try {
      const headRes = await axios.head(selected.dlUrl, { headers: HEADERS }).catch(() => null);
      let sizeMB = 0;
      if (headRes && headRes.headers["content-length"]) {
        sizeMB = parseInt(headRes.headers["content-length"]) / (1024 * 1024);
      }

      await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

      const cleanName = selected.name.replace(/[\\/:*?"<>|]/g, "").trim();

      let caption = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
      caption += `✅ *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
      caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      caption += `📦 *App:* ${selected.name}\n`;
      caption += `👤 *Dev:* ${selected.developer}\n`;
      if (sizeMB > 0) caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n`;
      caption += `📁 *Format:* Standard Document APK\n\n`;
      caption += `⊱━━━━━━━━━━━━━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      const res = await axios({
        url: selected.dlUrl,
        method: "GET",
        responseType: "stream",
        headers: HEADERS,
        timeout: 0,
      });

      const docPayload = {
        document: { stream: res.data },
        mimetype: "application/vnd.android.package-archive",
        fileName: `${cleanName}.apk`,
        caption: caption,
        contextInfo: channelContextInfo(),
      };

      await sock.sendMessage(from, docPayload, { quoted: mek });
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      clearUserSession(k);
    } catch (err) {
      clearUserSession(k);
      console.log("APK DOWNLOAD ERROR:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Failed to download the APK file.");
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(apkReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingApkSearch) {
    if (now - pendingApkSearch[k].timestamp > SESSION_TIMEOUT) delete pendingApkSearch[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
