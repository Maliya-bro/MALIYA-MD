const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const https = require("https");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const SEARCH_ACTION_ID = '4030206670241da32df0a5d1e0827a2ac752327e0d';
const SECURE_URL_ACTION_ID = '405a53934b798a3f28ee1d33fe148bcf8187a18654';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });
const client = axios.create({
  baseURL: 'https://cinevibes.lk',
  httpsAgent,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
  }
});

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingCine = Object.create(null);
const lastProcessedMsg = {};

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingCine[k];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((char) => {
    const idx = normal.indexOf(char);
    return idx !== -1 ? small[idx] : char;
  }).join("");
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

async function getThumbnailBuffer(url) {
  try {
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
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
      if (parsed.name) texts.push(String(parsed.name).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *ERROR*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

function parseRscResponse(rscText) {
  const lines = rscText.split('\n');
  for (const line of lines) {
    if (line.startsWith('1:')) {
      return JSON.parse(line.slice(2));
    }
  }
  throw new Error('RSC data parse failed');
}

async function searchCineMovies(query, year = 'All') {
  try {
    const res = await client.post('/', JSON.stringify([query, year]), {
      headers: {
        'Accept': 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'next-action': SEARCH_ACTION_ID,
        'Origin': 'https://cinevibes.lk',
        'Referer': 'https://cinevibes.lk/'
      }
    });

    const data = parseRscResponse(res.data);
    const list = Array.isArray(data) ? data : (data.results || data.data || []);

    return list.map(item => ({
      title: item.title,
      year: item.year,
      rating: item.rating,
      type: item.type || 'Movie',
      slug: item.slug,
      poster: item.posterUrl || item.poster || null,
      url: item.type === 'TVShow' 
        ? `https://cinevibes.lk/tv-show/${item.slug}` 
        : `https://cinevibes.lk/movie/${item.slug}`
    }));
  } catch (err) {
    return [];
  }
}

async function resolveDirectLink(moviePath, rawSrvUrl) {
  const res = await client.post(moviePath, JSON.stringify([rawSrvUrl]), {
    headers: {
      'Accept': 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'next-action': SECURE_URL_ACTION_ID,
      'Origin': 'https://cinevibes.lk',
      'Referer': `https://cinevibes.lk${moviePath}`
    }
  });
  return parseRscResponse(res.data);
}

// ── 1. Search Command (.cv / .cinevibes) ──────────────────────
cmd({
  pattern: "cinevibes",
  alias: ["cv", "cvsearch"],
  desc: "Search and download movies from CineVibes with direct streaming",
  category: "download",
  react: "🍿",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🍿 *CINEVIBES SEARCH DL*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.cv <movie name>\`\n💡 *Example:*\n• \`.cv spider-man\`\n• \`.cv avatar\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const results = await searchCineMovies(q.trim());
    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}".`);
    }

    const topResults = results.slice(0, 15);
    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let searchImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cinevibes_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *CINEVIBES SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const cvRows = topResults.map((item, index) => {
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${(item.title || 'Movie').slice(0, 38)}`,
            description: `⭐ IMDb: ${item.rating || 'N/A'} | Year: ${item.year || 'N/A'}`,
            id: `.cv_select ${index + 1}`
          };
        });

        const fittedThumb = await getFittedImageBuffer(searchImg);

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(fittedThumb);

        btn.addRawButton({
          buttonId: ".cv_list",
          buttonText: { displayText: "🍿 Select Movie" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "CineVibes Results ↯",
              sections: [{ title: "Found Movies", rows: cvRows }]
            }),
          },
        });

        btn.addButton("⚡ Alive", ".alive");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingCine[k] = {
            expectedMsgId: sentMsg.key.id,
            step: 1,
            results: topResults,
            timestamp: Date.now(),
            isProcessing: false,
          };
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.log("CINEVIBES BUTTONV2 ERROR:", err);
      }
    }

    let text = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *CINEVIBES SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      text += `*[ ${numStr} ]* ➔ 🎬 *${(item.title || 'Movie').substring(0, 35)}* (${item.year || 'N/A'}) [⭐ ${item.rating || 'N/A'}]\n`;
    });

    text += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply with a number to Download...*`;

    const menuMsg = await sock.sendMessage(from, { 
      image: { url: searchImg }, 
      caption: text, 
      contextInfo: channelContextInfo() 
    }, { quoted: mek });

    pendingCine[k] = {
      expectedMsgId: menuMsg.key.id,
      step: 1,
      results: topResults,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (error) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVibes server.");
  }
});

// ── 2. Reply Handler ───────────────────────────────────────────
const cvReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingCine[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".cv_select ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.results.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const k = keyFor(sender, from);
    const pending = pendingCine[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".cv_select ")) {
        choice = parseInt(t.split(" ")[1].trim(), 10);
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
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === String(choice) && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    pending.isProcessing = true;
    clearUserSession(k);

    const selectedMovie = pending.results[choice - 1];
    await processCineDownload(sock, mek, from, selectedMovie);
  },
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(cvReplyHandler);
}

// ── 3. Resolve & Stream Direct Link (Stream Safe Pipe - 0MB Extra RAM) ──
async function processCineDownload(sock, mek, from, movieObj) {
  try {
    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    // URL path එක ලබා ගැනීම
    const moviePath = movieObj.url.startsWith('http') 
      ? new URL(movieObj.url).pathname 
      : movieObj.url;

    const { data: html } = await client.get(moviePath);
    const cleanHtml = html.replace(/\\"/g, '"');

    const playerMatch = cleanHtml.match(/"url":"([^"]+)","poster":"[^"]*","subtitles":(\[[^\]]*\])/);

    let rawVideoUrl = null;
    let rawSubUrl = null;

    if (playerMatch) {
      rawVideoUrl = playerMatch[1];
      try {
        const subs = JSON.parse(playerMatch[2]);
        if (subs.length > 0 && subs[0].url) {
          rawSubUrl = subs[0].url;
        }
      } catch (e) {}
    } else {
      const srvVideo = cleanHtml.match(/(srv\d+:[^"]+\.(?:mkv|mp4|webm|avi))/i);
      const srvSub = cleanHtml.match(/(srv\d+:[^"]+\.(?:srt|zip|vtt))/i);
      if (srvVideo) rawVideoUrl = srvVideo[1];
      if (srvSub) rawSubUrl = srvSub[1];
    }

    if (!rawVideoUrl) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, "No direct video stream player found for this movie on CineVibes.");
    }

    if (rawVideoUrl.includes('pixeldrain.com') && rawVideoUrl.includes('/u/')) {
      rawVideoUrl = rawVideoUrl.replace('/u/', '/api/file/');
    }

    const directVideoLink = rawVideoUrl.startsWith('http') && !rawVideoUrl.includes('srv')
      ? rawVideoUrl
      : await resolveDirectLink(moviePath, rawVideoUrl);

    let directSubLink = null;
    if (rawSubUrl) {
      directSubLink = rawSubUrl.startsWith('http') && !rawSubUrl.includes('srv')
        ? rawSubUrl
        : await resolveDirectLink(moviePath, rawSubUrl);
    }

    if (!directVideoLink) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, "Failed to resolve secure direct video download link.");
    }

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (movieObj.title || "CineVibes Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *CINEVIBES DOWNLOAD* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    captionText += `🎬 *Title :* ${toSmallCaps(movieObj.title)}\n`;
    captionText += `📅 *Year :* ${movieObj.year || 'N/A'}\n`;
    captionText += `⭐ *IMDb :* ${movieObj.rating || 'N/A'}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(movieObj.poster);

    // ⚡ Baileys Expired/Forbidden වළක්වා ගැනීමට Axios Stream එකක් ලෙස Pipe කිරීම (RAM එක පිරෙන්නේ නැත)
    console.log(`[CineVibes] Streaming video to WhatsApp: ${directVideoLink}`);
    const videoStreamRes = await axios.get(directVideoLink, {
      responseType: 'stream',
      httpsAgent,
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://cinevibes.lk/'
      }
    });

    const docPayload = {
      document: { stream: videoStreamRes.data },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle}.mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });

    // Send Subtitle if available (Stream Pipe)
    if (directSubLink) {
      try {
        const subStreamRes = await axios.get(directSubLink, {
          responseType: 'stream',
          httpsAgent,
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://cinevibes.lk/'
          }
        });

        await sock.sendMessage(from, {
          document: { stream: subStreamRes.data },
          mimetype: "application/x-subrip",
          fileName: `MALIYA-MD ${cleanTitle} [Sinhala Sub].srt`,
          caption: `📄 *Sinhala Subtitle Attached:*\n🎬 _${movieObj.title}_`,
          contextInfo: channelContextInfo()
        }, { quoted: mek });
      } catch (e) {
        console.error("Subtitle Stream Error:", e.message);
      }
    }

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("CineVibes Process Error:", err.response ? `${err.response.status} ${err.response.statusText}` : err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to download and stream movie: ${err.message}`);
  }
}

// Session Cleaner
setInterval(() => {
  const now = Date.now();
  for (const k in pendingCine) {
    if (now - pendingCine[k].timestamp > SESSION_TIMEOUT) {
      delete pendingCine[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = {};
