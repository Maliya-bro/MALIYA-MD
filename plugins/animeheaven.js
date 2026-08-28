const { cmd } = require("../command");
const scraper = require("liyanaarachchi-animeheavenme");

// State Management for User Interactive Sessions
const pendingAnimeSearch = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;

function clearUserSession(sender) {
  delete pendingAnimeSearch[sender];
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

// Helper Function: Sequential Delay to prevent WhatsApp Rate-Limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ===== 1. ANIME SEARCH COMMAND (.animedl) =====
cmd(
  {
    pattern: "animedl",
    alias: ["animedownload", "animesearch", "andl"],
    desc: "Search Anime and download all episodes sequentially with memory optimization",
    category: "download",
    react: "🎌",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("📱 *ᴜsᴀɢᴇ:* `.animedl [anime name]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.animedl dandadan`");
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ ғᴏʀ ᴀɴɪᴍᴇ...*");

    try {
      let searchResults = await scraper.searchAnime(q.trim());

      if (!searchResults || searchResults.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴀɴɪᴍᴇ ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      clearUserSession(sender);

      // Save top 10 search results to user session
      pendingAnimeSearch[sender] = {
        results: searchResults.slice(0, 10),
        timestamp: Date.now(),
      };

      let text = `╭━━━〔 🎌 *ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ* 〕━━━\n┃\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${Math.min(searchResults.length, 10)} Results\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      searchResults.slice(0, 10).forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(item.title)}*\n\n`;
      });

      text += `───────────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴛᴏ sᴛᴀʀᴛ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴀʟʟ ᴇᴘɪsᴏᴅᴇs*`;

      await reply(text);

      // Clear memory variable
      searchResults = null;
    } catch (e) {
      console.error("ANIME SEARCH ERROR:", e);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇ!*");
    }
  }
);

// ===== 2. NUMBER REPLY LISTENER (MEMORY-CLEAN SEQUENTIAL DOWNLOAD) =====
cmd(
  {
    filter: (text, { sender, key }) => {
      if (!sender || (key && key.fromMe)) return false;

      const isNumber = /^\d+$/.test(text ? text.trim() : "");
      if (!isNumber) return false;

      return Boolean(pendingAnimeSearch[sender]);
    },
  },
  async (bot, mek, m, { body, sender, reply, from }) => {
    const input = body ? body.trim() : "";
    const num = parseInt(input);
    if (isNaN(num)) return;

    // Loop Protection
    const now = Date.now();
    const lastMsg = lastProcessedMsg[sender];
    if (lastMsg && lastMsg.text === input && now - lastMsg.time < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[sender] = { text: input, time: now };

    const session = pendingAnimeSearch[sender];
    if (num <= 0 || num > session.results.length) return;

    const selectedAnime = session.results[num - 1];
    clearUserSession(sender);

    await reply(`⏳ *ғᴇᴛᴄʜɪɴɢ ᴇᴘɪsᴏᴅᴇs ғᴏʀ ${toSmallCaps(selectedAnime.title)}...*`);

    try {
      // Get complete episode list
      let episodes = await scraper.getEpisodes(selectedAnime.link);

      if (!episodes || episodes.length === 0) {
        return reply(`❌ *ɴᴏ ᴇᴘɪsᴏᴅᴇs ғᴏᴜɴᴅ ғᴏʀ ${selectedAnime.title}!*`);
      }

      await reply(
        `📦 *ғᴏᴜɴᴅ ${episodes.length} ᴇᴘɪsᴏᴅᴇs!*\n🚀 *sᴛᴀʀᴛɪɴɢ ᴏɴᴇ-ʙʏ-ᴏɴᴇ ᴅᴏᴡɴʟᴏᴀᴅ...*`
      );

      // Send Episodes One By One Sequentially with Memory Optimization
      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        const epName = ep.name || `Episode ${i + 1}`;

        try {
          await reply(`⚙️ *[${i + 1}/${episodes.length}] ᴇxᴛʀᴀᴄᴛɪɴɢ ${epName}...*`);

          // Fetch Direct .mp4 Video Link
          let videoUrl = await scraper.getVideoLink(ep.id, selectedAnime.link);

          if (!videoUrl) {
            await reply(`⚠️ *Skipping ${epName}: Direct video link not found.*`);
            continue;
          }

          const caption =
            `🎌 *${toSmallCaps(selectedAnime.title)}*\n` +
            `🎬 *${toSmallCaps(epName)}*\n\n` +
            `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

          await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

          // Send Video
          await bot.sendMessage(
            from,
            {
              video: { url: videoUrl },
              mimetype: "video/mp4",
              caption,
            },
            { quoted: mek }
          );

          await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

          // ===== MEMORY CLEANUP PER EPISODE =====
          videoUrl = null; // Garbage Collector එකට RAM එක Release කරයි

          // 4 Seconds Delay - Prevents WhatsApp Spam Detection & System RAM Spikes
          await delay(4000);
        } catch (epErr) {
          console.error(`Error downloading ${epName}:`, epErr);
          await reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ${epName}. ᴍᴏᴠɪɴɢ ᴛᴏ ɴᴇxᴛ...*`);
        }
      }

      await reply(`🎉 *ᴀʟʟ ᴇᴘɪsᴏᴅᴇs ᴏғ ${toSmallCaps(selectedAnime.title)} sᴇɴᴛ sᴜᴄᴄᴇssғᴜʟʟʏ!*`);
      
      // Clear main list memory
      episodes = null;
    } catch (e) {
      console.error("ANIME EPISODES FETCH ERROR:", e);
      reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ ʟᴏᴀᴅ ᴀɴɪᴍᴇ ᴇᴘɪsᴏᴅᴇs!*");
    }
  }
);

// Automatic Session Cleanup Interval
setInterval(() => {
  const now = Date.now();
  for (const s in pendingAnimeSearch) {
    if (now - pendingAnimeSearch[s].timestamp > SESSION_TIMEOUT) {
      delete pendingAnimeSearch[s];
    }
  }
  for (const s in lastProcessedMsg) {
    if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[s];
    }
  }
}, 2.5 * 60 * 1000);
