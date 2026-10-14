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

const pendingXhamSearch = {};
const pendingXhamQuality = {}; 
const lastProcessedMsg = {};   

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

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
    fromPart = from;
  }
  let senderPart = "";
  if (sender) {
    senderPart = sender.split(":")[0];
  }
  return fromPart + "::" + senderPart;
}

function toSmallCaps(str) {
  if (!str) {
    str = "";
  }
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
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
  delete pendingXhamSearch[k];
  delete pendingXhamQuality[k];
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
      if (mek.message.documentMessage) {
        if (mek.message.documentMessage.contextInfo) {
          if (mek.message.documentMessage.contextInfo.stanzaId) {
            return mek.message.documentMessage.contextInfo.stanzaId;
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

// 1. JSON API & HTML DUAL-ENGINE SEARCH
async function xhamSearch(query, limit = 100) {
  let allResults = [];

  // ක්‍රමය A: Frontend Search API එක මඟින් සෙවීම (100% ප්‍රතිඵල ලැබේ)
  try {
    const apiRes = await axios.get("https://xhamster.com/api/front/search/video", {
      params: {
        q: query,
        page: 1,
        limit: limit
      },
      headers: {
        'User-Agent': UA,
        'Referer': 'https://xhamster.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 12000
    });

    if (apiRes.data) {
      let videoList = null;
      if (apiRes.data.videos) {
        videoList = apiRes.data.videos;
      } else if (apiRes.data.items) {
        videoList = apiRes.data.items;
      } else if (Array.isArray(apiRes.data)) {
        videoList = apiRes.data;
      }

      if (videoList) {
        if (Array.isArray(videoList)) {
          for (let i = 0; i < videoList.length; i++) {
            if (allResults.length >= limit) {
              break;
            }
            const item = videoList[i];
            let vTitle = item.title;
            let vUrl = item.pageURL;
            if (!vUrl) {
              vUrl = item.url;
            }
            if (!vUrl) {
              if (item.id) {
                vUrl = "https://xhamster.com/videos/" + item.id;
              }
            }

            let vThumb = item.thumbURL;
            if (!vThumb) {
              vThumb = item.thumb;
            }
            if (!vThumb) {
              vThumb = item.image;
            }

            let vDuration = item.durationFormatted;
            if (!vDuration) {
              if (item.duration) {
                vDuration = item.duration + "s";
              } else {
                vDuration = "N/A";
              }
            }

            if (vTitle) {
              if (vUrl) {
                if (!vUrl.startsWith('http')) {
                  vUrl = "https://xhamster.com" + vUrl;
                }
                allResults.push({
                  title: String(vTitle).trim(),
                  url: vUrl,
                  thumb: vThumb,
                  duration: vDuration
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // API fail වුවහොත් fallback එකට යයි
  }

  // ප්‍රතිඵල ලැබුණි නම් මෙතැනින්ම return කරයි
  if (allResults.length > 0) {
    return allResults;
  }

  // ක්‍රමය B: Cheerio Fallback
  let page = 1;
  while (allResults.length < limit) {
    if (page > 3) {
      break;
    }

    let url = "";
    if (page === 1) {
      url = "https://xhamster.com/search/" + encodeURIComponent(query);
    } else {
      url = "https://xhamster.com/search/" + encodeURIComponent(query) + "?page=" + page;
    }

    try {
      const { data } = await axios.get(url, {
        headers: { 
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://xhamster.com/'
        },
        timeout: 15000
      });

      // HTML එක තුළ ඇති window.initials JSON පරීක්ෂාව
      const match = data.match(/window\.initials\s*=\s*(\{.+?\});/);
      if (match) {
        if (match[1]) {
          const parsed = safeJsonParse(match[1]);
          if (parsed) {
            let jsonVideos = null;
            if (parsed.searchModel) {
              if (parsed.searchModel.videos) {
                jsonVideos = parsed.searchModel.videos;
              }
            }
            if (jsonVideos) {
              if (Array.isArray(jsonVideos)) {
                for (let j = 0; j < jsonVideos.length; j++) {
                  if (allResults.length >= limit) {
                    break;
                  }
                  const vid = jsonVideos[j];
                  if (vid.title) {
                    if (vid.pageURL) {
                      allResults.push({
                        title: vid.title,
                        url: vid.pageURL.startsWith('http') ? vid.pageURL : 'https://xhamster.com' + vid.pageURL,
                        thumb: vid.thumbURL,
                        duration: vid.durationFormatted ? vid.durationFormatted : 'N/A'
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (allResults.length === 0) {
        const $ = cheerio.load(data);
        $('a[href*="/videos/"]').each((_, el) => {
          if (allResults.length >= limit) {
            return false;
          }
          const anchor = $(el);
          const href = anchor.attr('href');
          const title = anchor.attr('aria-label') ? anchor.attr('aria-label') : anchor.attr('title');

          if (href) {
            if (title) {
              if (!href.includes('/categories/')) {
                if (!href.includes('/creators/')) {
                  const fullUrl = href.startsWith('http') ? href : 'https://xhamster.com' + href;
                  const alreadyIn = allResults.some(r => r.url === fullUrl);
                  if (!alreadyIn) {
                    allResults.push({
                      title: title.trim(),
                      url: fullUrl,
                      thumb: '',
                      duration: 'N/A'
                    });
                  }
                }
              }
            }
          }
        });
      }

      page++;
    } catch (e) {
      break;
    }
  }

  return allResults;
}

// 2. VIDEO DETAILS EXTRACTION
async function fetchXhamVideoDetails(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://xhamster.com/' },
    timeout: 12000
  });

  const $ = cheerio.load(data);
  let hlsUrl = null;

  const windowStateMatch = data.match(/window\.initials\s*=\s*({.*?});/s);
  if (windowStateMatch) {
    if (windowStateMatch[1]) {
      try {
        const initialState = JSON.parse(windowStateMatch[1]);
        let videoModel = null;
        if (initialState.videoModel) {
          videoModel = initialState.videoModel;
        } else if (initialState.video) {
          videoModel = initialState.video;
        }

        if (videoModel) {
          if (videoModel.sources) {
            if (videoModel.sources.hls) {
              hlsUrl = videoModel.sources.hls;
            } else if (videoModel.sources.mp4) {
              if (videoModel.sources.mp4.h264) {
                if (videoModel.sources.mp4.h264[0]) {
                  hlsUrl = videoModel.sources.mp4.h264[0].url;
                }
              }
            } else if (videoModel.sources.standard) {
              if (videoModel.sources.standard.h264) {
                if (videoModel.sources.standard.h264[0]) {
                  hlsUrl = videoModel.sources.standard.h264[0].url;
                }
              }
            }
          }
        }
      } catch (e) {
        // Parse error ignored
      }
    }
  }

  if (!hlsUrl) {
    const m3u8Match = data.match(/(https?:\\?\/\\?\/[^"]+\.m3u8[^"]*)/i);
    if (m3u8Match) {
      if (m3u8Match[1]) {
        hlsUrl = m3u8Match[1].replace(/\\/g, '');
      }
    }
  }

  if (!hlsUrl) {
    throw new Error('No video stream URL found for this video.');
  }

  let title = $('h1').first().text().trim();
  if (!title) {
    title = 'xHamster Video';
  }

  let duration = $('[data-role="video-duration"]').first().text().trim();
  if (!duration) {
    duration = 'N/A';
  }

  let qualities = [];
  try {
    const m3u8Res = await axios.get(hlsUrl, {
      headers: { 'User-Agent': UA, 'Referer': 'https://xhamster.com/' },
      timeout: 10000
    });
    const lines = m3u8Res.data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('RESOLUTION=')) {
        const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
        if (resMatch) {
          if (lines[i + 1]) {
            const qualityName = resMatch[1] + 'p';
            let streamUrl = lines[i + 1].trim();
            if (!streamUrl.startsWith('http')) {
              streamUrl = new URL(streamUrl, hlsUrl).href;
            }
            const exists = qualities.some(q => q.quality === qualityName);
            if (!exists) {
              qualities.push({ quality: qualityName, url: streamUrl });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Master playlist parse error:", e.message);
  }

  if (qualities.length === 0) {
    qualities.push({ quality: 'Auto / 720p', url: hlsUrl });
  }

  return { title, duration, hlsUrl, qualities };
}

// 3. FFMPEG BUFFER DOWNLOAD
async function xhamDownloadBuffer(streamUrl) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'xhamdl-'));
  const outPath = join(tmpDir, 'video.mp4');

  const ffmpegArgs = [
    '-v', 'error',
    '-y',
    '-user_agent', UA,
    '-headers', 'Referer: https://xhamster.com/\r\n',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
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
    await rm(tmpDir, { recursive: true, force: true });
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

async function processDownload(bot, mek, m, reply, from, selected, streamUrl, qualityName, botDisplayName = DEFAULT_BOT_NAME) {
  await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });

  try {
    const buffer = await xhamDownloadBuffer(streamUrl);

    if (!buffer) {
      return reply("╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Could not process video stream!_\n╰───────────────⮞");
    } else if (buffer.length < 5000) {
      return reply("╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Could not process video stream!_\n╰───────────────⮞");
    }

    const sizeMB = buffer.length / (1024 * 1024);
    let title = "xHamster Video";
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
    captionText += "├ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* " + qualityName + "\n";
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
    console.error("xHamster Download Error:", e);
    await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
    
    let errMsg = "Unknown Download Error";
    if (e.message) {
      errMsg = e.message;
    }
    reply("╭─[ ❌ *𝗙𝗔𝗜𝗟𝗘𝗗* ]\n│\n├ 🚫 _" + errMsg + "_\n╰───────────────⮞");
  }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
  pattern: "xham",
  alias: ["xh", "xhamster"],
  desc: "Search and download videos from xHamster",
  category: "download",
  react: "🔍",
  filename: __filename
}, async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
  if (!q) {
    return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘* ]\n│\n├ 📌 *Usage:* .xham [search_term]\n├ 💡 *Example:* .xham hot\n╰───────────────⮞");
  }

  await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

  try {
    const results = await xhamSearch(q.trim(), 100);

    if (!results) {
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return reply("╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _" + q + "_\n╰───────────────⮞");
    } else if (!Array.isArray(results)) {
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return reply("╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _" + q + "_\n╰───────────────⮞");
    } else if (results.length === 0) {
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      return reply("╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _" + q + "_\n╰───────────────⮞");
    }

    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    let btnsOn = false;
    if (settings) {
      if (settings.btns_enabled) {
        btnsOn = true;
      }
    }

    let botDisplayName = DEFAULT_BOT_NAME;
    if (settings) {
      if (settings.bot_name) {
        if (settings.bot_name.trim()) {
          botDisplayName = settings.bot_name.trim();
        }
      }
    }

    let searchImg = DEFAULT_SEARCH_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "xham_header");
        if (custom) {
          if (custom.data) {
            searchImg = custom.data;
          }
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
            id: ".xh_select " + (index + 1)
          };
        });

        const bodyText = "╭─[ 🔞 *" + botDisplayName.toUpperCase() + " 𝟭𝟴+* ]\n│\n├ 🔍 *Search :* " + q + "\n├ 📊 *Total Results :* " + results.length + "\n│\n╰───────────────⮞\n\n© 2026 " + BRAND_BASE + " SYSTEM";

        const btn = new ButtonV2(bot)
          .setBody(bodyText)
          .setFooter("WaBot by " + botDisplayName)
          .setThumbnail(searchImg);

        btn.addRawButton({
          buttonId: "xham_search_list",
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

        if (sentMsg) {
          if (sentMsg.key) {
            if (sentMsg.key.id) {
              pendingXhamSearch[k] = { 
                results: results, 
                timestamp: Date.now(), 
                expectedMsgId: sentMsg.key.id,
                botDisplayName: botDisplayName
              };
              await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
              return;
            }
          }
        }
      } catch (err) {
        let errMsg = err;
        if (err) {
          if (err.message) {
            errMsg = err.message;
          }
        }
        console.log("XHAM BUTTON ERROR:", errMsg);
      }
    }

    // Numbered Fallback
    const sentMsg = await bot.sendMessage(from, { 
      image: { url: searchImg },
      caption: generateResultText(results, 0, botDisplayName),
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    let sentId = null;
    if (sentMsg) {
      if (sentMsg.key) {
        sentId = sentMsg.key.id;
      }
    }

    pendingXhamSearch[k] = { 
      results: results, 
      timestamp: Date.now(), 
      expectedMsgId: sentId,
      botDisplayName: botDisplayName
    };

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("xHamster Search Error:", error);
    await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
    reply("╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Error occurred while searching xHamster!_\n╰───────────────⮞");
  }
});

// ===== 2. NUMBER & SELECTION REPLY HANDLER =====
const xhamReplyHandler = {
  filter: (text, { sender, from }) => {
    const k = keyFor(sender, from);
    if (pendingXhamSearch[k]) {
      return true;
    }
    if (pendingXhamQuality[k]) {
      return true;
    }
    return false;
  },
  function: async (bot, mek, m, { body, sender, reply, from, sessionId }) => {
    const payload = extractIncomingPayload(body, mek, m);
    if (!payload) {
      return;
    }

    const k = keyFor(sender, from);

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg) {
      if (lastMsg.text === payload) {
        if ((now - lastMsg.time) < LOOP_COOLDOWN) {
          return;
        }
      }
    }
    lastProcessedMsg[k] = { text: payload, time: now };

    const quotedId = getQuotedStanzaId(mek);

    // STEP 1
    if (pendingXhamSearch[k]) {
      const session = pendingXhamSearch[k];
      if (quotedId) {
        if (session.expectedMsgId) {
          if (quotedId !== session.expectedMsgId) {
            return;
          }
        }
      }

      let num = null;
      if (payload.startsWith(".xh_select ")) {
        num = parseInt(payload.replace(".xh_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        num = parseInt(payload, 10);
      }

      if (num === null) {
        return;
      } else if (isNaN(num)) {
        return;
      } else if (num <= 0) {
        return;
      } else if (num > session.results.length) {
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
      delete pendingXhamSearch[k];

      await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

      try {
        const videoDetails = await fetchXhamVideoDetails(selected.url);

        const settings = await readSettings(sessionId);
        let btnsOn = false;
        if (settings) {
          if (settings.btns_enabled) {
            btnsOn = true;
          }
        }

        let thumbImg = DEFAULT_SEARCH_IMAGE;
        if (selected.thumb) {
          thumbImg = selected.thumb;
        }

        let finalTitle = selected.title;
        if (videoDetails.title) {
          finalTitle = videoDetails.title;
        }

        let finalDuration = selected.duration;
        if (videoDetails.duration) {
          finalDuration = videoDetails.duration;
        }

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const qualityRows = videoDetails.qualities.map((q, idx) => ({
              title: String(idx + 1).padStart(2, "0") + ". " + q.quality,
              description: "Download video in " + q.quality,
              id: ".xh_dl " + (idx + 1)
            }));

            let displayDuration = 'N/A';
            if (selected.duration) {
              displayDuration = selected.duration;
            }

            const bodyText = "╭─[ 📊 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* " + toSmallCaps(selected.title.slice(0, 36)) + "\n├ ⏱️ *Duration:* " + displayDuration + "\n│\n╰───────────────⮞\n\n© 2026 " + BRAND_BASE + " SYSTEM";

            const btn = new ButtonV2(bot)
              .setBody(bodyText)
              .setFooter("WaBot by " + botDisplayName)
              .setThumbnail(thumbImg);

            btn.addRawButton({
              buttonId: "xham_quality_list",
              buttonText: { displayText: "📥 Select Quality" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Available Qualities ↯",
                  sections: [{ title: "Choose Quality", rows: qualityRows }]
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentQualityMsg = await btn.send(from, { quoted: mek });

            if (sentQualityMsg) {
              if (sentQualityMsg.key) {
                if (sentQualityMsg.key.id) {
                  pendingXhamQuality[k] = {
                    selected: { ...selected, title: finalTitle, duration: finalDuration },
                    qualities: videoDetails.qualities,
                    timestamp: Date.now(),
                    expectedMsgId: sentQualityMsg.key.id,
                    botDisplayName: botDisplayName
                  };
                  await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                  return;
                }
              }
            }
          } catch (e) {
            let errMsg = e;
            if (e) {
              if (e.message) {
                errMsg = e.message;
              }
            }
            console.log("XHAM QUALITY BUTTON ERROR:", errMsg);
          }
        }

        // Numbered Menu
        let qMsg = "╭─[ 📊 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n";
        qMsg += "├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* " + toSmallCaps(selected.title.slice(0, 36)) + "\n│\n";
        qMsg += "├ 👇 *Reply with Quality Number:*\n│\n";

        videoDetails.qualities.forEach((q, idx) => {
          const numStr = String(idx + 1).padStart(2, "0");
          qMsg += "├ 📱 *[ " + numStr + " ]* 🎬 " + q.quality + "\n";
        });

        qMsg += "│\n╰───────────────⮞";

        const sentQualityMsg = await bot.sendMessage(from, {
          image: { url: thumbImg },
          caption: qMsg,
          contextInfo: channelContextInfo()
        }, { quoted: mek });

        let sentQualityId = null;
        if (sentQualityMsg) {
          if (sentQualityMsg.key) {
            sentQualityId = sentQualityMsg.key.id;
          }
        }

        pendingXhamQuality[k] = {
          selected: { ...selected, title: finalTitle, duration: finalDuration },
          qualities: videoDetails.qualities,
          timestamp: Date.now(),
          expectedMsgId: sentQualityId,
          botDisplayName: botDisplayName
        };

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (err) {
        console.error("Quality Extract Error:", err);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply("╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Failed to extract stream qualities!_\n╰───────────────⮞");
      }
      return;
    }

    // STEP 2
    if (pendingXhamQuality[k]) {
      const session = pendingXhamQuality[k];
      if (quotedId) {
        if (session.expectedMsgId) {
          if (quotedId !== session.expectedMsgId) {
            return;
          }
        }
      }

      let choiceNum = null;
      if (payload.startsWith(".xh_dl ")) {
        choiceNum = parseInt(payload.replace(".xh_dl ", "").trim(), 10) - 1;
      } else if (/^\d+$/.test(payload)) {
        choiceNum = parseInt(payload, 10) - 1;
      }

      const selected = session.selected;
      const qualities = session.qualities;
      let botDisplayName = DEFAULT_BOT_NAME;
      if (session.botDisplayName) {
        botDisplayName = session.botDisplayName;
      }

      if (choiceNum === null) {
        return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡* ]\n│\n├ 🎯 *Range:* 1 - " + qualities.length + "\n╰───────────────⮞");
      } else if (isNaN(choiceNum)) {
        return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡* ]\n│\n├ 🎯 *Range:* 1 - " + qualities.length + "\n╰───────────────⮞");
      } else if (choiceNum < 0) {
        return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡* ]\n│\n├ 🎯 *Range:* 1 - " + qualities.length + "\n╰───────────────⮞");
      } else if (choiceNum >= qualities.length) {
        return reply("╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡* ]\n│\n├ 🎯 *Range:* 1 - " + qualities.length + "\n╰───────────────⮞");
      }

      const chosenQuality = qualities[choiceNum];
      delete pendingXhamQuality[k];

      return processDownload(bot, mek, m, reply, from, selected, chosenQuality.url, chosenQuality.quality, botDisplayName);
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(xhamReplyHandler);
}

setInterval(() => {
  const now = Date.now();
  for (const s in pendingXhamSearch) {
    if ((now - pendingXhamSearch[s].timestamp) > SESSION_TIMEOUT) {
      delete pendingXhamSearch[s];
    }
  }
  for (const s in pendingXhamQuality) {
    if ((now - pendingXhamQuality[s].timestamp) > SESSION_TIMEOUT) {
      delete pendingXhamQuality[s];
    }
  }
  for (const s in lastProcessedMsg) {
    if ((now - lastProcessedMsg[s].time) > LOOP_COOLDOWN) {
      delete lastProcessedMsg[s];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingXhamSearch };
