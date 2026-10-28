const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;
const MAX_RESULTS = 15;
const pendingPhSearch = {};
const lastProcessedMsg = {};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// External Chamindu API Config
const CHAMA_API_BASE = "https://api.chamindu.site/api/adult/pornhub/dl";
const CHAMA_API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingPhSearch[k];
}

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

  const p1 =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage
      ?.paramsJson;
  const p2 =
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage
      ?.paramsJson;
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

async function getThumbnailBuffer(url) {
  const tryUrl = url || DEFAULT_SEARCH_IMAGE;
  try {
    const res = await axios.get(tryUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": UA },
    });
    return await sharp(Buffer.from(res.data))
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 50 })
      .toBuffer();
  } catch (e) {
    return null;
  }
}

// Download නොකර Video එකේ ප්‍රමාණය (MB) සොයාගැනීම
async function getRemoteFileSizeMB(url) {
  try {
    const headRes = await axios.head(url, {
      headers: { "User-Agent": UA },
      timeout: 10000,
    });
    const bytes = parseInt(headRes.headers["content-length"], 10);
    if (!isNaN(bytes) && bytes > 0) {
      return bytes / (1024 * 1024);
    }
  } catch (e) {}
  return null;
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(
    from,
    {
      text:
        "⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _" +
        text +
        "_",
      contextInfo: channelContextInfo(),
    },
    { quoted: mek }
  );
}

/* ================= 1. PORNHUB SEARCH ================= */
async function phSearch(query, limit = 15) {
  let allResults = [];
  let page = 1;

  while (allResults.length < limit && page <= 3) {
    const url =
      "https://www.pornhub.com/video/search?search=" +
      encodeURIComponent(query) +
      "&page=" +
      page;

    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "hasVisited=1; age_verified=1",
        },
        timeout: 12000,
      });
      const $ = cheerio.load(data);

      $("li.pcVideoListItem, li.videoBox").each((_, el) => {
        if (allResults.length >= limit) return false;
        const anchor = $(el).find("a").first();
        const img = $(el).find("img").first();

        let title =
          $(el).find(".title a, span.title").first().text().trim() ||
          anchor.attr("title") ||
          "";
        let href = anchor.attr("href") || "";
        const duration =
          $(el).find("var.duration, .duration").first().text().trim() || "N/A";

        if (title && href && href.includes("viewkey=")) {
          const fullUrl = href.startsWith("http")
            ? href
            : "https://www.pornhub.com" + href;
          const thumb = img.attr("data-mediumhint") || img.attr("src") || "";

          allResults.push({
            title: title,
            url: fullUrl,
            thumb: thumb,
            duration: duration,
          });
        }
      });
      page++;
    } catch (err) {
      break;
    }
  }
  return allResults;
}

/* ================= 2. FETCH FROM CHAMA API ================= */
async function getChamaStreamData(targetUrl) {
  const apiUrl = `${CHAMA_API_BASE}?url=${encodeURIComponent(
    targetUrl
  )}&api_key=${CHAMA_API_KEY}`;

  const { data } = await axios.get(apiUrl, { timeout: 20000 });

  if (!data || !data.success) {
    throw new Error("API request failed or video is unavailable.");
  }

  const streamUrl =
    data.download_proxy ||
    data.download_url ||
    data.stream_proxy ||
    data.stream_url ||
    data.direct_link ||
    data.raw_link;

  if (!streamUrl) {
    throw new Error("Direct stream link could not be retrieved from API.");
  }

  return { streamUrl };
}

/* ================= COMMAND: .ph ================= */
cmd(
  {
    pattern: "ph",
    alias: ["pornhub", "phub", "phsearch"],
    react: "🔞",
    desc: "Search and stream videos from Pornhub",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    try {
      if (!q) {
        return await sock.sendMessage(
          from,
          {
            text: "⊱━━━━━ • ✿ • ━━━━━⊰\n🔞 *𝐏𝐎𝐑𝐍𝐇𝐔𝐁 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* `.ph <search_term>`\n💡 *Example:* `.ph hot`",
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
        );
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

      const results = await phSearch(q.trim(), MAX_RESULTS);
      if (!results || results.length === 0) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `No results found on Pornhub for "${q}".`
        );
      }

      const topResults = results.slice(0, MAX_RESULTS);
      const k = keyFor(sender, from);
      clearUserSession(k);

      const settings = await readSettings(sessionId);
      const btnsOn = !!settings.btns_enabled;
      const botDisplayName = settings?.bot_name?.trim() || DEFAULT_BOT_NAME;

      let searchImg = DEFAULT_SEARCH_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "ph_header");
          if (custom && custom.data) searchImg = custom.data;
        } catch (e) {}
      }

      const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🔞 *${botDisplayName.toUpperCase()} 18+*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 ${BRAND_BASE} SYSTEM`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const videoRows = topResults.map((item, index) => ({
            title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
            description: `Duration: ${item.duration || "N/A"}`,
            id: `.ph_select ${index + 1}`,
          }));

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(searchImg);

          btn.addRawButton({
            buttonId: "ph_videos_list",
            buttonText: { displayText: "🎬 Select Video" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Pornhub Search Results ↯",
                sections: [{ title: "🎥 Available Videos", rows: videoRows }],
              }),
            },
          });

          btn.addButton("📜 Bot Menu", ".menu");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pendingPhSearch[k] = {
              results: topResults,
              timestamp: Date.now(),
              isProcessing: false,
              expectedMsgId: sentMsg.key.id,
              botDisplayName,
            };
            await sock.sendMessage(from, {
              react: { text: "✅", key: mek.key },
            });
            return;
          }
        } catch (e) {
          console.log("PH BUTTONV2 ERROR:", e?.message || e);
        }
      }

      // Numbered Fallback List
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🔞 *${botDisplayName.toUpperCase()} 18+*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n`;
      topResults.forEach((item, index) => {
        text += `*[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${toSmallCaps(
          item.title.substring(0, 40)
        )}* _(${item.duration})_\n`;
      });
      text +=
        "\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*";

      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: searchImg },
          caption: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );

      pendingPhSearch[k] = {
        results: topResults,
        timestamp: Date.now(),
        isProcessing: false,
        expectedMsgId: sentMsg.key.id,
        botDisplayName,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Failed to connect to Pornhub search.");
    }
  }
);

/* ================= REPLY HANDLER ================= */
const phReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const pending = pendingPhSearch[k];
    if (!pending) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".ph_select ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const max = pending.results?.length || 0;
    const isNum = !isNaN(num) && num > 0 && num <= max;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === pending.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const k = keyFor(sender, from);
    const pending = pendingPhSearch[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".ph_select ")) {
        choice = parseInt(t.replace(".ph_select ", "").trim(), 10);
        break;
      }
    }

    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num)) choice = num;
    }

    if (!choice || choice < 1 || choice > pending.results.length) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (
      lastMsg &&
      lastMsg.text === String(choice) &&
      now - lastMsg.time < LOOP_COOLDOWN
    )
      return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    const botDisplayName = pending.botDisplayName || DEFAULT_BOT_NAME;
    const selected = pending.results[choice - 1];

    pending.isProcessing = true;
    clearUserSession(k);

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    try {
      const streamData = await getChamaStreamData(selected.url);
      const streamUrl = streamData.streamUrl;

      const cleanTitle = (selected.title || "Video")
        .replace(/[^\w\s.-]/gi, "")
        .substring(0, 50)
        .trim();

      const fileName = `MALIYA-MD ${cleanTitle}.mp4`;
      const thumbBuffer = await getThumbnailBuffer(selected.thumb);

      // Download නොකර Remote URL එකෙන් Size එක (MB) පරීක්ෂා කිරීම
      const sizeMB = await getRemoteFileSizeMB(streamUrl);
      const sizeText = sizeMB ? `${sizeMB.toFixed(2)} MB` : "Unknown";

      let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🔞 *${botDisplayName.toUpperCase()} 18+*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Title :* ${toSmallCaps(
        cleanTitle
      )}\n⏱️ *Duration :* ${selected.duration || "N/A"}\n💾 *Size :* ${sizeText}\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      // 80MB ට වඩා වැඩි නම් Document ලෙසද, 80MB හෝ ඊට අඩු නම් Video ලෙසද Stream කරයි
      if (sizeMB && sizeMB > 80) {
        const docPayload = {
          document: { url: streamUrl },
          mimetype: "video/mp4",
          fileName: fileName,
          caption:
            captionText + "\n\n_📄 Video sent as document stream (Size > 80MB)._",
          contextInfo: channelContextInfo(),
        };
        if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

        await sock.sendMessage(from, docPayload, { quoted: mek });
      } else {
        try {
          const videoPayload = {
            video: { url: streamUrl },
            mimetype: "video/mp4",
            fileName: fileName,
            caption: captionText,
            contextInfo: channelContextInfo(),
          };
          if (thumbBuffer) videoPayload.jpegThumbnail = thumbBuffer;

          await sock.sendMessage(from, videoPayload, { quoted: mek });
        } catch (videoErr) {
          // Video payload එක fail වුවහොත් document එකක් ලෙස fallback stream කිරීම
          const fallbackDocPayload = {
            document: { url: streamUrl },
            mimetype: "video/mp4",
            fileName: fileName,
            caption:
              captionText +
              "\n\n_📄 Video sent as document stream due to stream format._",
            contextInfo: channelContextInfo(),
          };
          if (thumbBuffer) fallbackDocPayload.jpegThumbnail = thumbBuffer;

          await sock.sendMessage(from, fallbackDocPayload, { quoted: mek });
        }
      }

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(
        sock,
        from,
        mek,
        `Streaming download failed: ${error.message || "Unknown Error"}`
      );
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(phReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingPhSearch) {
    if (now - pendingPhSearch[k].timestamp > SESSION_TIMEOUT)
      delete pendingPhSearch[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN)
      delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
