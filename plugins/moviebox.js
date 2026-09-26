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
  desc: "Direct streaming and subtitle movie & series downloads",
  category: "download",
  react: "🎥",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *MOVIEBOX DL*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.mb <name>\`\n💡 *Example:*\n• \`.mb avatar\`\n• \`.mb loki\``,
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

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const mbRows = topResults.map((item, index) => {
          const isTv = (item.type === 'tvshows' || item.type === 'tv');
          const typeIcon = isTv ? '📺' : '🎥';
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${(item.title || 'Title').slice(0, 38)}`,
            description: `${typeIcon} Year: ${item.year || 'N/A'} | Type: ${isTv ? 'TV Series' : 'Movie'}`,
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
              title: "Search Results ↯",
              sections: [{ title: "Found Titles", rows: mbRows }]
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
        console.log("SEARCH BUTTONV2 ERROR:", err);
      }
    }

    // Fallback Numbered Menu
    let text = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const isTv = (item.type === 'tvshows' || item.type === 'tv');
      text += `*[ ${numStr} ]* ➔ ${isTv ? '📺' : '🎥'} *${(item.title || 'Title').substring(0, 35)}* (${item.year || 'N/A'})\n`;
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

// ── 2. Master Reply Handler ────────────────────────────────────
const mbReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingMovieBox[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (
        t.startsWith(".mb_select ") || 
        t.startsWith(".mb_season ") || 
        t.startsWith(".mb_ep ") || 
        t.startsWith(".mb_movie_dl ") || 
        t === ".mb_batch_ep"
      ) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num >= 0;

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
      if (t.startsWith(".mb_select ") || t.startsWith(".mb_season ") || t.startsWith(".mb_ep ") || t.startsWith(".mb_movie_dl ")) {
        choice = parseInt(t.split(" ")[1].trim(), 10);
        break;
      }
      if (t === ".mb_batch_ep") {
        isBatch = true;
        break;
      }
    }

    if (choice === null && !isBatch) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num)) {
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

    // ──────────────────────────────────────────────────────────
    // STEP 1: MOVIE OR SERIES TITLE SELECTED
    // ──────────────────────────────────────────────────────────
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

        // ─── 📺 TV SERIES ROUTE ───
        if (isTvShow) {
          let seasons = detailsData.seasons || [];

          // API එකේ direct episodes arrays තිබුණොත් Seasons auto-group කිරීම
          if (!seasons.length && detailsData.episodes) {
            const seasonMap = {};
            detailsData.episodes.forEach(ep => {
              const sNum = ep.season || 1;
              if (!seasonMap[sNum]) seasonMap[sNum] = { season: sNum, episodes: [] };
              seasonMap[sNum].episodes.push(ep);
            });
            seasons = Object.values(seasonMap);
          }

          if (!seasons.length) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "No seasons or episodes available for this series.");
          }

          let tvCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *TV SERIES SEASONS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
          tvCard += `🎬 *Series :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          tvCard += `⭐ *IMDb :* ${detailsData.rating || detailsData.imdb || 'N/A'}\n`;
          tvCard += `📅 *Year :* ${detailsData.year || 'N/A'}\n`;
          tvCard += `📁 *Total Seasons :* ${seasons.length}\n`;

          if (btnsOn) {
            try {
              const { ButtonV2 } = await import("@vanzxy/baileys");

              const seasonRows = seasons.map((s, idx) => ({
                title: `Season ${s.season || idx + 1}`,
                description: `${(s.episodes || []).length || 'Multiple'} Episodes available`,
                id: `.mb_season ${idx + 1}`
              }));

              const fittedThumb = await getFittedImageBuffer(posterUrl);

              const btn = new ButtonV2(sock)
                .setBody(tvCard + "\n👇 *Select a season to view episodes:*")
                .setFooter("WaBot by MALIYA-MD Team ツ")
                .setThumbnail(fittedThumb);

              btn.addRawButton({
                buttonId: ".mb_season_list",
                buttonText: { displayText: "📁 Select Season" },
                type: 1,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({
                    title: "Available Seasons ↯",
                    sections: [{ title: "Seasons", rows: seasonRows }]
                  }),
                },
              });

              btn.addButton("⚡ Alive", ".alive");

              const sentMsg = await btn.send(from, { quoted: mek });

              if (sentMsg?.key?.id) {
                pending.expectedMsgId = sentMsg.key.id;
                pending.step = "select_season";
                pending.seasons = seasons;
                pending.metadata = detailsData;
                pending.timestamp = Date.now();
                pending.isProcessing = false;
                await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
                return;
              }
            } catch (err) {
              console.log("SEASONS BUTTON ERROR:", err);
            }
          }

          // Fallback Numbered Menu for Seasons
          let seasonText = tvCard + `\n`;
          seasons.forEach((s, idx) => {
            const numStr = String(idx + 1).padStart(2, "0");
            seasonText += `*[ ${numStr} ]* ➔ 📁 *Season ${s.season || idx + 1}* _(${(s.episodes || []).length || 'Eps'} episodes)_\n`;
          });
          seasonText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply with Season number...*`;

          const sentMsg = await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: seasonText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.expectedMsgId = sentMsg.key.id;
          pending.step = "select_season";
          pending.seasons = seasons;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;

        } else {
          // ─── 🎥 MOVIE ROUTE ───
          const validDownloads = detailsData.downloads || [];

          if (!validDownloads.length) {
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
                id: `.mb_movie_dl ${i + 1}`
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
                pending.subtitles = detailsData.subtitles || [];
                pending.metadata = detailsData;
                pending.timestamp = Date.now();
                pending.isProcessing = false;
                await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
                return;
              }
            } catch (err) {
              console.log("MOVIE BUTTON ERROR:", err);
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
          pending.subtitles = detailsData.subtitles || [];
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;
        }

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (err) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch details from server.");
      }
    }

    // ──────────────────────────────────────────────────────────
    // STEP 2: SEASON SELECTED ➔ EPISODES LIST
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_season") {
      if (!choice || choice < 1 || choice > pending.seasons.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selectedSeason = pending.seasons[choice - 1];
      const episodes = selectedSeason.episodes || [];
      const posterUrl = pending.metadata.image || DEFAULT_IMAGE;

      if (!episodes.length) {
        pending.isProcessing = false;
        return await sendErrorMsg(sock, from, mek, "No episodes found for this season.");
      }

      let epCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *SEASON ${selectedSeason.season || choice} EPISODES* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
      epCard += `🎬 *Series :* ${toSmallCaps(pending.metadata.title)}\n`;
      epCard += `📁 *Season :* ${selectedSeason.season || choice}\n`;
      epCard += `🎞️ *Episodes :* ${episodes.length}\n`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const epRows = episodes.slice(0, 30).map((ep, idx) => ({
            title: `${String(idx + 1).padStart(2, "0")}. ${ep.name || ep.title || 'Episode ' + (idx + 1)}`,
            description: "Direct Video Stream + Auto Subtitle",
            id: `.mb_ep ${idx + 1}`
          }));

          const fittedThumb = await getFittedImageBuffer(posterUrl);

          const btn = new ButtonV2(sock)
            .setBody(epCard + "\n👇 *Select an episode to download with subtitle, or Download ALL:*")
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: ".mb_episodes_list",
            buttonText: { displayText: "📺 Select Episode" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Episode List ↯",
                sections: [{ title: "Season Episodes", rows: epRows }]
              }),
            },
          });

          // Single row side-by-side Batch Download button
          btn.addButton("📥 Download ALL", ".mb_batch_ep");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_episode";
            pending.currentSeason = selectedSeason;
            pending.episodes = episodes;
            pending.timestamp = Date.now();
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (err) {
          console.log("EPISODES BUTTON ERROR:", err);
        }
      }

      // Fallback Numbered Menu for Episodes
      let epText = epCard + `\n*[ 00 ]* ➔ 📥 *Download ALL Episodes + All Subs (Batch)*\n`;
      episodes.slice(0, 25).forEach((ep, idx) => {
        const numStr = String(idx + 1).padStart(2, "0");
        epText += `*[ ${numStr} ]* ➔ 📺 *${ep.name || ep.title || 'Episode ' + (idx + 1)}*\n`;
      });
      epText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Reply with Episode number or 00 for ALL...*`;

      const sentMsg = await sock.sendMessage(from, { 
        image: { url: posterUrl }, 
        caption: epText, 
        contextInfo: channelContextInfo() 
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_episode";
      pending.currentSeason = selectedSeason;
      pending.episodes = episodes;
      pending.timestamp = Date.now();
      pending.isProcessing = false;

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 3: EPISODE CHOSEN (SINGLE / BATCH + SUBTITLES)
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_episode") {
      const isBatchSelect = isBatch || choice === 0;

      // ── BATCH ALL EPISODES + SUBTITLES ──
      if (isBatchSelect) {
        pending.isProcessing = true;
        const epsToDownload = pending.episodes;
        const seriesTitle = pending.metadata.title || "Series";
        const seasonNum = pending.currentSeason?.season || 1;
        const poster = pending.metadata.image || DEFAULT_IMAGE;

        clearUserSession(k);

        await sock.sendMessage(from, { 
          text: `🚀 *Starting Batch Download: Season ${seasonNum} (${epsToDownload.length} Episodes + Subtitles)*\nEpisodes and Subtitle files will be delivered sequentially. Please hold on!`,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        for (let i = 0; i < epsToDownload.length; i++) {
          const ep = epsToDownload[i];
          const dlUrl = ep.download_link || ep.link || ep.url;
          const subUrl = ep.subtitle || ep.sub || (pending.currentSeason?.subtitles && pending.currentSeason.subtitles[i]);

          if (dlUrl) {
            const title = `${seriesTitle} S${String(seasonNum).padStart(2, '0')}E${String(i + 1).padStart(2, '0')} - ${ep.name || ep.title || 'Episode ' + (i + 1)}`;
            await fastSendVideo(sock, mek, from, dlUrl, title, "HD", poster);
            
            // Auto-send Subtitle file immediately after Episode video
            if (subUrl) {
              await sendSubtitleDoc(sock, mek, from, subUrl, `${seriesTitle} S${seasonNum}E${i + 1}`);
            }
            await new Promise(r => setTimeout(r, 3000));
          }
        }
        return;
      }

      // ── SINGLE EPISODE + SINGLE SUBTITLE ──
      if (!choice || choice < 1 || choice > pending.episodes.length) return;

      pending.isProcessing = true;
      const selectedEp = pending.episodes[choice - 1];
      const dlUrl = selectedEp.download_link || selectedEp.link || selectedEp.url;
      const subUrl = selectedEp.subtitle || selectedEp.sub;
      
      const seriesTitle = pending.metadata.title || "Series";
      const seasonNum = pending.currentSeason?.season || 1;
      const title = `${seriesTitle} S${String(seasonNum).padStart(2, '0')}E${String(choice).padStart(2, '0')} - ${selectedEp.name || selectedEp.title || 'Episode ' + choice}`;
      const poster = pending.metadata.image || DEFAULT_IMAGE;

      clearUserSession(k);

      await fastSendVideo(sock, mek, from, dlUrl, title, "HD", poster);

      // Auto-send subtitle for selected episode
      if (subUrl) {
        await sendSubtitleDoc(sock, mek, from, subUrl, `${seriesTitle} S${seasonNum}E${choice}`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // STEP: MOVIE QUALITY CHOSEN (VIDEO + MOVIE SUBTITLES)
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "movie_quality") {
      if (!choice || choice < 1 || choice > pending.downloads.length) return;

      pending.isProcessing = true;
      const selectedDl = pending.downloads[choice - 1];
      const dlUrl = selectedDl.link || selectedDl.download_link || selectedDl.direct_link;
      const title = pending.metadata.title || "Movie";
      const quality = selectedDl.quality || "HD";
      const poster = pending.metadata.image || DEFAULT_IMAGE;
      const subtitles = pending.subtitles || [];

      clearUserSession(k);

      await fastSendVideo(sock, mek, from, dlUrl, title, quality, poster);

      // Auto-send movie subtitle if available in response
      if (subtitles.length > 0) {
        const sub = subtitles[0];
        const subUrl = sub.url || sub.link || sub;
        if (typeof subUrl === 'string') {
          await sendSubtitleDoc(sock, mek, from, subUrl, title);
        }
      }
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

// ── Subtitle File Auto-Sender ──────────────────────────────────
async function sendSubtitleDoc(sock, mek, from, subUrl, title) {
  try {
    const cleanTitle = (title || "Subtitle").replace(/[^\w\s.-]/gi, "").trim();
    const isZip = subUrl.endsWith(".zip") || subUrl.includes(".zip");
    const ext = isZip ? "zip" : "srt";
    const mime = isZip ? "application/zip" : "application/x-subrip";

    await sock.sendMessage(from, {
      document: { url: subUrl },
      mimetype: mime,
      fileName: `MALIYA-MD ${cleanTitle}.${ext}`,
      caption: `📄 *Subtitle File Attached:*\n🎬 _${cleanTitle}_`,
      contextInfo: channelContextInfo()
    }, { quoted: mek });
  } catch (err) {
    console.log("Subtitle Send Error:", err.message);
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
