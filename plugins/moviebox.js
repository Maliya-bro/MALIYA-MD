const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const API_BASE = "https://api.chamindu.site";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingMovieBox = Object.create(null);
const lastProcessedMsg = {};

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingMovieBox[k];
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

// ── 1. Search Command ──────────────────────────────────────────
cmd({
  pattern: "moviebox",
  alias: ["mb", "mbsearch"],
  desc: "Direct streaming and subtitle movie downloads",
  category: "download",
  react: "🎥",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *MOVIEBOX DL*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.mb <name>\`\n💡 *Example:*\n• \`.mb avatar\`\n• \`.mb game of thrones\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const res = await axios.get(`${API_BASE}/api/v1/movie/moviebox/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`);
    const results = res.data.data || res.data.results || [];

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
        const custom = await getCustomImage(sessionId, "moviebox_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    // 🔘 ButtonV2 Popup List
    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const mbRows = topResults.map((item, index) => {
          const typeIcon = (item.type === 'tvshows' || item.type === 'tv') ? '📺' : '🎥';
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${(item.title || 'Movie').slice(0, 38)}`,
            description: `${typeIcon} Year: ${item.year || 'N/A'} | Type: ${item.type || 'Movie'}`,
            id: `.mb_select ${index + 1}`
          };
        });

        const fittedThumb = await getFittedImageBuffer(searchImg);

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(fittedThumb);

        btn.addRawButton({
          buttonId: ".mb_list",
          buttonText: { displayText: "🎬 Select Movie / Series" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "MovieBox Results ↯",
              sections: [{ title: "Found Movies & Series", rows: mbRows }]
            }),
          },
        });

        btn.addButton("⚡ Alive", ".alive");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingMovieBox[k] = {
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
        console.log("MOVIEBOX BUTTONV2 ERROR:", err?.message || err);
      }
    }

    // Numbered Fallback Menu
    let text = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const typeIcon = (item.type === 'tvshows' || item.type === 'tv') ? '📺' : '🎥';
      text += `*[ ${numStr} ]* ➔ ${typeIcon} *${(item.title || 'Movie').substring(0, 35)}* (${item.year || 'N/A'})\n`;
    });

    text += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*`;

    const menuMsg = await sock.sendMessage(from, { 
      image: { url: searchImg }, 
      caption: text, 
      contextInfo: channelContextInfo() 
    }, { quoted: mek });

    pendingMovieBox[k] = {
      expectedMsgId: menuMsg.key.id,
      step: 1,
      results: topResults,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (error) {
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to MovieBox server.");
  }
});

// ── 2. Unified Reply Handler ───────────────────────────────────
const mbReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingMovieBox[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".mb_select ") || t.startsWith(".mb_pick_dl ") || t.startsWith(".mb_batch_dl")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const maxItems = state.step === 1 ? state.results.length : (state.step === "tv_episode" ? state.episodes.length + 1 : state.downloads.length);
    const isNum = !isNaN(num) && num > 0 && num <= maxItems;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingMovieBox[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;
    let isBatch = false;

    for (const t of texts) {
      if (t.startsWith(".mb_select ") || t.startsWith(".mb_pick_dl ")) {
        choice = parseInt(t.split(" ")[1].trim(), 10);
        break;
      }
      if (t === ".mb_batch_dl") {
        isBatch = true;
        break;
      }
    }

    if (choice === null && !isBatch) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num) && num > 0) {
        choice = num;
      }
    }

    const now = Date.now();
    const sig = `${pending.step}_${choice || (isBatch ? 'batch' : '')}`;
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === sig && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: sig, time: now };

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    // ══════════════════════════════════════════════════════════
    // STEP 1: MOVIE / TV SHOW SELECTION
    // ══════════════════════════════════════════════════════════
    if (pending.step === 1) {
      if (!choice || choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selectedItem = pending.results[choice - 1];
      const isTvShow = selectedItem.type === 'tvshows' || selectedItem.type === 'tv';

      try {
        const detailsRes = await axios.get(`${API_BASE}/api/v1/movie/moviebox/info?q=${encodeURIComponent(selectedItem.link || selectedItem.url)}&api_key=${API_KEY}`);
        const detailsData = detailsRes.data.data || {};
        const posterUrl = detailsData.image || selectedItem.image || DEFAULT_IMAGE;

        // ─── 📺 TV SERIES SELECTED ───
        if (isTvShow) {
          const episodes = detailsData.episodes || detailsData.downloads || [];

          if (episodes.length === 0) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "No episodes available for this series.");
          }

          let tvCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *TV SERIES DETAILS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
          tvCard += `🎬 *Series :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          tvCard += `⭐ *IMDb :* ${detailsData.rating || detailsData.imdb || 'N/A'}\n`;
          tvCard += `📅 *Year :* ${detailsData.year || 'N/A'}\n`;
          tvCard += `🎞️ *Total Episodes :* ${episodes.length}\n`;

          if (btnsOn) {
            try {
              const { ButtonV2 } = await import("@vanzxy/baileys");

              const epRows = episodes.slice(0, 30).map((ep, idx) => ({
                title: `${String(idx + 1).padStart(2, "0")}. ${ep.name || ep.title || 'Episode ' + (idx + 1)}`,
                description: "Direct High-Speed Stream Download",
                id: `.mb_pick_dl ${idx + 1}`
              }));

              const fittedThumb = await getFittedImageBuffer(posterUrl);

              const btn = new ButtonV2(sock)
                .setBody(tvCard + "\n👇 *Select an episode or download all at once:*")
                .setFooter("WaBot by MALIYA-MD Team ツ")
                .setThumbnail(fittedThumb);

              btn.addRawButton({
                buttonId: ".mb_ep_list",
                buttonText: { displayText: "📺 Select Episode" },
                type: 1,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({
                    title: "Episode List ↯",
                    sections: [{ title: "Episodes", rows: epRows }]
                  }),
                },
              });

              // Batch download button
              btn.addButton("📥 Download ALL", ".mb_batch_dl");

              const sentMsg = await btn.send(from, { quoted: mek });

              if (sentMsg?.key?.id) {
                pending.expectedMsgId = sentMsg.key.id;
                pending.step = "tv_episode";
                pending.episodes = episodes;
                pending.metadata = detailsData;
                pending.timestamp = Date.now();
                pending.isProcessing = false;
                await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
                return;
              }
            } catch (err) {
              console.log("TV BUTTONV2 ERROR:", err);
            }
          }

          // Numbered Fallback Menu (With Download ALL option)
          let tvText = tvCard + `\n*[ 00 ]* ➔ 📥 *Download ALL Episodes (Batch)*\n`;
          episodes.slice(0, 25).forEach((ep, idx) => {
            const numStr = String(idx + 1).padStart(2, "0");
            tvText += `*[ ${numStr} ]* ➔ 📺 *${ep.name || ep.title || 'Episode ' + (idx + 1)}*\n`;
          });
          tvText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply with Episode number or 00 for ALL...*`;

          const sentMsg = await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: tvText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.expectedMsgId = sentMsg.key.id;
          pending.step = "tv_episode";
          pending.episodes = episodes;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;

        } else {
          // ─── 🎥 MOVIE SELECTED ───
          const validDownloads = detailsData.downloads || [];

          if (validDownloads.length === 0) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "No direct downloads available for this movie.");
          }

          let movieCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIE DETAILS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
          movieCard += `🎬 *Movie :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          movieCard += `⭐ *IMDb :* ${detailsData.imdb || detailsData.rating || 'N/A'}\n`;
          movieCard += `📅 *Year :* ${detailsData.year || 'N/A'}\n`;
          movieCard += `⏳ *Duration :* ${detailsData.duration || 'N/A'}\n`;

          if (btnsOn) {
            try {
              const { ButtonV2 } = await import("@vanzxy/baileys");

              const dlRows = validDownloads.map((dl, i) => ({
                title: `${String(i + 1).padStart(2, "0")}. ${dl.quality || 'Direct'} Quality`,
                description: `Size: ${dl.size || 'N/A'} | Direct Cloud Upload`,
                id: `.mb_pick_dl ${i + 1}`
              }));

              const fittedThumb = await getFittedImageBuffer(posterUrl);

              const btn = new ButtonV2(sock)
                .setBody(movieCard + "\n👇 *Select your preferred video quality:*")
                .setFooter("WaBot by MALIYA-MD Team ツ")
                .setThumbnail(fittedThumb);

              btn.addRawButton({
                buttonId: ".mb_quality_list",
                buttonText: { displayText: "🍿 Choose Quality" },
                type: 1,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({
                    title: "Quality Options ↯",
                    sections: [{ title: "Available Downloads", rows: dlRows }]
                  }),
                },
              });

              btn.addButton("⚡ Alive", ".alive");

              const sentMsg = await btn.send(from, { quoted: mek });

              if (sentMsg?.key?.id) {
                pending.expectedMsgId = sentMsg.key.id;
                pending.step = "movie_quality";
                pending.downloads = validDownloads;
                pending.metadata = detailsData;
                pending.timestamp = Date.now();
                pending.isProcessing = false;
                await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
                return;
              }
            } catch (err) {
              console.log("MOVIE BUTTONV2 ERROR:", err);
            }
          }

          let movieText = movieCard + `\n`;
          validDownloads.forEach((dl, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            movieText += `*[ ${numStr} ]* 📊 *${dl.quality || 'Direct'}* _(${dl.size || 'N/A'})_\n`;
          });
          movieText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply with quality number to Download...*`;

          const sentMsg = await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: movieText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.expectedMsgId = sentMsg.key.id;
          pending.step = "movie_quality";
          pending.downloads = validDownloads;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;
        }

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (err) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch media details from server.");
      }
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: MOVIE QUALITY CHOSEN
    // ══════════════════════════════════════════════════════════
    else if (pending.step === "movie_quality") {
      if (!choice || choice < 1 || choice > pending.downloads.length) return;

      pending.isProcessing = true;
      const selectedDl = pending.downloads[choice - 1];
      const dlUrl = selectedDl.link || selectedDl.download_link || selectedDl.direct_link;
      const title = pending.metadata.title || "Movie";
      const quality = selectedDl.quality || "HD";
      const poster = pending.metadata.image || DEFAULT_IMAGE;

      clearUserSession(k);
      await fastSendVideo(sock, mek, from, dlUrl, title, quality, poster);
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: TV EPISODE / BATCH DOWNLOAD
    // ══════════════════════════════════════════════════════════
    else if (pending.step === "tv_episode") {
      const isBatchSelect = isBatch || choice === 0;

      // ── BATCH ALL DOWNLOAD ──
      if (isBatchSelect) {
        pending.isProcessing = true;
        const epsToDownload = pending.episodes;
        const seriesTitle = pending.metadata.title || "Series";
        const poster = pending.metadata.image || DEFAULT_IMAGE;

        clearUserSession(k);
        await sock.sendMessage(from, { 
          text: `🚀 *Starting Batch Download for ${epsToDownload.length} Episodes...*\nPlease stay patient while episodes are uploaded one by one.`,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        for (let i = 0; i < epsToDownload.length; i++) {
          const ep = epsToDownload[i];
          const dlUrl = ep.download_link || ep.link || ep.url;
          if (dlUrl) {
            const title = `${seriesTitle} - ${ep.name || ep.title || 'EP ' + (i + 1)}`;
            await fastSendVideo(sock, mek, from, dlUrl, title, "HD", poster);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
        return;
      }

      // ── SINGLE EPISODE DOWNLOAD ──
      if (!choice || choice < 1 || choice > pending.episodes.length) return;

      pending.isProcessing = true;
      const selectedEp = pending.episodes[choice - 1];
      const dlUrl = selectedEp.download_link || selectedEp.link || selectedEp.url;
      const title = `${pending.metadata.title} - ${selectedEp.name || selectedEp.title || 'EP ' + choice}`;
      const poster = pending.metadata.image || DEFAULT_IMAGE;

      clearUserSession(k);
      await fastSendVideo(sock, mek, from, dlUrl, title, "HD", poster);
    }
  }
};

// ── Direct Document Upload with Thumbnail ───────────────────────
async function fastSendVideo(sock, mek, from, url, rawTitle, quality, posterUrl) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (rawTitle || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX DOWNLOAD* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    captionText += `🎬 *Title :* ${toSmallCaps(rawTitle)}\n`;
    captionText += `📊 *Quality :* ${quality}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(posterUrl);

    const docPayload = {
      document: { url: url },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle}.mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (err) {
    console.error("MovieBox Fast Upload Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to upload video directly. Server might be restricting access.`);
  }
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(mbReplyHandler);
}

// Session Cleaner
setInterval(() => {
  const now = Date.now();
  for (const k in pendingMovieBox) {
    if (now - pendingMovieBox[k].timestamp > SESSION_TIMEOUT) {
      delete pendingMovieBox[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = {};
