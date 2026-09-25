const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";
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
  if (from) return `${from}`;
  return "";
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
  if (mek && mek.message) {
    if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo && mek.message.extendedTextMessage.contextInfo.stanzaId) {
      return mek.message.extendedTextMessage.contextInfo.stanzaId;
    }
    if (mek.message.imageMessage && mek.message.imageMessage.contextInfo && mek.message.imageMessage.contextInfo.stanzaId) {
      return mek.message.imageMessage.contextInfo.stanzaId;
    }
    if (mek.message.videoMessage && mek.message.videoMessage.contextInfo && mek.message.videoMessage.contextInfo.stanzaId) {
      return mek.message.videoMessage.contextInfo.stanzaId;
    }
    if (mek.message.documentMessage && mek.message.documentMessage.contextInfo && mek.message.documentMessage.contextInfo.stanzaId) {
      return mek.message.documentMessage.contextInfo.stanzaId;
    }
  }
  return null;
}

async function getThumbnailBuffer(url) {
  const tryUrl = url ? url : DEFAULT_SEARCH_IMAGE;
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
    if (tryUrl !== DEFAULT_SEARCH_IMAGE) {
      try {
        const res2 = await axios.get(DEFAULT_SEARCH_IMAGE, { responseType: "arraybuffer", timeout: 8000 });
        return await sharp(Buffer.from(res2.data))
          .resize(200, 200, { fit: "cover" })
          .jpeg({ quality: 50 })
          .toBuffer();
      } catch (e2) {
        return null;
      }
    }
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

/**
 * 2GB ට අඩු ගොනුවක්දැයි පරීක්ෂා කිරීම
 */
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

/**
 * 1. 1TamilMV Search API හරහා චිත්‍රපට සෙවීම
 */
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

    let title = item.title;
    if (!title) title = item.topic_title;
    if (!title) title = item.name;
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

    let tid = item.tid;
    if (!tid) tid = item.topic_id;
    if (!tid) tid = item.id;

    let slug = item.title_seo;
    if (!slug) slug = item.seo_title;
    if (!slug) slug = item.slug;
    if (!slug) slug = makeSeoSlug(cleanTitle);

    if (!link && tid) {
      link = `${TAMILMV_BASE}/index.php?/forums/topic/${tid}-${slug}/`;
    } else if (link && !link.startsWith("http")) {
      if (link.startsWith("/")) {
        link = `${TAMILMV_BASE}${link}`;
      } else {
        link = `${TAMILMV_BASE}/${link}`;
      }
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

/**
 * 2. Topic පිටුවක ඇති (< 2GB) Direct Download Links සහ Poster Image ලබාගැනීම
 */
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

    // චිත්‍රපටයේ Poster Image එක ලබාගැනීම
    $("div[data-role='commentContent'] img").each((_, imgEl) => {
      const src = $(imgEl).attr("src");
      if (src && !src.includes("torrborder") && !src.includes("uTorrent") && !src.includes("emojis")) {
        poster = src;
        return false;
      }
    });

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (href.startsWith("magnet:")) return;
      if (href.startsWith("#")) return;
      if (href.startsWith("javascript")) return;

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
        let prevHref = prevEl.attr("href");
        if (!prevHref) {
          prevHref = prevEl.find("a").attr("href");
        }

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
        if (txt.includes("1080p")) hasQualityKeyword = true;
        if (txt.includes("720p")) hasQualityKeyword = true;
        if (txt.includes("480p")) hasQualityKeyword = true;
        if (txt.includes("2160p")) hasQualityKeyword = true;
        if (txt.includes("WEB-DL")) hasQualityKeyword = true;
        if (txt.includes("HDRip")) hasQualityKeyword = true;
        if (txt.includes("BluRay")) hasQualityKeyword = true;
        if (txt.includes("PreDVD")) hasQualityKeyword = true;
        if (txt.includes("HDTS")) hasQualityKeyword = true;
        if (txt.includes("MB")) hasQualityKeyword = true;
        if (txt.includes("GB")) hasQualityKeyword = true;

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

      // 2GB ට අඩු Qualities පමණක් තෝරාගැනීම
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

/**
 * 3. අදාළ පිටු ස්වයංක්‍රීයව පරීක්ෂා කර (< 2GB) Direct Links ඇති පිටු පමණක් ලබාගැනීම
 */
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

/**
 * 4. Cyberloom -> MessyCloud -> Direct CDN URL එක ලබාගැනීම
 */
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
      let isValidCdn = false;
      if (href.includes("cdn.")) isValidCdn = true;
      if (href.includes("juicybits")) isValidCdn = true;
      if (href.includes("/files/")) isValidCdn = true;

      if (isValidCdn) {
        cdnUrl = href;
        return false;
      }
    }
  });

  if (!cdnUrl) {
    const match = messyBody.match(/https?:\/\/cdn\.[^"'\s]+\/files\/[^"'\s]+/i);
    if (match) cdnUrl = match[0];
  }

  if (!cdnUrl) {
    throw new Error("Direct CDN Download Link not found.");
  }

  let rawFilename = $("h1").text().trim();
  if (!rawFilename) {
    rawFilename = "Movie_File.mkv";
  }

  return {
    downloadUrl: cdnUrl,
    fileName: rawFilename
  };
}

/**
 * 5. Command: .tamilmv <movie_name>
 */
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
      helpText += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n\n";
      helpText += "📌 *Usage :* `.tamilmv <movie name>`\n";
      helpText += "💡 *Example :* `.tamilmv awarapan 2`\n\n";
      helpText += "•───────•°•❀•°•───────•\n";
      helpText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

      return await sock.sendMessage(from, {
        text: helpText,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const matchedTopics = await searchTamilMV(q.trim());
    if (!matchedTopics ? true : matchedTopics.length === 0) {
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

    let text = "╭──────────.★..─╮\n";
    text += "    🍿 𝟏𝐓𝐀𝐌𝐈𝐋𝐌𝐕 𝐒𝐄𝐀𝐑𝐂𝐇 🍿\n";
    text += "╰─..★.──────────╯\n\n";
    text += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n";
    text += `🔎 *Search  :* ${q}\n`;
    text += `⚡ *Direct Movies (< 2GB) :* ${validMovies.length}\n`;
    text += "────── ⋆⋅☆⋅⋆ ──────\n\n";

    validMovies.forEach((item, index) => {
      text += `╭─── ⋆⋅☆⋅⋆ ───\n`;
      text += `│ *[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${item.title}*\n`;
      text += `╰──────────────\n`;
    });

    text += "\n•∘˙⊹. ꒰ঌ ᧔ෆ᧓ ໒꒱ .⊹˙∘•\n";
    text += "> 💬 *Reply to this message with the movie number...*";

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cinesubz_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

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

/**
 * 6. Quoted Reply Handler (Step 1 -> Movie, Step 2 -> Direct Stream Send with VLC Note)
 */
const tmvReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return Boolean(pendingTamilMV[k]);
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const rawBody = body ? String(body).trim() : "";
    if (!rawBody) return;
    if (!/^\d+$/.test(rawBody)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingTamilMV[k];
    if (!pending) return;
    if (pending.isProcessing) return;

    const quotedId = getQuotedStanzaId(mek);
    if (!quotedId) return;
    if (quotedId !== pending.expectedMsgId) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === rawBody && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: rawBody, time: now };

    const choice = parseInt(rawBody, 10);

    // ================= STEP 1: SELECT MOVIE =================
    if (pending.step === 1) {
      if (choice < 1) return;
      if (choice > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const selectedMovie = pending.results[choice - 1];
      const qualities = selectedMovie.options;

      let qualityMsg = "╭──────────. ִ ࣪ ⋆ ೀ ─╮\n";
      qualityMsg += "   📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒\n";
      qualityMsg += "╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n";
      qualityMsg += "⊹₊˚‧︵‿₊୨ᰔ୧₊‿︵‧˚₊⊹\n";
      qualityMsg += `🎬 *Movie :* ${toSmallCaps(selectedMovie.title)}\n`;
      qualityMsg += "•───────•°•❀•°•───────•\n\n";

      qualities.forEach((opt, i) => {
        qualityMsg += `╭─── ⋆⋅ 𖤓 ⋅⋆ ───\n`;
        qualityMsg += `│ *[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${opt.title}*\n`;
        qualityMsg += `╰────────────────\n`;
      });

      qualityMsg += "\n.𖥔 ݁ ˖⊹˚₊‧──────୨ ✦ ✦ ୧──────‧₊˚⊹.𖥔 ݁ ˖\n";
      qualityMsg += "> 💬 *Reply with quality number to send movie...*";

      const imgToSend = selectedMovie.poster ? selectedMovie.poster : DEFAULT_SEARCH_IMAGE;

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
      if (choice < 1) return;
      if (choice > selectedMovie.options.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const selectedOpt = selectedMovie.options[choice - 1];
      clearUserSession(k);

      try {
        const { downloadUrl, fileName } = await resolveDirectCdnUrl(selectedOpt.url);

        const posterUrl = selectedMovie.poster ? selectedMovie.poster : DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(posterUrl);

        const cleanFileName = fileName
          .replace(/^www\.1TamilMV\.[a-z]+\s*-\s*/i, "")
          .replace(/[^a-zA-Z0-9._ -]/g, "")
          .trim();

        let captionText = "╔═════ஓ๑♡๑ஓ═════╗\n";
        captionText += "  🎉 𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃 🎉\n";
        captionText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
        captionText += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n";
        captionText += `🎬 *File    :* ${toSmallCaps(cleanFileName)}\n`;
        captionText += `📊 *Quality :* ${selectedOpt.title}\n`;
        captionText += `📦 *Format  :* MKV Video\n`;
        captionText += "•───────•°•❀•°•───────•\n\n";
        captionText += "⚠️ *Important Note :*\n";
        captionText += "_Please download *VLC Media Player* because this is an *MKV* video file._ 📲🎞️\n\n";
        captionText += "•∘˙⊹. ꒰ঌ ᧔ෆ᧓ ໒꒱ .⊹˙∘•\n";
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
