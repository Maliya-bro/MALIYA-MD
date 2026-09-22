const { cmd, replyHandlers } = require("../command");
const scraper = require("liyanaarachchi-animeheavenme");

// State Management per Session & User
const pendingAnimeSearch = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingAnimeSearch[k];
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

// Sequential Delay Helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// 1. ANIME SEARCH COMMAND (.animedl)
// ============================================================
cmd(
  {
    pattern: "animedl",
    alias: ["anime", "animesearch"],
    desc: "Search up to 10 anime and download 8 episodes per anime as document files",
    category: "download",
    react: "🎌",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
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
        return reply(`❌ *ɴᴏ ᴀɴɪᴍᴇ ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      const k = makePendingKey(sender, from);
      clearUserSession(k);

      // Store up to 10 Search Results
      const topResults = searchResults.slice(0, 10);
      pendingAnimeSearch[k] = {
        results: topResults,
        timestamp: Date.now(),
        isProcessing: false,
      };

      let text = `╭━━━〔 🎌 *ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ (ᴍᴀx 10 ʀᴇsᴜʟᴛs)* 〕━━━\n┃\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${topResults.length} Anime(s)\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      topResults.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(item.title)}*\n`;
      });

      text += `\n───────────────────\n`;
      text += `📌 *Select up to 4 Anime by numbers (e.g. reply: "1,3,5" or "2")*\n`;
      text += `⚠️ *Note:* Max 8 Episodes will be downloaded per selected anime as Document Files.`;

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
// 2. NUMBER REPLIES SELECTION HANDLER (URL STREAMING AS DOCUMENT)
//    Cinesubz-style replyHandlers entry instead of a cmd filter.
// ============================================================
const animeReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    if (!pendingAnimeSearch[k]) return false;
    return /^[\d\s,]+$/.test(text.trim());
  },
  function: async (sock, mek, m, { body, sender, from, reply }) => {
    const k = makePendingKey(sender, from);
    const session = pendingAnimeSearch[k];
    if (!session || session.isProcessing) return;

    const input = String(body || "").trim();
    if (!input) return;

    // Parse selected indices
    const chosenIndices = input
      .split(/[\s,]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= session.results.length);

    if (chosenIndices.length === 0) return;

    // Loop & Spam Guard
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && now - lastMsg.time < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[k] = { text: input, time: now };

    session.isProcessing = true;

    // Limit selection to maximum 4 Anime
    const finalSelectionIndices = [...new Set(chosenIndices)].slice(0, 4);

    const searchResults = session.results;
    clearUserSession(k);

    const selectedAnimeList = finalSelectionIndices.map((idx) => searchResults[idx - 1]);

    await reply(
      `🚀 *sᴛᴀʀᴛɪɴɢ ʙᴀᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ:* ${selectedAnimeList.length} Anime selected. (Max 8 Episodes each in Document Format)...`
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

        // Strictly limit to maximum 8 Episodes
        const targetEpisodes = episodes.slice(0, 8);

        await reply(
          `📦 *Found ${episodes.length} Total Episodes.* Downloading first *${targetEpisodes.length} Episodes*...`
        );

        // Send Episodes sequentially using direct URL Streaming (Cinesubz style)
        for (let epIndex = 0; epIndex < targetEpisodes.length; epIndex++) {
          const ep = targetEpisodes[epIndex];
          const epName = ep.name || `Episode ${epIndex + 1}`;

          try {
            await reply(
              `⚙️ *[Anime ${aIndex + 1}/${selectedAnimeList.length}] [Ep ${
                epIndex + 1
              }/${targetEpisodes.length}] Downloading ${epName}...*`
            );

            let videoUrl = await scraper.getVideoLink(ep.id, anime.link);

            if (!videoUrl) {
              await reply(`⚠️ *Skipping ${epName}: Extraction failed.*`);
              continue;
            }

            await sock.sendMessage(from, { react: { text: "📥", key: m.key } });

            // File Name Formatting
            const cleanTitle = anime.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);
            const cleanEpName = epName.replace(/[^\w\s.-]/gi, "");
            const fileName = `MALIYA-MD ${cleanTitle} - ${cleanEpName}.mp4`;

            const caption =
              `🎌 *${toSmallCaps(anime.title)}*\n` +
              `🎬 *${toSmallCaps(epName)}*\n\n` +
              `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

            // Direct URL Streaming Document Sending (No Axios Buffer to avoid RAM crash)
            await sock.sendMessage(
              from,
              {
                document: { url: videoUrl },
                mimetype: "video/mp4",
                fileName: fileName,
                caption: caption,
              },
              { quoted: mek }
            );

            await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

            // Garbage Collection
            videoUrl = null;

            // Cooldown delay (4 seconds)
            await delay(4000);
          } catch (epErr) {
            console.error(`Error sending ${epName}:`, epErr.message);
            await reply(`❌ *Failed to send ${epName}: ${epErr.message || "Unknown Error"}*`);
          }
        }

        episodes = null;
      } catch (animeErr) {
        console.error(`Error processing anime ${anime.title}:`, animeErr.message);
        await reply(`❌ *Failed to process ${anime.title}. Moving to next anime...*`);
      }
    }

    await reply(`🎉 *All Selected Anime Document Downloads Completed Successfully!*`);
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(animeReplyHandler);

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
