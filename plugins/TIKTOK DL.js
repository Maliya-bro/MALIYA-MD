const { cmd } = require("../command");
const TikTokScraper = require("nexora-tiktok-search");
const axios = require("axios");

const tiktok = new TikTokScraper();

const pendingTT = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes

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

function formatNumber(num) {
  if (!num) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

// 1. TikTok Search Command
cmd(
  {
    pattern: "tiktok",
    alias: ["tt", "ttsearch", "tik"],
    desc: "Search and download TikTok videos (>40MB as Document, <40MB as Video)",
    category: "download",
    react: "🎵",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply(
        "📱 *ᴜsᴀɢᴇ:* `.tiktok [search query]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.tiktok cute cats`"
      );
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ...*");

    try {
      const results = await tiktok.search(q.trim(), 10);

      if (!results || results.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      pendingTT[sender] = {
        results: results,
        timestamp: Date.now(),
      };

      let text = `╭〔 🎵 *ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ* 〕━\n┃\n`;
      text += `┃ 🔎 *ǫᴜᴇʀʏ:* ${toSmallCaps(q)}\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${results.length} Videos\n┃\n`;
      text += `╰━━━───────━► ❥\n\n`;

      results.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        const title = item.description 
          ? item.description.replace(/\n/g, " ").substring(0, 45) + "..." 
          : "TikTok Video";
        const likes = formatNumber(item.likes);
        
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(title)}*\n`;
        text += `      👤 _@${item.author || "user"}_ | ❤️ ${likes}\n\n`;
      });

      text += `────────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ (1-${results.length}) ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*`;

      await reply(text);

    } catch (e) {
      console.error("TIKTOK SEARCH ERROR:", e);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ!*");
    }
  }
);

// 2. Number Reply Listener
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

    await reply(
      `⬇️ *ғᴇᴛᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ...*\n\n👤 *ᴀᴜᴛʜᴏʀ:* @${selected.author || "N/A"}\n📝 *ᴅᴇsᴄ:* ${selected.description || "N/A"}\n\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*`
    );

    try {
      const videoUrl = selected.downloadUrl || selected.url;

      if (!videoUrl) {
        return reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ ɢᴇᴛ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋ ғᴏʀ ᴛʜɪs ᴠɪᴅᴇᴏ!*");
      }

      // Check File Size (Head Request)
      let fileSizeInMB = 0;
      try {
        const headRes = await axios.head(videoUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const contentLength = headRes.headers["content-length"];
        if (contentLength) {
          fileSizeInMB = parseInt(contentLength) / (1024 * 1024);
        }
      } catch (err) {
        console.log("Could not check content-length, defaulting to standard send.");
      }

      const cleanDesc = (selected.description || "TikTok Video")
        .replace(/[^\w\s.-]/gi, "")
        .substring(0, 30);
      
      const fileName = `MALIYA-MD TikTok - ${cleanDesc}.mp4`;

      const caption =
        `🎵 *ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ*\n\n` +
        `👤 *ᴀᴜᴛʜᴏʀ:* @${selected.author || "user"}\n` +
        `📝 *ᴅᴇsᴄ:* ${selected.description || "No description"}\n` +
        `📊 *ᴠɪᴇᴡs:* ${formatNumber(selected.views)} | ❤️ *ʟɪᴋᴇs:* ${formatNumber(selected.likes)}\n` +
        `🎵 *ᴍᴜsɪᴄ:* ${selected.music || "Original Sound"}\n\n` +
        `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

      // Size > 40MB -> Send as Document
      if (fileSizeInMB > 40) {
        await reply(`📦 *ғɪʟᴇ sɪᴢᴇ (${fileSizeInMB.toFixed(1)}MB) ɪs ᴏᴠᴇʀ 40ᴍʙ. sᴇɴᴅɪɴɢ ᴀs a ᴅᴏᴄᴜᴍᴇɴᴛ...*`);
        await bot.sendMessage(
          from,
          {
            document: { url: videoUrl },
            mimetype: "video/mp4",
            fileName: fileName,
            caption: caption,
          },
          { quoted: mek }
        );
      } else {
        // Size <= 40MB -> Send as Normal Video
        await bot.sendMessage(
          from,
          {
            video: { url: videoUrl },
            mimetype: "video/mp4",
            caption: caption,
          },
          { quoted: mek }
        );
      }

      await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
      console.error("TikTok Send Error:", error.message);
      reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ:* ${error.message || "Unknown error"}`);
    }
  }
);

setInterval(() => {
  const now = Date.now();
  for (const s in pendingTT) {
    if (now - pendingTT[s].timestamp > SESSION_TIMEOUT) {
      delete pendingTT[s];
    }
  }
}, 5 * 60 * 1000);
