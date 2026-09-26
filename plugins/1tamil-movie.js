const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const TAMILMV_BASE = "https://www.1tamilmv.lease";

const pendingTamilMV = {};
const lastProcessedMsg = {};

const REQUEST_OPTIONS = {
  headerGeneratorOptions: {
    browsers: [{ name: "chrome", minVersion: 120 }],
    devices: ["desktop"],
    operatingSystems: ["windows"]
  }
};

function makePendingKey(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingTamilMV[k];
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

function getQuotedStanzaId(mek) {
  return (
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.videoMessage?.contextInfo?.stanzaId ||
    mek?.message?.documentMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function extractIncomingPayload(body, mek, m) {
  const paramsJson =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    
  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
      if (btnId) return String(btnId).trim();
    }
  }

  const directId =
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId ||
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    mek?.message?.buttonsResponseMessage?.selectedButtonId;
    
  if (directId) return String(directId).trim();

  const text =
    m?.message?.interactiveResponseMessage?.body?.text ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    mek?.message?.interactiveResponseMessage?.body?.text ||
    mek?.message?.conversation ||
    mek?.message?.extendedTextMessage?.text ||
    body ||
    "";
    
  return String(text).trim();
}

async function getThumbnailBuffer(url) {
  const tryUrl = url || DEFAULT_SEARCH_IMAGE;
  try {
    const res = await axios.get(tryUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    return await sharp(Buffer.from(res.data))
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 50 })
      .toBuffer();
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  let errText = "╭─── ⋆⋅ ♰ ⋅⋆ ───╮\n";
  errText += "  ❌  𝐄𝐑𝐑𝐎𝐑  𝐎𝐂𝐂𝐔𝐑𝐑𝐄𝐃\n";
  errText += "╰─── ⋆⋅ ♰ ⋅⋆ ───╯\n\n";
  errText += "• ──────── ⌒⌒⌒ ︶︶︶\n";
  errText += "🚫 _" + text + "_\n";
  errText += "• ──────── ⌒⌒⌒ ︶︶︶\n\n";
  errText += "⋆⁺₊⋆ ♱ MALIYA-MD ♱ ⋆⁺₊⋆";

  await sock.sendMessage(from, {
    text: errText,
    contextInfo: channelContextInfo()
  }, { quoted: mek });
}

function isUnder2GB(titleText) {
  const matches = [...String(titleText).matchAll(/(\d+(?:\.\d+)?)\s*(GB|MB)/gi)];
  if (matches.length === 0) return true;

  const lastMatch = matches[matches.length - 1];
  const sizeVal = parseFloat(lastMatch[1]);
  const unit = lastMatch[2].toUpperCase();

  if (unit === "GB") return sizeVal <= 2.0;
  if (unit === "MB") return sizeVal <= 2048;
  return true;
}

function makeSeoSlug(title) {
  return String(title)
    .toLowerCase()
    .replace(/&amp;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRelevantMoviePost(title, query) {
  const lowerTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const queryWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

  for (const word of queryWords) {
    if (!lowerTitle.includes(word)) return false;
  }

  if (lowerTitle.includes("soundtrack")) return false;
  if (lowerTitle.includes("flac")) return false;
  if (lowerTitle.includes("glimpse")) return false;
  if (lowerTitle.includes("lyrical")) return false;
  if (lowerTitle.includes("video song")) return false;
  if (lowerTitle.includes("mp3")) return false;
  if (lowerTitle.includes("24bit")) return false;
  if (lowerTitle.includes("16bit")) return false;
  if (lowerTitle.includes("ost")) return false;

  return true;
}

async function searchTamilMV(query) {
  const { gotScraping } = await import("got-scraping");
  const formattedQuery = encodeURIComponent(query).replace(/%20/g, "+");
  const apiUrl = `${TAMILMV_BASE}/search/api/search.php?q=${formattedQuery}&priority=1&sort=title_asc&page=1&per_page=40`;

  const res = await gotScraping({
    url: apiUrl,
    ...REQUEST_OPTIONS,
    headers: {
      Referer: `${TAMILMV_BASE}/search/?q=${formattedQuery}`,
      Accept: "application/json, text/plain, */*"
    }
  });

  const data = JSON.parse(res.body);
  const results = [];

  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        list = data[key];
        break;
      }
    }
  }

  list.forEach((item) => {
    if (!item) return;

    let title = item.title || item.topic_title || item.name;
    if (!title) return;

    const cleanTitle = cheerio.load(String(title)).text().replace(/\s+/g, " ").trim();
    if (!isRelevantMoviePost(cleanTitle, query)) return;

    let link = null;
    const possibleUrlKeys = ["url", "topic_url", "link", "href", "seo_url", "full_url"];
    for (const k of possibleUrlKeys) {
      if (item[k] && typeof item[k] === "string") {
        link = item[k];
        break;
      }
    }

    let tid = item.tid || item.topic_id || item.id;
    let slug = item.title_seo || item.seo_title || item.slug || makeSeoSlug(cleanTitle);

    if (!link && tid) {
      link = `${TAMILMV_BASE}/index.php?/forums/topic/${tid}-${slug}/`;
    } else if (link && !link.startsWith("http")) {
      link = link.startsWith("/") ? `${TAMILMV_BASE}${link}` : `${TAMILMV_BASE}/${link}`;
    }

    if (cleanTitle && link) {
      results.push({
        title: cleanTitle,
        link: String(link)
      });
    }
  });

  return results;
}

async function parseTamilMVTopic(topicUrl) {
  const { gotScraping } = await import("got-scraping");

  try {
    const res = await gotScraping({
      url: topicUrl,
      ...REQUEST_OPTIONS,
      followRedirect: true,
      timeout: { request: 15000 }
    });

    const $ = cheerio.load(res.body);
    const downloadOptions = [];
    let poster = null;

    $("div[data-role='commentContent'] img").each((_, imgEl) => {
      const src = $(imgEl).attr("src");
      if (src && !src.includes("torrborder") && !src.includes("uTorrent") && !src.includes("emojis")) {
        poster = src;
        return false;
      }
    });

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("magnet:") || href.startsWith("#") || href.startsWith("javascript")) return;

      const btnText = $(el).text().replace(/\s+/g, " ").trim().toUpperCase();

      let isDirectLink = false;
      if ($(el).hasClass("download-button")) isDirectLink = true;
      if (btnText.includes("DIRECT LINK")) isDirectLink = true;
      if (href.includes("cyberloom")) isDirectLink = true;
      if (href.includes("messycloud")) isDirectLink = true;

      if (!isDirectLink) return;

      let qualityTitle = "";
      let prevEl = $(el).prev();

      while (prevEl.length && !qualityTitle) {
        let prevHref = prevEl.attr("href") || prevEl.find("a").attr("href");

        if (prevHref && prevHref.startsWith("magnet:")) {
          const dnMatch = prevHref.match(/[?&]dn=([^&]+)/i);
          if (dnMatch && dnMatch[1]) {
            qualityTitle = decodeURIComponent(dnMatch[1].replace(/\+/g, " "))
              .replace(/^www\.1TamilMV\.[a-z]+\s*-\s*/i, "")
              .trim();
            break;
          }
        }

        const txt = prevEl.text().replace(/\s+/g, " ").trim();
        let hasQualityKeyword = false;
        if (txt.includes("1080p") || txt.includes("720p") || txt.includes("480p") || txt.includes("2160p") ||
            txt.includes("WEB-DL") || txt.includes("HDRip") || txt.includes("BluRay") || txt.includes("PreDVD") ||
            txt.includes("HDTS") || txt.includes("MB") || txt.includes("GB")) {
          hasQualityKeyword = true;
        }

        if (hasQualityKeyword && !txt.startsWith("MAGNET")) {
          qualityTitle = txt
            .replace(/^www\.1TamilMV\.[a-z]+\s*-\s*/i, "")
            .replace(/\.torrent$/i, "")
            .replace(/[:\-]$/, "")
            .trim();
          break;
        }

        prevEl = prevEl.prev();
      }

      if (!qualityTitle) {
        qualityTitle = `Direct Quality Option ${downloadOptions.length + 1}`;
      }

      if (isUnder2GB(qualityTitle)) {
        downloadOptions.push({
          title: qualityTitle,
          url: href
        });
      }
    });

    return { poster, downloadOptions };
  } catch (err) {
    return { poster: null, downloadOptions: [] };
  }
}

async function findPagesWithDirectLinks(matchedTopics) {
  const verifiedPages = [];
  const totalToCheck = Math.min(matchedTopics.length, 15);

  for (let i = 0; i < totalToCheck; i++) {
    const topic = matchedTopics[i];
    const parsed = await parseTamilMVTopic(topic.link);

    if (parsed.downloadOptions && parsed.downloadOptions.length > 0) {
      verifiedPages.push({
        title: topic.title,
        link: topic.link,
        poster: parsed.poster,
        options: parsed.downloadOptions
      });
    }

    if (verifiedPages.length >= 10) break;
  }

  return verifiedPages;
}

async function resolveDirectCdnUrl(shortUrl) {
  const { gotScraping } = await import("got-scraping");

  const step1 = await gotScraping({
    url: shortUrl,
    ...REQUEST_OPTIONS,
    followRedirect: true
  });

  let $ = cheerio.load(step1.body);
  let messyBody = step1.body;

  let outUrl = $("#cta").attr("href");
  if (!outUrl) {
    const match = step1.body.match(/https?:\/\/[^"'\s]*\/out\?t=[^"'\s]+/i);
    if (match) outUrl = match[0];
  }

  if (outUrl) {
    const step2 = await gotScraping({
      url: outUrl,
      ...REQUEST_OPTIONS,
      followRedirect: true,
      headers: { Referer: shortUrl }
    });
    messyBody = step2.body;
    $ = cheerio.load(messyBody);
  }

  let cdnUrl = null;

  $(".download-grid a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      if (href.includes("cdn.") || href.includes("juicybits") || href.includes("/files/")) {
        cdnUrl = href;
        return false;
      }
    }
  });

  if (!cdnUrl) {
    const match = messyBody.match(/https?:\/\/cdn\.[^"'\s]+\/files\/[^"'\s]+/i);
    if (match) cdnUrl = match[0];
  }

  if (!cdnUrl) throw new Error("Direct CDN Download Link not found.");

  let rawFilename = $("h1").text().trim() || "Movie_File.mkv";

  return {
    downloadUrl: cdnUrl,
    fileName: rawFilename
  };
}

/* ================= COMMAND: .tamilmv ================= */
cmd({
  pattern: "tamilmv",
  alias: ["tmv", "1tamilmv", "tmvdl"],
  react: "🎬",
  desc: "Search and download direct movies from 1TamilMV",
  category: "download",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      let helpText = "╔═════ஓ๑♡๑ஓ═════╗\n";
      helpText += "   🎬 𝟏𝐓𝐀𝐌𝐈𝐋𝐌𝐕 𝐃𝐈𝐑𝐄𝐂𝐓 🎬\n";
      helpText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
      helpText += "📌 *Usage :* `.tamilmv <movie name>`\n";
      helpText += "💡 *Example :* `.tamilmv awarapan 2`\n\n";
      helpText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

      return await sock.sendMessage(from, {
        text: helpText,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const matchedTopics = await searchTamilMV(q.trim());
    if (!matchedTopics || matchedTopics.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No relevant movies found on 1TamilMV for "${q}".`);
    }

    const validMovies = await findPagesWithDirectLinks(matchedTopics);
    if (validMovies.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No Direct Download links (under 2GB) found for "${q}".`);
    }

    const k = makePendingKey(sender, from);
    clearUserSession(k);

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cinesubz_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `╭──────────.★..─╮\n   🍿 𝟏𝐓𝐀𝐌𝐈𝐋𝐌𝐕 𝐒𝐄𝐀𝐑𝐂𝐇 🍿\n╰─..★.──────────╯\n\n🔎 *Search :* ${q}\n⚡ *Direct Movies (< 2GB) :* ${validMovies.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    // 🔥 BUTTONS SYSTEM (Asitha-MD Style)
    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const movieRows = validMovies.map((item, index) => ({
          title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
          description: "Click to view movie qualities",
          id: `.tmv_select ${index + 1}`
        }));

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(searchImg);

        // 1. Popup List Menu Button
        btn.addRawButton({
          buttonId: "tamilmv_movies_list",
          buttonText: { displayText: "🎬 Select Movie" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "1TamilMV Search Results ↯",
              sections: [
                {
                  title: "🎥 Available Movies",
                  rows: movieRows
                }
              ]
            }),
          },
        });

        // 2. Bot Menu Button
        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingTamilMV[k] = {
            step: 1,
            results: validMovies,
            timestamp: Date.now(),
            isProcessing: false,
            expectedMsgId: sentMsg.key.id
          };
          await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
          return;
        }
      } catch (e) {
        console.log("TAMILMV BUTTONV2 ERROR:", e?.message || e);
      }
    }

    // 🔢 FALLBACK NUMBERED MENU
    let text = "╭──────────.★..─╮\n";
    text += "   🍿 𝟏𝐓𝐀𝐌𝐈𝐋𝐌𝐕 𝐒𝐄𝐀𝐑𝐂𝐇 🍿\n";
    text += "╰─..★.──────────╯\n\n";
    text += `🔎 *Search  :* ${q}\n`;
    text += `⚡ *Direct Movies (< 2GB) :* ${validMovies.length}\n`;
    text += "────── ⋆⋅☆⋅⋆ ──────\n\n";

    validMovies.forEach((item, index) => {
      text += `╭─── ⋆⋅☆⋅⋆ ───\n`;
      text += `│ *[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${item.title}*\n`;
      text += `╰──────────────\n`;
    });

    text += "\n> 💬 *Reply to this message with the movie number...*";

    const sentMsg = await sock.sendMessage(from, {
      image: { url: searchImg },
      caption: text,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    pendingTamilMV[k] = {
      step: 1,
      results: validMovies,
      timestamp: Date.now(),
      isProcessing: false,
      expectedMsgId: sentMsg.key.id
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (error) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to 1TamilMV search server.");
  }
});

/* ================= REPLY HANDLER ================= */
const tmvReplyHandler = {
  filter: (text, { sender, from }) => {
    const k = makePendingKey(sender, from);
    return Boolean(pendingTamilMV[k]);
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const payload = extractIncomingPayload(body, mek, m);
    if (!payload) return;

    let choice = null;
    if (payload.startsWith(".tmv_select ")) {
      choice = parseInt(payload.replace(".tmv_select ", "").trim(), 10);
    } else if (payload.startsWith(".tmv_dl ")) {
      choice = parseInt(payload.replace(".tmv_dl ", "").trim(), 10);
    } else if (/^\d+$/.test(payload)) {
      choice = parseInt(payload, 10);
    }

    if (choice === null || isNaN(choice)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingTamilMV[k];
    if (!pending || pending.isProcessing) return;

    const quotedId = getQuotedStanzaId(mek);
    if (quotedId && pending.expectedMsgId && quotedId !== pending.expectedMsgId) {
      return;
    }

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: payload, time: now };

    // ================= STEP 1: SELECT MOVIE =================
    if (pending.step === 1) {
      if (choice < 1 || choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const selectedMovie = pending.results[choice - 1];
      const qualities = selectedMovie.options;
      const imgToSend = selectedMovie.poster || DEFAULT_SEARCH_IMAGE;

      let qualityBody = `╭──────────. ִ ࣪ ⋆ ೀ ─╮\n   📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒\n╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n🎬 *Movie :* ${toSmallCaps(selectedMovie.title)}\n\nDirect formats below 2GB are listed. Choose one to start download.\n\n© 2026 MALIYA-MD BOT SYSTEM`;

      const settings = await readSettings(sessionId);
      const btnsOn = !!settings.btns_enabled;

      // 🔥 BUTTONS SYSTEM (Quality List Popup)
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const qualityRows = qualities.map((opt, i) => ({
            title: `${String(i + 1).padStart(2, "0")}. ${opt.title.substring(0, 45)}`,
            description: `Download ${opt.title}`,
            id: `.tmv_dl ${i + 1}`
          }));

          const btn = new ButtonV2(sock)
            .setBody(qualityBody)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(imgToSend);

          // 1. Popup List Menu Button
          btn.addRawButton({
            buttonId: "tamilmv_quality_list",
            buttonText: { displayText: "📥 Select Quality" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Choose Quality & Size ↯",
                sections: [
                  {
                    title: "📊 Available Qualities",
                    rows: qualityRows
                  }
                ]
              }),
            },
          });

          // 2. Bot Menu Button
          btn.addButton("📜 Bot Menu", ".menu");

          const sentQualityMsg = await btn.send(from, { quoted: mek });

          if (sentQualityMsg?.key?.id) {
            pending.step = 2;
            pending.selectedMovie = selectedMovie;
            pending.timestamp = Date.now();
            pending.isProcessing = false;
            pending.expectedMsgId = sentQualityMsg.key.id;
            await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
            return;
          }
        } catch (e) {
          console.log("TAMILMV QUALITY BUTTONV2 ERROR:", e?.message || e);
        }
      }

      // 🔢 FALLBACK NUMBERED QUALITY MENU
      let qualityMsg = "╭──────────. ִ ࣪ ⋆ ೀ ─╮\n";
      qualityMsg += "   📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒\n";
      qualityMsg += "╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n";
      qualityMsg += `🎬 *Movie :* ${toSmallCaps(selectedMovie.title)}\n`;
      qualityMsg += "•───────•°•❀•°•───────•\n\n";

      qualities.forEach((opt, i) => {
        qualityMsg += `╭─── ⋆⋅ 𖤓 ⋅⋆ ───\n`;
        qualityMsg += `│ *[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${opt.title}*\n`;
        qualityMsg += `╰────────────────\n`;
      });

      qualityMsg += "\n> 💬 *Reply with quality number to send movie...*";

      const sentQualityMsg = await sock.sendMessage(from, {
        image: { url: imgToSend },
        caption: qualityMsg,
        contextInfo: channelContextInfo()
      }, { quoted: mek });

      pending.step = 2;
      pending.selectedMovie = selectedMovie;
      pending.timestamp = Date.now();
      pending.isProcessing = false;
      pending.expectedMsgId = sentQualityMsg.key.id;

      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
    }

    // ================= STEP 2: SELECT QUALITY & DIRECT STREAM SEND =================
    else if (pending.step === 2) {
      const selectedMovie = pending.selectedMovie;
      if (choice < 1 || choice > selectedMovie.options.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const selectedOpt = selectedMovie.options[choice - 1];
      clearUserSession(k);

      try {
        const { downloadUrl, fileName } = await resolveDirectCdnUrl(selectedOpt.url);
        const posterUrl = selectedMovie.poster || DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(posterUrl);

        const cleanFileName = fileName
          .replace(/^www\.1TamilMV\.[a-z]+\s*-\s*/i, "")
          .replace(/[^a-zA-Z0-9._ -]/g, "")
          .trim();

        let captionText = "╔═════ஓ๑♡๑ஓ═════╗\n";
        captionText += "   🎉 𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃 🎉\n";
        captionText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
        captionText += `🎬 *File    :* ${toSmallCaps(cleanFileName)}\n`;
        captionText += `📊 *Quality :* ${selectedOpt.title}\n`;
        captionText += `📦 *Format  :* MKV Video\n`;
        captionText += "•───────•°•❀•°•───────•\n\n";
        captionText += "⚠️ *Important Note :*\n";
        captionText += "_Please download *VLC Media Player* because this is an *MKV* video file._ 📲🎞️\n\n";
        captionText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

        const docPayload = {
          document: { url: downloadUrl },
          mimetype: "video/x-matroska",
          fileName: `MALIYA-MD - ${cleanFileName.endsWith(".mkv") ? cleanFileName : cleanFileName + ".mkv"}`,
          caption: captionText,
          contextInfo: channelContextInfo()
        };

        if (thumbBuffer) {
          docPayload.jpegThumbnail = thumbBuffer;
        }

        await sock.sendMessage(from, docPayload, { quoted: mek });
        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (err) {
        await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
        await sendErrorMsg(sock, from, mek, `Failed to send movie: ${err.message}`);
      }
    }
  }
};

if (Array.isArray(replyHandlers)) replyHandlers.push(tmvReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingTamilMV) {
    if (now - pendingTamilMV[k].timestamp > SESSION_TIMEOUT) delete pendingTamilMV[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);

module.exports = {};
