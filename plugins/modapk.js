const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { readSettings, getCustomImage } = require("../lib/botSettings");

// ── Context Info (Channel Details) ─────────────
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

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const DEFAULT_THUMB = "https://i.ibb.co/3m1bXvt/cineverse.jpg"; 
const SEARCH_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";

const TEMP_DIR = path.join(os.tmpdir(), "maliya_an1_temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".apk") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingAn1Search[k];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
    const idx = normal.indexOf(char);
    return idx !== -1 ? small[idx] : char;
  }).join("");
}

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

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title, m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
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

const pendingAn1Search = Object.create(null);
const lastProcessedMsg = {};
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

async function getThumbnailBuffer(url) {
  try {
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ==========================================
// 1. Scraper Functions
// ==========================================

async function searchAN1(query) {
  try {
    const searchUrl = `https://an1.com/?story=${encodeURIComponent(query)}&do=search&subaction=search`;
    const { data } = await axios.get(searchUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];
    
    $(".item_app").each((i, el) => {
      if (i >= 10) return false;
      const title = $(el).find(".name a span").text().trim() || $(el).find(".name a").text().trim();
      const appUrl = $(el).find(".name a").attr("href");
      const img = $(el).find(".img img").attr("src");
      const developer = $(el).find(".developer").text().trim();
      
      if (title && appUrl) {
        results.push({ title, url: appUrl, img, developer });
      }
    });
    
    return results;
  } catch (error) {
    console.error("AN1 Search Error:", error.message);
    return [];
  }
}

async function getAppDetails(appUrl) {
  try {
    const { data } = await axios.get(appUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    
    const version = $('span[itemprop="softwareVersion"]').text().trim() || "Unknown";
    const size = $('span[itemprop="fileSize"]').text().trim() || "Unknown";
    let dlPagePath = $('a.btn-green[href*="file_"]').attr("href");
    
    if (!dlPagePath) return null;
    const dlPageUrl = dlPagePath.startsWith("http") ? dlPagePath : `https://an1.com${dlPagePath}`;
    
    return { version, size, dlPageUrl };
  } catch (error) {
    console.error("AN1 Details Fetch Error:", error.message);
    return null;
  }
}

async function getDirectDownloadLink(dlPageUrl) {
  try {
    const { data } = await axios.get(dlPageUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    return $("#pre_download").attr("href");
  } catch (error) {
    console.error("AN1 Direct Link Error:", error.message);
    return null;
  }
}

// ==========================================
// 2. Command Trigger (.an1)
// ==========================================
cmd({
  pattern: "an1",
  alias: ["modapk", "an1apk", "hackapk"],
  react: "👾",
  desc: "Search and download MOD games/apps from AN1.com",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n👾 *𝐀𝐍𝟏 𝐌𝐎𝐃 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.an1 <app/game name>\`\n💡 *Example:* \`.an1 temple run\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const results = await searchAN1(q.trim());

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, `No MOD apps found for "${q}" on AN1.com.`);
    }

    const key = keyFor(sender, from);
    clearUserSession(key);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let finalSearchImg = SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "an1_header");
        if (custom && custom.data) finalSearchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n👾 *𝐀𝐍𝟏 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${results.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    // 🔥 BUTTONS SYSTEM (ButtonV2)
    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const an1Rows = results.map((item, index) => ({
          title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
          description: `Dev: ${item.developer || "Unknown"}`,
          id: `.an1_dl ${index + 1}`
        }));

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(finalSearchImg);

        btn.addRawButton({
          buttonId: "an1_search_list",
          buttonText: { displayText: "👾 Select MOD APK" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "Available MOD Applications ↯",
              sections: [
                {
                  title: "🎮 MOD Apps & Games",
                  rows: an1Rows
                }
              ]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingAn1Search[key] = {
            expectedMsgId: sentMsg.key.id,
            results,
            timestamp: Date.now(),
            isProcessing: false,
          };
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.log("AN1 BUTTONV2 ERROR:", err?.message || err);
      }
    }

    // 🔢 FALLBACK NUMBERED MENU
    let text = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    text += `👾 *𝐀𝐍𝟏 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
    text += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      text += `*[ ${numStr} ]* ➔ *${item.title}*\n`;
      text += `  ├ 👤 ${item.developer || "Unknown"}\n`;
      text += `  ╰ 🔗 \`an1.com\`\n\n`;
    });
    text += `━ ━ ━ ⋆ ━ ━ ━\n> 💬 *Swipe & Reply this message with a number to Download...*`;

    const menuMsg = await sock.sendMessage(from, { 
      image: { url: finalSearchImg }, 
      caption: text,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    pendingAn1Search[key] = {
      expectedMsgId: menuMsg.key.id,
      results,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to AN1 API.");
  }
});

// ==========================================
// 3. Number Reply Listener
// ==========================================
const an1ReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const key = keyFor(sender, from);
    const state = pendingAn1Search[key];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".an1_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.results.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = keyFor(sender, from);
    const pending = pendingAn1Search[key];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".an1_dl ")) {
        choice = parseInt(t.replace(".an1_dl ", "").trim(), 10);
        break;
      }
    }

    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num) && num > 0 && num <= pending.results.length) {
        choice = num;
      }
    }

    if (!choice || choice < 1 || choice > pending.results.length) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[key];
    if (lastMsg && lastMsg.text === String(choice) && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[key] = { text: String(choice), time: now };

    pending.isProcessing = true;
    const selected = pending.results[choice - 1];

    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    try {
      const details = await getAppDetails(selected.url);
      
      if (!details || !details.dlPageUrl) {
        clearUserSession(key);
        return await sendErrorMsg(sock, from, mek, "Failed to find the download page for this app.");
      }

      const directLink = await getDirectDownloadLink(details.dlPageUrl);
      
      if (!directLink) {
        clearUserSession(key);
        return await sendErrorMsg(sock, from, mek, "Failed to extract the direct download link.");
      }

      clearUserSession(key);
      await executeDownload(sock, mek, from, directLink, selected, details);

    } catch (error) {
      clearUserSession(key);
      console.error("AN1 Extraction Error:", error.message);
      await sendErrorMsg(sock, from, mek, "An error occurred while fetching the download link.");
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(an1ReplyHandler);

// ==========================================
// 4. Download Execution (With Document Thumbnail)
// ==========================================
async function executeDownload(sock, mek, from, url, selectedApp, details) {
  let tempFile = makeTempFile(".apk");
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    const response = await axios({
      url: url,
      method: "GET",
      responseType: "stream",
      headers: HEADERS, 
      timeout: 180000, 
      maxContentLength: 300 * 1024 * 1024,
      maxBodyLength: 300 * 1024 * 1024,
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const stats = fs.statSync(tempFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB === 0) throw new Error("Downloaded file is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanName = selectedApp.title.replace(/[\\/:*?"<>|]/g, "").trim();
    const isLargeDoc = sizeMB > 60;
    
    let caption = `⊱╔════·༻𐫱༺·═══════╗⊰\n`;
    caption += `✅ *𝐀𝐏𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    caption += `📦 *App:* ${selectedApp.title}\n`;
    caption += `👤 *Dev:* ${selectedApp.developer}\n`;
    caption += `🏷️ *Version:* ${details.version}\n`;
    caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n`;
    caption += `📁 *Format:* ${isLargeDoc ? "Document (Raw Binary)" : "Standard APK"}\n\n`;
    caption += `⊱╚═══════·༻𐫱༺·════╝⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(selectedApp.img || DEFAULT_THUMB);

    const docPayload = {
      document: { stream: fs.createReadStream(tempFile) },
      mimetype: isLargeDoc ? "application/octet-stream" : "application/vnd.android.package-archive",
      fileName: `${cleanName}.apk`,
      caption: caption,
      contextInfo: channelContextInfo(),
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    let fallbackMsg = `⊱─────── ⋆⋅ ♰ ⋅⋆ ───────⊰\n`;
    fallbackMsg += `⚠️ *𝐅𝐈𝐋𝐄 𝐓𝐎𝐎 𝐋𝐀𝐑𝐆𝐄 𝐎𝐑 𝐄𝐑𝐑𝐎𝐑*\n`;
    fallbackMsg += `⊱─────── ⋆⋅ ♰ ⋅⋆ ───────⊰\n\n`;
    fallbackMsg += `📦 *App:* ${selectedApp.title}\n`;
    fallbackMsg += `ℹ️ _File size exceeds limits or connection timed out._\n\n`;
    fallbackMsg += `🔗 *Direct Download Link:*\n${url}\n\n`;
    fallbackMsg += `⊱━━• ✿ •━━━━━• ✿ •━━⊰`;
    
    await sock.sendMessage(from, { text: fallbackMsg, contextInfo: channelContextInfo() }, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
  } finally {
    safeUnlink(tempFile);
  }
}

// Expired sessions cleanup
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingAn1Search)) {
    if (now - pendingAn1Search[key].timestamp > SESSION_TIMEOUT) {
      delete pendingAn1Search[key];
    }
  }
  for (const key of Object.keys(lastProcessedMsg)) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 30000);

module.exports = {};
