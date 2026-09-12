const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬ𝗜𝗬Ａ-〽️Ｄ 🍁";

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

const pendingApkSearch = Object.create(null);

const UA = "Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const BASE = "https://apkpure.net";
const DL_BASE = "https://d.apkpure.net";
const HEADERS = { "User-Agent": UA, Referer: BASE };

function getQuotedId(m, mek) {
  return m?.quoted?.id || 
         mek?.message?.extendedTextMessage?.contextInfo?.stanzaId || 
         m?.message?.extendedTextMessage?.contextInfo?.stanzaId || null;
}

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
}, async (sock, mek, m, { from, q }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n📦 *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.apk <name>\`\n💡 *Example:* \`.apk whatsapp\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await apkSearch(q.trim(), 5);

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
    text += `⊱━━━━━━━━━━━━━━━⊰\n> 👇 *Swipe & Reply this message with a number to Download...*`;

    const iconUrl = results[0]?.icon || "https://i.ibb.co/L9Hpw2B/apkpure.png";
    
    // Send App Icon
    const imgMsg = await sock.sendMessage(from, {
        image: { url: iconUrl },
        caption: `> 📦 *${results[0].name}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`,
        contextInfo: channelContextInfo(),
    }, { quoted: mek });

    // Send Details Menu
    const menuMsg = await sock.sendMessage(from, { 
        text: text, 
        contextInfo: channelContextInfo() 
    }, { quoted: imgMsg });

    // 🔥 Store Menu Message ID (Strict Quoted Verification)
    pendingApkSearch[from] = {
      expectedMsgId: menuMsg.key.id,
      results,
      createdAt: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, e.message || "Failed to search APK.");
  }
});

replyHandlers.push({
  filter: (text, { from, m, mek }) => {
    const pending = pendingApkSearch[from];
    if (!pending) return false;
    const quotedId = getQuotedId(m, mek);
    // 🔥 අදාළ මැසේජ් එකට Quoted Reply එකක් කරලා තියෙනවා නම් පමණක් වැඩ කරයි!
    return quotedId && quotedId === pending.expectedMsgId;
  },
  function: async (sock, mek, m, { body, from }) => {
    const pending = pendingApkSearch[from];
    if (!pending || pending.isProcessing) return;

    const input = parseInt(String(body).trim(), 10);
    if (isNaN(input) || input < 1 || input > pending.results.length) return;

    pending.isProcessing = true;
    const selected = pending.results[input - 1];

    await sock.sendMessage(from, { react: { text: "⬇️", key: m.key } });

    try {
      const res = await axios({
        url: selected.dlUrl,
        method: "GET",
        responseType: "arraybuffer",
        headers: HEADERS,
        timeout: 90000,
        maxContentLength: 100 * 1024 * 1024,
      });

      const buffer = Buffer.from(res.data);
      const sizeMB = buffer.length / (1024 * 1024);

      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const cleanName = selected.name.replace(/[\\/:*?"<>|]/g, "").trim();
      
      let caption = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
      caption += `✅ *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
      caption += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      caption += `📦 *App:* ${selected.name}\n`;
      caption += `👤 *Dev:* ${selected.developer}\n`;
      caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n`;
      caption += `📁 *Format:* ${sizeMB > 60 ? "Document (Raw)" : "Standard APK"}\n\n`;
      caption += `⊱━━━━━━━━━━━━━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      const mimeType = sizeMB > 60 ? "application/octet-stream" : "application/vnd.android.package-archive";

      await sock.sendMessage(from, {
        document: buffer,
        mimetype: mimeType,
        fileName: `${cleanName}.apk`,
        caption: caption,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
    } catch (err) {
      if (err.message.includes("maxContentLength") || err.code === "ECONNABORTED") {
        let largeFileMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        largeFileMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄*\n`;
        largeFileMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        largeFileMsg += `📦 *App:* ${selected.name}\n`;
        largeFileMsg += `ℹ️ _Exceeds 100MB limit._\n\n`;
        largeFileMsg += `🔗 *Direct Download Link:*\n${selected.dlUrl}\n\n`;
        largeFileMsg += `⊱━━━━━━━━━━━━━━━⊰`;
        await sock.sendMessage(from, { text: largeFileMsg, contextInfo: channelContextInfo() }, { quoted: mek });
      } else {
        await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
        await sendErrorMsg(sock, from, mek, "Failed to download the APK file.");
      }
    } finally {
      delete pendingApkSearch[from];
    }
  },
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingApkSearch)) {
    if (now - pendingApkSearch[key].createdAt > 5 * 60 * 1000) {
      delete pendingApkSearch[key];
    }
  }
}, 30000);
