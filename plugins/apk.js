const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_APK_IMAGE = "https://i.ibb.co/L9Hpw2B/apkpure.png";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingApkSearch = {};
const lastProcessedMsg = {};

// ✅ Group/Chat එකේ ඕනෑම කෙනෙකුට reply කළ හැකි වන පරිදි 'from' පමණක් භාවිතය
function makePendingKey(sender, from) {
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

// ✅ Quoted Message ID extract කරගැනීම
function getQuotedStanzaId(mek, m) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    null
  );
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

async function apkSearch(query, limit = 5) {
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

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await apkSearch(q.trim(), 5);
    const k = makePendingKey(sender, from);
    clearUserSession(k);

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
    text += `⊱━━━━━━━━━━━━━━━⊰\n> 💬 *Please reply to this message with a number to Download...*`;

    // Bot Settings හරහා Custom Image ඇත්නම් එය ලබා ගැනීම
    let headerImg = results[0]?.icon || DEFAULT_APK_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "apk_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    // Menu එක image caption එකක් ලෙස යවා එහි ID එක save කර ගැනීම
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

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, e.message || "Failed to search APK.");
  }
});

const apkReplyHandler = {
  filter: (text, { from, sender }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingApkSearch[k];
  },
  function: async (sock, mek, m, { body, from, sender }) => {
    const inputStr = String(body || "").trim();
    if (!inputStr || !/^\d+$/.test(inputStr)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingApkSearch[k];
    if (!pending || pending.isProcessing) return;

    // 🔥 User reply කර ඇත්තේ Bot එවූ Menu message එකටම දැයි පරීක්ෂා කිරීම
    const quotedId = getQuotedStanzaId(mek, m);
    if (!quotedId || quotedId !== pending.expectedMsgId) return;

    // Spam / Duplicate Loop Cooldown
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === inputStr && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: inputStr, time: now };

    const choice = parseInt(inputStr, 10);
    if (isNaN(choice) || choice < 1 || choice > pending.results.length) return;

    pending.isProcessing = true;
    const selected = pending.results[choice - 1];

    await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

    try {
      // 1. Get exact file size
      const headRes = await axios.head(selected.dlUrl, { headers: HEADERS }).catch(() => null);
      let sizeMB = 0;
      if (headRes && headRes.headers["content-length"]) {
        sizeMB = parseInt(headRes.headers["content-length"]) / (1024 * 1024);
      }

      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const cleanName = selected.name.replace(/[\\/:*?"<>|]/g, "").trim();

      let caption = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
      caption += `✅ *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
      caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      caption += `📦 *App:* ${selected.name}\n`;
      caption += `👤 *Dev:* ${selected.developer}\n`;
      if (sizeMB > 0) caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n`;
      caption += `📁 *Format:* Standard Document APK\n\n`;
      caption += `⊱━━━━━━━━━━━━━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      // 2. Stream File (RAM crash වැළැක්වීම සඳහා)
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
      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      clearUserSession(k);
    } catch (err) {
      clearUserSession(k);
      console.log("APK DOWNLOAD ERROR:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
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
