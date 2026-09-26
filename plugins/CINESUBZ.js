const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const sharp = require("sharp");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;
const pendingCineSubz = {};
const lastProcessedMsg = {};

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingCineSubz[k];
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
      serverMessageId: -1
    }
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

async function getThumbnailBuffer(url) {
  const tryUrl = url || DEFAULT_SEARCH_IMAGE;
  try {
    const res = await axios.get(tryUrl, { responseType: "arraybuffer", timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return await sharp(Buffer.from(res.data)).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 50 }).toBuffer();
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: "⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _" + text + "_",
    contextInfo: channelContextInfo()
  }, { quoted: mek });
}

async function getCineSubzLinks(originalUrl) {
  let baseServerMatch = originalUrl.match(/server(\d+)/);
  let serversToTry = [];
  if (baseServerMatch) serversToTry.push(baseServerMatch[1]);
  ['1', '2', '3', '4', '5', '6', '8', '9', '7', '11'].forEach(s => {
    if (!serversToTry.includes(s)) serversToTry.push(s);
  });

  for (let serverNum of serversToTry) {
    let movieUrl = originalUrl;
    if (baseServerMatch) movieUrl = movieUrl.replace(/server\d+/, `server${serverNum}`);

    try {
      const parsedUrl = new URL(movieUrl);
      const domain = parsedUrl.origin;
      const currentPath = parsedUrl.pathname + parsedUrl.search;
      const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT });

      const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      };

      const initialRes = await axios.get(movieUrl, { httpsAgent: agent, headers: baseHeaders });
      let cookieHeader = '';
      if (initialRes.headers['set-cookie']) {
        cookieHeader = initialRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      }

      let html = initialRes.data;
      let realPageUrl = movieUrl;
      const hexRegex = /[0-9a-fA-F]{200,}/g;
      let payloads = html.match(hexRegex) || [];

      if (payloads.length === 0) {
        const apiUrl = `${domain}/api/download-data${currentPath}`;
        const apiResponse = await axios.get(apiUrl, {
          httpsAgent: agent,
          headers: { ...baseHeaders, 'Accept': 'application/json', 'Referer': movieUrl, 'Cookie': cookieHeader }
        });

        if (apiResponse.headers['set-cookie']) {
          cookieHeader = apiResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }

        if (apiResponse.data && apiResponse.data.redirect) {
          realPageUrl = apiResponse.data.redirect;
          if (!realPageUrl.startsWith('http')) realPageUrl = domain + realPageUrl;

          const pageResponse = await axios.get(realPageUrl, {
            httpsAgent: agent,
            headers: { ...baseHeaders, 'Referer': movieUrl, 'Cookie': cookieHeader }
          });
          html = pageResponse.data;
          payloads = html.match(hexRegex) || [];
        }
      }

      if (payloads.length === 0) continue;

      const allStrings = [...html.matchAll(/(["'])(.*?)\1/g)].map(m => m[2]);
      const keysToTry = [...new Set(allStrings)];
      keysToTry.push("kasun", "cinesubz.lk", "CSPlayer", "ravindu01manoj");

      const results = [];

      for (let hexPayload of payloads) {
        try {
          const payloadBytes = Buffer.from(hexPayload, 'hex');
          const postHeaders = {
            'User-Agent': baseHeaders['User-Agent'],
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Content-Type': 'application/octet-stream',
            'Cookie': cookieHeader,
            'Origin': domain,
            'Referer': realPageUrl,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
          };

          const dlResponse = await axios.post(realPageUrl, payloadBytes, {
            httpsAgent: agent,
            headers: postHeaders,
            responseType: 'arraybuffer'
          });

          const responseText = Buffer.from(dlResponse.data).toString('utf8');
          const encryptedUrlMatch = responseText.match(/U2FsdGVkX1[a-zA-Z0-9+/=]+/);

          if (encryptedUrlMatch) {
            const encryptedUrl = encryptedUrlMatch[0];
            for (let key of keysToTry) {
              if (!key || key.length < 3) continue;
              try {
                const decryptedBytes = CryptoJS.AES.decrypt(encryptedUrl, key);
                let decodedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);

                if (decodedStr && !decodedStr.startsWith('http')) {
                  try { decodedStr = Buffer.from(decodedStr, 'base64').toString('utf8'); } catch(e){}
                }

                if (decodedStr && decodedStr.startsWith('http')) {
                  results.push(decodedStr);
                  break;
                }
              } catch (e) {}
            }
          }
        } catch (err) {}
      }

      const finalLinks = [...new Set(results)];
      if (finalLinks.length > 0) return { success: true, links: finalLinks };

    } catch (error) {
      continue;
    }
  }
  return { error: 'File not found on any server.' };
}

/* ================= COMMAND: .cinesubz ================= */
cmd({
  pattern: "cinesubz",
  alias: ["cinesub", "cs", "cssearch", "film", "movie"],
  react: "🎬",
  desc: "Search and send movies from Cinesubz.co",
  category: "download",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: "⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* `.cinesubz <name>`\n💡 *Example:* `.cinesubz avengers`",
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "📺", key: mek.key } });

    const results = await searchCineSubz(q.trim());
    if (!results || results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, `No movies found on CineSubz for "${q}".`);
    }

    const topResults = results.slice(0, 10);
    const k = keyFor(sender, from);
    clearUserSession(k);

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cinesubz_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const movieRows = topResults.map((item, index) => ({
          title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
          description: "Click to view movie qualities",
          id: `.cs_select ${index + 1}`
        }));

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "cinesubz_movies_list",
          buttonText: { displayText: "🎬 Select Movie" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "CineSubz Search Results ↯",
              sections: [{ title: "🎥 Available Movies", rows: movieRows }]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingCineSubz[k] = { 
            step: 1, 
            results: topResults, 
            timestamp: Date.now(), 
            isProcessing: false,
            expectedMsgId: sentMsg.key.id 
          };
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (e) {
        console.log("CINESUBZ BUTTONV2 ERROR:", e?.message || e);
      }
    }

    // Numbered Fallback
    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n`;
    topResults.forEach((item, index) => {
      text += `*[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${item.title}*\n`;
    });
    text += "\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*";

    const sentMsg = await sock.sendMessage(from, { image: { url: searchImg }, caption: text, contextInfo: channelContextInfo() }, { quoted: mek });
    
    pendingCineSubz[k] = { 
      step: 1, 
      results: topResults, 
      timestamp: Date.now(), 
      isProcessing: false,
      expectedMsgId: sentMsg.key.id 
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (error) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineSubz search server.");
  }
});

/* ================= REPLY HANDLER ================= */
const csReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineSubz[k];
    if (!pending) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".cs_select ") || t.startsWith(".cs_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const max = pending.step === 1 ? (pending.results?.length || 0) : (pending.movie?.downloadLinks?.length || 0);
    const isNum = !isNaN(num) && num > 0 && num <= max;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === pending.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineSubz[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".cs_select ")) {
        choice = parseInt(t.replace(".cs_select ", "").trim(), 10);
        break;
      }
      if (t.startsWith(".cs_dl ")) {
        choice = parseInt(t.replace(".cs_dl ", "").trim(), 10);
        break;
      }
    }

    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num)) choice = num;
    }

    if (!choice || choice < 1) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === String(choice) && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    // STEP 1: Select Movie
    if (pending.step === 1) {
      if (choice > pending.results.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selected = pending.results[choice - 1];
      try {
        const movieInfo = await scrapeCineSubz(selected.url);
        if (!movieInfo || !movieInfo.downloadLinks || movieInfo.downloadLinks.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No download links available for this movie.");
        }

        const downloadLinks = movieInfo.downloadLinks.filter(d => {
          const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
          if (match) {
            const size = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === 'GB') return size < 2.0;
            if (unit === 'MB') return true;
          }
          return true;
        });

        if (downloadLinks.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No download links found below 2GB.");
        }

        const imgToSend = movieInfo.poster || movieInfo.image || DEFAULT_SEARCH_IMAGE;
        let qualityBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate) qualityBody += `⭐ *IMDb :* ${movieInfo.imdb_rate}\n`;
        if (movieInfo.duration) qualityBody += `⏳ *Duration :* ${movieInfo.duration}\n\n`;
        qualityBody += `Available formats below 2GB are listed. Choose one to start download.\n\n© 2026 MALIYA-MD BOT SYSTEM`;

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const qualityRows = downloadLinks.map((d, i) => ({
              title: `${String(i + 1).padStart(2, "0")}. ${d.quality}`,
              description: `Download ${d.quality}`,
              id: `.cs_dl ${i + 1}`
            }));

            const btn = new ButtonV2(sock)
              .setBody(qualityBody)
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(imgToSend);

            btn.addRawButton({
              buttonId: "cinesubz_quality_list",
              buttonText: { displayText: "📥 Select Quality" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Choose Quality & Size ↯",
                  sections: [{ title: "📊 Available Qualities", rows: qualityRows }]
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentQualityMsg = await btn.send(from, { quoted: mek });

            if (sentQualityMsg?.key?.id) {
              pending.step = 2;
              pending.movie = { metadata: movieInfo, downloadLinks };
              pending.timestamp = Date.now();
              pending.isProcessing = false;
              pending.expectedMsgId = sentQualityMsg.key.id;
              await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
              return;
            }
          } catch (e) {
            console.log("CINESUBZ QUALITY BUTTONV2 ERROR:", e?.message || e);
          }
        }

        // Fallback Quality Numbered Menu
        let qualityMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate) qualityMsg += `⭐ *IMDb :* ${movieInfo.imdb_rate}\n`;
        if (movieInfo.duration) qualityMsg += `⏳ *Duration :* ${movieInfo.duration}\n\n`;

        downloadLinks.forEach((d, i) => {
          qualityMsg += `*[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${d.quality}*\n`;
        });
        qualityMsg += "\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply this message with a quality number...*";

        const sentQualityMsg = await sock.sendMessage(from, { image: { url: imgToSend }, caption: qualityMsg, contextInfo: channelContextInfo() }, { quoted: mek });

        pending.step = 2;
        pending.movie = { metadata: movieInfo, downloadLinks };
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        pending.expectedMsgId = sentQualityMsg.key.id;

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (error) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch download links for this movie.");
      }
    }
    // STEP 2: Process Download
    else if (pending.step === 2) {
      if (choice > pending.movie.downloadLinks.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

      const { movie } = pending;
      const selectedLink = movie.downloadLinks[choice - 1];
      let originalServerLink = selectedLink.directUrl;
      let targetServerLink = originalServerLink;

      clearUserSession(k);
      try {
        targetServerLink = targetServerLink.replace(/^https:\/\/[^\/]+/, 'https://drive.csplayer2.space');
        targetServerLink = targetServerLink.replace(/(server\d+\/)\d+:\//, '$1');
        if (targetServerLink.endsWith('.mp4') && !targetServerLink.includes('?ext=')) targetServerLink = targetServerLink.replace('.mp4', '?ext=mp4');

        const finalResult = await getCineSubzLinks(targetServerLink);
        const correctPosterUrl = movie.metadata.poster || movie.metadata.image || DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

        if (!finalResult.success || !finalResult.links || finalResult.links.length === 0) {
          let fallbackText = `⊱━━━━━ • ✿ • ━━━━━⊰\n⚠️ *𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐅𝐀𝐈𝐋𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\nℹ️ _Server එකේ ආරක්ෂක හේතූන් මත Bot ට කෙලින්ම Video එක Download කිරීමට නොහැකි විය._\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

          if (thumbBuffer) {
             await sock.sendMessage(from, { image: thumbBuffer, caption: fallbackText, contextInfo: channelContextInfo() }, { quoted: mek });
          } else {
             await sock.sendMessage(from, { text: fallbackText, contextInfo: channelContextInfo() }, { quoted: mek });
          }
          return await sock.sendMessage(from, { react: { text: "⚠️", key: mek.key } });
        }

        const allLinks = finalResult.links;
        const terracloudLinks = allLinks.filter(link => link.includes('terracloud') || link.includes('skylines'));
        const pixeldrainLinks = allLinks.filter(link => link.includes('pixeldrain'));

        let directDownloadUrl = terracloudLinks[0] || pixeldrainLinks[0] || null;
        const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

        let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        if (directDownloadUrl) {
          const docPayload = {
            document: { url: directDownloadUrl },
            mimetype: "video/mp4",
            fileName: `MALIYA-MD ${cleanTitle}.mp4`,
            caption: captionText,
            contextInfo: channelContextInfo()
          };
          if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;
          await sock.sendMessage(from, docPayload, { quoted: mek });
        } else {
          await sock.sendMessage(from, { text: captionText, contextInfo: channelContextInfo() }, { quoted: mek });
        }
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (error) {
        await sendErrorMsg(sock, from, mek, `Failed to download movie: ${error.message}`);
      }
    }
  }
};

if (Array.isArray(replyHandlers)) replyHandlers.push(csReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineSubz) {
    if (now - pendingCineSubz[k].timestamp > SESSION_TIMEOUT) delete pendingCineSubz[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
