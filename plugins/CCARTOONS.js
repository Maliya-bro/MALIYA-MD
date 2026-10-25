const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { MongoClient } = require('mongodb');
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingCartoonSearch = {};
const pendingCartoonSelection = {};
const pendingTargetSelection = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000;
const LOOP_COOLDOWN = 2000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

// ── Inline MongoDB Connection (Shared with CineSubz) ─────────
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";
const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const TARGETS_COLLECTION = "user_movie_targets";

let cachedDb = null;
let cachedClient = null;

async function getMongoDb() {
  if (cachedDb) return cachedDb;
  try {
    cachedClient = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
    await cachedClient.connect();
    cachedDb = cachedClient.db(MONGODB_DB);
    return cachedDb;
  } catch (err) {
    console.error("MongoDB Connection Error:", err?.message || err);
    throw err;
  }
}

async function resolveUserKey(sessionId) {
  const rawId = String(sessionId || "default").trim() || "default";
  if (rawId === "default") return "default";
  if (rawId.startsWith("PHONE::")) return rawId;

  try {
    const db = await getMongoDb();
    const doc = await db.collection("wa_sessions").findOne({ sessionId: rawId });
    if (doc) {
      if (doc.phone) {
        return `PHONE::${String(doc.phone).replace(/\D/g, "")}`;
      }
      if (doc.botJid) {
        const phone = String(doc.botJid).split(":")[0].split("@")[0].replace(/\D/g, "");
        if (phone) return `PHONE::${phone}`;
      }
    }
  } catch (e) {}

  return rawId;
}

async function getUserTargetGroups(sessionId) {
  const userKey = await resolveUserKey(sessionId);
  try {
    const db = await getMongoDb();
    const doc = await db.collection(TARGETS_COLLECTION).findOne({ sessionId: userKey });
    return doc?.groups || [];
  } catch (e) {
    console.error("getTargetGroups Error:", e?.message || e);
    return [];
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

function sanitizeFileName(name = "cartoon") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "cartoon";
}

function getChannelContext() {
  return {
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: CHANNEL_JID,
        newsletterName: CHANNEL_NAME,
        serverMessageId: -1,
      },
    }
  };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function toSmallCaps(str) {
  let s = str || "";
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(s).split("").map((char) => {
    const idx = normal.indexOf(char);
    return idx !== -1 ? small[idx] : char;
  }).join("");
}

function clearUserSession(k) {
  delete pendingCartoonSearch[k];
  delete pendingCartoonSelection[k];
  delete pendingTargetSelection[k];
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
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

async function getThumbnailBuffer(url) {
  let tryUrl = url || DEFAULT_SEARCH_IMAGE;
  try {
    const res = await axios.get(tryUrl, { responseType: "arraybuffer", timeout: 8000, headers: { 'User-Agent': UA } });
    return await sharp(Buffer.from(res.data)).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 50 }).toBuffer();
  } catch (e) {
    return null;
  }
}

async function getSearchResults(searchTerm) {
  const url = `https://sinhalacartoons.com/?s=${encodeURIComponent(searchTerm)}`;
  const { data } = await axios.get(url, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(data);
  const results = [];

  $('.post, article, .search-result, .movie-item, .post-item, .item-article').each((i, el) => {
    const link = $(el).find('a[href*="sinhalacartoons.com"]').first();
    const href = link.attr('href');
    
    let titleEl = $(el).find('h2.entry-title, h3.entry-title, .post-title, h2, h3').first();
    let title = titleEl.text().trim();
    if (!title) {
      title = link.attr('title') || link.text().trim();
    }
    title = title.replace(/^(HD|FHD|CAM|DVD|4K|SD)\s*[:|-]?\s*/i, '').trim();
    
    if (href && title) {
      if (href.startsWith('https://sinhalacartoons.com/') && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/page/') && !href.includes('/about-us/') && href !== 'https://sinhalacartoons.com' && title.length > 2) {
        if (!results.some(r => r.href === href)) results.push({ title, href });
      }
    }
  });

  return results.slice(0, 15);
}

async function getFinalDownloadLink(landingUrl) {
  if (!landingUrl) return null;
  try {
    const cleanUrl = landingUrl.replace(/&#038;/g, '&').replace(/&amp;/g, '&');
    const { data } = await axios.get(cleanUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://sinhalacartoons.com/' } });
    const $ = cheerio.load(data);
    
    let actualDlLink = $('a.dl-card-landing.force-download-btn').attr('href') || $('a.force-download-btn').attr('href');
    if (actualDlLink) return actualDlLink;

    const urlObj = new URL(cleanUrl, 'https://sinhalacartoons.com');
    const scData = urlObj.searchParams.get('sc_data');
    if (scData) {
      const decodedStr = Buffer.from(scData, 'base64').toString('utf-8');
      const parsedObj = JSON.parse(decodedStr);
      if (parsedObj.direct) return parsedObj.direct;
    }
  } catch(e) {
    console.error("Link Extraction Error:", e.message);
  }
  return null;
}

async function getMovieAndEpisodes(moviePageUrl) {
  const { data } = await axios.get(moviePageUrl, { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(data);

  let pageTitle = $('h1.movie-title, h1.entry-title, h1').first().text().trim() || $('title').text().trim();
  pageTitle = pageTitle.replace(/^(HD|FHD|CAM|DVD)\s*[:|-]?\s*/i, '').trim();
  let poster = $('.info-poster img, .poster img, .featured-image img').first().attr('src') || '';

  const details = { title: pageTitle, poster: poster, year: 'N/A', rating: 'N/A', quality: 'HD', isSeries: false };

  $('.details-list li, .movie-info li').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Release Year:')) details.year = text.replace('Release Year:', '').trim();
    if (text.includes('IMDb Rating:')) details.rating = text.replace('IMDb Rating:', '').trim();
    if (text.includes('Quality:')) details.quality = text.replace('Quality:', '').trim();
  });

  const items = [];

  if ($('.episode-row').length > 0) {
    details.isSeries = true;
    $('.episode-row').each((i, el) => {
      let landingUrl = $(el).find('a.sc-download-links-btn').attr('href') || $(el).attr('data-download-url');
      let epTitle = $(el).find('.ep-title').text().trim() || `Episode ${i + 1}`;
      if (landingUrl) items.push({ title: epTitle, landingUrl: landingUrl });
    });
  } else {
    details.isSeries = false;
    let landingUrl = $('a.sc-download-links-btn').attr('href') || $('a[href*="sc_data="]').attr('href');
    if (landingUrl) items.push({ title: "Full Movie", landingUrl: landingUrl });
  }

  return { details, items };
}

/* ================= TARGET SENDER CORE (CLEAN DETAILS ONLY) ================= */
async function sendCartoonToGroup(bot, originalMek, m, from, targetJid, details, selectedItem, itemIndex, totalItems) {
  const targetName = await getGroupName(bot, targetJid);
  const correctPosterUrl = details.poster || DEFAULT_SEARCH_IMAGE;
  const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

  // Group Info Card (Only movie details, no bot branding)
  if (itemIndex === 0) {
    let infoCard = `╭─[ 🎬 *𝗖𝗔𝗥𝗧𝗢𝗢𝗡 𝗜𝗡𝗙𝗢* ]\n│\n`;
    infoCard += `├ 🎬 *Title :* ${details.title}\n`;
    if (details.year !== 'N/A') infoCard += `├ 📅 *Year :* ${details.year}\n`;
    if (details.rating !== 'N/A') infoCard += `├ ⭐ *IMDb :* ${details.rating}\n`;
    infoCard += `├ 🎥 *Quality :* ${details.quality}\n`;
    infoCard += `├ 📺 *Type :* ${details.isSeries ? 'TV Series' : 'Movie'}\n│\n`;
    infoCard += `╰──────────────⮞\n> ⏳ _Uploading cartoon file(s), please wait..._`;

    if (thumbBuffer) {
      await bot.sendMessage(targetJid, { image: thumbBuffer, caption: infoCard });
    } else {
      await bot.sendMessage(targetJid, { text: infoCard });
    }
  }

  const finalDirectLink = await getFinalDownloadLink(selectedItem.landingUrl);
  if (!finalDirectLink) {
    await bot.sendMessage(from, { text: `❌ _Failed to extract link for ${selectedItem.title}_` }, { quoted: originalMek });
    return false;
  }

  let rawTitle = details.title || "Cartoon";
  let rawItemTitle = selectedItem.title || "";
  const cleanTitle = sanitizeFileName(rawTitle);
  const cleanSubTitle = sanitizeFileName(rawItemTitle);

  let finalFileName = details.isSeries ? `${cleanTitle} - ${cleanSubTitle}.mp4` : `${cleanTitle}.mp4`;

  let captionText = `╭─[ 🎬 *${details.title}* ]\n│\n`;
  captionText += `├ 📌 *Item :* ${selectedItem.title}\n`;
  captionText += `├ 📊 *Quality :* ${details.quality}\n│\n`;
  captionText += `╰──────────────⮞\n🍿 *Enjoy Your Cartoon!*`;

  const docPayload = {
    document: { url: finalDirectLink },
    mimetype: "video/mp4",
    fileName: finalFileName,
    caption: captionText
  };
  if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

  await bot.sendMessage(targetJid, docPayload);
  return true;
}

/* ================= FLOW PROCESSOR ================= */
async function processCartoonFlow(bot, mek, m, { body, sender, reply, from, sessionId, overridePayload, isOwner }) {
  if (!m.key.fromMe && !isOwner) return;

  const k = keyFor(sender, from);
  const texts = extractTexts(body, mek, m);

  let payload = overridePayload || "";
  if (!payload) {
    for (const t of texts) {
      if (t.startsWith(".cc_select ") || t.startsWith(".cc_ep ") || t.startsWith(".cc_send") || t.startsWith(".cc_target ")) {
        payload = t;
        break;
      }
    }
  }
  if (!payload) payload = String(body || "").trim();

  const now = Date.now();
  const lastMsg = lastProcessedMsg[k];
  if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) return;
  lastProcessedMsg[k] = { text: payload, time: now };

  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  // ── STEP 1: Cartoon Selected -> Show Episodes / Quality ──
  if (pendingCartoonSearch[k]) {
    const session = pendingCartoonSearch[k];
    let num = null;

    if (payload.startsWith(".cc_select ")) {
      num = parseInt(payload.replace(".cc_select ", "").trim(), 10);
    } else if (/^\d+$/.test(payload)) {
      num = parseInt(payload, 10);
    }

    if (num === null || isNaN(num) || num <= 0 || num > session.results.length) return;

    const selectedMovie = session.results[num - 1];
    const botDisplayName = session.botDisplayName || DEFAULT_BOT_NAME;
    const groups = session.groups;
    const originalMek = session.originalMek;
    delete pendingCartoonSearch[k];

    await bot.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    try {
      const { details, items } = await getMovieAndEpisodes(selectedMovie.href);
      if (items.length === 0) {
        return reply(`*╭──[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]──╮*\n│\n├─ 🚫 _No download options available!_\n╰────────────────╯`);
      }

      let dispTitle = details.title || selectedMovie.title;
      let typeName = details.isSeries ? 'TV Series' : 'Movie';

      let captionText = `*╭[ 🎬 ${botDisplayName.toUpperCase()} CARTOON ]╮*\n│\n`;
      captionText += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(dispTitle)}\n`;
      captionText += `├─ 📅 *𝗬𝗲𝗮𝗿:* ${details.year}\n`;
      captionText += `├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n`;
      captionText += `├─ 🎥 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n`;
      captionText += `├─ 📺 *𝗧𝘆𝗽𝗲:* ${typeName}\n`;
      if (details.isSeries) captionText += `├─ 📥 *𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗘𝗽𝗶𝘀𝗼𝗱𝗲𝘀:* ${items.length}\n`;
      captionText += `│\n╰──────────────────╯\n\n© 2026 ${BRAND_BASE} SYSTEM`;

      const posterImg = details.poster || DEFAULT_SEARCH_IMAGE;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const btn = new ButtonV2(bot)
            .setBody(captionText)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(posterImg);

          if (details.isSeries) {
            const episodeRows = [
              { title: "📦 Download ALL Episodes", description: `Download all ${items.length} episodes`, id: ".cc_ep all" },
              ...items.map((it, idx) => ({
                title: `${String(idx + 1).padStart(2, "0")}. ${it.title.substring(0, 45)}`,
                description: `Select ${it.title}`,
                id: `.cc_ep ${idx + 1}`
              }))
            ];

            btn.addRawButton({
              buttonId: "ccartoon_ep_list",
              buttonText: { displayText: "📺 Select Episodes" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Choose Episode ↯",
                  sections: [{ title: "Available Episodes", rows: episodeRows }]
                }),
              },
            });
          } else {
            btn.addButton("📥 Select Movie", ".cc_ep 1");
          }

          btn.addButton("📜 Bot Menu", ".menu");

          const sentDetailsMsg = await btn.send(from, { quoted: mek });

          if (sentDetailsMsg?.key?.id) {
            pendingCartoonSelection[k] = { details, items, groups, originalMek, timestamp: Date.now(), expectedMsgId: sentDetailsMsg.key.id, botDisplayName };
            await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {
          console.error("CCARTOON DETAILS BTN ERROR:", e);
        }
      }

      // Fallback
      let fallbackMsg = captionText + `\n\n`;
      if (details.isSeries) {
        fallbackMsg += `├─ 📱 *[ 01 ]* 📦 Select ALL Episodes\n`;
        items.forEach((item, idx) => {
          let numStr = String(idx + 2).padStart(2, "0");
          fallbackMsg += `├─ 📱 *[ ${numStr} ]* 📌 ${item.title}\n`;
        });
        fallbackMsg += `\n💡 *Swipe & Reply with "01" for ALL, or number like "2,3" for specific episodes.*`;
      } else {
        fallbackMsg += `├─ 📱 *[ 01 ]* 📌 Select Movie\n\n💡 *Swipe & Reply "01" to proceed.*`;
      }

      const channelMeta = getChannelContext();
      const sentDetailsMsg = await bot.sendMessage(from, { image: { url: posterImg }, caption: fallbackMsg, ...channelMeta }, { quoted: mek });

      pendingCartoonSelection[k] = { details, items, groups, originalMek, timestamp: Date.now(), expectedMsgId: sentDetailsMsg.key.id, botDisplayName };
      await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (err) {
      console.error("SinhalaCartoon Details Error:", err);
      await bot.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
      reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Failed to fetch cartoon details!_\n╰──────────────────╯`);
    }
    return;
  }

  // ── STEP 2: Episode(s) Picked -> Show "Send Cartoon" & "Bot Menu" ──
  if (pendingCartoonSelection[k]) {
    const session = pendingCartoonSelection[k];
    const { details, items, groups, originalMek, botDisplayName = DEFAULT_BOT_NAME } = session;
    let selectedIndices = [];

    let cmdInput = payload;
    if (cmdInput.startsWith(".cc_ep ")) {
      cmdInput = cmdInput.replace(".cc_ep ", "").trim();
    }

    const lowerInput = cmdInput.toLowerCase();

    if (details.isSeries) {
      if (lowerInput === "all" || lowerInput === "01" || lowerInput === "1") {
        selectedIndices = items.map((_, idx) => idx);
      } else {
        const numbers = cmdInput.split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        numbers.forEach(num => {
          if (num === 1) items.forEach((_, idx) => selectedIndices.push(idx));
          else if (num >= 2 && num <= items.length + 1) selectedIndices.push(num - 2);
        });
      }
    } else {
      if (lowerInput === "01" || lowerInput === "1" || lowerInput === "all") {
        selectedIndices = [0];
      }
    }

    selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);
    if (selectedIndices.length === 0) {
      return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗦𝗘𝗟𝗘𝗖𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 📌 *Please select a valid option.*\n╰────────────────╯`);
    }

    delete pendingCartoonSelection[k];

    let confirmBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${toSmallCaps(details.title)}*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    confirmBody += `📦 *Selected Items :* ${selectedIndices.length}\n`;
    confirmBody += `🎥 *Quality :* ${details.quality}\n\n`;
    confirmBody += `Click *Send Cartoon* to dispatch files to your saved target group(s).\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${BRAND_BASE}`;

    const posterImg = details.poster || DEFAULT_SEARCH_IMAGE;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const btn = new ButtonV2(bot)
          .setBody(confirmBody)
          .setFooter(`WaBot by ${botDisplayName}`)
          .setThumbnail(posterImg);

        btn.addButton("🚀 Send Cartoon", ".cc_send");
        btn.addButton("📜 Bot Menu", ".menu");

        const sentActionMsg = await btn.send(from, { quoted: mek });
        if (sentActionMsg?.key?.id) {
          pendingTargetSelection[k] = {
            step: 3,
            details,
            items,
            selectedIndices,
            groups,
            originalMek,
            botDisplayName,
            expectedMsgId: sentActionMsg.key.id,
            timestamp: Date.now()
          };
          await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (e) {
        console.error("ButtonV2 Action Error:", e);
      }
    }

    let actionMsg = `╭─[ 🚀 *𝗔𝗖𝗧𝗜𝗢𝗡 𝗠𝗘𝗡𝗨* ]\n│\n`;
    actionMsg += `├ 🎬 *${toSmallCaps(details.title)}*\n`;
    actionMsg += `├ 📦 *Items:* ${selectedIndices.length}\n│\n`;
    actionMsg += `├ 📱 *[ 01 ]* 🚀 Send Cartoon\n`;
    actionMsg += `├ 📱 *[ 02 ]* 📜 Bot Menu\n│\n`;
    actionMsg += `╰──────────────⮞\n> 💬 *Reply with 1 to Send or 2 for Menu...*`;

    const sentActionMsg = await bot.sendMessage(
      from,
      { image: { url: posterImg }, caption: actionMsg, ...getChannelContext() },
      { quoted: mek }
    );

    pendingTargetSelection[k] = {
      step: 3,
      details,
      items,
      selectedIndices,
      groups,
      originalMek,
      botDisplayName,
      expectedMsgId: sentActionMsg.key.id,
      timestamp: Date.now()
    };
    await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
    return;
  }

  // ── STEP 3: Action Triggered -> Choose Target Group or Direct Dispatch ──
  if (pendingTargetSelection[k]) {
    const session = pendingTargetSelection[k];

    if (session.step === 3) {
      let isSendAction = payload === ".cc_send" || payload === "1" || payload === "01";
      let isMenuAction = payload === "2" || payload === "02";

      if (isSendAction) {
        const { details, items, selectedIndices, groups, originalMek, botDisplayName } = session;

        // If only 1 group, dispatch immediately
        if (groups.length === 1) {
          clearUserSession(k);
          await startCartoonDispatch(bot, originalMek, m, from, groups[0], details, items, selectedIndices);
          return;
        }

        // Multiple target groups -> Select list
        const groupNames = await Promise.all(groups.map((g) => getGroupName(bot, g)));

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const groupRows = groupNames.map((n, i) => ({
              title: `${String(i + 1).padStart(2, "0")}. ${n.substring(0, 45)}`,
              description: `Send to ${n}`,
              id: `.cc_target ${i + 1}`,
            }));

            const btn = new ButtonV2(bot)
              .setBody(`⊱━━━━━ • ✿ • ━━━━━⊰\n🎯 *SELECT TARGET GROUP*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\nChoose destination group:`)
              .setFooter(`WaBot by ${botDisplayName}`);

            btn.addRawButton({
              buttonId: "ccartoon_target_group_list",
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
              session.step = 4;
              session.expectedMsgId = sentGrpMsg.key.id;
              session.timestamp = Date.now();
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
        groupMsg += `│\n╰──────────────⮞\n> 💬 *Reply with group number...*`;

        const sentGrpMsg = await bot.sendMessage(
          from,
          { text: groupMsg, ...getChannelContext() },
          { quoted: mek }
        );

        session.step = 4;
        session.expectedMsgId = sentGrpMsg.key.id;
        session.timestamp = Date.now();
      } else if (isMenuAction) {
        clearUserSession(k);
        const menuCmd = cmd.commands?.find((c) => c.pattern === "menu");
        if (menuCmd && typeof menuCmd.function === "function") {
          return await menuCmd.function(bot, mek, m, { from, sender, sessionId });
        } else {
          return await bot.sendMessage(
            from,
            { text: "Type `.menu` to view main bot menu.", ...getChannelContext() },
            { quoted: mek }
          );
        }
      }
    } 
    // ── STEP 4: Target Chosen -> Dispatch ──
    else if (session.step === 4) {
      let num = null;
      if (payload.startsWith(".cc_target ")) {
        num = parseInt(payload.replace(".cc_target ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        num = parseInt(payload, 10);
      }

      if (num === null || isNaN(num) || num <= 0 || num > session.groups.length) return;

      const { details, items, selectedIndices, groups, originalMek } = session;
      const targetGroup = groups[num - 1];
      clearUserSession(k);

      await startCartoonDispatch(bot, originalMek, m, from, targetGroup, details, items, selectedIndices);
    }
  }
}

async function startCartoonDispatch(bot, originalMek, m, from, targetJid, details, items, selectedIndices) {
  const targetName = await getGroupName(bot, targetJid);
  await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });
  await bot.sendMessage(from, {
    text: `╭[ 🚀 *𝗦𝗘𝗡𝗗𝗜𝗡𝗚 𝗖𝗔𝗥𝗧𝗢𝗢𝗡* ]\n│\n├ 🎯 *Target :* ${targetName}\n├ 📦 *Items :* ${selectedIndices.length}\n╰──────────────⮞`,
    ...getChannelContext()
  }, { quoted: originalMek });

  for (let i = 0; i < selectedIndices.length; i++) {
    const epIndex = selectedIndices[i];
    const selectedItem = items[epIndex];

    try {
      await bot.sendMessage(from, { react: { text: "📤", key: m.key } });
      await sendCartoonToGroup(bot, originalMek, m, from, targetJid, details, selectedItem, i, selectedIndices.length);
      await delay(2500);
    } catch (e) {
      console.error(`Dispatch item error (${selectedItem.title}):`, e);
    }
  }

  await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
  await bot.sendMessage(from, {
    text: `╭─[ ✅ *𝗦𝗨𝗖𝗖𝗘𝗦𝗦* ]\n│\n├ 📌 _Cartoon item(s) sent to: *${targetName}*_ \n╰──────────────⮞`,
    ...getChannelContext()
  }, { quoted: originalMek });
}

/* ================= MAIN COMMAND: .ccartoon (OWNER ONLY) ================= */
cmd({
  pattern: "ccartoon",
  alias: ["ccartoons", "cani"],
  desc: "Search and send cartoons to target groups (Shared Target Storage)",
  category: "download",
  react: "🎬",
  filename: __filename
}, async (bot, mek, m, { from, q, sender, reply, sessionId, isOwner }) => {
  // 🔒 OWNER PROTECTION
  if (!m.key.fromMe && !isOwner) {
    return reply("🚫 *Only the bot owner can use this command!*");
  }

  // Load target groups from shared collection
  const groups = await getUserTargetGroups(sessionId);

  if (!groups || groups.length === 0) {
    await bot.sendMessage(from, { react: { text: "❌", key: mek.key } });
    return reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _No target groups saved for your account._\n├ 💡 _Go to a group and use .ctarget to save it first._\n╰──────────────⮞`);
  }

  if (!q) {
    return reply(`*╭[ 🎬 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 𝗦𝗘𝗡𝗗𝗘𝗥 ]╮*\n│\n├─ 📌 *Usage:* .ccartoon [name]\n├─ 💡 *Example:* .ccartoon ben 10\n╰─────────────────╯`);
  }

  await bot.sendMessage(from, { react: { text: "🔍", key: mek.key } });

  try {
    const results = await getSearchResults(q.trim());
    if (results.length === 0) {
      await bot.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
      return reply(`*╭───[ 😞 𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦 ]───╮*\n│\n├─ 🎬 *Query:* _${q}_\n╰────────────────────╯`);
    }

    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;
    const botDisplayName = settings?.bot_name?.trim() || DEFAULT_BOT_NAME;

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "cartoon_header");
        if (custom && custom.data) searchImg = custom.data;
      } catch (e) {}
    }

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const cartoonRows = results.map((item, index) => ({
          title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
          description: "Click to view cartoon details & episodes",
          id: `.cc_select ${index + 1}`
        }));

        const bodyText = `*╭[ 🎬 ${botDisplayName.toUpperCase()} CARTOONS ]╮*\n│\n├─ 🔍 *Search :* ${q}\n├─ 📊 *Total Results :* ${results.length}\n│\n╰────────────────╯\n\n© 2026 ${BRAND_BASE} SYSTEM`;

        const btn = new ButtonV2(bot)
          .setBody(bodyText)
          .setFooter(`WaBot by ${botDisplayName}`)
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "ccartoon_search_list",
          buttonText: { displayText: "🎬 Select Cartoon" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "Available Cartoons ↯",
              sections: [{ title: "🎥 Search Results", rows: cartoonRows }]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingCartoonSearch[k] = { results, groups, originalMek: mek, timestamp: Date.now(), expectedMsgId: sentMsg.key.id, botDisplayName };
          await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.error("CCARTOON BUTTON ERROR:", err);
      }
    }

    let text = `*╭─[ 🎬 ${botDisplayName.toUpperCase()} CARTOONS ]─╮*\n│\n├─ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${results.length}\n│\n`;
    results.forEach((v, idx) => {
      let numStr = String(idx + 1).padStart(2, "0");
      text += `├─ 📱 *[ ${numStr} ]* 🎬 *${toSmallCaps(v.title.slice(0, 40))}*\n`;
    });
    text += `│\n╰───────────────╯\n\n> 💬 *Swipe & Reply with a number to select cartoon*`;

    const channelMeta = getChannelContext();
    const sentMsg = await bot.sendMessage(from, { image: { url: searchImg }, caption: text, ...channelMeta }, { quoted: mek });

    pendingCartoonSearch[k] = { results, groups, originalMek: mek, timestamp: Date.now(), expectedMsgId: sentMsg.key.id, botDisplayName };
    await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("CCartoon Search Error:", error);
    await bot.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
    reply(`*╭─[ ❌ 𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥 ]─╮*\n│\n├─ 🚫 _Error occurred while searching cartoons!_\n╰─────────────────╯`);
  }
});

/* ================= DIRECT BUTTON COMMANDS (PREVENTS UNKNOWN COMMAND) ================= */
cmd({ pattern: "cc_select", dontAddCommandList: true, filename: __filename }, async (bot, mek, m, opts) => {
  const arg = opts.q ? `.cc_select ${opts.q}` : ".cc_select";
  await processCartoonFlow(bot, mek, m, { ...opts, overridePayload: arg });
});

cmd({ pattern: "cc_ep", dontAddCommandList: true, filename: __filename }, async (bot, mek, m, opts) => {
  const arg = opts.q ? `.cc_ep ${opts.q}` : ".cc_ep";
  await processCartoonFlow(bot, mek, m, { ...opts, overridePayload: arg });
});

cmd({ pattern: "cc_send", dontAddCommandList: true, filename: __filename }, async (bot, mek, m, opts) => {
  await processCartoonFlow(bot, mek, m, { ...opts, overridePayload: ".cc_send" });
});

cmd({ pattern: "cc_target", dontAddCommandList: true, filename: __filename }, async (bot, mek, m, opts) => {
  const arg = opts.q ? `.cc_target ${opts.q}` : ".cc_target";
  await processCartoonFlow(bot, mek, m, { ...opts, overridePayload: arg });
});

/* ================= NUMBER REPLY LISTENER ================= */
const cartoonReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    if (!pendingCartoonSearch[k] && !pendingCartoonSelection[k] && !pendingTargetSelection[k]) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".cc_select ") || t.startsWith(".cc_ep ") || t.startsWith(".cc_send") || t.startsWith(".cc_target ")) return true;
    }

    const cleanInput = String(text || "").trim().toLowerCase();
    const isNumberOrList = /^(\d+|all|\d+(\s*,\s*\d+)*)$/.test(cleanInput);

    const targetId = pendingCartoonSearch[k]?.expectedMsgId || pendingCartoonSelection[k]?.expectedMsgId || pendingTargetSelection[k]?.expectedMsgId;
    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === targetId;

    return isQuoted || isNumberOrList;
  },
  function: async (bot, mek, m, opts) => {
    await processCartoonFlow(bot, mek, m, opts);
  }
};

if (Array.isArray(replyHandlers)) replyHandlers.push(cartoonReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const s in pendingCartoonSearch) {
    if (now - pendingCartoonSearch[s].timestamp > SESSION_TIMEOUT) delete pendingCartoonSearch[s];
  }
  for (const s in pendingCartoonSelection) {
    if (now - pendingCartoonSelection[s].timestamp > SESSION_TIMEOUT) delete pendingCartoonSelection[s];
  }
  for (const s in pendingTargetSelection) {
    if (now - pendingTargetSelection[s].timestamp > SESSION_TIMEOUT) delete pendingTargetSelection[s];
  }
  for (const s in lastProcessedMsg) {
    if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingCartoonSearch, pendingCartoonSelection };
