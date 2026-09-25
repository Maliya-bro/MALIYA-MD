const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { File: MegaFile } = require("megajs");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const pendingCineru = {};
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
  delete pendingCineru[k];
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
 * 1. Search Cineru.lk Movies
 */
async function searchCineruMovies(query) {
  const { gotScraping } = await import("got-scraping");
  const searchUrl = `https://cineru.lk/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=10`;

  try {
    const response = await gotScraping({ url: searchUrl, ...REQUEST_OPTIONS });
    const posts = JSON.parse(response.body);
    return posts.map(post => ({
      id: post.id,
      title: cheerio.load(post.title.rendered).text().trim(),
      url: post.link
    }));
  } catch (err) {
    const fallbackUrl = `https://cineru.lk/?s=${encodeURIComponent(query)}`;
    const fallbackRes = await gotScraping({ url: fallbackUrl, ...REQUEST_OPTIONS });
    const $ = cheerio.load(fallbackRes.body);
    const results = [];

    $(".post-box-title a").each((_, el) => {
      results.push({
        title: $(el).text().trim(),
        url: $(el).attr("href")
      });
    });
    return results;
  }
}

/**
 * 2. Scrape Movie and sort by PIXELDRAIN -> GDRIVE -> MEGA
 */
async function scrapeCineruMovie(movieUrl, postId) {
  const { gotScraping } = await import("got-scraping");

  const pageRes = await gotScraping({ url: movieUrl, ...REQUEST_OPTIONS });
  const $ = cheerio.load(pageRes.body);

  const rawTitle = $("h1.post-title").text().trim();
  const pipeChar = String.fromCharCode(124);
  const cleanTitle = rawTitle ? rawTitle.split(pipeChar)[0].trim() : "Movie";
  const imdb = $(".cs-rate__val").text().trim();
  const poster = $(".single-post-thumb img").attr("src");

  if (!postId) {
    postId = $("#post_id").val();
  }

  if (!postId) {
    throw new Error("Post ID not found.");
  }

  const ajaxRes = await gotScraping.post("https://cineru.lk/wp-admin/admin-ajax.php", {
    ...REQUEST_OPTIONS,
    form: {
      action: "cs_download_data",
      post_id: postId
    },
    headers: {
      "Referer": movieUrl,
      "Origin": "https://cineru.lk",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  const ajaxJson = JSON.parse(ajaxRes.body);
  const downloadLinks = [];

  if (ajaxJson.success && ajaxJson.data) {
    const $dl = cheerio.load(ajaxJson.data);

    $dl(".download-card .copy").each((_, copyEl) => {
      const qualityInfo = $dl(copyEl).find(".namer").text().trim();
      const linksContainer = $dl(copyEl).next(".imgf");
      const servers = [];

      linksContainer.find(".btns").each((_, btnEl) => {
        const serverName = $dl(btnEl).find(".nmcld").text().trim().toUpperCase();
        const downloadUrl = $dl(btnEl).attr("data-link");

        // Priority: 1 = PIXELDRAIN, 2 = GDRIVE, 3 = MEGA
        let priority = 99;
        if (serverName.includes("PIXELDRAIN")) {
          priority = 1;
        } else if (serverName.includes("GDRIVE")) {
          priority = 2;
        } else if (serverName.includes("DRIVE") && !serverName.includes("USERDRIVE")) {
          priority = 2;
        } else if (serverName.includes("MEGA")) {
          priority = 3;
        }

        if (downloadUrl && priority < 99) {
          servers.push({
            name: serverName,
            url: downloadUrl,
            priority: priority
          });
        }
      });

      servers.sort((a, b) => a.priority - b.priority);

      if (qualityInfo && servers.length > 0) {
        downloadLinks.push({
          quality: qualityInfo,
          servers: servers
        });
      }
    });
  }

  return {
    title: cleanTitle,
    fullTitle: rawTitle,
    imdb_rate: imdb,
    poster: poster,
    url: movieUrl,
    downloadLinks: downloadLinks
  };
}

/**
 * 3. Token URL එකෙන් Direct Streaming URL එක Resolve කරගැනීම (No Disk Save)
 */
async function resolveDirectStreamingUrl(initialUrl, refererUrl) {
  const { gotScraping } = await import("got-scraping");

  // 1. Pixeldrain ලින්ක් එකක් නම් කෙලින්ම Direct Stream URL එක සෑදීම
  const pdQuick = initialUrl.match(/pixeldrain\.[a-z]+\/[ul]\/([a-zA-Z0-9_-]+)/i);
  if (pdQuick) {
    return {
      type: "url",
      url: `https://pixeldrain.com/api/file/${pdQuick[1]}?download`
    };
  }

  // 2. Google Drive ලින්ක් එකක් නම්
  let gdId = null;
  const gdMatch = initialUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdMatch) gdId = gdMatch[1];
  const gdMatch2 = initialUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (!gdId && gdMatch2) gdId = gdMatch2[1];

  if (gdId) {
    const gdCheckUrl = `https://drive.usercontent.google.com/download?id=${gdId}&export=download`;
    const checkRes = await gotScraping({ url: gdCheckUrl, ...REQUEST_OPTIONS });
    let contentType = checkRes.headers["content-type"] ? checkRes.headers["content-type"].toLowerCase() : "";

    if (contentType.includes("text/html")) {
      const $ = cheerio.load(checkRes.body);
      const gdForm = $("form#download-form, form[action*='drive.usercontent.google.com']");
      if (gdForm.length) {
        const action = gdForm.attr("action");
        const params = new URLSearchParams();
        gdForm.find("input[name]").each((_, el) => {
          let val = $(el).attr("value");
          if (!val) val = "";
          params.append($(el).attr("name"), val);
        });
        return { type: "url", url: `${action}?${params.toString()}` };
      }
      return { type: "url", url: `https://drive.usercontent.google.com/download?id=${gdId}&export=download&confirm=t` };
    }
    return { type: "url", url: gdCheckUrl };
  }

  // 3. dl.cineru.lk Token එක හරහා Redirect වීම
  const res = await gotScraping({
    url: initialUrl,
    ...REQUEST_OPTIONS,
    followRedirect: true,
    headers: { "Referer": refererUrl }
  });

  const finalVisited = res.url ? res.url : initialUrl;

  // Final URL එකෙන් Pixeldrain අල්ලා ගැනීම
  const pdFinal = finalVisited.match(/pixeldrain\.[a-z]+\/[ul]\/([a-zA-Z0-9_-]+)/i);
  if (pdFinal) {
    return { type: "url", url: `https://pixeldrain.com/api/file/${pdFinal[1]}?download` };
  }

  // Final URL එකෙන් GDrive අල්ලා ගැනීම
  const gdFinal = finalVisited.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdFinal) {
    return { type: "url", url: `https://drive.usercontent.google.com/download?id=${gdFinal[1]}&export=download&confirm=t` };
  }

  // Final URL එකෙන් Mega අල්ලා ගැනීම (Mega වලට stream එකක් ලබාදේ)
  if (finalVisited.includes("mega.nz")) {
    const file = MegaFile.fromURL(finalVisited);
    await file.loadAttributes();
    return { type: "stream", stream: file.download(), size: file.size };
  }

  // HTML එක තුළ ඇත්නම් parse කිරීම
  if (typeof res.body === "string") {
    const $ = cheerio.load(res.body);

    const pdInHtml = res.body.match(/https?:\/\/[a-z0-9.]*pixeldrain\.[a-z]+\/[ul]\/([a-zA-Z0-9_-]+)/i);
    if (pdInHtml) {
      return { type: "url", url: `https://pixeldrain.com/api/file/${pdInHtml[1]}?download` };
    }

    const gdInHtml = res.body.match(/https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (gdInHtml) {
      return { type: "url", url: `https://drive.usercontent.google.com/download?id=${gdInHtml[1]}&export=download&confirm=t` };
    }

    const megaInHtml = res.body.match(/https?:\/\/mega\.nz\/[a-zA-Z0-9/_#-]+/i);
    if (megaInHtml) {
      const file = MegaFile.fromURL(megaInHtml[0]);
      await file.loadAttributes();
      return { type: "stream", stream: file.download(), size: file.size };
    }
  }

  throw new Error("Direct link extract කරගත නොහැකි විය.");
}

/**
 * 4. Bot Command (.cineru)
 */
cmd({
  pattern: "cineru",
  alias: ["cr", "cinerulk", "crfilm"],
  react: "🎬",
  desc: "Search and send movies from Cineru.lk (No Server Storage)",
  category: "download",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      let helpText = "╔═════ஓ๑♡๑ஓ═════╗\n";
      helpText += "    🎬 𝐂𝐈𝐍𝐄𝐑𝐔 𝐒𝐄𝐀𝐑𝐂𝐇 🎬\n";
      helpText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
      helpText += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n\n";
      helpText += "📌 *Usage :* `.cineru <movie name>`\n";
      helpText += "💡 *Example :* `.cineru spider man`\n\n";
      helpText += "•───────•°•❀•°•───────•\n";
      helpText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

      return await sock.sendMessage(from, {
        text: helpText,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const results = await searchCineruMovies(q.trim());
    if (!results ? true : results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No movies found on Cineru.lk for "${q}".`);
    }

    const topResults = results.slice(0, 10);
    const k = makePendingKey(sender, from);
    clearUserSession(k);

    let text = "╭──────────.★..─╮\n";
    text += "     🍿 𝐂𝐈𝐍𝐄𝐑𝐔 𝐌𝐎𝐕𝐈𝐄𝐒 🍿\n";
    text += "╰─..★.──────────╯\n\n";
    text += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n";
    text += `🔎 *Search  :* ${q}\n`;
    text += `🎬 *Results :* ${topResults.length}\n`;
    text += "────── ⋆⋅☆⋅⋆ ──────\n\n";

    topResults.forEach((item, index) => {
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

    pendingCineru[k] = {
      step: 1,
      results: topResults,
      timestamp: Date.now(),
      isProcessing: false,
      expectedMsgId: sentMsg.key.id
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (error) {
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to Cineru.lk search server.");
  }
});

/**
 * 5. Reply Handler (Direct Stream Send - No Disk Storage)
 */
const cineruReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return Boolean(pendingCineru[k]);
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const rawBody = body ? String(body).trim() : "";
    if (!rawBody) return;
    if (!/^\d+$/.test(rawBody)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingCineru[k];
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

      const selected = pending.results[choice - 1];
      try {
        const movieInfo = await scrapeCineruMovie(selected.url, selected.id);
        if (!movieInfo ? true : !movieInfo.downloadLinks ? true : movieInfo.downloadLinks.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No download links available for this movie.");
        }

        const filteredQualities = movieInfo.downloadLinks.filter(d => {
          const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
          if (match) {
            const size = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === "GB") return size < 2.0;
            if (unit === "MB") return true;
          }
          return true;
        });

        if (filteredQualities.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No download links found below 2GB.");
        }

        let qualityMsg = "╭──────────. ִ ࣪ ⋆ ೀ ─╮\n";
        qualityMsg += "   📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒\n";
        qualityMsg += "╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n";
        qualityMsg += "⊹₊˚‧︵‿₊୨ᰔ୧₊‿︵‧˚₊⊹\n";
        qualityMsg += `🎬 *Movie  :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate) {
          qualityMsg += `⭐ *IMDb   :* ${movieInfo.imdb_rate} / 10\n`;
        }
        qualityMsg += "•───────•°•❀•°•───────•\n\n";

        filteredQualities.forEach((d, i) => {
          qualityMsg += `╭─── ⋆⋅ 𖤓 ⋅⋆ ───\n`;
          qualityMsg += `│ *[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${d.quality}*\n`;
          qualityMsg += `╰────────────────\n`;
        });

        qualityMsg += "\n.𖥔 ݁ ˖⊹˚₊‧──────୨ ✦ ✦ ୧──────‧₊˚⊹.𖥔 ݁ ˖\n";
        qualityMsg += "> 💬 *Reply with quality number to send movie...*";

        const imgToSend = movieInfo.poster ? movieInfo.poster : DEFAULT_SEARCH_IMAGE;

        const sentQualityMsg = await sock.sendMessage(from, {
          image: { url: imgToSend },
          caption: qualityMsg,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        pending.step = 2;
        pending.movie = { metadata: movieInfo, downloadLinks: filteredQualities };
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        pending.expectedMsgId = sentQualityMsg.key.id;

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      } catch (error) {
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch download links for this movie.");
      }
    }

    // ================= STEP 2: QUALITY CHOSEN -> DIRECT STREAM TO WHATSAPP =================
    else if (pending.step === 2) {
      if (choice < 1) return;
      if (choice > pending.movie.downloadLinks.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const { movie } = pending;
      const selectedQuality = movie.downloadLinks[choice - 1];
      const { metadata } = movie;

      clearUserSession(k);

      const cleanTitle = metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();
      let sentSuccessfully = false;
      let usedServer = "";

      // Fallback Loop: PIXELDRAIN ➔ GDRIVE ➔ MEGA (Direct Streaming)
      for (let i = 0; i < selectedQuality.servers.length; i++) {
        const currentServer = selectedQuality.servers[i];

        try {
          const resolved = await resolveDirectStreamingUrl(currentServer.url, metadata.url);

          const correctPosterUrl = metadata.poster ? metadata.poster : DEFAULT_SEARCH_IMAGE;
          const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

          let captionText = "╔═════ஓ๑♡๑ஓ═════╗\n";
          captionText += "  🎉 𝐌𝐎𝐕𝐈𝐄 𝐔𝐏𝐋𝐎𝐀𝐃𝐄𝐃 🎉\n";
          captionText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
          captionText += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n";
          captionText += `🎬 *Movie   :* ${toSmallCaps(metadata.title)}\n`;
          captionText += `📊 *Quality :* ${selectedQuality.quality}\n`;
          captionText += `🌐 *Server  :* ${currentServer.name}\n`;
          captionText += "•───────•°•❀•°•───────•\n\n";
          captionText += "•∘˙⊹. ꒰ঌ ᧔ෆ᧓ ໒꒱ .⊹˙∘•\n";
          captionText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

          // Baileys Document Payload: Server එකේ file save නොවී Stream එක කෙලින්ම යවයි
          let docPayload = {
            mimetype: "video/mp4",
            fileName: `MALIYA-MD ${cleanTitle}.mp4`,
            caption: captionText,
            contextInfo: channelContextInfo()
          };

          if (thumbBuffer) {
            docPayload.jpegThumbnail = thumbBuffer;
          }

          if (resolved.type === "url") {
            docPayload.document = { url: resolved.url };
          } else if (resolved.type === "stream") {
            docPayload.document = { stream: resolved.stream };
          }

          await sock.sendMessage(from, docPayload, { quoted: mek });
          sentSuccessfully = true;
          usedServer = currentServer.name;
          break; // සාර්ථක වූ බැවින් ඊළඟ server එකට යාම නතර කරයි
        } catch (serverErr) {
          continue; // Server එක අසාර්ථක නම් auto ඊළඟ server එකට යයි
        }
      }

      if (sentSuccessfully) {
        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      } else {
        await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
        await sendErrorMsg(sock, from, mek, "Pixeldrain, GDrive සහ Mega යන සියලුම servers වලින් stream කිරීමට නොහැකි විය. කරුණාකර වෙනත් Quality එකක් උත්සාහ කරන්න.");
      }
    }
  }
};

if (Array.isArray(replyHandlers)) replyHandlers.push(cineruReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineru) {
    if (now - pendingCineru[k].timestamp > SESSION_TIMEOUT) delete pendingCineru[k];
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) delete lastProcessedMsg[k];
  }
}, 2.5 * 60 * 1000);
