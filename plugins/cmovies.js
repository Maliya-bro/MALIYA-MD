const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 1500;
const MAX_RESULTS = 15;

const pendingCineSubz = {};
const lastProcessedMsg = {};

// ── Target Groups Storage (Shared with csend / csong) ─────────────
const STORE_PATH = path.join(__dirname, "csong_targets.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { groups: [] };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8") || '{"groups":[]}');
  } catch {
    return { groups: [] };
  }
}

async function getGroupName(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta?.subject || jid;
  } catch {
    return jid;
  }
}

function sanitizeFileName(name = "movie") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "movie";
}

const sslAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingCineSubz[k];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

function decodeHtmlEntities(str = "") {
  return String(str)
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&#8217;|&#8216;|&apos;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#038;|&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .trim();
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
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return await sharp(Buffer.from(res.data))
      .resize(250, 250, { fit: "cover" })
      .jpeg({ quality: 60 })
      .toBuffer();
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(
    from,
    {
      text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _${text}_\n╰──────────────⮞`,
      contextInfo: channelContextInfo(),
    },
    { quoted: mek }
  );
}

/* ================= 1. CINESUBZ SEARCH ================= */
async function customSearchCineSubz(query) {
  const formattedQuery = encodeURIComponent(query.trim()).replace(/%20/g, "+");
  const searchUrl = `https://cinesubz.co/?s=${formattedQuery}`;

  try {
    const res = await axios.get(searchUrl, {
      httpsAgent: sslAgent,
      timeout: 15000,
      headers: { ...defaultHeaders, Referer: "https://cinesubz.co/" },
    });

    const html = String(res.data || "");
    const results = [];
    const seenUrls = new Set();

    const parts = html
      .split(/<div id="item-\d+"\s+class="display-item">/i)
      .slice(1);

    for (const block of parts) {
      const linkMatch = block.match(
        /<a\s+href="([^"]+)"[^>]*?(?:title="([^"]*)")?/i
      );
      const h3Match =
        block.match(/<div class="item-desc-title">\s*<h3>([\s\S]*?)<\/h3>/i) ||
        block.match(/<h3>([\s\S]*?)<\/h3>/i);
      const imgMatch = block.match(
        /<img[^>]+(?:data-original|src)="([^"]+)"/i
      );
      const imdbMatch = block.match(
        /<span class="imdb-score">([^<]+)<\/span>/i
      );
      const qualityMatch = block.match(
        /<span class="badge-(?:quality|season)-corner">([^<]+)<\/span>/i
      );

      const url = linkMatch ? linkMatch[1].trim() : null;
      const rawTitle =
        (h3Match && h3Match[1]) || (linkMatch && linkMatch[2]) || "";
      const title = decodeHtmlEntities(rawTitle);
      const image = imgMatch ? imgMatch[1].trim() : DEFAULT_SEARCH_IMAGE;
      const imdb = imdbMatch ? imdbMatch[1].trim() : null;
      const quality = qualityMatch ? qualityMatch[1].trim() : null;

      if (url && title && !seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({ title, url, image, imdb, quality });
      }
    }

    return results;
  } catch (err) {
    console.error("CineSubz Search Error:", err?.message || err);
    return [];
  }
}

/* ================= 2. MOVIE SCRAPING ================= */
async function scrapeMoviePage(movieUrl, fallbackTitle = "Movie", fallbackImage = DEFAULT_SEARCH_IMAGE) {
  try {
    const res = await axios.get(movieUrl, {
      httpsAgent: sslAgent,
      timeout: 15000,
      headers: { ...defaultHeaders, Referer: "https://cinesubz.co/" },
    });

    const html = String(res.data || "");
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1].replace(/- CineSubz.*$/i, ""))
      : fallbackTitle;

    const imdbMatch = html.match(/class=['"][^'"]*imdb-rate[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i);
    const durationMatch = html.match(/class=['"][^'"]*duration[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i);

    const downloadLinks = [];
    const seenUrls = new Set();

    const btnRegex =
      /<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"][^'"]*movie-download-button[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = btnRegex.exec(html)) !== null) {
      const rawLink = match[1].trim();
      const innerHtml = match[2];
      const metaMatch = innerHtml.match(
        /class=['"][^'"]*movie-download-meta[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i
      );
      const typeMatch = innerHtml.match(
        /class=['"][^'"]*movie-download-type[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i
      );

      const qualityLabel = metaMatch
        ? decodeHtmlEntities(metaMatch[1])
        : (typeMatch ? decodeHtmlEntities(typeMatch[1]) : "Quality");

      let directCsLink = "";

      try {
        const pageRes = await axios.get(rawLink, {
          httpsAgent: sslAgent,
          headers: { ...defaultHeaders, Referer: movieUrl },
          timeout: 10000,
        });
        const pData = String(pageRes.data || "");

        const pathMatch = pData.match(
          /(?:https?:\/\/(?:google\.com|sonic-cloud\.online|drive\.csplayer2\.space))?\/(server\d+\/[^\s'"<>]+\.mp4)/i
        );

        if (pathMatch) {
          let cleanPath = pathMatch[1].replace(/(server\d+\/)\d+:\//, "$1");
          directCsLink = `https://drive.csplayer2.space/${cleanPath}`;
        }
      } catch (e) {}

      if (directCsLink && !seenUrls.has(directCsLink)) {
        seenUrls.add(directCsLink);
        downloadLinks.push({
          quality: qualityLabel,
          pageUrl: rawLink,
          directUrl: directCsLink,
        });
      }
    }

    return { 
      title, 
      poster: fallbackImage, 
      image: fallbackImage, 
      imdb_rate: imdbMatch ? decodeHtmlEntities(imdbMatch[1]) : null,
      duration: durationMatch ? decodeHtmlEntities(durationMatch[1]) : null,
      downloadLinks 
    };
  } catch (e) {
    console.error("CineSubz Scrape Error:", e?.message || e);
    return null;
  }
}

/* ================= 3. DIRECT DOWNLOAD RESOLVER ================= */
async function getCineSubzLinks(originalUrl) {
  let targetLink = originalUrl.replace(/^https:\/\/[^\/]+/, "https://drive.csplayer2.space");
  targetLink = targetLink.replace(/(server\d+\/)\d+:\//, "$1");
  targetLink = targetLink.replace(/\?ext=mp4/gi, "");

  let baseServerMatch = targetLink.match(/server(\d+)/);
  let serversToTry = [];
  if (baseServerMatch) serversToTry.push(baseServerMatch[1]);
  ["1", "2", "3", "4", "5", "6", "8", "9", "7", "11"].forEach((s) => {
    if (!serversToTry.includes(s)) serversToTry.push(s);
  });

  for (let serverNum of serversToTry) {
    let movieUrl = targetLink;
    if (baseServerMatch) {
      movieUrl = movieUrl.replace(/server\d+/, `server${serverNum}`);
    }

    try {
      const parsedUrl = new URL(movieUrl);
      const domain = parsedUrl.origin;
      const currentPath = parsedUrl.pathname + parsedUrl.search;

      const initialRes = await axios.get(movieUrl, {
        httpsAgent: sslAgent,
        headers: defaultHeaders,
        timeout: 12000,
      });
      let cookieHeader = "";
      if (initialRes.headers["set-cookie"]) {
        cookieHeader = initialRes.headers["set-cookie"]
          .map((c) => c.split(";")[0])
          .join("; ");
      }

      let html = String(initialRes.data || "");
      let realPageUrl = movieUrl;
      const hexRegex = /[0-9a-fA-F]{200,}/g;
      let payloads = html.match(hexRegex) || [];

      if (payloads.length === 0) {
        const apiUrl = `${domain}/api/download-data${currentPath}`;
        const apiResponse = await axios.get(apiUrl, {
          httpsAgent: sslAgent,
          timeout: 12000,
          headers: {
            ...defaultHeaders,
            Accept: "application/json",
            Referer: movieUrl,
            Cookie: cookieHeader,
          },
        });

        if (apiResponse.headers["set-cookie"]) {
          cookieHeader = apiResponse.headers["set-cookie"]
            .map((c) => c.split(";")[0])
            .join("; ");
        }

        if (apiResponse.data && apiResponse.data.redirect) {
          realPageUrl = apiResponse.data.redirect;
          if (!realPageUrl.startsWith("http"))
            realPageUrl = domain + realPageUrl;

          const pageResponse = await axios.get(realPageUrl, {
            httpsAgent: sslAgent,
            timeout: 12000,
            headers: {
              ...defaultHeaders,
              Referer: movieUrl,
              Cookie: cookieHeader,
            },
          });
          html = String(pageResponse.data || "");
          payloads = html.match(hexRegex) || [];
        }
      }

      if (payloads.length === 0) continue;

      const allStrings = [...html.matchAll(/(["'])(.*?)\1/g)].map((m) => m[2]);
      const keysToTry = [...new Set(allStrings)];
      keysToTry.push("kasun", "cinesubz.lk", "CSPlayer", "ravindu01manoj");

      const results = [];

      for (let hexPayload of payloads) {
        try {
          const payloadBytes = Buffer.from(hexPayload, "hex");
          const postHeaders = {
            "User-Agent": defaultHeaders["User-Agent"],
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Connection: "keep-alive",
            "Content-Type": "application/octet-stream",
            Cookie: cookieHeader,
            Origin: domain,
            Referer: realPageUrl,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
          };

          const dlResponse = await axios.post(realPageUrl, payloadBytes, {
            httpsAgent: sslAgent,
            timeout: 12000,
            headers: postHeaders,
            responseType: "arraybuffer",
          });

          const responseText = Buffer.from(dlResponse.data).toString("utf8");
          const encryptedUrlMatch = responseText.match(
            /U2FsdGVkX1[a-zA-Z0-9+/=]+/
          );

          if (encryptedUrlMatch) {
            const encryptedUrl = encryptedUrlMatch[0];
            for (let key of keysToTry) {
              if (!key || key.length < 3) continue;
              try {
                const decryptedBytes = CryptoJS.AES.decrypt(encryptedUrl, key);
                let decodedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);

                if (decodedStr && !decodedStr.startsWith("http")) {
                  try {
                    decodedStr = Buffer.from(decodedStr, "base64").toString(
                      "utf8"
                    );
                  } catch (e) {}
                }

                if (decodedStr && decodedStr.startsWith("http")) {
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
  return { error: "File not found on any server." };
}

/* ================= MOVIE SENDER CORE (CLEAN DETAILS ONLY) ================= */
async function sendMovieToGroup(sock, originalMek, m, from, targetJid, selectedLink, movie) {
  await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

  const targetName = await getGroupName(sock, targetJid);
  const correctPosterUrl = movie.metadata.poster || movie.metadata.image || DEFAULT_SEARCH_IMAGE;
  const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

  // 1. Group එකට යන Card එක: Bot / Channel තොරතුරු කිසිවක් නැත. චිත්‍රපටයේ විස්තර පමණි.
  let infoCard = `╭─[ 🎬 *𝗠𝗢𝗩𝗜𝗘 𝗜𝗡𝗙𝗢* ]\n│\n`;
  infoCard += `├ 🎬 *Title :* ${movie.metadata.title}\n`;
  if (movie.metadata.imdb_rate) infoCard += `├ ⭐ *IMDb :* ${movie.metadata.imdb_rate}\n`;
  if (movie.metadata.duration) infoCard += `├ ⏳ *Duration :* ${movie.metadata.duration}\n`;
  infoCard += `├ 📊 *Quality :* ${selectedLink.quality}\n│\n`;
  infoCard += `╰──────────────⮞\n> ⏳ _Uploading movie file, please wait..._`;

  if (thumbBuffer) {
    await sock.sendMessage(targetJid, {
      image: thumbBuffer,
      caption: infoCard,
    });
  } else {
    await sock.sendMessage(targetJid, {
      text: infoCard,
    });
  }

  // 2. Direct Video Download & File Dispatch
  await sock.sendMessage(from, { react: { text: "⬇️", key: m.key } });
  let targetServerLink = selectedLink.directUrl;

  try {
    const finalResult = await getCineSubzLinks(targetServerLink);

    if (!finalResult.success || !finalResult.links || finalResult.links.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(
        sock,
        from,
        originalMek,
        `Link Extract Fail: ${finalResult.error || "Encrypted link resolver error."}`
      );
    }

    const allLinks = finalResult.links;
    const skylinesLinks = allLinks.filter((link) => link.includes("skylines") || link.includes("terracloud"));
    const pixeldrainLinks = allLinks.filter((link) => link.includes("pixeldrain"));
    const supercloudLinks = allLinks.filter((link) => link.includes("supercloud"));
    const directDownloadUrl = skylinesLinks[0] || pixeldrainLinks[0] || supercloudLinks[0] || allLinks[0];

    const cleanTitle = sanitizeFileName(movie.metadata.title);
    const finalFileName = `${cleanTitle}.mp4`;

    // Group එකට යන Video Document එක: Pure Movie details පමණි
    let captionText = `╭─[ 🎬 *${movie.metadata.title}* ]\n│\n`;
    captionText += `├ 📊 *Quality :* ${selectedLink.quality}\n`;
    if (movie.metadata.imdb_rate) captionText += `├ ⭐ *IMDb :* ${movie.metadata.imdb_rate}\n`;
    if (movie.metadata.duration) captionText += `├ ⏳ *Duration :* ${movie.metadata.duration}\n│\n`;
    captionText += `╰──────────────⮞\n🍿 *Enjoy Your Movie!*`;

    await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

    if (directDownloadUrl) {
      const docPayload = {
        document: { url: directDownloadUrl },
        mimetype: "video/mp4",
        fileName: finalFileName,
        caption: captionText,
      };
      if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

      // Group එකට Document එක යැවීම (No channelContextInfo)
      await sock.sendMessage(targetJid, docPayload);

      // Bot එක run කරන user ට Confirmation එක යැවීම
      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      await sock.sendMessage(
        from,
        {
          text: `╭─[ ✅ *𝗦𝗨𝗖𝗖𝗘𝗦𝗦* ]\n│\n├ 📌 _Movie successfully sent to: *${targetName}*_ \n╰──────────────⮞`,
          contextInfo: channelContextInfo(),
        },
        { quoted: originalMek }
      );
    } else {
      await sock.sendMessage(targetJid, {
        text: captionText,
      });
      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
    }
  } catch (error) {
    console.error("Movie Send Error:", error);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, originalMek, `Failed to send movie: ${error.message}`);
  }
}

/* ================= CENTRAL FLOW CONTROLLER ================= */
async function handleFlowInput(sock, mek, m, { body, sender, from, sessionId }) {
  const k = keyFor(sender, from);
  const pending = pendingCineSubz[k];
  if (!pending || pending.isProcessing) return;

  const texts = extractTexts(body, mek, m);
  let choice = null;
  let customAction = null;

  for (const t of texts) {
    if (t.startsWith(".cm_select ")) {
      choice = parseInt(t.replace(".cm_select ", "").trim(), 10);
      break;
    }
    if (t.startsWith(".cm_qual ")) {
      choice = parseInt(t.replace(".cm_qual ", "").trim(), 10);
      break;
    }
    if (t.startsWith(".cm_target ")) {
      choice = parseInt(t.replace(".cm_target ", "").trim(), 10);
      break;
    }
    if (t === ".cm_send") {
      customAction = "send";
      break;
    }
  }

  if (choice === null && customAction === null) {
    const num = parseInt(String(body || "").trim(), 10);
    if (!isNaN(num)) choice = num;
  }

  const now = Date.now();
  const lastMsg = lastProcessedMsg[k];
  if (
    lastMsg &&
    lastMsg.text === String(choice || customAction) &&
    now - lastMsg.time < LOOP_COOLDOWN
  ) {
    return;
  }
  lastProcessedMsg[k] = { text: String(choice || customAction), time: now };

  const botDisplayName = pending.botDisplayName || DEFAULT_BOT_NAME;
  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  // ── Step 1: Movie Chosen -> Get Qualities ──
  if (pending.step === 1) {
    if (!choice || choice > pending.results.length) return;
    pending.isProcessing = true;
    await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    const selected = pending.results[choice - 1];

    try {
      const movieInfo = await scrapeMoviePage(
        selected.url,
        selected.title,
        selected.image
      );

      if (!movieInfo || !movieInfo.downloadLinks || movieInfo.downloadLinks.length === 0) {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, "No download links available for this movie!");
      }

      const downloadLinks = movieInfo.downloadLinks.filter((d) => {
        const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
        if (match) {
          const size = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          if (unit === "GB") return size <= 2.0;
          if (unit === "MB") return true;
        }
        return true;
      });

      if (downloadLinks.length === 0) {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, "No download links under 2GB available!");
      }

      const imgToSend = movieInfo.poster || movieInfo.image || selected.image || DEFAULT_SEARCH_IMAGE;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const qualityRows = downloadLinks.map((d, i) => ({
            title: `${String(i + 1).padStart(2, "0")}. ${d.quality}`,
            description: `Select ${d.quality}`,
            id: `.cm_qual ${i + 1}`,
          }));

          let qualityBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *${botDisplayName.toUpperCase()} QUALITIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
          qualityBody += `🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
          if (movieInfo.imdb_rate) qualityBody += `⭐ *IMDb :* ${movieInfo.imdb_rate}\n`;
          if (movieInfo.duration) qualityBody += `⏳ *Duration :* ${movieInfo.duration}\n\n`;
          qualityBody += `Choose your desired quality below 2GB.\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;

          const btn = new ButtonV2(sock)
            .setBody(qualityBody)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(imgToSend);

          btn.addRawButton({
            buttonId: "cinesubz_quality_list",
            buttonText: { displayText: "📥 Select Quality" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Available Qualities ↯",
                sections: [{ title: "📊 Qualities", rows: qualityRows }],
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
          console.error("ButtonV2 Quality Error:", e);
        }
      }

      let qualityMsg = `╭─[ 📥 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n`;
      qualityMsg += `├ 🎬 *${toSmallCaps(movieInfo.title)}*\n`;
      if (movieInfo.imdb_rate) qualityMsg += `├ ⭐ *IMDb:* ${movieInfo.imdb_rate}\n`;
      if (movieInfo.duration) qualityMsg += `├ ⏳ *Duration:* ${movieInfo.duration}\n`;
      qualityMsg += `├ 👇 *Reply with Quality Number:*\n│\n`;

      downloadLinks.forEach((d, i) => {
        qualityMsg += `├ 📱 *[ ${String(i + 1).padStart(2, "0")} ]* 📊 ${d.quality}\n`;
      });
      qualityMsg += `│\n╰──────────────⮞\n> 💬 *Swipe & Reply this message with a quality number...*`;

      const sentQualityMsg = await sock.sendMessage(
        from,
        {
          image: { url: imgToSend },
          caption: qualityMsg,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );

      pending.step = 2;
      pending.movie = { metadata: movieInfo, downloadLinks };
      pending.timestamp = Date.now();
      pending.isProcessing = false;
      pending.expectedMsgId = sentQualityMsg.key.id;

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      clearUserSession(k);
      await sendErrorMsg(sock, from, mek, "Failed to scrape movie details.");
    }
  }

  // ── Step 2: Quality Picked -> Action Menu ──
  else if (pending.step === 2) {
    if (!choice || choice > pending.movie.downloadLinks.length) return;
    pending.isProcessing = true;
    await sock.sendMessage(from, { react: { text: "⚡", key: mek.key } });

    const selectedLink = pending.movie.downloadLinks[choice - 1];
    pending.selectedLink = selectedLink;

    const imgToSend =
      pending.movie.metadata.poster ||
      pending.movie.metadata.image ||
      DEFAULT_SEARCH_IMAGE;

    let confirmBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${toSmallCaps(pending.movie.metadata.title)}*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    confirmBody += `📊 *Selected Quality :* ${selectedLink.quality}\n\n`;
    confirmBody += `Click *Send Movie* to dispatch the movie file to your saved target group(s).\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const btn = new ButtonV2(sock)
          .setBody(confirmBody)
          .setFooter(`WaBot by ${botDisplayName}`)
          .setThumbnail(imgToSend);

        btn.addButton("🚀 Send Movie", ".cm_send");
        btn.addButton("📜 Bot Menu", ".menu");

        const sentActionMsg = await btn.send(from, { quoted: mek });
        if (sentActionMsg?.key?.id) {
          pending.step = 3;
          pending.timestamp = Date.now();
          pending.isProcessing = false;
          pending.expectedMsgId = sentActionMsg.key.id;
          await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (e) {
        console.error("ButtonV2 Action Error:", e);
      }
    }

    let actionMsg = `╭─[ 🚀 *𝗔𝗖𝗧𝗜𝗢𝗡 𝗠𝗘𝗡𝗨* ]\n│\n`;
    actionMsg += `├ 🎬 *${toSmallCaps(pending.movie.metadata.title)}*\n`;
    actionMsg += `├ 📊 *Quality:* ${selectedLink.quality}\n│\n`;
    actionMsg += `├ 📱 *[ 01 ]* 🚀 Send Movie\n`;
    actionMsg += `├ 📱 *[ 02 ]* 📜 Bot Menu\n│\n`;
    actionMsg += `╰──────────────⮞\n> 💬 *Reply with 1 to Send or 2 for Menu...*`;

    const sentActionMsg = await sock.sendMessage(
      from,
      {
        image: { url: imgToSend },
        caption: actionMsg,
        contextInfo: channelContextInfo(),
      },
      { quoted: mek }
    );

    pending.step = 3;
    pending.timestamp = Date.now();
    pending.isProcessing = false;
    pending.expectedMsgId = sentActionMsg.key.id;

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  }

  // ── Step 3: Trigger Movie Send ──
  else if (pending.step === 3) {
    if (customAction === "send" || choice === 1) {
      pending.isProcessing = true;
      const { movie, selectedLink, groups, originalMek } = pending;

      if (groups.length === 1) {
        clearUserSession(k);
        await sendMovieToGroup(sock, originalMek, m, from, groups[0], selectedLink, movie);
        return;
      }

      const groupNames = await Promise.all(groups.map((g) => getGroupName(sock, g)));

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const groupRows = groupNames.map((n, i) => ({
            title: `${String(i + 1).padStart(2, "0")}. ${n.substring(0, 45)}`,
            description: `Send to ${n}`,
            id: `.cm_target ${i + 1}`,
          }));

          const btn = new ButtonV2(sock)
            .setBody(`⊱━━━━━ • ✿ • ━━━━━⊰\n🎯 *SELECT TARGET GROUP*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\nChoose the destination group:`)
            .setFooter(`WaBot by ${botDisplayName}`);

          btn.addRawButton({
            buttonId: "cinesubz_target_group_list",
            buttonText: { displayText: "👥 Select Group" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Target Groups ↯",
                sections: [{ title: "Available Groups", rows: groupRows }],
              }),
            },
          });

          const sentGrpMsg = await btn.send(from, { quoted: mek });
          if (sentGrpMsg?.key?.id) {
            pending.step = 4;
            pending.timestamp = Date.now();
            pending.isProcessing = false;
            pending.expectedMsgId = sentGrpMsg.key.id;
            return;
          }
        } catch (e) {
          console.error("ButtonV2 Target Selection Error:", e);
        }
      }

      let groupMsg = `╭─[ 🎯 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗧𝗔𝗥𝗚𝗘𝗧 𝗚𝗥𝗢𝗨𝗣* ]\n│\n`;
      groupNames.forEach((n, i) => {
        groupMsg += `├ 📱 *[ ${String(i + 1).padStart(2, "0")} ]* 👥 ${n}\n`;
      });
      groupMsg += `│\n╰──────────────⮞\n> 💬 *Reply with the group number...*`;

      const sentGrpMsg = await sock.sendMessage(
        from,
        { text: groupMsg, contextInfo: channelContextInfo() },
        { quoted: mek }
      );

      pending.step = 4;
      pending.timestamp = Date.now();
      pending.isProcessing = false;
      pending.expectedMsgId = sentGrpMsg.key.id;
    } else if (choice === 2) {
      clearUserSession(k);
      const menuCmd = cmd.commands?.find((c) => c.pattern === "menu");
      if (menuCmd && typeof menuCmd.function === "function") {
        return await menuCmd.function(sock, mek, m, { from, sender, sessionId });
      } else {
        return await sock.sendMessage(
          from,
          { text: "Type `.menu` to view main bot menu.", contextInfo: channelContextInfo() },
          { quoted: mek }
        );
      }
    }
  }

  // ── Step 4: Target Picked -> Dispatch ──
  else if (pending.step === 4) {
    if (!choice || choice > pending.groups.length) return;
    pending.isProcessing = true;

    const { movie, selectedLink, groups, originalMek } = pending;
    const targetGroup = groups[choice - 1];
    clearUserSession(k);

    await sendMovieToGroup(sock, originalMek, m, from, targetGroup, selectedLink, movie);
  }
}

/* ================= COMMAND DEFINITIONS ================= */
cmd(
  {
    pattern: "cmovie",
    alias: ["cfilm", "cfilms", "cinesubz"],
    react: "🎬",
    desc: "Search and send movies from CineSubz to target groups",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    const store = readStore();
    const groups = store.groups || [];

    if (!groups.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return await sock.sendMessage(
        from,
        {
          text: `╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _No target groups saved. Use .ctarget inside a group first._\n╰──────────────⮞`,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );
    }

    if (!q) {
      return await sock.sendMessage(
        from,
        {
          text: `╭─[ 🎬 *MOVIE SENDER* ]\n│\n├ 📌 *Usage:* \`.cmovie <movie_name>\`\n├ 💡 *Example:* \`.cmovie avengers\`\n╰──────────────⮞`,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

      const results = await customSearchCineSubz(q.trim());
      if (!results || results.length === 0) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sock.sendMessage(
          from,
          {
            text: `╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _${q}_\n╰──────────────⮞`,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
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
          const custom = await getCustomImage(sessionId, "cinesubz_header");
          if (custom && custom.data) searchImg = custom.data;
        } catch (e) {}
      }

      const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${botDisplayName.toUpperCase()} MOVIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 ${BRAND_BASE} SYSTEM`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const movieRows = topResults.map((item, index) => ({
            title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
            description: "Click to select movie and view qualities",
            id: `.cm_select ${index + 1}`,
          }));

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(searchImg);

          btn.addRawButton({
            buttonId: "cinesubz_movie_list",
            buttonText: { displayText: "🎬 Select Movie" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "CineSubz Search Results ↯",
                sections: [{ title: "🎥 Available Movies", rows: movieRows }],
              }),
            },
          });

          btn.addButton("📜 Bot Menu", ".menu");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pendingCineSubz[k] = {
              step: 1,
              results: topResults,
              groups,
              timestamp: Date.now(),
              isProcessing: false,
              expectedMsgId: sentMsg.key.id,
              botDisplayName,
              originalMek: mek,
            };
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {
          console.error("ButtonV2 Movie List Error:", e);
        }
      }

      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${botDisplayName.toUpperCase()} MOVIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      text += `├ 🔎 *Search :* ${toSmallCaps(q)}\n`;
      text += `├ 📊 *Results :* ${topResults.length}\n`;
      text += `├ 👇 *Reply with a Number:*\n│\n`;

      topResults.forEach((item, index) => {
        text += `├ 📱 *[ ${String(index + 1).padStart(2, "0")} ]* 🎥 ${toSmallCaps(item.title)}\n`;
      });
      text += `│\n╰──────────────⮞\n> 💬 *Swipe & Reply this message with a number...*`;

      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: searchImg },
          caption: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );

      pendingCineSubz[k] = {
        step: 1,
        results: topResults,
        groups,
        timestamp: Date.now(),
        isProcessing: false,
        expectedMsgId: sentMsg.key.id,
        botDisplayName,
        originalMek: mek,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      console.error("Movie Search Error:", error);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Failed to connect to movie search.");
    }
  }
);

// ── DIRECT COMMAND HANDLERS FOR BUTTON RESPONSES ──
cmd(
  {
    pattern: "cm_send",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, sessionId }) => {
    await handleFlowInput(sock, mek, m, { body: ".cm_send", sender, from, sessionId });
  }
);

cmd(
  {
    pattern: "cm_select",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, sessionId, q }) => {
    await handleFlowInput(sock, mek, m, { body: `.cm_select ${q || ""}`, sender, from, sessionId });
  }
);

cmd(
  {
    pattern: "cm_qual",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, sessionId, q }) => {
    await handleFlowInput(sock, mek, m, { body: `.cm_qual ${q || ""}`, sender, from, sessionId });
  }
);

cmd(
  {
    pattern: "cm_target",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (sock, mek, m, { body, sender, from, sessionId, q }) => {
    await handleFlowInput(sock, mek, m, { body: `.cm_target ${q || ""}`, sender, from, sessionId });
  }
);

/* ================= NUMBER REPLY LISTENER ================= */
const movieReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineSubz[k];
    if (!pending) return false;

    const num = parseInt(String(text || "").trim(), 10);
    let max = 0;
    if (pending.step === 1) max = pending.results?.length || 0;
    else if (pending.step === 2) max = pending.movie?.downloadLinks?.length || 0;
    else if (pending.step === 3) max = 2;
    else if (pending.step === 4) max = pending.groups?.length || 0;

    const isNum = !isNaN(num) && num > 0 && num <= max;
    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === pending.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    await handleFlowInput(sock, mek, m, { body, sender, from, sessionId });
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(movieReplyHandler);

// Clean up idle sessions (Every 2.5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineSubz) {
    if (now - pendingCineSubz[k].timestamp > SESSION_TIMEOUT) {
      delete pendingCineSubz[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = {};
