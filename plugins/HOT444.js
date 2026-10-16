const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, readFile, rm } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');
const { readSettings, getCustomImage } = require("../lib/botSettings");

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
  if (mek) {
    if (mek.message) {
      if (mek.message.extendedTextMessage) {
        if (mek.message.extendedTextMessage.contextInfo) {
          if (mek.message.extendedTextMessage.contextInfo.stanzaId) {
            return mek.message.extendedTextMessage.contextInfo.stanzaId;
          }
        }
      }
      if (mek.message.imageMessage) {
        if (mek.message.imageMessage.contextInfo) {
          if (mek.message.imageMessage.contextInfo.stanzaId) {
            return mek.message.imageMessage.contextInfo.stanzaId;
          }
        }
      }
      if (mek.message.videoMessage) {
        if (mek.message.videoMessage.contextInfo) {
          if (mek.message.videoMessage.contextInfo.stanzaId) {
            return mek.message.videoMessage.contextInfo.stanzaId;
          }
        }
      }
      if (mek.message.interactiveResponseMessage) {
        if (mek.message.interactiveResponseMessage.contextInfo) {
          if (mek.message.interactiveResponseMessage.contextInfo.stanzaId) {
            return mek.message.interactiveResponseMessage.contextInfo.stanzaId;
          }
        }
      }
    }
  }
  return null;
}

function extractIncomingPayload(body, mek, m) {
  let paramsJson = null;
  if (m) {
    if (m.message) {
      if (m.message.interactiveResponseMessage) {
        if (m.message.interactiveResponseMessage.nativeFlowResponseMessage) {
          if (m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson) {
            paramsJson = m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
          }
        }
      }
    }
  }
  if (!paramsJson) {
    if (mek) {
      if (mek.message) {
        if (mek.message.interactiveResponseMessage) {
          if (mek.message.interactiveResponseMessage.nativeFlowResponseMessage) {
            if (mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson) {
              paramsJson = mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
            }
          }
        }
      }
    }
  }

  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      let btnId = null;
      if (parsed.id) {
        btnId = parsed.id;
      } else if (parsed.selectedId) {
        btnId = parsed.selectedId;
      } else if (parsed.selectedRowId) {
        btnId = parsed.selectedRowId;
      } else if (parsed.name) {
        btnId = parsed.name;
      }

      if (btnId) {
        return String(btnId).trim();
      }
    }
  }

  let directId = null;
  if (m) {
    if (m.message) {
      if (m.message.listResponseMessage) {
        if (m.message.listResponseMessage.singleSelectReply) {
          directId = m.message.listResponseMessage.singleSelectReply.selectedRowId;
        }
      }
      if (!directId) {
        if (m.message.buttonsResponseMessage) {
          directId = m.message.buttonsResponseMessage.selectedButtonId;
        }
      }
    }
  }
  if (!directId) {
    if (mek) {
      if (mek.message) {
        if (mek.message.listResponseMessage) {
          if (mek.message.listResponseMessage.singleSelectReply) {
            directId = mek.message.listResponseMessage.singleSelectReply.selectedRowId;
          }
        }
        if (!directId) {
          if (mek.message.buttonsResponseMessage) {
            directId = mek.message.buttonsResponseMessage.selectedButtonId;
          }
        }
      }
    }
  }

  if (directId) {
    return String(directId).trim();
  }

  let text = "";
  if (m) {
    if (m.message) {
      if (m.message.interactiveResponseMessage) {
        if (m.message.interactiveResponseMessage.body) {
          text = m.message.interactiveResponseMessage.body.text;
        }
      }
      if (!text) {
        if (m.message.conversation) {
          text = m.message.conversation;
        }
      }
      if (!text) {
        if (m.message.extendedTextMessage) {
          text = m.message.extendedTextMessage.text;
        }
      }
    }
  }
  if (!text) {
    if (mek) {
      if (mek.message) {
        if (mek.message.interactiveResponseMessage) {
          if (mek.message.interactiveResponseMessage.body) {
            text = mek.message.interactiveResponseMessage.body.text;
          }
        }
        if (!text) {
          if (mek.message.conversation) {
            text = mek.message.conversation;
          }
        }
        if (!text) {
          if (mek.message.extendedTextMessage) {
            text = mek.message.extendedTextMessage.text;
          }
        }
      }
    }
  }
  if (!text) {
    if (body) {
      text = body;
    }
  }

  return String(text).trim();
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
        
        let title = $(el).find('.title a, span.title').first().text().trim();
        if (!title) {
          title = anchor.attr('title');
        }
        if (!title) {
          title = '';
        }

        let href = anchor.attr('href');
        if (!href) {
          href = '';
        }

        const duration = $(el).find('var.duration, .duration').first().text().trim();

        if (title && href && href.includes('viewkey=')) {
          let fullUrl = '';
          if (href.startsWith('http')) {
            fullUrl = href;
          } else {
            fullUrl = "https://www.pornhub.com" + href;
          }

          let thumb = img.attr('data-mediumhint');
          if (!thumb) {
            thumb = img.attr('src');
          }
          if (!thumb) {
            thumb = '';
          }

          allResults.push({
            title: title,
            url: fullUrl,
            thumb: thumb,
            duration: duration || 'N/A'
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

// 2. DIRECT STREAM & SUB-PLAYLIST RESOLVER
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

  let flashvarsMatch = data.match(/flashvars_\d+\s*=\s*({.+?});/s);
  if (!flashvarsMatch) {
    flashvarsMatch = data.match(/var\s+media_0\s*=\s*({.+?});/s);
  }

  if (flashvarsMatch) {
    try {
      const flashvars = JSON.parse(flashvarsMatch[1]);
      if (flashvars.mediaDefinitions && Array.isArray(flashvars.mediaDefinitions)) {
        // High quality HLS stream pick
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

  let title = $('h1.inlineFree').first().text().trim();
  if (!title) {
    title = $('title').text().replace('- Pornhub.com', '').trim();
  }
  if (!title) {
    title = 'Pornhub Video';
  }

  const duration = $('span.duration').first().text().trim();

  // Master m3u8 එක parse කර direct sub-playlist (.m3u8) link එකක් ලබාගැනීම
  let finalStreamUrl = masterM3u8Url;
  try {
    const m3u8Res = await axios.get(masterM3u8Url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.pornhub.com/',
        'Origin': 'https://www.pornhub.com',
        'Cookie': 'hasVisited=1; age_verified=1'
      },
      timeout: 10000
    });

    const m3u8Content = m3u8Res.data;
    if (typeof m3u8Content === 'string') {
      const lines = m3u8Content.split('\n');
      const validSubLinks = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          if (line.startsWith('http')) {
            validSubLinks.push(line);
          } else {
            const baseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);
            validSubLinks.push(baseUrl + line);
          }
        }
      }
      if (validSubLinks.length > 0) {
        // පළමු sub-playlist (හොඳම quality) URL එක තෝරා ගනී
        finalStreamUrl = validSubLinks[0];
      }
    }
  } catch (e) {
    finalStreamUrl = masterM3u8Url;
  }

  return { title: title, duration: duration, streamUrl: finalStreamUrl };
}

// 3. FFMPEG DOWNLOAD BUFFER
async function phDownloadBuffer(streamUrl) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'phdl-'));
  const outPath = join(tmpDir, 'video.mp4');

  // Multi-line header string වෙනුවට single sanitized string
  const customHeaders = "Referer: https://www.pornhub.com/\r\nOrigin: https://www.pornhub.com\r\nCookie: hasVisited=1; age_verified=1\r\nAccept: */*\r\n";

  const ffmpegArgs = [
    '-v', 'error',
    '-y',
    '-user_agent', UA,
    '-headers', customHeaders,
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-c', 'copy', // Re-encoding (libx264) වෙනුවට direct copy එකෙන් වේගවත් කර memory limit බේරා ගනී
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    outPath
  ];

  try {
    await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 600000 });
    const buffer = await readFile(outPath);
    
    if (buffer.length < 5000) {
      throw new Error('Downloaded stream returned empty file.');
    }

    return buffer;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
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
  if (endIndex < results.length) {
    if (endIndex <= 90) {
      text += '\n> ➡️ *Reply with "' + (endIndex + 1) + '" for next 10 results*';
    }
  }
  return text;
}

// 4. SEND DOWNLOADED VIDEO
async function processDownload(bot, mek, m, reply, from, selected, streamUrl, botDisplayName = DEFAULT_BOT_NAME) {
  await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });

  try {
    const buffer = await phDownloadBuffer(streamUrl);

    if (!buffer || buffer.length < 5000) {
      return reply("╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Could not process video stream!_\n╰───────────────⮞");
    }

    const sizeMB = buffer.length / (1024 * 1024);
    let title = "Pornhub Video";
    if (selected.title) {
      title = selected.title;
    }
    const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

    let finalDuration = 'N/A';
    if (selected.duration) {
      finalDuration = selected.duration;
    }

    let captionText = "╭─[ 🔞 *" + botDisplayName.toUpperCase() + " 𝟭𝟴+* ]\n│\n";
    captionText += "├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* " + toSmallCaps(cleanTitle) + "\n";
    captionText += "├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* " + finalDuration + "\n";
    captionText += "├ 💾 *𝗦𝗶𝘇𝗲:* " + sizeMB.toFixed(2) + " MB\n";
    captionText += "│\n╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗";

    const fileName = "MALIYA-MD " + cleanTitle + ".mp4";

    if (sizeMB > 60) {
      await bot.sendMessage(from, {
        document: buffer,
        mimetype: "video/mp4",
        fileName: fileName,
        caption: captionText + "\n\n_📄 Video sent as document due to size limit._",
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    } else {
      await bot.sendMessage(from, {
        video: buffer,
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
    
    let errMsg = "Unknown Download Error";
    if (e.message) {
      errMsg = e.message;
    }
    reply("╭─[ ❌ *𝗙𝗔𝗜𝗟𝗘𝗗* ]\n│\n├ 🚫 _" + errMsg + "_\n╰───────────────⮞");
  }
}

// ===== 1. MAIN COMMAND =====
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
    let btnsOn = false;
    if (settings && settings.btns_enabled) {
      btnsOn = true;
    }

    let botDisplayName = DEFAULT_BOT_NAME;
    if (settings && settings.bot_name && settings.bot_name.trim()) {
      botDisplayName = settings.bot_name.trim();
    }

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
        const videoRows = topResults.map((v, index) => {
          let dur = 'N/A';
          if (v.duration) {
            dur = v.duration;
          }
          return {
            title: String(index + 1).padStart(2, "0") + ". " + v.title.substring(0, 45),
            description: "Duration: " + dur,
            id: ".ph_select " + (index + 1)
          };
        });

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

    let sentId = null;
    if (sentMsg && sentMsg.key) {
      sentId = sentMsg.key.id;
    }

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

      let botDisplayName = DEFAULT_BOT_NAME;
      if (session.botDisplayName) {
        botDisplayName = session.botDisplayName;
      }

      if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
        session.timestamp = Date.now();
        return reply(generateResultText(session.results, num - 1, botDisplayName));
      }

      const selected = session.results[num - 1];
      delete pendingPhSearch[k];

      await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

      try {
        const streamData = await getPhDirectStream(selected.url);
        
        let finalTitle = streamData.title || selected.title;
        let finalDuration = streamData.duration || selected.duration;

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
