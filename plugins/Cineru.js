const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = "cheerio" in global ? global.cheerio : require("cheerio");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
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

function makeProgressBarText(transferred, total, startTime, movieTitle, quality, serverName) {
  const barLength = 12;
  const downloadedMB = (transferred / (1024 * 1024)).toFixed(2);
  const elapsedSec = (Date.now() - startTime) / 1000;
  let speedMBps = 0;
  if (elapsedSec > 0) {
    speedMBps = (transferred / (1024 * 1024)) / elapsedSec;
  }
  const speedStr = speedMBps.toFixed(2);

  let barLine = "";
  if (total && total > 0) {
    const percent = Math.min(1, transferred / total);
    const filled = Math.round(barLength * percent);
    const empty = barLength - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const pctStr = (percent * 100).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(2);
    barLine = `📊 *[${bar}] ${pctStr}%*\n📦 *Size :* ${downloadedMB} MB / ${totalMB} MB\n⚡ *Speed :* ${speedStr} MB/s`;
  } else {
    barLine = `📦 *Downloaded :* ${downloadedMB} MB\n⚡ *Speed :* ${speedStr} MB/s`;
  }

  let msg = "╭──────────. ִ ࣪ ⋆ ೀ ─╮\n";
  msg += "   ⬇️  𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐈НГ  \n";
  msg += "╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n";
  msg += "─── ⋆⋅☆⋅⋆ ───\n";
  msg += `🎬 *Movie  :* ${toSmallCaps(movieTitle)}\n`;
  msg += `📺 *Quality:* ${quality}\n`;
  msg += `🌐 *Server :* ${serverName}\n`;
  msg += "─── ⋆⋅☆⋅⋆ ───\n\n";
  msg += `${barLine}\n\n`;
  msg += "•───────•°•❀•°•───────•\n";
  msg += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";
  return msg;
}

/**
 * 1. නම අනුව Movies Search කිරීම
 */
async function searchMovies(query) {
  const cheerio = require("cheerio");
  const { gotScraping } = await import("got-scraping");
  const searchUrl = `https://cineru.lk/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=10`;

  try {
    const response = await gotScraping({ url: searchUrl, ...REQUEST_OPTIONS });
    const posts = JSON.parse(response.body);
    return posts.map(post => ({
      id: post.id,
      title: cheerio.load(post.title.rendered).text().trim(),
      link: post.link
    }));
  } catch (err) {
    const fallbackUrl = `https://cineru.lk/?s=${encodeURIComponent(query)}`;
    const fallbackRes = await gotScraping({ url: fallbackUrl, ...REQUEST_OPTIONS });
    const $ = cheerio.load(fallbackRes.body);
    const results = [];

    $(".post-box-title a").each((_, el) => {
      results.push({
        title: $(el).text().trim(),
        link: $(el).attr("href")
      });
    });
    return results;
  }
}

/**
 * 2. Post ID එකෙන් PIXELDRAIN, GDRIVE සහ MEGA ලින්ක් ලබාගැනීම
 *    🔥 Cookie Jar + Browser Headers + Nonce Support 🔥
 */
async function getMovieDownloadData(movieUrl, postId) {
  const cheerio = require("cheerio");
  const { gotScraping } = await import("got-scraping");

  // ─── Cookie jar for session persistence ───
  let cookieJar;
  try {
    const tough = require("tough-cookie");
    cookieJar = new tough.CookieJar();
  } catch (e) {
    console.log("[CINERU] tough-cookie not installed, using manual cookies");
  }

  // ─── Browser-like headers (Cloudflare-friendly) ───
  const BROWSER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  };

  console.log(`[CINERU] 🚀 Fetching movie page: ${movieUrl}`);

  // ═══ STEP 1: Fetch the movie page to get cookies + poster ═══
  let pageRes;
  try {
    pageRes = await gotScraping({
      url: movieUrl,
      ...REQUEST_OPTIONS,
      headers: BROWSER_HEADERS,
      cookieJar: cookieJar,
      throwHttpErrors: false,
      retry: { limit: 2 }
    });
  } catch (e) {
    console.log("[CINERU] Page fetch failed:", e.message);
    throw new Error("Cineru.lk server එකට සම්බන්ධ විය නොහැක.");
  }

  console.log(`[CINERU] Page status: ${pageRes.statusCode}`);

  let $ = cheerio.load(pageRes.body);

  if (!postId) {
    postId = $("#post_id").val();
  }

  const poster = $(".single-post-thumb img").attr("src");

  if (!postId) {
    throw new Error("Post ID එක සොයාගත නොහැකි විය.");
  }

  console.log(`[CINERU] postId=${postId} | poster=${poster ? "✓" : "✗"}`);

  // ─── Get cookies from jar as a string ───
  let cookieString = "";
  try {
    if (cookieJar) {
      const cookies = await cookieJar.getCookies("https://cineru.lk");
      cookieString = cookies.map(c => `${c.key}=${c.value}`).join("; ");
      console.log(`[CINERU] 🍪 Cookies: ${cookieString.substring(0, 120)}${cookieString.length > 120 ? "..." : ""}`);
    }
  } catch (e) {
    console.log("[CINERU] Cookie extraction failed:", e.message);
  }

  // ─── Extract nonce from page if exists ───
  let nonce = "";
  const nonceMatch = pageRes.body.match(/cs_download_data['"]?\s*[:,]\s*['"]([a-f0-9]+)['"]/i)
    || pageRes.body.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i)
    || pageRes.body.match(/var\s+\w*nonce\w*\s*=\s*['"]([a-f0-9]+)['"]/i);
  if (nonceMatch) {
    nonce = nonceMatch[1];
    console.log(`[CINERU] 🔑 Found nonce: ${nonce}`);
  }

  // ═══ STEP 2: POST to admin-ajax.php with same session ═══
  const ajaxHeaders = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://cineru.lk",
    "Referer": movieUrl,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  };

  if (cookieString) {
    ajaxHeaders["Cookie"] = cookieString;
  }

  const formData = {
    action: "cs_download_data",
    post_id: postId
  };

  if (nonce) {
    formData.nonce = nonce;
    formData._wpnonce = nonce;
  }

  console.log(`[CINERU] 📡 POST admin-ajax.php (postId=${postId})...`);

  let ajaxRes;
  try {
    ajaxRes = await gotScraping.post("https://cineru.lk/wp-admin/admin-ajax.php", {
      ...REQUEST_OPTIONS,
      headers: ajaxHeaders,
      form: formData,
      cookieJar: cookieJar,
      throwHttpErrors: false,
      retry: { limit: 2 }
    });
  } catch (e) {
    console.log("[CINERU] AJAX request failed:", e.message);
    throw new Error("AJAX request failed: " + e.message);
  }

  console.log(`[CINERU] AJAX status: ${ajaxRes.statusCode}`);
  console.log(`[CINERU] AJAX body preview: ${ajaxRes.body.substring(0, 300)}`);

  let ajaxJson;
  try {
    ajaxJson = JSON.parse(ajaxRes.body);
  } catch (e) {
    console.log("[CINERU] ❌ Response is not JSON");
    throw new Error("Invalid AJAX response (not JSON)");
  }

  // ═══ STEP 3: If AJAX failed, try alternate endpoint ═══
  if (!ajaxJson.success || !ajaxJson.data) {
    console.log("[CINERU] ⚠️ AJAX returned success=false, trying fallback...");

    try {
      const fbRes = await gotScraping.post("https://cineru.lk/wp-admin/admin-ajax.php", {
        ...REQUEST_OPTIONS,
        headers: ajaxHeaders,
        form: {
          action: "cs_download_data",
          post_id: postId,
          _wpnonce: nonce || ""
        },
        cookieJar: cookieJar,
        throwHttpErrors: false
      });

      const fbJson = JSON.parse(fbRes.body);
      if (fbJson.success && fbJson.data) {
        console.log("[CINERU] ✅ Fallback 1 succeeded!");
        ajaxJson = fbJson;
      }
    } catch (e) {
      console.log("[CINERU] Fallback 1 failed:", e.message);
    }
  }

  // ═══ STEP 4: Parse the response ═══
  const downloads = [];

  if (ajaxJson.success && ajaxJson.data) {
    const $dl = cheerio.load(ajaxJson.data);

    const copyCards = $dl(".download-card .copy");
    console.log(`[CINERU] Found ${copyCards.length} quality cards`);

    $dl(".download-card .copy").each((_, copyEl) => {
      const qualityInfo = $dl(copyEl).find(".namer").text().trim();
      const linksContainer = $dl(copyEl).next(".imgf");
      const servers = [];

      linksContainer.find(".btns").each((_, btnEl) => {
        const serverName = $dl(btnEl).find(".nmcld").text().trim();
        const upperName = serverName.toUpperCase();
        const downloadUrl = $dl(btnEl).attr("data-link");

        let priority = 99;
        if (upperName.includes("PIXELDRAIN")) priority = 1;
        else if (upperName.includes("GDRIVE")) priority = 2;
        else if (upperName.includes("DRIVE") && !upperName.includes("USERDRIVE")) priority = 2;
        else if (upperName.includes("MEGA")) priority = 3;

        if (downloadUrl && priority < 99) {
          servers.push({ name: upperName, url: downloadUrl, priority });
        }
      });

      servers.sort((a, b) => a.priority - b.priority);

      console.log(`[CINERU] Quality: "${qualityInfo}" | Servers: ${servers.length}`);

      if (qualityInfo && servers.length > 0) {
        downloads.push({ quality: qualityInfo, servers });
      }
    });
  } else {
    console.log("[CINERU] ❌ Server returned success=false. Full response:");
    console.log("[CINERU] Response:", JSON.stringify(ajaxJson));
    console.log("[CINERU] 💡 මෙයට හේතු: Server IP එක Cineru.lk එකෙන් block වීම හෝ Cloudflare challenge");
  }

  console.log(`[CINERU] ✅ Total downloads found: ${downloads.length}`);
  return { downloads, poster };
}

function normalizeDirectUrl(url) {
  const pdMatch = url.match(/pixeldrain\.[a-z]+\/[ul]\/([a-zA-Z0-9_-]+)/i);
  if (pdMatch) {
    return `https://pixeldrain.com/api/file/${pdMatch[1]}?download`;
  }

  const gdFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdFileMatch) {
    return `https://drive.usercontent.google.com/download?id=${gdFileMatch[1]}&export=download&confirm=t`;
  }

  const gdOpenMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (gdOpenMatch) {
    return `https://drive.usercontent.google.com/download?id=${gdOpenMatch[1]}&export=download&confirm=t`;
  }

  const gdUcMatch = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i);
  if (gdUcMatch) {
    return `https://drive.usercontent.google.com/download?id=${gdUcMatch[1]}&export=download&confirm=t`;
  }

  return url;
}

async function downloadFromMega(megaUrl, downloadDir, fallbackFilePath, onProgress) {
  const file = MegaFile.fromURL(megaUrl);
  await file.loadAttributes();

  let finalPath = fallbackFilePath;
  if (file.name) {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "");
    if (cleanName) {
      finalPath = path.join(downloadDir, cleanName);
    }
  }

  const totalBytes = file.size;

  return await new Promise((resolve, reject) => {
    let transferred = 0;
    const readStream = file.download();
    const writeStream = fs.createWriteStream(finalPath);

    readStream.on("data", (chunk) => {
      transferred += chunk.length;
      if (onProgress) onProgress(transferred, totalBytes);
    });

    readStream.pipe(writeStream);

    writeStream.on("finish", () => resolve(finalPath));
    readStream.on("error", reject);
    writeStream.on("error", reject);
  });
}

function extractNextUrlFromHtml(html, currentUrl) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(html);

  const gdForm = $("form#download-form, form[action*='drive.usercontent.google.com']");
  if (gdForm.length) {
    const action = gdForm.attr("action");
    const params = new URLSearchParams();
    gdForm.find("input[name]").each((_, el) => {
      let val = $(el).attr("value");
      if (!val) val = "";
      params.append($(el).attr("name"), val);
    });
    return `${action}?${params.toString()}`;
  }

  const megaMatch = html.match(/https?:\/\/mega\.nz\/[a-zA-Z0-9/_#-]+/i);
  if (megaMatch) return megaMatch[0];

  const pdMatch = html.match(/https?:\/\/[a-z0-9.]*pixeldrain\.[a-z]+\/[ul]\/([a-zA-Z0-9_-]+)/i);
  if (pdMatch) return `https://pixeldrain.com/api/file/${pdMatch[1]}?download`;

  const gdMatch = html.match(/https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdMatch && !currentUrl.includes("drive.usercontent.google.com")) {
    return `https://drive.usercontent.google.com/download?id=${gdMatch[1]}&export=download&confirm=t`;
  }

  let foundLink = null;
  $("a[href], [data-link], [data-url]").each((_, el) => {
    let rawHref = $(el).attr("data-link");
    if (!rawHref) rawHref = $(el).attr("data-url");
    if (!rawHref) rawHref = $(el).attr("href");

    if (!rawHref) return;
    if (rawHref.startsWith("#")) return;
    if (rawHref.startsWith("javascript")) return;

    try {
      const fullUrl = new URL(rawHref, currentUrl).toString();
      let isValidTarget = false;

      if (fullUrl.includes("pixeldrain")) isValidTarget = true;
      if (fullUrl.includes("drive.google")) isValidTarget = true;
      if (fullUrl.includes("usercontent.google")) isValidTarget = true;
      if (fullUrl.includes("mega.nz")) isValidTarget = true;
      if (fullUrl.includes("workers.dev")) isValidTarget = true;
      if (fullUrl.includes("r2.dev")) isValidTarget = true;
      if (fullUrl.includes("dl.php?") && fullUrl !== currentUrl) isValidTarget = true;
      if (fullUrl.includes(".mp4")) isValidTarget = true;
      if (fullUrl.includes(".mkv")) isValidTarget = true;

      if (isValidTarget) {
        foundLink = normalizeDirectUrl(fullUrl);
        return false;
      }
    } catch (e) {}
  });

  return foundLink;
}

async function downloadMovieDirect(initialUrl, refererUrl, tempFilePath, onProgress, depth = 0) {
  if (depth > 5) throw new Error("Redirect සීමාව ඉක්මවා ගියා.");

  if (initialUrl.includes("mega.nz")) {
    return await downloadFromMega(initialUrl, path.dirname(tempFilePath), tempFilePath, onProgress);
  }

  const { gotScraping } = await import("got-scraping");
  const targetUrl = normalizeDirectUrl(initialUrl);

  return new Promise((resolve, reject) => {
    const stream = gotScraping.stream({
      url: targetUrl,
      ...REQUEST_OPTIONS,
      followRedirect: true,
      headers: { "Referer": refererUrl }
    });

    let isHtmlResponse = false;
    const htmlChunks = [];

    stream.on("response", (res) => {
      let finalVisitedUrl = res.url ? res.url : targetUrl;

      if (finalVisitedUrl.includes("mega.nz")) {
        stream.destroy();
        downloadFromMega(finalVisitedUrl, path.dirname(tempFilePath), tempFilePath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      let contentType = res.headers["content-type"] ? res.headers["content-type"].toLowerCase() : "";
      let disposition = res.headers["content-disposition"] ? res.headers["content-disposition"] : "";

      const normalizedFinal = normalizeDirectUrl(finalVisitedUrl);
      if (normalizedFinal !== finalVisitedUrl) {
        stream.destroy();
        downloadMovieDirect(normalizedFinal, finalVisitedUrl, tempFilePath, onProgress, depth + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      let isBinaryFile = false;
      if (disposition.includes("attachment")) isBinaryFile = true;
      if (contentType.includes("video/")) isBinaryFile = true;
      if (contentType.includes("application/octet-stream")) isBinaryFile = true;
      if (contentType.includes("application/x-matroska")) isBinaryFile = true;
      if (contentType.includes("application/force-download")) isBinaryFile = true;

      if (contentType.includes("text/html") && !isBinaryFile) {
        isHtmlResponse = true;
        stream.on("data", (chunk) => htmlChunks.push(chunk));
        stream.on("end", () => {
          const htmlBody = Buffer.concat(htmlChunks).toString("utf8");
          if (htmlBody.includes("Quota exceeded") || htmlBody.includes("TooManyRequests")) {
            reject(new Error("Google Drive quota ඉක්මවා ඇත."));
            return;
          }
          const nextUrl = extractNextUrlFromHtml(htmlBody, finalVisitedUrl);
          if (nextUrl && nextUrl !== targetUrl) {
            downloadMovieDirect(nextUrl, finalVisitedUrl, tempFilePath, onProgress, depth + 1)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error("ගොනුව ලබාගත නොහැකි විය."));
          }
        });
        return;
      }

      const fileWriter = fs.createWriteStream(tempFilePath);
      stream.on("downloadProgress", ({ transferred, total }) => {
        if (onProgress) onProgress(transferred, total);
      });
      stream.pipe(fileWriter);

      fileWriter.on("finish", () => resolve(tempFilePath));
      fileWriter.on("error", reject);
    });

    stream.on("error", (err) => {
      if (!isHtmlResponse) reject(err);
    });
  });
}

/**
 * Command: .cineru <name>
 */
cmd({
  pattern: "cineru",
  alias: ["cr", "cinerulk", "crfilm"],
  react: "🎬",
  desc: "Search and download movies from Cineru.lk",
  category: "download",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, sessionId }) => {
  try {
    if (!q) {
      let helpText = "╔═════ஓ๑♡๑ஓ═════╗\n";
      helpText += "    🎬 𝐂𝐈𝐍𝐄𝐑𝐔 𝐃𝐋 🎬\n";
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

    const results = await searchMovies(q.trim());
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
    console.log("[CINERU] Search error:", error);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to Cineru search server.");
  }
});

/**
 * Reply Handler
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
        const { downloads, poster } = await getMovieDownloadData(selected.link, selected.id);
        if (!downloads ? true : downloads.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "මෙම චිත්‍රපටය සඳහා Direct Download ලින්ක් හමු නොවුණි.");
        }

        let qualityMsg = "╭──────────. ִ ࣪ ⋆ ೀ ─╮\n";
        qualityMsg += "   📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒\n";
        qualityMsg += "╰─ ִ ࣪ ⋆ ೀ ──────────╯\n\n";
        qualityMsg += "⊹₊˚‧︵‿₊୨ᰔ୧₊‿︵‧˚₊⊹\n";
        qualityMsg += `🎬 *Movie  :* ${toSmallCaps(selected.title)}\n`;
        qualityMsg += "•───────•°•❀•°•───────•\n\n";

        downloads.forEach((d, i) => {
          qualityMsg += `╭─── ⋆⋅ 𖤓 ⋅⋆ ───\n`;
          qualityMsg += `│ *[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${d.quality}*\n`;
          qualityMsg += `╰────────────────\n`;
        });

        qualityMsg += "\n.𖥔 ݁ ˖⊹˚₊‧──────୨ ✦ ✦ ୧──────‧₊˚⊹.𖥔 ݁ ˖\n";
        qualityMsg += "> 💬 *Reply with quality number to auto-download...*";

        const imgToSend = poster ? poster : DEFAULT_SEARCH_IMAGE;

        const sentQualityMsg = await sock.sendMessage(from, {
          image: { url: imgToSend },
          caption: qualityMsg,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        pending.step = 2;
        pending.movie = { title: selected.title, link: selected.link, poster, downloads };
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        pending.expectedMsgId = sentQualityMsg.key.id;

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });
      } catch (error) {
        console.log("[CINERU] Step 1 error:", error);
        clearUserSession(k);
        await sendErrorMsg(sock, from, mek, "Failed to fetch qualities for this movie.");
      }
    }

    // ================= STEP 2: QUALITY CHOSEN -> AUTO DOWNLOAD & SEND =================
    else if (pending.step === 2) {
      if (choice < 1) return;
      if (choice > pending.movie.downloads.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬇️", key: m.key } });

      const { movie } = pending;
      const selectedQuality = movie.downloads[choice - 1];

      clearUserSession(k);

      const tempDir = path.join(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const cleanTitle = movie.title.replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();
      const tempFilePath = path.join(tempDir, `cineru_${Date.now()}_${cleanTitle}.mp4`);

      const firstServer = selectedQuality.servers[0] ? selectedQuality.servers[0].name : "AUTO";
      const progressMsg = await sock.sendMessage(from, {
        text: makeProgressBarText(0, 0, Date.now(), movie.title, selectedQuality.quality, firstServer),
        contextInfo: channelContextInfo()
      }, { quoted: mek });

      let downloadedSuccessfully = false;
      let usedServerName = "";

      for (let i = 0; i < selectedQuality.servers.length; i++) {
        const currentServer = selectedQuality.servers[i];
        const startTime = Date.now();
        let lastUpdate = 0;

        try {
          await sock.sendMessage(from, {
            text: makeProgressBarText(0, 0, startTime, movie.title, selectedQuality.quality, currentServer.name),
            edit: progressMsg.key
          });
        } catch (e) {}

        try {
          if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
          }

          await downloadMovieDirect(
            currentServer.url,
            movie.link,
            tempFilePath,
            async (transferred, total) => {
              const nowTime = Date.now();
              if (nowTime - lastUpdate > 4000) {
                lastUpdate = nowTime;
                try {
                  await sock.sendMessage(from, {
                    text: makeProgressBarText(transferred, total, startTime, movie.title, selectedQuality.quality, currentServer.name),
                    edit: progressMsg.key
                  });
                } catch (e) {}
              }
            }
          );

          if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 1024 * 1024) {
            downloadedSuccessfully = true;
            usedServerName = currentServer.name;
            break;
          }
        } catch (serverErr) {
          console.log(`[CINERU] Server ${currentServer.name} failed:`, serverErr.message);
          if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
          }
          continue;
        }
      }

      try {
        const correctPosterUrl = movie.poster ? movie.poster : DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

        if (!downloadedSuccessfully) {
          let failText = "╭─── ⋆⋅ ♰ ⋅⋆ ───╮\n";
          failText += " ⚠️ 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐅𝐀𝐈𝐋𝐄𝐃 ⚠️\n";
          failText += "╰─── ⋆⋅ ♰ ⋅⋆ ───╯\n\n";
          failText += `🎬 *Movie   :* ${toSmallCaps(movie.title)}\n`;
          failText += `📊 *Quality :* ${selectedQuality.quality}\n\n`;
          failText += "🚫 _Pixeldrain, GDrive සහ Mega යන සේවාදායක ත්‍රිත්වයෙන්ම ගොනුව බාගත කිරීමට නොහැකි විය._\n";

          if (thumbBuffer) {
            await sock.sendMessage(from, { image: thumbBuffer, caption: failText, contextInfo: channelContextInfo() }, { quoted: mek });
          } else {
            await sock.sendMessage(from, { text: failText, contextInfo: channelContextInfo() }, { quoted: mek });
          }
          return await sock.sendMessage(from, { react: { text: "⚠️", key: m.key } });
        }

        await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

        let captionText = "╔═════ஓ๑♡๑ஓ═════╗\n";
        captionText += "  🎉 𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃 🎉\n";
        captionText += "╚═════ஓ๑♡๑ஓ═════╝\n\n";
        captionText += "⋆⁺｡˚⋆˙‧₊☾ ◯ ☽₊‧˙⋆˚｡⁺⋆\n";
        captionText += `🎬 *Movie   :* ${toSmallCaps(movie.title)}\n`;
        captionText += `📊 *Quality :* ${selectedQuality.quality}\n`;
        captionText += `🌐 *Server  :* ${usedServerName}\n`;
        captionText += `📦 *Format  :* MKV Video\n`;
        captionText += "•───────•°•❀•°•───────•\n\n";
        captionText += "⚠️ *Important Note :*\n";
        captionText += "_Please download *VLC Media Player* because this is an *MKV* video file._ 📲🎞️\n\n";
        captionText += "•∘˙⊹. ꒰ঌ ᧔ෆ᧓ ໒꒱ .⊹˙∘•\n";
        captionText += "> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

        const docPayload = {
          document: fs.readFileSync(tempFilePath),
          mimetype: "video/x-matroska",
          fileName: `MALIYA-MD ${cleanTitle}.mkv`,
          caption: captionText,
          contextInfo: channelContextInfo()
        };

        if (thumbBuffer) {
          docPayload.jpegThumbnail = thumbBuffer;
        }

        await sock.sendMessage(from, docPayload, { quoted: mek });
        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (sendErr) {
        console.log("[CINERU] Send error:", sendErr);
        await sendErrorMsg(sock, from, mek, `Failed to send movie: ${sendErr.message}`);
      } finally {
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
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
