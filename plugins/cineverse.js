const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const DL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "Referer": "https://cineverselk.space/",
  "Accept": "*/*",
  "Cookie": "cv_auth=true;"
};

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_POSTER = "https://i.ibb.co/3m1bXvt/cineverse.jpg";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingCineVerse = {};
const lastProcessedMsg = {};

function makePendingKey(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingCineVerse[k];
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

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getQuotedStanzaId(mek, m) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

function extractIncomingPayload(body, mek, m) {
  const paramsJson =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    
  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
      if (btnId) return { payload: String(btnId).trim(), isButton: true };
    }
  }

  const directId =
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId ||
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    mek?.message?.buttonsResponseMessage?.selectedButtonId;
    
  if (directId) return { payload: String(directId).trim(), isButton: true };

  const text =
    m?.message?.interactiveResponseMessage?.body?.text ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    mek?.message?.interactiveResponseMessage?.body?.text ||
    mek?.message?.conversation ||
    mek?.message?.extendedTextMessage?.text ||
    body ||
    "";
    
  return { payload: String(text).trim(), isButton: false };
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

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

/* ================= COMMAND: .cineverse ================= */
cmd({
  pattern: "cineverse",
  alias: ["cv", "cvlk", "sinhala"],
  react: "🎬",
  desc: "Search and download Sinhala Subbed Movies & Series from Cineverse",
  category: "download",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const cb = Date.now();
    const [mRes, sRes] = await Promise.all([
      axios.get(`https://cineverselk.space/movies.json?v=${cb}`, { headers: DL_HEADERS, timeout: 15000 }).catch(() => null),
      axios.get(`https://cineverselk.space/series.json?v=${cb}`, { headers: DL_HEADERS, timeout: 15000 }).catch(() => null)
    ]);

    const movies = mRes?.data?.data ? mRes.data.data : (Array.isArray(mRes?.data) ? mRes.data : []);
    const series = sRes?.data?.data ? sRes.data.data : (Array.isArray(sRes?.data) ? sRes.data : []);
    const allData = [...movies, ...series];

    const queryWords = q.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
    const results = allData.filter(item => {
      if (!item.title) return false;
      const titleClean = item.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      return queryWords.every(word => titleClean.includes(word));
    }).slice(0, 10);

    if (results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No results found for "${q}".`);
    }

    const k = makePendingKey(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cineverse_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${results.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    // ButtonV2 System
    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const cvRows = results.map((item, index) => {
          const type = item.isSeries ? "📺 Series" : "🎥 Movie";
          const yr = item.year ? ` (${item.year})` : "";
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 42)}${yr}`,
            description: `${type} | ⭐ ${item.imdbRating || "N/A"} | 💽 ${item.quality || "1080p"}`,
            id: `.cv_select ${index + 1}`
          };
        });

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "cineverse_search_list",
          buttonText: { displayText: "🎬 Select Movie / Series" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "CineVerse Search Results ↯",
              sections: [
                {
                  title: "🎥 Available Titles",
                  rows: cvRows
                }
              ]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingCineVerse[k] = {
            expectedMsgId: sentMsg.key.id,
            results: results,
            timestamp: Date.now(),
            isProcessing: false,
          };
          await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
          return;
        }
      } catch (err) {
        console.log("CINEVERSE BUTTONV2 ERROR:", err?.message || err);
      }
    }

    // Fallback Numbered Menu
    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    text += `🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐒𝐄𝐀𝐑𝐂𝐇*\n`;
    text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${results.length}\n\n`;

    results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const type = item.isSeries ? "📺 Series" : "🎥 Movie";
      const year = item.year ? ` (${item.year})` : "";
      text += `*[ ${numStr} ]* ➔ *${item.title}*${year}\n`;
      text += `   ├ 🏷️ ${type} | ⭐ ${item.imdbRating || "N/A"}\n`;
      text += `   ╰ 💽 ${item.quality || "1080p FHD"}\n\n`;
    });

    text += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number to Download...*`;

    const sentMsg = await sock.sendMessage(from, { 
      image: { url: searchImg }, 
      caption: text, 
      contextInfo: channelContextInfo() 
    }, { quoted: mek });

    pendingCineVerse[k] = {
      expectedMsgId: sentMsg.key.id,
      results: results,
      timestamp: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("CineVerse Search Error:", e);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
  }
});

/* ================= REPLY HANDLER ================= */
const cvReplyHandler = {
  filter: (text, { sender, from, mek, m }) => {
    const k = makePendingKey(sender, from);
    const pending = pendingCineVerse[k];
    if (!pending) return false;

    const { payload, isButton } = extractIncomingPayload(text, mek, m);
    if (!payload) return false;

    if (isButton && (payload.startsWith(".cv_select ") || payload.startsWith(".cv_ep "))) return true;

    if (/^\d+$/.test(payload) \vert{}\vert{} /^\d+\s+\d+$/.test(payload)) {
      const quotedId = getQuotedStanzaId(mek, m);
      return Boolean(quotedId && quotedId === pending.expectedMsgId);
    }

    return false;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const { payload, isButton } = extractIncomingPayload(body, mek, m);
    if (!payload) return;

    const k = makePendingKey(sender, from);
    const pending = pendingCineVerse[k];
    if (!pending || pending.isProcessing) return;

    if (!isButton) {
      const quotedId = getQuotedStanzaId(mek, m);
      if (!quotedId || quotedId !== pending.expectedMsgId) {
        return;
      }
    }

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: payload, time: now };

    // STEP 1: Title Selection
    if (pending.results) {
      let choice = null;
      if (payload.startsWith(".cv_select ")) {
        choice = parseInt(payload.replace(".cv_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        choice = parseInt(payload, 10);
      }

      if (choice === null || isNaN(choice) || choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      const selected = pending.results[choice - 1];

      // MOVIE DOWNLOAD
      if (!selected.isSeries) {
        clearUserSession(k);
        await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        const dlUrl = selected.directLink || selected.downloadLink || selected.link;
        if (!dlUrl || dlUrl === '#') {
          return await sendErrorMsg(sock, from, mek, "Direct download link is not available for this movie.");
        }

        let detailsMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        detailsMsg += `🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃*\n`;
        detailsMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        detailsMsg += `🎬 *Movie :* ${toSmallCaps(selected.title)}\n`;
        if (selected.imdbRating) detailsMsg += `⭐ *IMDb :* ${selected.imdbRating}\n`;
        if (selected.duration) detailsMsg += `⏳ *Duration :* ${selected.duration}\n`;
        if (selected.year) detailsMsg += `📅 *Year :* ${selected.year}\n`;
        detailsMsg += `💽 *Quality :* ${selected.quality || "1080p FHD"}\n\n`;
        detailsMsg += `⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> ⬇️ *Downloading & Uploading Movie File...*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

        const posterUrl = selected.posterImage || selected.image || selected.poster || DEFAULT_POSTER;

        await sock.sendMessage(from, { 
          image: { url: posterUrl }, 
          caption: detailsMsg, 
          contextInfo: channelContextInfo() 
        }, { quoted: mek });

        await fastSendVideo(sock, mek, from, dlUrl, selected.title, selected.quality || "1080p FHD", posterUrl);

      } 
      // SERIES SELECTION
      else {
        pending.isProcessing = false;
        pending.series = selected;
        delete pending.results;

        const episodesData = selected.episodesData || {};
        const seasons = Object.keys(episodesData);
        const poster = selected.posterImage || selected.image || selected.poster || DEFAULT_POSTER;

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        // ButtonV2 Series Episode Popup
        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const epRows = [];
            for (const sNum of seasons) {
              const epList = episodesData[sNum] || {};
              for (const eNum of Object.keys(epList)) {
                if (epRows.length >= 25) break;
                const fS = parseInt(sNum, 10) < 10 ? '0' + sNum : sNum;
                const fE = parseInt(eNum, 10) < 10 ? '0' + eNum : eNum;
                epRows.push({
                  title: `Season ${fS} - Episode ${fE}`,
                  description: `Download S${fS}E${fE}`,
                  id: `.cv_ep ${sNum} ${eNum}`
                });
              }
            }

            const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Series :* ${toSmallCaps(selected.title)}\n🗂️ *Seasons :* ${seasons.join(", ") || "N/A"}\n\nChoose an episode from below to start download.\n\n© 2026 MALIYA-MD BOT SYSTEM`;

            const btn = new ButtonV2(sock)
              .setBody(bodyText)
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(poster);

            btn.addRawButton({
              buttonId: "cineverse_ep_list",
              buttonText: { displayText: "📺 Select Episode" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Available Episodes ↯",
                  sections: [
                    {
                      title: "Series Episodes",
                      rows: epRows
                    }
                  ]
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentEpMsg = await btn.send(from, { quoted: mek });

            if (sentEpMsg?.key?.id) {
              pending.expectedMsgId = sentEpMsg.key.id;
              await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
              return;
            }
          } catch (err) {
            console.log("CINEVERSE EP BUTTONV2 ERROR:", err?.message || err);
          }
        }

        // Fallback Numbered Menu for Series
        let sText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        sText += `📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n`;
        sText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        sText += `🎬 *Series :* ${toSmallCaps(selected.title)}\n`;
        sText += `🗂️ *Seasons :* ${seasons.join(", ") || "N/A"}\n\n`;
        sText += `⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 👇 *Swipe & Reply with Season & Episode*\n\n`;
        sText += `> 💡 *Example:* \`1 2\` (Season 1, Episode 2)`;

        const sentMsg = await sock.sendMessage(from, { 
          image: { url: poster }, 
          caption: sText, 
          contextInfo: channelContextInfo() 
        }, { quoted: mek });

        pending.expectedMsgId = sentMsg.key.id;
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      }
    } 
    // STEP 2: Episode Trigger & Download
    else if (pending.series) {
      let s = null;
      let e = null;

      if (payload.startsWith(".cv_ep ")) {
        const parts = payload.replace(".cv_ep ", "").trim().split(/\s+/);
        s = parseInt(parts[0], 10);
        e = parseInt(parts[1], 10);
      } else if (/^\d+\s+\d+$/.test(payload)) {
        const parts = payload.split(/\s+/);
        s = parseInt(parts[0], 10);
        e = parseInt(parts[1], 10);
      }

      if (s === null || e === null || isNaN(s) || isNaN(e)) return;

      const series = pending.series;
      const epData = series.episodesData && series.episodesData[s] ? series.episodesData[s][e] : null;

      if (!epData || !epData.d || epData.d === '#') {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, `Download link not found for Season ${s}, Episode ${e}.`);
      }

      clearUserSession(k);
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const fS = s < 10 ? '0' + s : s;
      const fE = e < 10 ? '0' + e : e;
      const epTitle = `${series.title} S${fS}E${fE}`;
      const posterUrl = series.posterImage || series.image || series.poster || DEFAULT_POSTER;

      await fastSendVideo(sock, mek, from, epData.d, epTitle, series.quality || "1080p FHD", posterUrl);
    }
  }
};

async function fastSendVideo(sock, mek, from, url, rawTitle, quality, posterUrl = null) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    const cleanTitle = (rawTitle || "Movie").replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();

    let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    captionText += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
    captionText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    captionText += `🎬 *Movie :* ${toSmallCaps(rawTitle)}\n`;
    captionText += `📊 *Quality :* ${quality}\n\n`;
    captionText += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(posterUrl);

    const streamRes = await axios({
      url: url,
      method: "GET",
      responseType: "stream",
      headers: DL_HEADERS,
      maxRedirects: 5,
      timeout: 60000,
    });

    const docPayload = {
      document: { stream: streamRes.data },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo()
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (err) {
    console.error("Cineverse Fast Upload Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to upload video directly. Link might be restricted.`);
  }
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(cvReplyHandler);
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineVerse) {
    if (now - pendingCineVerse[k].timestamp > SESSION_TIMEOUT) delete pendingCineVerse[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
