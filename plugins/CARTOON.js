const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingCartoonSearch = {};
const pendingCartoonSelection = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000;
const LOOP_COOLDOWN = 2500;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

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
  return `${from || ""}`; 
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

  $('.post, article, .search-result, .movie-item, .post-item').each((i, el) => {
    const link = $(el).find('a[href*="sinhalacartoons.com"]').first();
    const href = link.attr('href');
    let title = link.text().trim() || $(el).find('h2, h3').text().trim();
    
    if (href && title) {
      if (href.startsWith('https://sinhalacartoons.com/') && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/page/') && !href.includes('/about-us/') && href !== 'https://sinhalacartoons.com' && title.length > 5) {
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

  let pageTitle = $('h1.movie-title').text().trim() || $('title').text().trim();
  let poster = $('.info-poster img').attr('src') || '';

  const details = { title: pageTitle, poster: poster, year: 'N/A', rating: 'N/A', quality: 'N/A', isSeries: false };

  $('.details-list li').each((i, el) => {
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

/* ================= COMMAND: .sinhalacartoon ================= */
cmd({
  pattern: "sinhalacartoon",
  alias: ["scartoon", "sc", "cartoon", "cartoons"],
  desc: "Search and download cartoons from SinhalaCartoons.com",
  category: "movie",
  react: "🎬",
  filename: __filename
}, async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
  if (!q) {
    return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘 ]──╮*\n│\n├─ 📌 *Usage:* .scartoon [cartoon name]\n├─ 💡 *Example:* .scartoon ben 10\n╰────────────────────╯`);
  }

  await bot.sendMessage(from, { react: { text: "📺", key: mek.key } });

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
          id: `.sc_select ${index + 1}`
        }));

        const bodyText = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡𝗦 ]─╮*\n│\n├─ 🔍 *Search :* ${q}\n├─ 📊 *Total Results :* ${results.length}\n│\n╰──────────────────╯\n\n© 2026 MALIYA-MD BOT SYSTEM`;

        const btn = new ButtonV2(bot)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "scartoon_search_list",
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
          pendingCartoonSearch[k] = { results, timestamp: Date.now(), expectedMsgId: sentMsg.key.id };
          await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        }
      } catch (err) {
        console.log("SCARTOON BUTTON ERROR:", err?.message || err);
      }
    }

    // Numbered Fallback
    let text = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡𝗦 ]─╮*\n│\n├─ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${results.length}\n│\n`;
    results.forEach((v, idx) => {
      let numStr = String(idx + 1).padStart(2, "0");
      text += `├─ 📱 *[ ${numStr} ]* 🎬 *${toSmallCaps(v.title.slice(0, 40))}*\n`;
    });
    text += `│\n╰──────────────────╯\n\n> 💬 *Swipe & Reply with a number to select cartoon*`;

    const channelMeta = getChannelContext();
    const sentMsg = await bot.sendMessage(from, { image: { url: searchImg }, caption: text, ...channelMeta }, { quoted: mek });

    pendingCartoonSearch[k] = { results, timestamp: Date.now(), expectedMsgId: sentMsg.key.id };
    await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("SinhalaCartoon Search Error:", error);
    await bot.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
    reply(`*╭──[ ❌ 𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥 ]──╮*\n│\n├─ 🚫 _Error occurred while searching cartoons!_\n╰───────────────────╯`);
  }
});

/* ================= REPLY HANDLER ================= */
const cartoonReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    if (!pendingCartoonSearch[k] && !pendingCartoonSelection[k]) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".sc_select ") || t.startsWith(".sc_ep ")) return true;
    }

    const cleanInput = String(text || "").trim().toLowerCase();
    const isNumberOrList = /^(\d+|all|\d+(\s*,\s*\d+)*)$/.test(cleanInput);

    const targetId = pendingCartoonSearch[k]?.expectedMsgId || pendingCartoonSelection[k]?.expectedMsgId;
    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === targetId;

    return isQuoted || isNumberOrList;
  },
  function: async (bot, mek, m, { body, sender, reply, from, sessionId }) => {
    const k = keyFor(sender, from);
    const texts = extractTexts(body, mek, m);

    let payload = "";
    for (const t of texts) {
      if (t.startsWith(".sc_select ") || t.startsWith(".sc_ep ")) {
        payload = t; break;
      }
    }
    if (!payload) payload = String(body || "").trim();

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: payload, time: now };

    // STEP 1: Cartoon Selection
    if (pendingCartoonSearch[k]) {
      const session = pendingCartoonSearch[k];
      let num = null;

      if (payload.startsWith(".sc_select ")) {
        num = parseInt(payload.replace(".sc_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        num = parseInt(payload, 10);
      }

      if (num === null || isNaN(num) || num <= 0 || num > session.results.length) return;

      const selectedMovie = session.results[num - 1];
      delete pendingCartoonSearch[k];

      await bot.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      try {
        const { details, items } = await getMovieAndEpisodes(selectedMovie.href);
        if (items.length === 0) {
          return reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _No download options available!_\n╰───────────────────╯`);
        }

        let dispTitle = details.title || selectedMovie.title;
        let typeName = details.isSeries ? 'TV Series' : 'Movie';

        let captionText = `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n`;
        captionText += `├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(dispTitle)}\n`;
        captionText += `├─ 📅 *𝗬𝗲𝗮𝗿:* ${details.year}\n`;
        captionText += `├─ ⭐ *𝗥𝗮𝘁𝗶𝗻𝗴:* ${details.rating}\n`;
        captionText += `├─ 🎥 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n`;
        captionText += `├─ 📺 *𝗧𝘆𝗽𝗲:* ${typeName}\n`;
        if (details.isSeries) captionText += `├─ 📥 *𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗘𝗽𝗶𝘀𝗼𝗱𝗲𝘀:* ${items.length}\n`;
        captionText += `│\n╰──────────────────╯\n\n© 2026 MALIYA-MD BOT SYSTEM`;

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;
        const posterImg = details.poster || DEFAULT_SEARCH_IMAGE;

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const btn = new ButtonV2(bot)
              .setBody(captionText)
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(posterImg);

            if (details.isSeries) {
              const episodeRows = [
                { title: "📦 Download ALL Episodes", description: `Download all ${items.length} episodes`, id: ".sc_ep all" },
                ...items.map((it, idx) => ({
                  title: `${String(idx + 1).padStart(2, "0")}. ${it.title.substring(0, 45)}`,
                  description: `Download ${it.title}`,
                  id: `.sc_ep ${idx + 1}`
                }))
              ];

              btn.addRawButton({
                buttonId: "scartoon_ep_list",
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
              btn.addButton("📥 Download Movie", ".sc_ep 1");
            }

            btn.addButton("📜 Bot Menu", ".menu");

            const sentDetailsMsg = await btn.send(from, { quoted: mek });

            if (sentDetailsMsg?.key?.id) {
              pendingCartoonSelection[k] = { details, items, timestamp: Date.now(), expectedMsgId: sentDetailsMsg.key.id };
              await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
              return;
            }
          } catch (e) {
            console.log("SCARTOON DETAILS BTN ERROR:", e?.message || e);
          }
        }

        // Fallback Numbered Menu
        let fallbackMsg = captionText + `\n\n`;
        if (details.isSeries) {
          fallbackMsg += `├─ 📱 *[ 01 ]* 📦 Download ALL Episodes\n`;
          items.forEach((item, idx) => {
            let numStr = String(idx + 2).padStart(2, "0");
            fallbackMsg += `├─ 📱 *[ ${numStr} ]* 📌 ${item.title}\n`;
          });
          fallbackMsg += `\n💡 *Swipe & Reply with "01" for ALL, or number like "2,3" for specific episodes.*`;
        } else {
          fallbackMsg += `├─ 📱 *[ 01 ]* 📌 Download Movie\n\n💡 *Swipe & Reply "01" to download.*`;
        }

        const channelMeta = getChannelContext();
        const sentDetailsMsg = await bot.sendMessage(from, { image: { url: posterImg }, caption: fallbackMsg, ...channelMeta }, { quoted: mek });

        pendingCartoonSelection[k] = { details, items, timestamp: Date.now(), expectedMsgId: sentDetailsMsg.key.id };
        await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });

      } catch (err) {
        console.error("SinhalaCartoon Details Error:", err);
        await bot.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        reply(`*╭───[ ❌ 𝗘𝗥𝗥𝗢𝗥 ]───╮*\n│\n├─ 🚫 _Failed to fetch cartoon details!_\n╰───────────────────╯`);
      }
      return;
    }

    // STEP 2: Episode Selection & Download
    if (pendingCartoonSelection[k]) {
      const session = pendingCartoonSelection[k];
      const { details, items } = session;
      let selectedIndices = [];

      let cmdInput = payload;
      if (cmdInput.startsWith(".sc_ep ")) {
        cmdInput = cmdInput.replace(".sc_ep ", "").trim();
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
        return reply(`*╭──[ ⚠️ 𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗦𝗘𝗟𝗘𝗖𝗧𝗜𝗢𝗡 ]──╮*\n│\n├─ 📌 *Please select a valid option.*\n╰──────────────────╯`);
      }

      delete pendingCartoonSelection[k];
      await reply(`*╭──[ ⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗜𝗡𝗚 ]──╮*\n│\n├─ 🚀 *Starting Download...*\n├─ 📦 *Selected Items:* ${selectedIndices.length}\n╰───────────────────╯`);

      const channelMeta = getChannelContext();
      const thumbBuffer = await getThumbnailBuffer(details.poster);

      for (let i = 0; i < selectedIndices.length; i++) {
        const epIndex = selectedIndices[i];
        const selectedItem = items[epIndex];

        try {
          await bot.sendMessage(from, { react: { text: "📥", key: mek.key } });
          await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Fetching & Uploading${selectedItem.title}...*`);

          const finalDirectLink = await getFinalDownloadLink(selectedItem.landingUrl);
          if (!finalDirectLink) {
            await reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _Failed to extract link for ${selectedItem.title}_\n╰─────────────────╯`);
            continue;
          }

          let rawTitle = details.title || "Cartoon";
          let rawItemTitle = selectedItem.title || "";
          const cleanTitle = rawTitle.replace(/[^\w\s.-]/gi, "").substring(0, 40);
          const cleanSubTitle = rawItemTitle.replace(/[^\w\s.-]/gi, "").substring(0, 20);
          
          let finalFileName = details.isSeries ? `MALIYA-MD ${cleanTitle} -${cleanSubTitle}.mp4` : `MALIYA-MD ${cleanTitle}.mp4`;

          const docPayload = {
            document: { url: finalDirectLink },
            mimetype: "video/mp4",
            fileName: finalFileName,
            caption: `*╭─[ 🎬 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝗖𝗔𝗥𝗧𝗢𝗢𝗡 ]─╮*\n│\n├─ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(details.title)}\n├─ 📌 *𝗜𝘁𝗲𝗺:* ${selectedItem.title}\n├─ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${details.quality}\n│\n╰──────────────────╯\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
            ...channelMeta
          };

          if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

          await bot.sendMessage(from, docPayload, { quoted: mek });
          await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
          await delay(3000); 
        } catch (error) {
          console.error(`SinhalaCartoon File Send Error (${selectedItem.title}):`, error);
          await reply(`*╭───[ ❌ 𝗙𝗔𝗜𝗟𝗘𝗗 ]───╮*\n│\n├─ 🚫 _Failed to send ${selectedItem.title}_\n╰─────────────────╯`);
        }
      }

      await reply(`*╭───[ ✅ 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 ]───╮*\n│\n├─ 🎉 *All Selected Downloads Completed!*\n╰─────────────────╯`);
    }
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
  for (const s in lastProcessedMsg) {
    if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingCartoonSearch, pendingCartoonSelection };
