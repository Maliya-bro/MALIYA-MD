const { cmd } = require("../command");
const scraper = require("liyanaarachchi-animeheavenme");

// State Management per Session & User
const pendingAnimeSearch = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;

function clearUserSession(sessionId, sender) {
  const key = `${sessionId}_${sender}`;
  delete pendingAnimeSearch[key];
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

// Sequential Delay Helper to prevent WhatsApp Rate-Limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// 1. ANIME SEARCH COMMAND (.animedl)
// ============================================================
cmd(
  {
    pattern: "animedl",
    alias: ["anime", "animesearch"],
    desc: "Search up to 10 anime and download 8 episodes per anime (Max 4 selection)",
    category: "download",
    react: "🎌",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
    if (!q) {
      return reply(
        "📱 *ᴜsᴀɢᴇ:* `.animedl [anime name]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.animedl naruto`"
      );
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇʜᴇᴀᴠᴇɴ...*");

    try {
      let searchResults = await scraper.searchAnime(q.trim());

      if (!searchResults || searchResults.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴀɴɪᴍᴇ ғᴏᴜɴᴅ ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      const userSessionKey = `${sessionId}_${sender}`;
      clearUserSession(sessionId, sender);

      // Store up to 10 Search Results
      const topResults = searchResults.slice(0, 10);
      pendingAnimeSearch[userSessionKey] = {
        results: topResults,
        timestamp: Date.now(),
      };

      let text = `╭━━━〔 🎌 *ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ (ᴍᴀx 10 ʀᴇsᴜʟᴛs)* 〕━━━\n┃\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${topResults.length} Anime(s)\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      topResults.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(item.title)}*\n`;
      });

      text += `\n───────────────────\n`;
      text += `📌 * Select up to 4 Anime by numbers (e.g. reply: "1,3,5" or "2,4")*\n`;
      text += `⚠️ *Note:* Max 8 Episodes will be downloaded per selected anime.`;

      await reply(text);

      searchResults = null;
    } catch (e) {
      console.error("ANIME SEARCH ERROR:", e);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇ!*");
    }
  }
);

// ============================================================
// 2. NUMBER REPLIES SELECTION HANDLER
// ============================================================
cmd(
  {
    filter: (text, { sender, key }) => {
      if (!sender || (key && key.fromMe)) return false;
      // Matches single numbers or comma/space separated numbers (e.g. "1", "1,2,3", "1 4 5")
      return /^[\d\s,]+$/.test(text ? text.trim() : "");
    },
  },
  async (bot, mek, m, { body, sender, reply, from, sessionId }) => {
    const userSessionKey = `${sessionId}_${sender}`;
    const session = pendingAnimeSearch[userSessionKey];
    if (!session) return; // Ignore if user has no pending anime search context

    const input = body ? body.trim() : "";
    
    // Parse selected indices (e.g., "1, 3, 5" -> [1, 3, 5])
    const chosenIndices = input
      .split(/[\s,]+/)
      .map((n) => parseInt(n))
      .filter((n) => !isNaN(n) && n >= 1 && n <= session.results.length);

    if (chosenIndices.length === 0) return;

    // Limit selection to maximum 4 Anime
    const finalSelectionIndices = [...new Set(chosenIndices)].slice(0, 4);

    // Loop & Spam Guard
    const now = Date.now();
    const lastMsg = lastProcessedMsg[userSessionKey];
    if (lastMsg && lastMsg.text === input && now - lastMsg.time < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[userSessionKey] = { text: input, time: now };

    const searchResults = session.results;
    clearUserSession(sessionId, sender);

    const selectedAnimeList = finalSelectionIndices.map((idx) => searchResults[idx - 1]);

    await reply(
      `🚀 *sᴛᴀʀᴛɪɴɢ ʙᴀᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ:* ${selectedAnimeList.length} Anime selected. (Max 8 Episodes each)...`
    );

    // Process each selected anime sequentially
    for (let aIndex = 0; aIndex < selectedAnimeList.length; aIndex++) {
      const anime = selectedAnimeList[aIndex];

      try {
        await reply(
          `📌 *[ANIME ${aIndex + 1}/${selectedAnimeList.length}]* Fetching episodes for *${toSmallCaps(
            anime.title
          )}*...`
        );

        let episodes = await scraper.getEpisodes(anime.link);

        if (!episodes || episodes.length === 0) {
          await reply(`⚠️ *No episodes found for ${anime.title}. Moving to next anime...*`);
          continue;
        }

        // Strictly limit to the FIRST 8 EPISODES ONLY
        const targetEpisodes = episodes.slice(0, 8);

        await reply(
          `📦 *Found ${episodes.length} Total Episodes.* Downloading first *${targetEpisodes.length} Episodes*...`
        );

        // Send Episodes sequentially
        for (let epIndex = 0; epIndex < targetEpisodes.length; epIndex++) {
          const ep = targetEpisodes[epIndex];
          const epName = ep.name || `Episode ${epIndex + 1}`;

          try {
            await reply(
              `⚙️ *[Anime ${aIndex + 1}/${selectedAnimeList.length}] [Ep ${
                epIndex + 1
              }/${targetEpisodes.length}] Extracting ${epName}...*`
            );

            let videoUrl = await scraper.getVideoLink(ep.id, anime.link);

            if (!videoUrl) {
              await reply(`⚠️ *Skipping ${epName}: Extraction failed.*`);
              continue;
            }

            const caption =
              `🎌 *${toSmallCaps(anime.title)}*\n` +
              `🎬 *${toSmallCaps(epName)}*\n\n` +
              `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

            await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

            // Stream Video directly to chat
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

            // Clear Video URL memory reference
            videoUrl = null;

            // Cooldown delay (4 seconds) to avoid WhatsApp ban
            await delay(4000);
          } catch (epErr) {
            console.error(`Error sending ${epName}:`, epErr);
            await reply(`❌ *Failed to send ${epName}. Continuing...*`);
          }
        }

        episodes = null;
      } catch (animeErr) {
        console.error(`Error processing anime ${anime.title}:`, animeErr);
        await reply(`❌ *Failed to process ${anime.title}. Moving to next anime...*`);
      }
    }

    await reply(`🎉 *All Selected Anime Downloads Completed Successfully!*`);
  }
);

// Automatic Session Garbage Collector
setInterval(() => {
  const now = Date.now();
  for (const key in pendingAnimeSearch) {
    if (now - pendingAnimeSearch[key].timestamp > SESSION_TIMEOUT) {
      delete pendingAnimeSearch[key];
    }
  }
  for (const key in lastProcessedMsg) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 2.5 * 60 * 1000);
