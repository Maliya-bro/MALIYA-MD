const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const sharp = require("sharp");
const config = require("../config");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const API_KEY = config.TIKWM_API_KEY || "b66e0543466f628a640257ef30611d2b";

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_lru4belru4belru4.jpg?raw=true";

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

const TEMP_DIR = path.join(os.tmpdir(), "maliya_tiktok_temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function makeTempFile(ext = ".mp4") {
  return path.join(TEMP_DIR, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
}

function safeUnlink(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
}

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingTikTok[k];
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
      if (parsed.name) texts.push(String(parsed.name).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    const inputBuf = Buffer.from(res.data);
    return await sharp(inputBuf)
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return url;
  }
}

const pendingTikTok = Object.create(null);
const lastProcessedMsg = {};
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *ERROR*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// 1. TikTok Search Function
async function searchTikTok(keyword) {
  try {
    const response = await axios.get("https://api.tikwmapi.com/feed/search", {
      params: {
        keywords: keyword.trim(),
        count: 10,
        cursor: 0,
        sort_type: 0,
      },
      headers: {
        "x-tikwmapi-key": API_KEY,
      },
      timeout: 15000,
    });

    const data = response.data;
    if (data.code !== 0) {
      return [];
    }

    return data.data?.videos || [];
  } catch (err) {
    return [];
  }
}

// 2. Direct TikTok Link Resolver (No Watermark)
async function getTikTokFromUrl(url) {
  try {
    const response = await axios.get("https://www.tikwm.com/api/", {
      params: { url: url.trim() },
      timeout: 15000
    });
    if (response.data && response.data.code === 0 && response.data.data) {
      return response.data.data;
    }
  } catch (err) {}
  return null;
}

// 3. Command Trigger (.tt / .tiktok / .ttsearch)
cmd({
  pattern: "tt",
  alias: ["tiktok", "ttdl", "ttsearch", "tiktoksearch"],
  react: "🎵",
  desc: "Search TikTok by keyword or download directly by URL",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎵 *TIKTOK DOWNLOADER*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:*\n• Direct Link: \`.tt <tiktok link>\`\n• Search Keyword: \`.tt <song or video name>\`\n\n💡 *Example:*\n\`.tt https://vm.tiktok.com/xxxxxx/\`\n\`.tt sinhala songs\``,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    const input = q.trim();
    const isUrl = /^(https?:\/\/)?(www\.|vm\.|vt\.|t\.)?tiktok\.com\/[^\s]+$/i.test(input) || input.includes("tiktok.com");

    // ──────────────────────────────────────────────
    // CASE A: Direct TikTok URL Provided
    // ──────────────────────────────────────────────
    if (isUrl) {
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const videoData = await getTikTokFromUrl(input);
      if (!videoData) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(sock, from, mek, "Failed to fetch TikTok video. Ensure the link is public and valid.");
      }

      const downloadUrl = videoData.play || videoData.wmplay || videoData.hdplay;
      if (!downloadUrl) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(sock, from, mek, "Download link not found for this TikTok URL.");
      }

      const selectedVideo = {
        title: videoData.title || "TikTok Video",
        author: { unique_id: videoData.author?.unique_id || "unknown" },
        duration: videoData.duration || "N/A"
      };

      return await executeTikTokDownload(sock, mek, from, downloadUrl, selectedVideo);
    }

    // ──────────────────────────────────────────────
    // CASE B: Search Query Provided
    // ──────────────────────────────────────────────
    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const videos = await searchTikTok(input);

    if (!videos || videos.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, `No TikTok videos found for "${input}".`);
    }

    const topVideos = videos.slice(0, 10);
    const key = keyFor(sender, from);
    clearUserSession(key);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let headerImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "tiktok_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *TIKTOK SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n🎀 *Search :* ${input}\n🍿 *Results :* ${topVideos.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    // ButtonV2 System
    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const ttRows = topVideos.map((vid, index) => {
          const title = vid.title ? vid.title.replace(/\n/g, " ").slice(0, 42).trim() : "TikTok Video";
          const author = vid.author?.unique_id || "unknown";
          const duration = vid.duration ? `${vid.duration}s` : "N/A";
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${title}`,
            description: `@${author} | ⏱️ ${duration}`,
            id: `.tt_dl ${index + 1}`
          };
        });

        const fittedThumb = await getFittedImageBuffer(headerImg);

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(fittedThumb);

        // 1. Popup List Menu Button
        btn.addRawButton({
          buttonId: ".tt_search_list",
          buttonText: { displayText: "🎵 Select Video" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "TikTok Search Results ↯",
              sections: [
                {
                  title: "Available TikToks",
                  rows: ttRows
                }
              ]
            }),
          },
        });

        // 2. Alive Button (Side-by-Side row)
        btn.addButton("⚡ Alive", ".alive");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingTikTok[key] = {
            expectedMsgId: sentMsg.key.id,
            results: topVideos,
            timestamp: Date.now(),
            isProcessing: false,
          };
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.log("TIKTOK BUTTONV2 ERROR:", err?.message || err);
      }
    }

    // Numbered Fallback Menu
    let text = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *TIKTOK SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    text += `🎀 *Search :* ${input}\n`;
    text += `🍿 *Results :* ${topVideos.length}\n\n`;

    topVideos.forEach((vid, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const title = vid.title ? vid.title.replace(/\n/g, " ").slice(0, 50).trim() : "No Title";
      const author = vid.author?.unique_id || "unknown";
      const duration = vid.duration ? `${vid.duration}s` : "N/A";

      text += `*[ ${numStr} ]* ➔ *${title}*\n`;
      text += `  ├ 👤 @${author} | ⏱️ ${duration}\n\n`;
    });

    text += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply this message with a number to Download...*`;

    const menuMsg = await sock.sendMessage(from, {
      image: { url: headerImg },
      caption: text,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    pendingTikTok[key] = {
      expectedMsgId: menuMsg.key.id,
      results: topVideos,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (e) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to TikTok server.");
  }
});

// 4. Reply Handler for Search Results
const ttReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const key = keyFor(sender, from);
    const state = pendingTikTok[key];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".tt_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.results.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const key = keyFor(sender, from);
    const pending = pendingTikTok[key];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".tt_dl ")) {
        choice = parseInt(t.replace(".tt_dl ", "").trim(), 10);
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
    const selectedVideo = pending.results[choice - 1];
    const downloadUrl = selectedVideo.play || selectedVideo.wmplay;

    if (!downloadUrl) {
      clearUserSession(key);
      return await sendErrorMsg(sock, from, mek, "Download URL not available for this video.");
    }

    clearUserSession(key);
    await executeTikTokDownload(sock, mek, from, downloadUrl, selectedVideo);
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(ttReplyHandler);

// 5. Download & Stream Execution
async function executeTikTokDownload(sock, mek, from, url, selectedVideo) {
  let tempFile = makeTempFile(".mp4");
  try {
    await sock.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

    const response = await axios({
      url: url,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      timeout: 120000,
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const stats = fs.statSync(tempFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB === 0) throw new Error("Downloaded video is empty");

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const title = selectedVideo.title ? selectedVideo.title.replace(/\n/g, " ").trim() : "TikTok Video";
    const author = selectedVideo.author?.unique_id || "unknown";
    const duration = selectedVideo.duration ? `${selectedVideo.duration}s` : "N/A";

    let caption = `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n`;
    caption += `✅ *TIKTOK DOWNLOADED*\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n`;
    caption += `🎬 *Title:* ${title}\n`;
    caption += `👤 *Author:* @${author}\n`;
    caption += `⏱️ *Duration:* ${duration}\n`;
    caption += `📊 *Size:* ${sizeMB.toFixed(2)} MB\n\n`;
    caption += `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    await sock.sendMessage(from, {
      video: { url: tempFile },
      mimetype: "video/mp4",
      caption: caption,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (err) {
    console.error("TikTok Download Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to download the TikTok video.");
  } finally {
    safeUnlink(tempFile);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingTikTok)) {
    if (now - pendingTikTok[key].timestamp > SESSION_TIMEOUT) {
      delete pendingTikTok[key];
    }
  }
  for (const key of Object.keys(lastProcessedMsg)) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 30000);

module.exports = {};
