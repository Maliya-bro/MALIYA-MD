const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const API_BASE = "https://api.chamindu.site";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";
const REFERER = "https://videodownloader.site/";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function getTranslatedSubUrl(rawSubUrl) {
  if (!rawSubUrl) return null;
  return `${API_BASE}/api/v1/movie/subtitle/translate?url=${encodeURIComponent(rawSubUrl)}&referer=${encodeURIComponent(REFERER)}&api_key=${API_KEY}`;
}

function separateVideosAndSubs(rawList) {
  const videos = [];
  const subtitles = [];

  if (!Array.isArray(rawList)) return { videos, subtitles };

  rawList.forEach((item) => {
    const qName = (item.quality || item.name || "").toUpperCase();
    const link = item.link || item.download_link || item.url || item.direct_link || "";

    if (qName.includes("SUB") || link.endsWith(".srt") || link.endsWith(".vtt") || link.endsWith(".zip")) {
      subtitles.push({
        label: item.quality || item.name || "Subtitle",
        link: link,
        size: item.size || "N/A"
      });
    } else {
      videos.push({
        quality: item.quality || item.name || "HD",
        link: link,
        size: item.size || "N/A"
      });
    }
  });

  return { videos, subtitles };
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
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *MOVIEBOX DL*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Kasutus:* \`.mb <nimi>\`\n💡 *Näide:*\n• \`.mb avatar\`\n• \`.mb loki\``,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    let results = [];
    try {
      const tvRes = await axios.get(`${API_BASE}/api/v1/movies/moviebox/tv/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`, { timeout: 12000 });
      const rawTv = tvRes.data?.data || tvRes.data?.results || tvRes.data || [];
      if (Array.isArray(rawTv)) {
        results = rawTv.map((it) => ({ ...it, type: "tvshows" }));
      }
    } catch (e) {}

    if (!results.length) {
      try {
        const res = await axios.get(`${API_BASE}/api/v1/movie/moviebox/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`, { timeout: 12000 });
        results = res.data?.data || res.data?.results || [];
      } catch (e) {}
    }

    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sendErrorMsg(sock, from, mek, `Tulemusi ei leitud päringule "${q}".`);
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

    const bodyText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n🎀 *Otsing :* ${q}\n🍿 *Tulemused :* ${topResults.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const mbRows = topResults.map((item, index) => {
          const isTv = (item.type === 'tvshows' || item.type === 'tv');
          const typeIcon = isTv ? '📺' : '🎥';
          return {
            title: `${String(index + 1).padStart(2, "0")}. ${(item.title || item.name || 'Title').slice(0, 38)}`,
            description: `${typeIcon} Aasta: ${item.year || 'N/A'} | Tüüp: ${isTv ? 'TV Series' : 'Film'}`,
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
          buttonText: { displayText: "🎬 Vali Film / Sari" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "Otsingu Tulemused ↯",
              sections: [{ title: "Leitud Pealkirjad", rows: mbRows }]
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

    let text = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIEBOX SEARCH* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    text += `🎀 *Otsing :* ${q}\n`;
    text += `🍿 *Tulemused :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      const isTv = (item.type === 'tvshows' || item.type === 'tv');
      text += `*[ ${numStr} ]* ➔ ${isTv ? '📺' : '🎥'} *${(item.title || item.name || 'Title').substring(0, 35)}* (${item.year || 'N/A'})\n`;
    });

    text += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Vasta numbrit kasutades...*`;

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
    await sendErrorMsg(sock, from, mek, "Ühendus serveriga ebaõnnestus.");
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
        t.startsWith(".mb_ep_dl ") || 
        t.startsWith(".mb_movie_dl ") || 
        t === ".mb_batch_ep"
      ) return true;
    }

    const cleanInput = String(text || "").trim().toLowerCase();
    const isNumOrAll = /^(\d+|00|all)$/.test(cleanInput);

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    return isQuoted || isNumOrAll;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingMovieBox[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;
    let isBatch = false;

    for (const t of texts) {
      if (
        t.startsWith(".mb_select ") || 
        t.startsWith(".mb_season ") || 
        t.startsWith(".mb_ep ") || 
        t.startsWith(".mb_ep_dl ") || 
        t.startsWith(".mb_movie_dl ")
      ) {
        choice = parseInt(t.split(" ")[1].trim(), 10);
        break;
      }
      if (t === ".mb_batch_ep") {
        isBatch = true;
        break;
      }
    }

    const cleanBody = String(body || "").trim().toLowerCase();
    if (choice === null && !isBatch) {
      if (cleanBody === "00" || cleanBody === "all" || cleanBody === "0") {
        isBatch = true;
      } else {
        const num = parseInt(cleanBody, 10);
        if (!isNaN(num)) {
          choice = num;
        }
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
    // STEP 1: FILMI VÕI SARJA VALIK
    // ──────────────────────────────────────────────────────────
    if (pending.step === 1) {
      if (!choice || choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selectedItem = pending.results[choice - 1];
      const isTvShow = selectedItem.type === 'tvshows' || selectedItem.type === 'tv';
      const itemUrl = selectedItem.link || selectedItem.url;

      try {
        const infoUrl = isTvShow 
          ? `${API_BASE}/api/v1/movies/moviebox/tv/info?q=${encodeURIComponent(itemUrl)}&api_key=${API_KEY}`
          : `${API_BASE}/api/v1/movie/moviebox/info?q=${encodeURIComponent(itemUrl)}&api_key=${API_KEY}`;

        const detailsRes = await axios.get(infoUrl, { timeout: 15000 });
        const detailsData = detailsRes.data?.data || detailsRes.data || {};
        const posterUrl = detailsData.image || selectedItem.image || DEFAULT_IMAGE;

        // ─── 📺 TV SARJA TEEKOND ───
        if (isTvShow) {
          let seasons = detailsData.seasons || [];

          if (!seasons.length && detailsData.episodes) {
            const seasonMap = {};
            detailsData.episodes.forEach(ep => {
              const sNum = typeof ep === 'object' ? (ep.season || 1) : 1;
              if (!seasonMap[sNum]) seasonMap[sNum] = { season: sNum, episodes: [] };
              seasonMap[sNum].episodes.push(ep);
            });
            seasons = Object.values(seasonMap);
          }

          if (!seasons.length) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "Sellel sarjal pole episoode saadaval.");
          }

          let tvCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *TV SERIES SEASONS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
          tvCard += `🎬 *Sari :* ${toSmallCaps(detailsData.title || selectedItem.title || selectedItem.name)}\n`;
          tvCard += `⭐ *IMDb :* ${detailsData.rating || detailsData.imdb || 'N/A'}\n`;
          tvCard += `📅 *Aasta :* ${detailsData.year || 'N/A'}\n`;
          tvCard += `📁 *Hooaegu kokku :* ${seasons.length}\n`;

          if (btnsOn) {
            try {
              const { ButtonV2 } = await import("@vanzxy/baileys");

              const seasonRows = seasons.map((s, idx) => {
                const sNum = typeof s === 'object' ? (s.season || idx + 1) : s;
                const epLen = Array.isArray(s.episodes) ? `${s.episodes.length} osa` : 'Saadaval';
                return {
                  title: `Season ${sNum}`,
                  description: `${epLen} saadaval`,
                  id: `.mb_season ${idx + 1}`
                };
              });

              const fittedThumb = await getFittedImageBuffer(posterUrl);

              const btn = new ButtonV2(sock)
                .setBody(tvCard + "\n👇 *Vali hooaeg episoodide vaatamiseks:*")
                .setFooter("WaBot by MALIYA-MD Team ツ")
                .setThumbnail(fittedThumb);

              btn.addRawButton({
                buttonId: ".mb_season_list",
                buttonText: { displayText: "📁 Vali Hooaeg" },
                type: 1,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({
                    title: "Hooajad ↯",
                    sections: [{ title: "Hooajad", rows: seasonRows }]
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
                pending.itemUrl = itemUrl;
                pending.timestamp = Date.now();
                pending.isProcessing = false;
                await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
                return;
              }
            } catch (err) {
              console.log("SEASONS BUTTON ERROR:", err);
            }
          }

          let seasonText = tvCard + `\n`;
          seasons.forEach((s, idx) => {
            const numStr = String(idx + 1).padStart(2, "0");
            const sNum = typeof s === 'object' ? (s.season || idx + 1) : s;
            const epCount = Array.isArray(s.episodes) ? `${s.episodes.length} osa` : 'Saadaval';
            seasonText += `*[ ${numStr} ]* ➔ 📁 *Season ${sNum}* _(${epCount})_\n`;
          });
          seasonText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Vasta hooaja numbriga...*`;

          const sentMsg = await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: seasonText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.expectedMsgId = sentMsg.key.id;
          pending.step = "select_season";
          pending.seasons = seasons;
          pending.metadata = detailsData;
          pending.itemUrl = itemUrl;
          pending.timestamp = Date.now();
          pending.isProcessing = false;

        } else {
          // ─── 🎥 FILMI TEEKOND (KVALITEEDI VALIK NUPPUDENA) ───
          const rawDownloads = detailsData.downloads || detailsData.qualities || detailsData.links || [];
          const { videos, subtitles } = separateVideosAndSubs(Array.isArray(rawDownloads) ? rawDownloads : []);

          if (detailsData.subtitle) {
            subtitles.push({ label: "Filmi Subtiiter", link: detailsData.subtitle });
          }

          if (!videos.length) {
            clearUserSession(k);
            return await sendErrorMsg(sock, from, mek, "Sellele filmile pole allalaadimislinke saadaval.");
          }

          let movieCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *MOVIE DETAILS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
          movieCard += `🎬 *Film :* ${toSmallCaps(detailsData.title || selectedItem.title)}\n`;
          movieCard += `⭐ *IMDb :* ${detailsData.imdb || detailsData.rating || 'N/A'}\n`;
          movieCard += `📅 *Aasta :* ${detailsData.year || 'N/A'}\n`;
          movieCard += `⏳ *Kestus :* ${detailsData.duration || 'N/A'}\n`;

          if (btnsOn) {
            try {
              const { ButtonV2 } = await import("@vanzxy/baileys");

              const dlRows = videos.map((dl, i) => ({
                title: `${String(i + 1).padStart(2, "0")}. Kvaliteet: ${dl.quality || 'Direct'}`,
                description: `Suurus: ${dl.size || 'N/A'} | Otsefail + Subtiiter`,
                id: `.mb_movie_dl ${i + 1}`
              }));

              const fittedThumb = await getFittedImageBuffer(posterUrl);

              const btn = new ButtonV2(sock)
                .setBody(movieCard + "\n👇 *Vali sobiv video kvaliteet:*")
                .setFooter("WaBot by MALIYA-MD Team ツ")
                .setThumbnail(fittedThumb);

              btn.addRawButton({
                buttonId: ".mb_quality_list",
                buttonText: { displayText: "🍿 Vali Kvaliteet" },
                type: 1,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({
                    title: "Saadaolevad Kvaliteedid ↯",
                    sections: [{ title: "Kvaliteedi Valik", rows: dlRows }]
                  }),
                },
              });

              btn.addButton("⚡ Alive", ".alive");

              const sentMsg = await btn.send(from, { quoted: mek });

              if (sentMsg?.key?.id) {
                pending.expectedMsgId = sentMsg.key.id;
                pending.step = "movie_quality";
                pending.downloads = videos;
                pending.subtitles = subtitles;
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
          videos.forEach((dl, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            movieText += `*[ ${numStr} ]* 📊 *${dl.quality || 'Direct'}* _(${dl.size || 'N/A'})_\n`;
          });
          movieText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Vasta kvaliteedi numbriga allalaadimiseks...*`;

          const sentMsg = await sock.sendMessage(from, { 
            image: { url: posterUrl }, 
            caption: movieText, 
            contextInfo: channelContextInfo() 
          }, { quoted: mek });

          pending.expectedMsgId = sentMsg.key.id;
          pending.step = "movie_quality";
          pending.downloads = videos;
          pending.subtitles = subtitles;
          pending.metadata = detailsData;
          pending.timestamp = Date.now();
          pending.isProcessing = false;
        }

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (err) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Detailide laadimine ebaõnnestus.");
      }
    }

    // ──────────────────────────────────────────────────────────
    // STEP 2: HOOAEG VALITUD ➔ EPISOODIDE NIMEKIRI
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_season") {
      if (!choice || choice < 1 || choice > pending.seasons.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selectedSeason = pending.seasons[choice - 1];
      const seasonNum = typeof selectedSeason === 'object' ? (selectedSeason.season || choice) : selectedSeason;
      const episodes = Array.isArray(selectedSeason.episodes) ? selectedSeason.episodes : [];
      const posterUrl = pending.metadata?.image || DEFAULT_IMAGE;

      let epCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *SEASON ${seasonNum} EPISODES* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
      epCard += `🎬 *Sari :* ${toSmallCaps(pending.metadata.title)}\n`;
      epCard += `📁 *Hooaeg :* ${seasonNum}\n`;
      epCard += `🎞️ *Episoodid :* ${episodes.length || 'Mitmeid'}\n`;

      const listCount = episodes.length > 0 ? episodes.length : 25;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const epRows = [
            {
              title: "📦 Download ALL Episodes",
              description: `Laadi alla terve hooaeg ${seasonNum} koos subtiitritega`,
              id: ".mb_batch_ep"
            },
            ...Array.from({ length: Math.min(listCount, 30) }, (_, idx) => {
              const ep = episodes[idx];
              const epTitle = typeof ep === 'object' ? (ep.name || ep.title || `Episode ${idx + 1}`) : `Episode ${idx + 1}`;
              return {
                title: `${String(idx + 1).padStart(2, "0")}. ${epTitle.slice(0, 38)}`,
                description: "Vali kvaliteet enne allalaadimist",
                id: `.mb_ep ${idx + 1}`
              };
            })
          ];

          const fittedThumb = await getFittedImageBuffer(posterUrl);

          const btn = new ButtonV2(sock)
            .setBody(epCard + "\n👇 *Vali episood või klõpsa 'Download ALL':*")
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: ".mb_episodes_list",
            buttonText: { displayText: "📺 Vali Episood" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Episoodide Nimekiri ↯",
                sections: [{ title: "Hooaja Episoodid", rows: epRows }]
              }),
            },
          });

          btn.addButton("📥 Download ALL", ".mb_batch_ep");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_episode";
            pending.seasonNum = seasonNum;
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

      let epText = epCard + `\n*[ 00 ]* ➔ 📥 *Download ALL Episodes (Batch + Subtiitrid)*\n`;
      for (let idx = 0; idx < Math.min(listCount, 25); idx++) {
        const ep = episodes[idx];
        const numStr = String(idx + 1).padStart(2, "0");
        const epTitle = typeof ep === 'object' ? (ep.name || ep.title || `Episode ${idx + 1}`) : `Episode ${idx + 1}`;
        epText += `*[ ${numStr} ]* ➔ 📺 *${epTitle}*\n`;
      }
      epText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Vasta episoodi numbriga või 00 (KÕIK)...*`;

      const sentMsg = await sock.sendMessage(from, { 
        image: { url: posterUrl }, 
        caption: epText, 
        contextInfo: channelContextInfo() 
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_episode";
      pending.seasonNum = seasonNum;
      pending.episodes = episodes;
      pending.timestamp = Date.now();
      pending.isProcessing = false;

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 3: EPISOOD VALITUD ➔ NUPPUDENA KVALITEEDI VALIK (VÕI KOGU HOOAEG)
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_episode") {
      const isBatchSelect = isBatch || choice === 0;

      // ── BATCH ALL EPISODES: KÕIK KORRAGA ──
      if (isBatchSelect) {
        pending.isProcessing = true;
        const seasonNum = pending.seasonNum || 1;
        const seriesTitle = pending.metadata.title || "Series";
        const itemUrl = pending.itemUrl;
        const poster = pending.metadata.image || DEFAULT_IMAGE;
        const totalEps = (pending.episodes && pending.episodes.length > 0) ? pending.episodes.length : 12;

        clearUserSession(k);

        await sock.sendMessage(from, { 
          text: `*╭──[ ⬇️ 𝗕𝗔𝗧𝗖𝗛 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 ]──╮*\n│\n├─ 🚀 *Alustan hooaja ${seasonNum} allalaadimist!*\n├─ 🎞️ *Kokku osasid :* ${totalEps}\n├─ ⏳ _Videod ja subtiitrid saadetakse järjestikku._\n╰─────────────────────────╯`,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        for (let epIndex = 1; epIndex <= totalEps; epIndex++) {
          try {
            await sock.sendMessage(from, { react: { text: "📥", key: mek.key } });
            
            const queryParam = `${itemUrl}?se=${seasonNum}&ep=${epIndex}`;
            const dlApiUrl = `${API_BASE}/api/v1/movies/moviebox/tv/dl?q=${encodeURIComponent(queryParam)}&api_key=${API_KEY}`;
            const dlRes = await axios.get(dlApiUrl, { timeout: 15000 });
            const dlRaw = dlRes.data?.data || dlRes.data?.downloads || dlRes.data?.qualities || dlRes.data || [];
            const listToFilter = Array.isArray(dlRaw) ? dlRaw : (dlRaw.downloads || dlRaw.qualities || []);

            const { videos, subtitles } = separateVideosAndSubs(listToFilter);
            if (dlRes.data?.subtitle) {
              subtitles.push({ label: "Official Subtitle", link: dlRes.data.subtitle });
            }

            if (videos.length > 0) {
              const bestVideo = videos[0];
              const epTitle = `${seriesTitle} S${String(seasonNum).padStart(2, '0')}E${String(epIndex).padStart(2, '0')}`;
              
              await fastSendVideo(sock, mek, from, bestVideo.link, epTitle, bestVideo.quality, poster);

              if (subtitles.length > 0) {
                const transSub = getTranslatedSubUrl(subtitles[0].link);
                await sendSubtitleDoc(sock, mek, from, transSub, epTitle);
              }

              await delay(3000);
            }
          } catch (e) {
            console.log(`Batch Episode ${epIndex} Error:`, e.message);
          }
        }

        await sock.sendMessage(from, { 
          text: `*╭───[ ✅ 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 ]───╮*\n│\n├─ 🎉 *Hooaeg ${seasonNum} edukalt alla laaditud!*\n╰───────────────────────╯`,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        return;
      }

      // ── ÜKSIK EPISOOD: VALI KVALITEET (POPUP MENU) ──
      if (!choice || choice < 1) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const epNum = choice;
      const seasonNum = pending.seasonNum || 1;
      const itemUrl = pending.itemUrl;
      const posterUrl = pending.metadata?.image || DEFAULT_IMAGE;

      try {
        const queryParam = `${itemUrl}?se=${seasonNum}&ep=${epNum}`;
        const dlApiUrl = `${API_BASE}/api/v1/movies/moviebox/tv/dl?q=${encodeURIComponent(queryParam)}&api_key=${API_KEY}`;

        const dlRes = await axios.get(dlApiUrl, { timeout: 15000 });
        const dlRaw = dlRes.data?.data || dlRes.data?.downloads || dlRes.data?.qualities || dlRes.data || [];
        const listToFilter = Array.isArray(dlRaw) ? dlRaw : (dlRaw.downloads || dlRaw.qualities || []);

        const { videos, subtitles } = separateVideosAndSubs(listToFilter);

        if (dlRes.data?.subtitle) {
          subtitles.push({ label: "Official Subtitle", link: dlRes.data.subtitle });
        }

        if (!videos.length) {
          pending.isProcessing = false;
          return await sendErrorMsg(sock, from, mek, `Episoodile S${seasonNum}E${epNum} pole kvaliteete leitud.`);
        }

        let epQualCard = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *EPISODE QUALITIES* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
        epQualCard += `🎬 *Sari :* ${toSmallCaps(pending.metadata.title)}\n`;
        epQualCard += `🎞️ *Sihtmärk :* S${seasonNum}E${epNum}\n`;
        epQualCard += `📄 *Subtiiter :* ${subtitles.length > 0 ? 'Valmis automaatseks saatmiseks ✅' : 'Pole saadaval ⚠️'}\n`;

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const qRows = videos.map((v, i) => ({
              title: `${String(i + 1).padStart(2, "0")}. Kvaliteet: ${v.quality}`,
              description: `Suurus: ${v.size} | Kiire pilveallalaadimine`,
              id: `.mb_ep_dl ${i + 1}`
            }));

            const fittedThumb = await getFittedImageBuffer(posterUrl);

            const btn = new ButtonV2(sock)
              .setBody(epQualCard + "\n👇 *Vali oma eelistatud resolutsioon:*")
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(fittedThumb);

            btn.addRawButton({
              buttonId: ".mb_ep_qual_list",
              buttonText: { displayText: "🍿 Vali Kvaliteet" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Saadaolevad Kvaliteedid ↯",
                  sections: [{ title: "Kvaliteedi Valikud", rows: qRows }]
                }),
              },
            });

            btn.addButton("⚡ Alive", ".alive");

            const sentMsg = await btn.send(from, { quoted: mek });

            if (sentMsg?.key?.id) {
              pending.expectedMsgId = sentMsg.key.id;
              pending.step = "select_episode_quality";
              pending.epNum = epNum;
              pending.epVideos = videos;
              pending.epSubtitles = subtitles;
              pending.timestamp = Date.now();
              pending.isProcessing = false;
              await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
              return;
            }
          } catch (err) {
            console.log("EP QUALITY BUTTON ERROR:", err);
          }
        }

        let qualText = epQualCard + `\n`;
        videos.forEach((v, i) => {
          const numStr = String(i + 1).padStart(2, "0");
          qualText += `*[ ${numStr} ]* 📊 *${v.quality}* _(${v.size})_\n`;
        });
        qualText += `\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Vasta kvaliteedi numbriga allalaadimiseks...*`;

        const sentMsg = await sock.sendMessage(from, { 
          image: { url: posterUrl }, 
          caption: qualText, 
          contextInfo: channelContextInfo() 
        }, { quoted: mek });

        pending.expectedMsgId = sentMsg.key.id;
        pending.step = "select_episode_quality";
        pending.epNum = epNum;
        pending.epVideos = videos;
        pending.epSubtitles = subtitles;
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

      } catch (err) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Episoodi valikute laadimine ebaõnnestus.");
      }
    }

    // ──────────────────────────────────────────────────────────
    // STEP 4: ÜKSIKU EPISOODI KVALITEET VALITUD ➔ ALLALAADIMINE JA SUBTIITRI SAATMINE
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_episode_quality") {
      if (!choice || choice < 1 || choice > pending.epVideos.length) return;

      pending.isProcessing = true;
      const chosenVideo = pending.epVideos[choice - 1];
      const seriesTitle = pending.metadata.title || "Series";
      const seasonNum = pending.seasonNum || 1;
      const epNum = pending.epNum;
      const title = `${seriesTitle} S${String(seasonNum).padStart(2, '0')}E${String(epNum).padStart(2, '0')}`;
      const poster = pending.metadata.image || DEFAULT_IMAGE;
      const subtitles = pending.epSubtitles || [];

      clearUserSession(k);

      await fastSendVideo(sock, mek, from, chosenVideo.link, title, chosenVideo.quality, poster);

      if (subtitles.length > 0) {
        const transSub = getTranslatedSubUrl(subtitles[0].link);
        await sendSubtitleDoc(sock, mek, from, transSub, title);
      }
    }

    // ──────────────────────────────────────────────────────────
    // STEP: FILMI KVALITEET VALITUD ➔ VIDEO JA SUBTIITRID
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

      if (subtitles.length > 0) {
        const rawSubUrl = subtitles[0].link || subtitles[0].url || subtitles[0];
        const transSub = getTranslatedSubUrl(rawSubUrl);
        await sendSubtitleDoc(sock, mek, from, transSub, title);
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
    captionText += `🎬 *Pealkiri :* ${toSmallCaps(rawTitle)}\n`;
    captionText += `📊 *Kvaliteet :* ${quality}\n\n`;
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
    await sendErrorMsg(sock, from, mek, `Video saatmine ebaõnnestus.`);
  }
}

// ── Subtitle File Auto-Sender ──────────────────────────────────
async function sendSubtitleDoc(sock, mek, from, subUrl, title) {
  try {
    const cleanTitle = (title || "Subtitle").replace(/[^\w\s.-]/gi, "").trim();

    await sock.sendMessage(from, {
      document: { url: subUrl },
      mimetype: "application/x-subrip",
      fileName: `MALIYA-MD ${cleanTitle} [Sub].srt`,
      caption: `📄 *Subtiitrifail lisatud:*\n🎬 _${cleanTitle}_`,
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
