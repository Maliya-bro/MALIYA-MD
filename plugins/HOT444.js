const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, rm, stat } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');
const { readSettings, getCustomImage } = require("../lib/botSettings");
const ffmpegPath = require('ffmpeg-static');

const execFileAsync = promisify(execFile);

// State Management
const pendingPhSearch = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

// ===== HELPER FUNCTIONS =====

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

function keyFor(sender, from) {
  let fromPart = "";
  if (from) {
    fromPart = String(from);
  }
  let senderPart = "";
  if (sender) {
    senderPart = String(sender).split(":")[0];
  }
  return fromPart + "::" + senderPart;
}

function toSmallCaps(str) {
  let text = "";
  if (str) {
    text = String(str);
  }
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return text
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      if (idx !== -1) {
        return small[idx];
      } else {
        return char;
      }
    })
    .join("");
}

function clearUserSession(k) {
  delete pendingPhSearch[k];
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function getQuotedStanzaId(mek) {
  if (mek && mek.message) {
    const types = ['extendedTextMessage', 'imageMessage', 'videoMessage', 'interactiveResponseMessage'];
    for (let t of types) {
      if (mek.message[t] && mek.message[t].contextInfo && mek.message[t].contextInfo.stanzaId) {
        return mek.message[t].contextInfo.stanzaId;
      }
    }
  }
  return null;
}

function extractIncomingPayload(body, mek, m) {
  let paramsJson = null;
  if (m && m.message && m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.nativeFlowResponseMessage) {
    paramsJson = m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }
  if (!paramsJson && mek && mek.message && mek.message.interactiveResponseMessage && mek.message.interactiveResponseMessage.nativeFlowResponseMessage) {
    paramsJson = mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }

  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
      if (btnId) return String(btnId).trim();
    }
  }

  let directId = null;
  if (m && m.message) {
    if (m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply) {
      directId = m.message.listResponseMessage.singleSelectReply.selectedRowId;
    } else if (m.message.buttonsResponseMessage) {
      directId = m.message.buttonsResponseMessage.selectedButtonId;
    }
  }
  if (!directId && mek && mek.message) {
    if (mek.message.listResponseMessage && mek.message.listResponseMessage.singleSelectReply) {
      directId = mek.message.listResponseMessage.singleSelectReply.selectedRowId;
    } else if (mek.message.buttonsResponseMessage) {
      directId = mek.message.buttonsResponseMessage.selectedButtonId;
    }
  }

  if (directId) return String(directId).trim();

  let text = "";
  if (m && m.message) {
    text = (m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.body && m.message.interactiveResponseMessage.body.text) ||
           m.message.conversation ||
           (m.message.extendedTextMessage && m.message.extendedTextMessage.text);
  }
  if (!text && mek && mek.message) {
    text = (mek.message.interactiveResponseMessage && mek.message.interactiveResponseMessage.body && mek.message.interactiveResponseMessage.body.text) ||
           mek.message.conversation ||
           (mek.message.extendedTextMessage && mek.message.extendedTextMessage.text);
  }
  if (!text && body) {
    text = body;
  }

  return String(text || "").trim();
}

// 1. SEARCH LOGIC
async function phSearch(query, limit = 100) {
  let allResults = [];
  let page = 1;

  while (allResults.length < limit && page <= 5) {
    const url = "https://www.pornhub.com/video/search?search=" + encodeURIComponent(query) + "&page=" + page;

    try {
      const { data } = await axios.get(url, {
        headers: { 
          'User-Agent': UA, 
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'hasVisited=1; age_verified=1'
        },
        timeout: 12000
      });
      const $ = cheerio.load(data);
      
      $('li.pcVideoListItem, li.videoBox').each((_, el) => {
        if (allResults.length >= limit) return false;
        const anchor = $(el).find('a').first();
        const img = $(el).find('img').first();
        
        let title = $(el).find('.title a, span.title').first().text().trim() || anchor.attr('title') || '';
        let href = anchor.attr('href') || '';
        const duration = $(el).find('var.duration, .duration').first().text().trim() || 'N/A';

        if (title && href && href.includes('viewkey=')) {
          const fullUrl = href.startsWith('http') ? href : "https://www.pornhub.com" + href;
          const thumb = img.attr('data-mediumhint') || img.attr('src') || '';

          allResults.push({
            title: title,
            url: fullUrl,
            thumb: thumb,
            duration: duration
          });
        }
      });
      page++;
    } catch (err) {
      break;
    }
  }
  return allResults;
}

// 2. DIRECT STREAM & VARIANT RESOLVER (FIXES 4XX CDN ERROR & TOKENS)
async function getPhDirectStream(url) {
  const { data } = await axios.get(url, {
    headers: { 
      'User-Agent': UA, 
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'hasVisited=1; age_verified=1'
    },
    timeout: 15000
  });
  
  const $ = cheerio.load(data);
  let masterM3u8Url = null;

  let flashvarsMatch = data.match(/flashvars_\d+\s*=\s*({.+?});/s) || data.match(/var\s+media_0\s*=\s*({.+?});/s);

  if (flashvarsMatch) {
    try {
      const flashvars = JSON.parse(flashvarsMatch[1]);
      if (flashvars.mediaDefinitions && Array.isArray(flashvars.mediaDefinitions)) {
        const sortedDefs = flashvars.mediaDefinitions.filter(m => (m.format === 'hls' || (m.videoUrl && m.videoUrl.includes('.m3u8'))) && m.videoUrl);
        if (sortedDefs.length > 0) {
          masterM3u8Url = sortedDefs[0].videoUrl;
        }
      }
    } catch {}
  }

  if (!masterM3u8Url) {
    const directM3u8 = data.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/i);
    if (directM3u8) {
      masterM3u8Url = directM3u8[0].replace(/\\/g, '');
    }
  }

  if (!masterM3u8Url) {
    throw new Error('Video stream URL could not be extracted.');
  }

  let title = $('h1.inlineFree').first().text().trim() || $('title').text().replace('- Pornhub.com', '').trim() || 'Pornhub Video';
  const duration = $('span.duration').first().text().trim() || 'N/A';

  let finalStreamUrl = masterM3u8Url;
  
  // CDN Token Fix
  try {
    const parsedUrl = new URL(masterM3u8Url);
    const searchParams = parsedUrl.search;
    const basePath = parsedUrl.origin + parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1);

    const m3u8Res = await axios.get(masterM3u8Url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.pornhub.com/',
        'Origin': 'https://www.pornhub.com',
        'Cookie': 'hasVisited=1; age_verified=1'
      },
      timeout: 10000
    });

    const m3u8Text = m3u8Res.data;
    if (typeof m3u8Text === 'string') {
      const lines = m3u8Text.split('\n');
      const subPlaylists = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          if (line.startsWith('http')) {
            subPlaylists.push(line);
          } else {
            subPlaylists.push(basePath + line + searchParams);
          }
        }
      }

      if (subPlaylists.length > 0) {
        finalStreamUrl = subPlaylists[0];
      }
    }
  } catch (e) {
    console.log("M3U8 Parse Warning:", e.message);
    finalStreamUrl = masterM3u8Url;
  }

  return { title: title, duration: duration, streamUrl: finalStreamUrl };
}

// 3. FFMPEG FILE DOWNLOAD (RAM OPTIMIZED)
async function phDownloadToFile(streamUrl) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'phdl-'));
  const outPath = join(tmpDir, 'video.mp4');

  const headersPayload = "Referer: https://www.pornhub.com/\r\nOrigin: https://www.pornhub.com\r\nCookie: hasVisited=1; age_verified=1\r\n";

  const ffmpegArgs = [
    '-v', 'error',
    '-y',
    '-user_agent', UA,
    '-headers', headersPayload,
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    outPath
  ];

  await execFileAsync(ffmpegPath, ffmpegArgs, { timeout: 600000 });
  
  const fileStats = await stat(outPath);
  
  if (fileStats.size < 5000) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw new Error('Downloaded stream returned empty file.');
  }

  return { 
    filePath: outPath, 
    tmpDir: tmpDir, 
    sizeMB: fileStats.size / (1024 * 1024) 
  };
}

function generateResultText(results, startIndex = 0, botDisplayName = DEFAULT_BOT_NAME) {
  const endIndex = Math.min(startIndex + 10, results.length);
  let text = "╭─[ 🔞 *" + botDisplayName.toUpperCase() + " 𝟭𝟴+* ]\n│\n";
  text += "├ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* " + (startIndex + 1) + " - " + endIndex + " of " + results.length + "\n";
  text += "├ 👇 *Reply with a Number:*\n│\n";

  for (let i = startIndex; i < endIndex; i++) {
    const v = results[i];
    const numStr = String(i + 1).padStart(2, "0");
    const shortTitle = toSmallCaps(v.title.slice(0, 36));
    let durationText = "";
    if (v.duration) {
      durationText = " _(" + v.duration + ")_";
    }
    text += "├ 📱 *[ " + numStr + " ]* 🎬 " + shortTitle + durationText + "\n";
  }

  text += "│\n╰───────────────⮞\n";
  if (endIndex < results.length && endIndex <= 90) {
    text += '\n> ➡️ *Reply with "' + (endIndex + 1) + '" for next 10 results*';
  }
  return text;
}

// 4. SEND DOWNLOADED VIDEO (DIRECT FILE UPLOAD)
async function processDownload(bot, mek, m, reply, from, selected, streamUrl, botDisplayName = DEFAULT_BOT_NAME) {
  await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });
  
  let downloadedFile = null;

  try {
    downloadedFile = await phDownloadToFile(streamUrl);
    const { filePath, sizeMB } = downloadedFile;

    const title = selected.title || "Pornhub Video";
    const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);
    const finalDuration = selected.duration || 'N/A';

    let captionText = "╭─[ 🔞 *" + botDisplayName.toUpperCase() + " 𝟭𝟴+* ]\n│\n";
    captionText += "├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* " + toSmallCaps(cleanTitle) + "\n";
    captionText += "├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* " + finalDuration + "\n";
    captionText += "├ 💾 *𝗦𝗶𝘇𝗲:* " + sizeMB.toFixed(2) + " MB\n";
    captionText += "│\n╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

    const fileName = "MALIYA-MD " + cleanTitle + ".mp4";

    if (sizeMB > 60) {
      await bot.sendMessage(from, {
        document: { url: filePath },
        mimetype: "video/mp4",
        fileName: fileName,
        caption: captionText + "\n\n_📄 Video sent as document due to size limit._",
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    } else {
      await bot.sendMessage(from, {
        video: { url: filePath },
        mimetype: "video/mp4",
        fileName: fileName,
        caption: captionText,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("Pornhub Download Error:", e);
    await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
    reply("╭─[ ❌ *𝗙𝗔𝗜𝗟𝗘𝗗* ]\n│\n├ 🚫 _" + (e.message || "Unknown Download Error") + "_\n╰───────────────⮞");
  } finally {
    if (downloadedFile && downloadedFile.tmpDir) {
      await rm(downloadedFile.tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
  pattern: "ph",
  alias: ["pornhub", "phub"],
  desc: "Search and download videos from Pornhub",
  category: "download",
  react: "🔞",
  filename: __filename
}, async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
  if (!q) {
    return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘* ]\n│\n├ 📌 *Usage:* .ph [search_term]\n├ 💡 *Example:* .ph hot\n╰───────────────⮞");
  }

  await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

  try {
    const results = await phSearch(q.trim(), 100);

    if (!results || !Array.isArray(results) || results.length === 0) {
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return reply("╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _" + q + "_\n╰───────────────⮞");
    }

    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    let btnsOn = Boolean(settings && settings.btns_enabled);
    let botDisplayName = (settings && settings.bot_name && settings.bot_name.trim()) || DEFAULT_BOT_NAME;

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "ph_header");
        if (custom && custom.data) {
          searchImg = custom.data;
        }
      } catch (e) {}
    }

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");

        const topResults = results.slice(0, 20);
        const videoRows = topResults.map((v, index) => ({
          title: String(index + 1).padStart(2, "0") + ". " + v.title.substring(0, 45),
          description: "Duration: " + (v.duration || 'N/A'),
          id: ".ph_select " + (index + 1)
        }));

        const bodyText = "╭─[ 🔞 *" + botDisplayName.toUpperCase() + " 𝟭𝟴+* ]\n│\n├ 🔍 *Search :* " + q + "\n├ 📊 *Total Results :* " + results.length + "\n│\n╰───────────────⮞\n\n© 2026 " + BRAND_BASE + " SYSTEM";

        const btn = new ButtonV2(bot)
          .setBody(bodyText)
          .setFooter("WaBot by " + botDisplayName)
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "ph_search_list",
          buttonText: { displayText: "🎬 Select Video" },
          type: 1,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "Search Results ↯",
              sections: [{ title: "🎥 Available Videos", rows: videoRows }]
            }),
          },
        });

        btn.addButton("📜 Bot Menu", ".menu");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg && sentMsg.key && sentMsg.key.id) {
          pendingPhSearch[k] = { 
            results: results, 
            timestamp: Date.now(), 
            expectedMsgId: sentMsg.key.id,
            botDisplayName: botDisplayName
          };
          await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
          return;
        }
      } catch (err) {
        console.log("PH BUTTON ERROR:", err.message || err);
      }
    }

    // Numbered List Fallback
    const sentMsg = await bot.sendMessage(from, { 
      image: { url: searchImg },
      caption: generateResultText(results, 0, botDisplayName),
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    const sentId = sentMsg && sentMsg.key ? sentMsg.key.id : null;

    pendingPhSearch[k] = { 
      results: results, 
      timestamp: Date.now(), 
      expectedMsgId: sentId,
      botDisplayName: botDisplayName
    };

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Pornhub Search Error:", error);
    await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
    reply("╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Error occurred while searching Pornhub!_\n╰───────────────⮞");
  }
});

// ===== 2. SELECTION REPLY HANDLER =====
const phReplyHandler = {
  filter: (text, { sender, from }) => {
    const k = keyFor(sender, from);
    return Boolean(pendingPhSearch[k]);
  },
  function: async (bot, mek, m, { body, sender, reply, from }) => {
    const payload = extractIncomingPayload(body, mek, m);
    if (!payload) return;

    const k = keyFor(sender, from);

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[k] = { text: payload, time: now };

    const quotedId = getQuotedStanzaId(mek);

    if (pendingPhSearch[k]) {
      const session = pendingPhSearch[k];
      if (quotedId && session.expectedMsgId && quotedId !== session.expectedMsgId) {
        return;
      }

      let num = null;
      if (payload.startsWith(".ph_select ")) {
        num = parseInt(payload.replace(".ph_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        num = parseInt(payload, 10);
      }

      if (num === null || isNaN(num) || num <= 0 || num > session.results.length) {
        return;
      }

      const botDisplayName = session.botDisplayName || DEFAULT_BOT_NAME;

      if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
        session.timestamp = Date.now();
        return reply(generateResultText(session.results, num - 1, botDisplayName));
      }

      const selected = session.results[num - 1];
      delete pendingPhSearch[k];

      await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

      try {
        const streamData = await getPhDirectStream(selected.url);
        
        const finalTitle = streamData.title || selected.title;
        const finalDuration = streamData.duration || selected.duration;

        return processDownload(bot, mek, m, reply, from, { ...selected, title: finalTitle, duration: finalDuration }, streamData.streamUrl, botDisplayName);
      } catch (err) {
        console.error("Direct Download Fetch Error:", err);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply("╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Failed to extract video stream!_\n╰───────────────⮞");
      }
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(phReplyHandler);
}

// Cleanup expired sessions
setInterval(() => {
  const now = Date.now();
  for (const s in pendingPhSearch) {
    if ((now - pendingPhSearch[s].timestamp) > SESSION_TIMEOUT) {
      delete pendingPhSearch[s];
    }
  }
  for (const s in lastProcessedMsg) {
    if ((now - lastProcessedMsg[s].time) > LOOP_COOLDOWN) {
      delete lastProcessedMsg[s];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingPhSearch };
