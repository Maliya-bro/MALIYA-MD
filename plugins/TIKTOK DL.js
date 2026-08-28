const { cmd } = require("../command");
const { TikTokSearch } = require("tiktok-search-api");
const { tiktok } = require("sadaslk-dlcore");
const axios = require("axios");

// Session Storage for User Selection
const pendingTT = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes

// Helper to convert text to Small Caps
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

// Helper to format view/like counts
function formatNumber(num) {
  if (!num) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

// Helper to get auto-generated TTWID Cookie if not provided
async function getTtwidCookie() {
  try {
    const response = await axios.get("https://www.tiktok.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const cookies = response.headers["set-cookie"];
    if (cookies) {
      for (const cookie of cookies) {
        if (cookie.includes("ttwid=")) {
          return cookie.split("ttwid=")[1].split(";")[0];
        }
      }
    }
  } catch (err) {
    console.error("Failed to auto-fetch ttwid, using dummy cookie:", err.message);
  }
  return "1%7C_0kQW3q-fR4V5k6L7m8N9o0P1q2R3s4T5u6V7w8X9y0Z%7C1700000000%7Ca1b2c3d4e5f6";
}

// Extract direct media link using sadaslk-dlcore
async function extractWithSadaslk(tiktokUrl) {
  try {
    const data = await tiktok(tiktokUrl);
    if (data) {
      if (typeof data === "string") return data;
      if (data.nowm) return data.nowm;
      if (data.noWatermark) return data.noWatermark;
      if (data.downloadUrl) return data.downloadUrl;
      if (data.video) return data.video;
      if (data.result) return data.result.nowm || data.result.video || data.result;
      if (data.urls && data.urls.length > 0) return data.urls[0];
    }
  } catch (err) {
    console.error("sadaslk-dlcore extraction error:", err.message);
  }
  return null;
}

// ============================================================
// 1. TIKTOK SEARCH COMMAND (.tiktok / .tt)
// ============================================================
cmd(
  {
    pattern: "tiktok",
    alias: ["tt", "ttsearch", "tik"],
    desc: "Search TikTok via tiktok-search-api and Download via sadaslk-dlcore",
    category: "download",
    react: "🎵",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply(
        "📱 *ᴜsᴀɢᴇ:*\n1️⃣ Search: `.tiktok <query>`\n2️⃣ Link: `.tiktok <TikTok URL>`"
      );
    }

    const input = q.trim();
    const isUrl = /(http|https):\/\/(vt|vm|www)\.tiktok\.com/i.test(input);

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

    // ── CASE A: DIRECT TIKTOK LINK ──
    if (isUrl) {
      await reply("📥 *ғᴇᴛᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ...*");
      return await processAndSend(bot, from, input, { desc: "TikTok Video" }, mek);
    }

    // ── CASE B: SEARCH USING TIKTOK-SEARCH-API ──
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ...*");

    try {
      // 1. Fetch Cookie
      const ttwid = await getTtwidCookie();

      // 2. Perform TikTok Search (1 Page = ~12 Results)
      const rawResults = await TikTokSearch(input, ttwid, 1);

      if (!rawResults || !Array.isArray(rawResults) || rawResults.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ ғᴏʀ:* _${input}_`);
      }

      // Filter and format items
      const results = rawResults
        .filter((res) => res.item && res.item.id)
        .slice(0, 10)
        .map((res) => {
          const item = res.item;
          const author = item.author ? item.author.uniqueId : "user";
          return {
            id: item.id,
            desc: item.desc || "TikTok Video",
            author: author,
            likes: item.stats ? item.stats.diggCount : 0,
            views: item.stats ? item.stats.playCount : 0,
            url: `https://www.tiktok.com/@${author}/video/${item.id}`,
          };
        });

      if (results.length === 0) {
        return reply(`❌ *ɴᴏ ᴠᴀʟɪᴅ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ ғᴏʀ:* _${input}_`);
      }

      // Save user pending search state
      pendingTT[sender] = {
        results: results,
        timestamp: Date.now(),
      };

      let text = `╭━━━〔 🎵 *ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ* 〕━━━\n┃\n`;
      text += `┃ 🔎 *ǫᴜᴇʀʏ:* ${toSmallCaps(input)}\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${results.length} Videos\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      results.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        const title = item.desc
          ? item.desc.replace(/\n/g, " ").substring(0, 40) + "..."
          : "TikTok Video";

        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(title)}*\n`;
        text += `      👤 _@${item.author}_ | ❤️ ${formatNumber(item.likes)}\n\n`;
      });

      text += `───────────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ (1-${results.length}) ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*`;

      await reply(text);

    } catch (e) {
      console.error("TIKTOK SEARCH API ERROR:", e.message);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *sᴇᴀʀᴄʜ ғᴀɪʟᴇᴅ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴡɪᴛʜ ᴀ ᴅɪʀᴇᴄᴛ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋ.*");
    }
  }
);

// ============================================================
// 2. NUMBER REPLY LISTENER
// ============================================================
cmd(
  {
    filter: (text, { sender }) => {
      return (
        pendingTT[sender] &&
        !isNaN(text) &&
        parseInt(text) > 0 &&
        parseInt(text) <= pendingTT[sender].results.length
      );
    },
  },
  async (bot, mek, m, { body, sender, reply, from }) => {
    await bot.sendMessage(from, { react: { text: "⚡", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingTT[sender].results[index];
    delete pendingTT[sender];

    await reply(`⬇️ *ᴇxᴛʀᴀᴄᴛɪɴɢ ᴍᴇᴅɪᴀ ᴠɪᴀ sᴀᴅᴀsʟᴋ-ᴅʟᴄᴏʀᴇ...*`);

    try {
      await processAndSend(bot, from, selected.url, selected, mek);
    } catch (error) {
      console.error("TikTok Send Error:", error.message);
      reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ!*`);
    }
  }
);

// ============================================================
// 3. MEDIA PROCESSING & SENDING ENGINE
// ============================================================
async function processAndSend(bot, from, tiktokUrl, metaData, mek) {
  // Extract direct link using sadaslk-dlcore
  const downloadUrl = await extractWithSadaslk(tiktokUrl);

  if (!downloadUrl) {
    return bot.sendMessage(
      from,
      { text: "❌ *Could not extract direct video link using sadaslk-dlcore!*" },
      { quoted: mek }
    );
  }

  // Check File Size via Head Request
  let fileSizeInMB = 0;
  try {
    const headRes = await axios.head(downloadUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 5000,
    });
    const contentLength = headRes.headers["content-length"];
    if (contentLength) fileSizeInMB = parseInt(contentLength) / (1024 * 1024);
  } catch (err) {
    console.log("File size check skipped, defaulting to normal video send.");
  }

  const cleanDesc = (metaData.desc || metaData.description || "TikTok Video")
    .replace(/[^\w\s.-]/gi, "")
    .substring(0, 30);

  const fileName = `MALIYA-MD TikTok - ${cleanDesc}.mp4`;

  const caption =
    `🎵 *ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ*\n\n` +
    `👤 *ᴀᴜᴛʜᴏʀ:* @${metaData.author || "user"}\n` +
    `📝 *ᴅᴇsᴄ:* ${metaData.desc || metaData.description || "No description"}\n` +
    `📊 *ᴠɪᴇᴡs:* ${formatNumber(metaData.views)} | ❤️ *ʟɪᴋᴇs:* ${formatNumber(metaData.likes)}\n\n` +
    `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

  // Send as Document if Size > 40MB
  if (fileSizeInMB > 40) {
    await bot.sendMessage(
      from,
      {
        document: { url: downloadUrl },
        mimetype: "video/mp4",
        fileName: fileName,
        caption: caption,
      },
      { quoted: mek }
    );
  } else {
    // Send as Normal Playable Video if Size <= 40MB
    await bot.sendMessage(
      from,
      {
        video: { url: downloadUrl },
        mimetype: "video/mp4",
        caption: caption,
      },
      { quoted: mek }
    );
  }

  await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });
}

// Session Timeout Auto Cleanup
setInterval(() => {
  const now = Date.now();
  for (const s in pendingTT) {
    if (now - pendingTT[s].timestamp > SESSION_TIMEOUT) delete pendingTT[s];
  }
}, 5 * 60 * 1000);
