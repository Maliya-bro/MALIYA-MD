const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;
const MAX_RESULTS = 15;
const MAX_WHATSAPP_SIZE_GB = 2.0;

const pendingCineSubz = {};
const lastProcessedMsg = {};

/* ================= 0. DETAILED TERMINAL LOGGER ================= */
const logger = {
  header: (title) => console.log(`\n\x1b[1m\x1b[35m[CS-DEBUG] ═══════ ${title} ═══════\x1b[0m`),
  info: (msg) => console.log(`\x1b[36m[CS-INFO]\x1b[0m ${msg}`),
  req: (method, url) => console.log(`\x1b[33m[CS-REQ]\x1b[0m \x1b[1m${method}\x1b[0m ${url}`),
  res: (status, extra = "") => console.log(`\x1b[32m[CS-RES]\x1b[0m Status: \x1b[1m${status}\x1b[0m ${extra ? `(${extra})` : ""}`),
  warn: (msg) => console.log(`\x1b[33m[CS-WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[CS-ERR]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[CS-OK]\x1b[0m \x1b[1m${msg}\x1b[0m`),
  inspect: (title, data) => {
    console.log(`\x1b[90m┌── [${title}]`);
    const str = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    str.split("\n").forEach((line) => console.log(`\x1b[90m│\x1b[0m ${line}`));
    console.log(`\x1b[90m└──\x1b[0m`);
  },
};

/* ================= CLOUDFLARE WAF EVASION TLS AGENT ================= */
const sslAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  ciphers: [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-RSA-AES128-SHA",
    "ECDHE-RSA-AES256-SHA",
    "AES128-GCM-SHA256",
    "AES256-GCM-SHA384",
    "AES128-SHA",
    "AES256-SHA",
  ].join(":"),
  honorCipherOrder: true,
  minVersion: "TLSv1.2",
  maxVersion: "TLSv1.3",
  secureOptions:
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_NO_TICKET,
});

/* ================= EXACT 2026 BROWSER PROFILE ================= */
const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua":
    '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  Connection: "keep-alive",
};

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingCineSubz[k];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
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
      headers: browserHeaders,
      httpsAgent: sslAgent,
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
  await sock.sendMessage(
    from,
    {
      text:
        "⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _" +
        text +
        "_",
      contextInfo: channelContextInfo(),
    },
    { quoted: mek },
  );
}

/* ================= 1. CINESUBZ SEARCH ================= */
async function customSearchCineSubz(query) {
  const formattedQuery = encodeURIComponent(query.trim()).replace(/%20/g, "+");
  const searchUrl = `https://cinesubz.co/?s=${formattedQuery}`;

  logger.header("STEP 1: SEARCHING MOVIE");
  logger.req("GET", searchUrl);

  try {
    const res = await axios.get(searchUrl, {
      httpsAgent: sslAgent,
      timeout: 15000,
      headers: { ...browserHeaders, Referer: "https://cinesubz.co/" },
    });

    logger.res(res.status, `${String(res.data || "").length} bytes`);

    const html = String(res.data || "");
    const results = [];
    const seenUrls = new Set();

    const parts = html
      .split(/<div id="item-\d+"\s+class="display-item">/i)
      .slice(1);

    for (const block of parts) {
      const linkMatch = block.match(
        /<a\s+href="([^"]+)"[^>]*?(?:title="([^"]*)")?/i,
      );
      const h3Match =
        block.match(/<div class="item-desc-title">\s*<h3>([\s\S]*?)<\/h3>/i) ||
        block.match(/<h3>([\s\S]*?)<\/h3>/i);
      const imgMatch = block.match(
        /<img[^>]+(?:data-original|src)="([^"]+)"/i,
      );
      const imdbMatch = block.match(
        /<span class="imdb-score">([^<]+)<\/span>/i,
      );
      const qualityMatch = block.match(
        /<span class="badge-(?:quality|season)-corner">([^<]+)<\/span>/i,
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

    logger.success(`Extracted ${results.length} movies for query: "${query}"`);
    return results;
  } catch (err) {
    logger.error(`Search failed: ${err.message}`);
    return [];
  }
}

/* ================= 2. MOVIE SCRAPING ================= */
async function scrapeMoviePage(movieUrl, fallbackTitle = "Movie", fallbackImage = DEFAULT_SEARCH_IMAGE) {
  logger.header("STEP 2: SCRAPING MOVIE PAGE");
  logger.req("GET", movieUrl);

  try {
    const movieHost = new URL(movieUrl).origin;
    const res = await axios.get(movieUrl, {
      httpsAgent: sslAgent,
      timeout: 15000,
      headers: { ...browserHeaders, Referer: `${movieHost}/` },
    });

    logger.res(res.status, `${String(res.data || "").length} bytes`);

    const html = String(res.data || "");
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1].replace(/- CineSubz.*$/i, ""))
      : fallbackTitle;

    const downloadLinks = [];
    const seenUrls = new Set();

    const btnRegex =
      /<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"][^'"]*movie-download-button[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const buttonJobs = [];

    while ((match = btnRegex.exec(html)) !== null) {
      const rawLink = match[1].trim();
      const innerHtml = match[2];
      const metaMatch = innerHtml.match(
        /class=['"][^'"]*movie-download-meta[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i,
      );
      const typeMatch = innerHtml.match(
        /class=['"][^'"]*movie-download-type[^'"]*['"][^>]*>([\s\S]*?)<\/span>/i,
      );

      const qualityLabel = metaMatch
        ? decodeHtmlEntities(metaMatch[1])
        : (typeMatch ? decodeHtmlEntities(typeMatch[1]) : "Quality");

      buttonJobs.push((async () => {
        try {
          logger.info(`Resolving button redirect: ${rawLink}`);
          const pageRes = await axios.get(rawLink, {
            httpsAgent: sslAgent,
            headers: {
              ...browserHeaders,
              Referer: movieUrl,
              Host: new URL(rawLink).host,
            },
            timeout: 12000,
          });
          const pData = String(pageRes.data || "");
          const pathMatch = pData.match(
            /(?:https?:\/\/(?:google\.com|sonic-cloud\.online|drive\.csplayer2\.space))?\/(server\d+\/[^\s'"<>]+\.mp4)/i,
          );

          if (pathMatch) {
            let cleanPath = pathMatch[1].replace(/(server\d+\/)\d+:\//, "$1");
            const directCsLink = `https://drive.csplayer2.space/${cleanPath}`;
            logger.success(`Extracted CS Stream link: [${qualityLabel}] -> ${directCsLink}`);
            return { quality: qualityLabel, pageUrl: rawLink, directUrl: directCsLink, movieHost };
          }
        } catch (e) {
          logger.warn(`Button resolution failed: ${e.message}`);
        }
        return null;
      })());
    }

    const resolved = await Promise.all(buttonJobs);
    for (const item of resolved) {
      if (item && !seenUrls.has(item.directUrl)) {
        seenUrls.add(item.directUrl);
        downloadLinks.push(item);
      }
    }

    logger.success(`Total qualities extracted: ${downloadLinks.length}`);
    return { title, poster: fallbackImage, image: fallbackImage, downloadLinks };
  } catch (e) {
    logger.error(`Movie Page Scraping Failed: ${e.message}`);
    return null;
  }
}

/* ================= 3. DIRECT DOWNLOAD RESOLVER ================= */
async function getCineSubzLinks(originalUrl, originDomain = "https://cinesubz.co") {
  let targetLink = originalUrl.replace(/^https:\/\/[^\/]+/, "https://drive.csplayer2.space");
  targetLink = targetLink.replace(/(server\d+\/)\d+:\//, "$1");

  logger.header("STEP 3: DECRYPTING STREAM URL");
  logger.info(`Original Stream URL: ${originalUrl}`);
  logger.info(`Origin Referer    : ${originDomain}`);

  // Extract initial server from URL
  const serverMatch = targetLink.match(/\/server(\d+)\//);
  const detectedServer = serverMatch ? serverMatch[1] : "7";

  // Prioritize detected server first!
  const serversToTry = [detectedServer];
  ["7", "2", "1", "3", "4", "5", "6", "8", "9", "11", "21"].forEach((s) => {
    if (!serversToTry.includes(s)) serversToTry.push(s);
  });

  for (const serverNum of serversToTry) {
    let movieUrl = targetLink.replace(/\/server\d+\//, `/server${serverNum}/`);
    logger.info(`\n>>> Testing Server #${serverNum} -> ${movieUrl}`);

    try {
      const parsedUrl = new URL(movieUrl);
      const domain = parsedUrl.origin;
      const currentPath = parsedUrl.pathname + parsedUrl.search;

      let sessionCookies = "";

      // 1. Initial Handshake with Dynamic Referer
      logger.req("GET", movieUrl);
      const initialRes = await axios.get(movieUrl, {
        httpsAgent: sslAgent,
        headers: {
          ...browserHeaders,
          Host: parsedUrl.host,
          Referer: `${originDomain}/`,
          Origin: originDomain,
          "Sec-Fetch-Site": "cross-site",
        },
        timeout: 10000,
      });

      logger.res(initialRes.status, `${String(initialRes.data || "").length} bytes`);

      if (initialRes.headers["set-cookie"]) {
        sessionCookies = initialRes.headers["set-cookie"]
          .map((c) => c.split(";")[0])
          .join("; ");
        logger.inspect(`Server ${serverNum} Session Cookies`, sessionCookies);
      }

      let html = String(initialRes.data || "");
      let realPostUrl = movieUrl;
      const hexRegex = /[0-9a-fA-F]{200,}/g;
      let payloads = html.match(hexRegex) || [];

      logger.info(`Direct DOM HEX Payloads count: ${payloads.length}`);

      // 2. Download Data API Call
      if (payloads.length === 0) {
        const apiUrl = `${domain}/api/download-data${currentPath}`;
        logger.req("GET (Download-Data API)", apiUrl);

        try {
          const apiRes = await axios.get(apiUrl, {
            httpsAgent: sslAgent,
            timeout: 10000,
            headers: {
              ...browserHeaders,
              Accept: "application/json, text/plain, */*",
              Referer: movieUrl,
              Cookie: sessionCookies,
              Host: parsedUrl.host,
              Origin: domain,
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin",
            },
          });

          logger.res(apiRes.status, `JSON: ${JSON.stringify(apiRes.data)}`);

          if (apiRes.headers["set-cookie"]) {
            const apiCookies = apiRes.headers["set-cookie"]
              .map((c) => c.split(";")[0])
              .join("; ");
            sessionCookies = sessionCookies ? `${sessionCookies}; ${apiCookies}` : apiCookies;
          }

          if (apiRes.data && apiRes.data.redirect) {
            realPostUrl = apiRes.data.redirect;
            if (!realPostUrl.startsWith("http")) realPostUrl = domain + realPostUrl;

            logger.req("GET (Redirect Page)", realPostUrl);
            const redRes = await axios.get(realPostUrl, {
              httpsAgent: sslAgent,
              timeout: 10000,
              headers: {
                ...browserHeaders,
                Referer: movieUrl,
                Cookie: sessionCookies,
                Host: parsedUrl.host,
              },
            });

            logger.res(redRes.status, `${String(redRes.data || "").length} bytes`);
            html = String(redRes.data || "");
            payloads = html.match(hexRegex) || [];
            logger.info(`HEX Payloads extracted after redirect: ${payloads.length}`);
          }
        } catch (apiErr) {
          logger.warn(`API call failed for Server ${serverNum}: ${apiErr.response?.status || apiErr.message}`);
          continue;
        }
      }

      if (payloads.length === 0) {
        logger.warn(`Server ${serverNum} has 0 payloads. Skipping...`);
        continue;
      }

      // Keys from DOM
      const domStrings = [...html.matchAll(/(["'])(.*?)\1/g)].map((m) => m[2]);
      const keys = [...new Set(domStrings)].filter((k) => k && k.length >= 4 && k.length <= 40);
      keys.push("kasun", "cinesubz.lk", "CSPlayer", "ravindu01manoj", "jhutmupd", "dgpjjitp");

      logger.info(`Collected ${keys.length} decryption candidate keys.`);
      const results = [];

      for (let i = 0; i < payloads.length; i++) {
        const hex = payloads[i];
        try {
          const payloadBytes = Buffer.from(hex, "hex");
          const postRes = await axios.post(realPostUrl, payloadBytes, {
            httpsAgent: sslAgent,
            timeout: 10000,
            headers: {
              "User-Agent": browserHeaders["User-Agent"],
              Accept: "*/*",
              "Accept-Language": "en-US,en;q=0.9",
              Connection: "keep-alive",
              "Content-Type": "application/octet-stream",
              Cookie: sessionCookies,
              Origin: domain,
              Referer: realPostUrl,
              Host: parsedUrl.host,
              "sec-ch-ua": '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin",
            },
            responseType: "arraybuffer",
          });

          const resText = Buffer.from(postRes.data).toString("utf8");
          const encMatch = resText.match(/U2FsdGVkX1[a-zA-Z0-9+/=]+/);

          if (encMatch) {
            const encryptedStr = encMatch[0];
            for (const k of keys) {
              try {
                const dec = CryptoJS.AES.decrypt(encryptedStr, k).toString(CryptoJS.enc.Utf8);
                let finalStr = dec;

                if (finalStr && !finalStr.startsWith("http")) {
                  try {
                    finalStr = Buffer.from(finalStr, "base64").toString("utf8");
                  } catch (e) {}
                }

                if (finalStr && finalStr.startsWith("http")) {
                  logger.success(`Decrypted using key [ "${k}" ] -> ${finalStr}`);
                  results.push(finalStr);
                  break;
                }
              } catch (e) {}
            }
          }
        } catch (postErr) {
          // Individual payload failures are ignored
        }
      }

      const finalLinks = [...new Set(results)];
      if (finalLinks.length > 0) {
        logger.inspect(`Final Decrypted URLs on Server ${serverNum}`, finalLinks);
        return { success: true, links: finalLinks };
      }
    } catch (serverErr) {
      logger.error(`Server #${serverNum} encountered error: ${serverErr.response?.status || serverErr.message}`);
      continue;
    }
  }

  logger.error("All server attempts exhausted. 0 direct URLs resolved.");
  return { error: "Unable to decrypt file link from CineSubz servers (403/Forbidden from Host)." };
}

/* ================= COMMAND: .cinesubz ================= */
cmd(
  {
    pattern: "cinesubz",
    alias: ["cinesub", "cs", "cssearch", "film", "movie"],
    react: "🎬",
    desc: "Search and send movies from Cinesubz.co",
    category: "movie",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    try {
      if (!q) {
        return await sock.sendMessage(
          from,
          {
            text: "⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* `.cinesubz <name>`\n💡 *Example:* `.cinesubz spider man`",
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );
      }

      await sock.sendMessage(from, { react: { text: "📺", key: mek.key } });

      const results = await customSearchCineSubz(q.trim());
      if (!results || results.length === 0) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `No movies found on CineSubz for "${q}".`,
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
            description: "Click to view movie qualities",
            id: `.cs_select ${index + 1}`,
          }));

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(searchImg);

          btn.addRawButton({
            buttonId: "cinesubz_movies_list",
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
              timestamp: Date.now(),
              isProcessing: false,
              expectedMsgId: sentMsg.key.id,
              botDisplayName,
            };
            await sock.sendMessage(from, {
              react: { text: "✅", key: mek.key },
            });
            return;
          }
        } catch (e) {
          logger.warn(`ButtonV2 Render Failed: ${e.message}`);
        }
      }

      // Numbered Fallback
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${botDisplayName.toUpperCase()} MOVIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n`;
      topResults.forEach((item, index) => {
        text += `*[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${item.title}*\n`;
      });
      text +=
        "\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*";

      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: searchImg },
          caption: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek },
      );

      pendingCineSubz[k] = {
        step: 1,
        results: topResults,
        timestamp: Date.now(),
        isProcessing: false,
        expectedMsgId: sentMsg.key.id,
        botDisplayName,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(
        sock,
        from,
        mek,
        "Failed to connect to CineSubz search server.",
      );
    }
  },
);

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
    const max =
      pending.step === 1
        ? pending.results?.length || 0
        : pending.movie?.downloadLinks?.length || 0;
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
    if (
      lastMsg &&
      lastMsg.text === String(choice) &&
      now - lastMsg.time < LOOP_COOLDOWN
    )
      return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    const botDisplayName = pending.botDisplayName || DEFAULT_BOT_NAME;

    // STEP 1: Movie Pick -> Qualities
    if (pending.step === 1) {
      if (choice > pending.results.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selected = pending.results[choice - 1];
      logger.info(`User Selected Movie #${choice}: "${selected.title}"`);

      try {
        const movieInfo = await scrapeMoviePage(
          selected.url,
          selected.title,
          selected.image,
        );
        if (
          !movieInfo ||
          !movieInfo.downloadLinks ||
          movieInfo.downloadLinks.length === 0
        ) {
          clearUserSession(k);
          return await sendErrorMsg(
            sock,
            from,
            mek,
            "No download links available for this movie.",
          );
        }

        // WhatsApp 2GB limit filter
        const downloadLinks = movieInfo.downloadLinks.filter((d) => {
          const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
          if (match) {
            const size = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === "GB") return size <= MAX_WHATSAPP_SIZE_GB;
            if (unit === "MB") return true;
          }
          return true;
        });

        if (downloadLinks.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(
            sock,
            from,
            mek,
            `No download links found below WhatsApp limit (${MAX_WHATSAPP_SIZE_GB}GB).`,
          );
        }

        const imgToSend =
          movieInfo.poster ||
          movieInfo.image ||
          selected.image ||
          DEFAULT_SEARCH_IMAGE;
        let qualityBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate || selected.imdb)
          qualityBody += `⭐ *IMDb :* ${movieInfo.imdb_rate || selected.imdb}\n`;
        if (movieInfo.duration)
          qualityBody += `⏳ *Duration :* ${movieInfo.duration}\n\n`;
        qualityBody += `Available formats below 2GB are listed. Choose one to start direct stream.\n\n© 2026 ${BRAND_BASE} SYSTEM`;

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const qualityRows = downloadLinks.map((d, i) => ({
              title: `${String(i + 1).padStart(2, "0")}. ${d.quality}`,
              description: `Download ${d.quality}`,
              id: `.cs_dl ${i + 1}`,
            }));

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
                  title: "Choose Quality & Size ↯",
                  sections: [
                    { title: "📊 Available Qualities", rows: qualityRows },
                  ],
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
              await sock.sendMessage(from, {
                react: { text: "✅", key: mek.key },
              });
              return;
            }
          } catch (e) {
            logger.warn(`Quality ButtonV2 Error: ${e.message}`);
          }
        }

        // Fallback Quality Numbered Menu
        let qualityMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate || selected.imdb)
          qualityMsg += `⭐ *IMDb :* ${movieInfo.imdb_rate || selected.imdb}\n`;
        if (movieInfo.duration)
          qualityMsg += `⏳ *Duration :* ${movieInfo.duration}\n\n`;

        downloadLinks.forEach((d, i) => {
          qualityMsg += `*[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${d.quality}*\n`;
        });
        qualityMsg +=
          "\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply this message with a quality number...*";

        const sentQualityMsg = await sock.sendMessage(
          from,
          {
            image: { url: imgToSend },
            caption: qualityMsg,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );

        pending.step = 2;
        pending.movie = { metadata: movieInfo, downloadLinks };
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        pending.expectedMsgId = sentQualityMsg.key.id;

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (error) {
        clearUserSession(k);
        await sendErrorMsg(
          sock,
          from,
          mek,
          "Failed to fetch download links for this movie.",
        );
      }
    }
    // STEP 2: Download Link Processing
    else if (pending.step === 2) {
      if (choice > pending.movie.downloadLinks.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆", key: mek.key } });

      const { movie } = pending;
      const selectedLink = movie.downloadLinks[choice - 1];
      let targetServerLink = selectedLink.directUrl;
      const originHost = selectedLink.movieHost || "https://cinesubz.net";

      logger.header("STEP 4: USER CHOSE QUALITY");
      logger.info(`Choice: #${choice} (${selectedLink.quality})`);
      logger.info(`Target Server Stream Link: ${targetServerLink}`);

      clearUserSession(k);

      let directDownloadUrl = null;
      let telegramUrl = null;

      try {
        const finalResult = await getCineSubzLinks(targetServerLink, originHost);
        const correctPosterUrl =
          movie.metadata.poster || movie.metadata.image || DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

        if (
          !finalResult.success ||
          !finalResult.links ||
          finalResult.links.length === 0
        ) {
          throw new Error("Unable to decrypt file link from CineSubz servers (403 WAF Block).");
        }

        const allLinks = finalResult.links;

        // Telegram link
        const tgLink = allLinks.find(
          (link) => link.includes("t.me") || link.includes("telegram.me"),
        );
        if (tgLink) telegramUrl = tgLink;

        // Priority Link Filter
        const r2Links = allLinks.filter(
          (link) =>
            link.includes("r2.cloudflarestorage.com") ||
            link.includes("cloudflarestorage") ||
            link.includes(".r2."),
        );
        const mp4Links = allLinks.filter((link) => link.includes(".mp4"));
        const terracloudLinks = allLinks.filter(
          (link) => link.includes("terracloud") || link.includes("skylines"),
        );
        const pixeldrainLinks = allLinks.filter((link) =>
          link.includes("pixeldrain"),
        );
        const supercloudLinks = allLinks.filter((link) =>
          link.includes("supercloud"),
        );
        const nonTelegramLinks = allLinks.filter(
          (link) => !link.includes("telegram.me") && !link.includes("t.me"),
        );

        directDownloadUrl =
          r2Links[0] ||
          mp4Links[0] ||
          terracloudLinks[0] ||
          pixeldrainLinks[0] ||
          supercloudLinks[0] ||
          nonTelegramLinks[0] ||
          null;

        if (!directDownloadUrl) {
          throw new Error("Decryption succeeded but no valid direct streaming link found.");
        }

        const cleanTitle = movie.metadata.title
          .replace(/[^\w\s.-]/gi, "")
          .substring(0, 50)
          .trim();

        let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        // Direct Baileys Streaming Object
        const isR2Url = directDownloadUrl.includes("cloudflarestorage.com");
        const docPayload = {
          document: {
            url: directDownloadUrl,
            headers: isR2Url
              ? {
                  "User-Agent": browserHeaders["User-Agent"],
                  Accept: "*/*",
                }
              : {
                  "User-Agent": browserHeaders["User-Agent"],
                  Referer: "https://drive.csplayer2.space/",
                },
          },
          mimetype: "video/mp4",
          fileName: `MALIYA-MD ${cleanTitle}.mp4`,
          caption: captionText,
          contextInfo: channelContextInfo(),
        };

        if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

        logger.header("STEP 5: DISPATCHING TO BAILEYS SOCKET");
        logger.info(`Stream URL -> ${directDownloadUrl.substring(0, 100)}...`);

        // Send via Baileys Stream directly
        await sock.sendMessage(from, docPayload, { quoted: mek });
        logger.success("Video document stream successfully sent to WhatsApp!");
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

      } catch (error) {
        logger.error(`FULL PROCESS ERROR: ${error.stack || error.message}`);

        const realErrorReason = error?.message || "Connection timeout or WhatsApp upload rejected the stream.";

        let fallbackText = `⊱━━━━━ • ✿ • ━━━━━⊰\n⚠️ *𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐅𝐀𝐈𝐋𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\n❌ *Real Cause / Issue :*\n> _${realErrorReason}_\n\n`;

        if (directDownloadUrl) {
          fallbackText += `📥 *DIRECT HIGH-SPEED DOWNLOAD LINK :*\n${directDownloadUrl}\n\n💡 _Browser එකෙන් Link එක open කර Direct Download කරගන්න._\n\n`;
        }

        if (telegramUrl) {
          fallbackText += `✈️ *Telegram Direct Bot :*\n${telegramUrl}\n\n`;
        }

        fallbackText += `> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        const correctPosterUrl =
          movie.metadata?.poster || movie.metadata?.image || DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

        if (thumbBuffer) {
          await sock.sendMessage(
            from,
            {
              image: thumbBuffer,
              caption: fallbackText,
              contextInfo: channelContextInfo(),
            },
            { quoted: mek },
          );
        } else {
          await sock.sendMessage(
            from,
            { text: fallbackText, contextInfo: channelContextInfo() },
            { quoted: mek },
          );
        }

        await sock.sendMessage(from, { react: { text: "⚠️", key: mek.key } });
      }
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(csReplyHandler);

setInterval(
  () => {
    const now = Date.now();
    for (const k in pendingCineSubz) {
      if (now - pendingCineSubz[k].timestamp > SESSION_TIMEOUT)
        delete pendingCineSubz[k];
    }
    for (const k in lastProcessedMsg) {
      if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN)
        delete lastProcessedMsg[k];
    }
  },
  2.5 * 60 * 1000,
);

module.exports = {};
