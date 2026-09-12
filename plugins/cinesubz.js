const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const https = require("https");
const crypto = require("crypto");
const { searchCineSubz, scrapeCineSubz } = require("cinesubz-scraper");

// ── Context Info (Channel Details) ─────────────
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

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

const SEARCH_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg?raw=true";

// Chat ID (from) මඟින් ක්‍රියාත්මක වන session ගබඩාව (ඕනෑම අයෙකුට reply කළ හැක)
const pendingCineSubz = Object.create(null);

function getQuotedId(m, mek) {
  return m?.quoted?.id || 
         mek?.message?.extendedTextMessage?.contextInfo?.stanzaId || 
         m?.message?.extendedTextMessage?.contextInfo?.stanzaId || null;
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

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

// ── Auto-Server Hopper & Decryption Function ─────────────
async function getCineSubzLinks(originalUrl) {
  let baseServerMatch = originalUrl.match(/server(\d+)/);
  let serversToTry = [];
  if (baseServerMatch) serversToTry.push(baseServerMatch[1]);
  
  ['1', '4', '7', '11'].forEach(s => {
    if (!serversToTry.includes(s)) serversToTry.push(s);
  });

  for (let serverNum of serversToTry) {
    let movieUrl = originalUrl;
    if (baseServerMatch) movieUrl = movieUrl.replace(/server\d+/, `server${serverNum}`);
    
    try {
      const parsedUrl = new URL(movieUrl);
      const domain = parsedUrl.origin;
      const currentPath = parsedUrl.pathname + parsedUrl.search;
      
      const agent = new https.Agent({ 
        rejectUnauthorized: false,
        keepAlive: true,
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
      });

      const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      };

      const initialRes = await axios.get(movieUrl, { httpsAgent: agent, headers: baseHeaders });
      let cookieHeader = '';
      if (initialRes.headers['set-cookie']) {
        cookieHeader = initialRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      }

      let html = initialRes.data;
      let realPageUrl = movieUrl;
      let payloads = html.match(/[0-9a-fA-F]{200,}/g) || [];

      if (payloads.length === 0) {
        const apiUrl = `${domain}/api/download-data${currentPath}`;
        const apiResponse = await axios.get(apiUrl, {
          httpsAgent: agent,
          headers: { ...baseHeaders, 'Accept': 'application/json', 'Referer': movieUrl, 'Cookie': cookieHeader }
        });

        if (apiResponse.headers['set-cookie']) {
          cookieHeader = apiResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }

        if (!apiResponse.data || !apiResponse.data.redirect) throw new Error('API Session Error');

        realPageUrl = apiResponse.data.redirect;
        if (!realPageUrl.startsWith('http')) realPageUrl = domain + realPageUrl;

        const pageResponse = await axios.get(realPageUrl, {
          httpsAgent: agent,
          headers: { ...baseHeaders, 'Referer': movieUrl, 'Cookie': cookieHeader }
        });

        html = pageResponse.data;
        payloads = html.match(/[0-9a-fA-F]{200,}/g) || [];
      }

      if (payloads.length === 0) throw new Error('No Payloads');

      const allStrings = [...html.matchAll(/(["'])(.*?)\1/g)].map(m => m[2]);
      const uniqueStrings = [...new Set(allStrings)];
      const results = [];

      for (let hexPayload of payloads) {
        try {
          const payloadBytes = Buffer.from(hexPayload, 'hex');
          const dlResponse = await axios.post(realPageUrl, payloadBytes, {
            httpsAgent: agent,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Referer': realPageUrl,
              'Cookie': cookieHeader,
              'User-Agent': baseHeaders['User-Agent']
            },
            responseType: 'arraybuffer'
          });

          const binaryString = dlResponse.data.toString('utf8');
          const aesStringMatch = binaryString.match(/U2FsdGVkX1[a-zA-Z0-9+/=]+/);

          if (aesStringMatch) {
            const encryptedUrl = aesStringMatch[0];
            for (let key of uniqueStrings) {
              try {
                const decryptedBytes = CryptoJS.AES.decrypt(encryptedUrl, key);
                const decodedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);
                if (decodedStr) {
                  const finalUrl = Buffer.from(decodedStr, 'base64').toString('utf8');
                  if (finalUrl.startsWith('http')) {
                    results.push(finalUrl);
                    break; 
                  }
                }
              } catch (e) {}
            }
          }
        } catch (err) {}
      }

      const finalLinks = [...new Set(results)];
      if (finalLinks.length > 0) return { success: true, links: finalLinks };
      
      throw new Error('Links decrypt fail');

    } catch (error) {
      continue; 
    }
  }
  return { error: 'File not found on any server.' };
}

// ==========================================
// 1. Search Command
// ==========================================
cmd({
  pattern: "cinesubz",
  alias: ["cinesub", "cs", "cssearch", "film", "movie"],
  react: "🎬",
  desc: "Search and send movies from Cinesubz.co",
  category: "download",
  filename: __filename
}, async (sock, mek, m, { from, q }) => {
  if (!q) {
    return await sock.sendMessage(from, { 
      text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.cinesubz <name>\`\n💡 *Example:* \`.cinesubz avengers\``, 
      contextInfo: channelContextInfo() 
    }, { quoted: mek });
  }

  await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

  try {
    const results = await searchCineSubz(q.trim());

    if (!results || results.length === 0) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, `No movies found on CineSubz for "${q}".`);
    }

    const topResults = results.slice(0, 10);

    let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    text += `🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐒𝐄𝐀𝐑𝐂𝐇*\n`;
    text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    text += `🎀 *Search :* ${q}\n`;
    text += `🍿 *Results :* ${topResults.length}\n\n`;

    topResults.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      text += `*[ ${numStr} ]* ➔ *${item.title}*\n`;
    });

    text += `\n⊱━━━━━━━━━━━━━━⊰\n> 👇 *Swipe & Reply this message with a number to Download...*`;

    // 1. Image පළමුව යැවීම
    const imgMsg = await sock.sendMessage(from, { 
      image: { url: SEARCH_IMAGE }, 
      caption: `> 🎬 *${topResults[0].title}*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ ᴍᴅ`,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    // 2. Menu මැසේජ් එක Image එකට Quoted කර යැවීම
    const menuMsg = await sock.sendMessage(from, { 
      text: text, 
      contextInfo: channelContextInfo() 
    }, { quoted: imgMsg });

    // Message ID එක session එකට lock කිරීම
    pendingCineSubz[from] = {
      step: 1,
      expectedMsgId: menuMsg.key.id,
      results: topResults,
      createdAt: Date.now(),
      isProcessing: false,
    };

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Cinesubz Search Error:", error.message);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to CineSubz search server.");
  }
});

// ==========================================
// 2. Multi-Step Quoted Reply Listener (Strict Message ID Lock)
// ==========================================
replyHandlers.push({
  filter: (text, { from, m, mek }) => {
    const pending = pendingCineSubz[from];
    if (!pending) return false;
    const quotedId = getQuotedId(m, mek);
    return quotedId && quotedId === pending.expectedMsgId;
  },
  function: async (sock, mek, m, { body, from }) => {
    const pending = pendingCineSubz[from];
    if (!pending || pending.isProcessing) return;

    const input = parseInt(String(body).trim(), 10);

    // ── STEP 1: Movie Selection ──
    if (pending.step === 1) {
      if (isNaN(input) || input < 1 || input > pending.results.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

      const selected = pending.results[input - 1];

      try {
        const movieInfo = await scrapeCineSubz(selected.url);

        if (!movieInfo || !movieInfo.downloadLinks || movieInfo.downloadLinks.length === 0) {
          pending.isProcessing = false;
          delete pendingCineSubz[from];
          return await sendErrorMsg(sock, from, mek, "No download links available for this movie.");
        }

        // 2GB ට අඩු download links ෆිල්ටර් කිරීම
        const downloadLinks = movieInfo.downloadLinks.filter(d => {
          const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
          if (match) {
            const size = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === 'GB') return size < 2.0;
            if (unit === 'MB') return true;
          }
          return true;
        });

        if (downloadLinks.length === 0) {
          pending.isProcessing = false;
          delete pendingCineSubz[from];
          return await sendErrorMsg(sock, from, mek, "No download links found below 2GB.");
        }

        let qualityMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        qualityMsg += `📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n`;
        qualityMsg += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        qualityMsg += `🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate) qualityMsg += `⭐ *IMDb :* ${movieInfo.imdb_rate}\n`;
        if (movieInfo.duration) qualityMsg += `⏳ *Duration :* ${movieInfo.duration}\n`;
        qualityMsg += `\n`;

        downloadLinks.forEach((d, i) => {
          const numStr = String(i + 1).padStart(2, "0");
          qualityMsg += `*[ ${numStr} ]* 📊 *${d.quality}*\n`;
        });

        qualityMsg += `\n⊱━━━━━━━━━━━━━━⊰\n> 👇 *Swipe & Reply this message with quality number to Download...*`;

        let qMsg;
        if (movieInfo.poster) {
          qMsg = await sock.sendMessage(from, { 
            image: { url: movieInfo.poster }, 
            caption: qualityMsg,
            contextInfo: channelContextInfo()
          }, { quoted: mek });
        } else {
          qMsg = await sock.sendMessage(from, { 
            text: qualityMsg,
            contextInfo: channelContextInfo()
          }, { quoted: mek });
        }

        // Session එක දෙවන පියවරට (Quality Selection) මාරු කර නව Message ID එක Lock කිරීම
        pending.step = 2;
        pending.expectedMsgId = qMsg.key.id;
        pending.movie = { metadata: movieInfo, downloadLinks };
        pending.isProcessing = false;

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (error) {
        console.error("CineSubz Scrape Error:", error.message);
        pending.isProcessing = false;
        delete pendingCineSubz[from];
        await sendErrorMsg(sock, from, mek, "Failed to fetch download links for this movie.");
      }
    }

    // ── STEP 2: Quality Selection & Download ──
    else if (pending.step === 2) {
      if (isNaN(input) || input < 1 || input > pending.movie.downloadLinks.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

      const { movie } = pending;
      const selectedLink = movie.downloadLinks[input - 1];
      let targetServerLink = selectedLink.directUrl;

      delete pendingCineSubz[from];

      try {
        targetServerLink = targetServerLink.replace(/^https:\/\/[^\/]+/, 'https://drive.csplayer2.space');
        targetServerLink = targetServerLink.replace(/(server\d+\/)\d+:\//, '$1');
        if (targetServerLink.endsWith('.mp4') && !targetServerLink.includes('?ext=')) {
          targetServerLink = targetServerLink.replace('.mp4', '?ext=mp4');
        }

        const finalResult = await getCineSubzLinks(targetServerLink);

        if (!finalResult.success) {
          return await sendErrorMsg(sock, from, mek, `Error Extracting Link: ${finalResult.error}`);
        }

        const allLinks = finalResult.links;
        const skylineLinks = allLinks.filter(link => link.includes('skylines'));
        const pixeldrainLinks = allLinks.filter(link => link.includes('pixeldrain'));
        const telegramLinks = allLinks.filter(link => link.includes('telegram'));

        let directDownloadUrl = null;
        if (skylineLinks.length > 0) directDownloadUrl = skylineLinks[0];
        else if (pixeldrainLinks.length > 0) directDownloadUrl = pixeldrainLinks[0];

        const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50).trim();
        
        let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
        captionText += `✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n`;
        captionText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
        captionText += `🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n`;
        captionText += `📊 *Quality :* ${selectedLink.quality}\n\n`;
        
        if (skylineLinks.length > 0) captionText += `🌟 *Direct Link :* ${skylineLinks[0]}\n\n`;
        if (pixeldrainLinks.length > 0) captionText += `⚡ *Pixeldrain :* ${pixeldrainLinks[0]}\n\n`;
        if (telegramLinks.length > 0) captionText += `✈️ *Telegram :* ${telegramLinks[0]}\n\n`;
        
        captionText += `⊱━━━━━━━━━━━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        if (directDownloadUrl) {
          await sock.sendMessage(from, {
            document: { url: directDownloadUrl },
            mimetype: "video/mp4",
            fileName: `MALIYA-MD ${cleanTitle}.mp4`,
            caption: captionText,
            contextInfo: channelContextInfo()
          }, { quoted: mek });
        } else {
          await sock.sendMessage(from, { 
            text: captionText,
            contextInfo: channelContextInfo()
          }, { quoted: mek });
        }

        await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

      } catch (error) {
        console.error("Download Extraction Error:", error.message);
        await sendErrorMsg(sock, from, mek, `Failed to download movie: ${error.message}`);
      }
    }
  },
});

// Expired sessions ඉවත් කිරීම (විනාඩි 10)
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingCineSubz)) {
    if (now - pendingCineSubz[key].createdAt > 10 * 60 * 1000) {
      delete pendingCineSubz[key];
    }
  }
}, 30000);
