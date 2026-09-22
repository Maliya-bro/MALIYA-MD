const { cmd, replyHandlers } = require("../command");
const scraper = require("liyanaarachchi-animeheavenme");

// State Management per Session & User
const pendingAnimeSearch = {};
const pendingAnimeSelection = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;

// Channel Forwarding Meta Data (same pattern as Cinesubz / SinhalaCartoon plugins)
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

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
    },
  };
}

function keyFor(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function clearUserSession(k) {
  delete pendingAnimeSearch[k];
  delete pendingAnimeSelection[k];
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

// Best-effort poster field lookup — the scraper's exact field name isn't
// guaranteed, so check the common ones and fall back to nothing.
function extractPoster(obj) {
  if (!obj) return "";
  return obj.poster || obj.image || obj.thumbnail || obj.cover || obj.img || "";
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
    desc: "Search up to 10 anime and download episodes as document files",
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

      const k = keyFor(sender, from);
      clearUserSession(k);

      // Store up to 10 Search Results
      const topResults = searchResults.slice(0, 10);
      pendingAnimeSearch[k] = {
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
      text += `📌 *Reply with a number to select one Anime*`;

      const channelMeta = getChannelContext();
      await bot.sendMessage(from, {
        text,
        ...channelMeta,
      }, { quoted: mek });

      searchResults = null;
    } catch (e) {
      console.error("ANIME SEARCH ERROR:", e);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇ!*");
    }
  }
);

// ============================================================
// 2. NUMBER REPLY HANDLER — anime pick, then episode pick
//    (Cinesubz/SinhalaCartoon-style replyHandlers entry)
// ============================================================
const animeReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = keyFor(sender, from);

    const cleanInput = text.trim().toLowerCase();
    const isNumberOrList = /^(all|\d+(\s*,\s*\d+)*)$/.test(cleanInput);
    if (!isNumberOrList) return false;

    return Boolean(pendingAnimeSearch[k] || pendingAnimeSelection[k]);
  },
  function: async (bot, mek, m, { body, sender, reply, from }) => {
    const input = body ? body.trim() : "";
    if (!input) return;

    const k = keyFor(sender, from);

    // Loop & Spam Guard
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === input && now - lastMsg.time < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[k] = { text: input, time: now };

    // --- STEP 1: ANIME SELECTION FROM SEARCH ---
    if (pendingAnimeSearch[k]) {
      const num = parseInt(input, 10);
      const session = pendingAnimeSearch[k];

      if (isNaN(num) || num <= 0 || num > session.results.length) {
        return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ.* Range: 1 - ${session.results.length}`);
      }

      const selectedAnime = session.results[num - 1];
      delete pendingAnimeSearch[k];

      await reply(`⏳ *ғᴇᴛᴄʜɪɴɢ ᴇᴘɪsᴏᴅᴇs ғᴏʀ ${toSmallCaps(selectedAnime.title)}...*`);

      try {
        let episodes = await scraper.getEpisodes(selectedAnime.link);

        if (!episodes || episodes.length === 0) {
          return reply(`⚠️ *No episodes found for ${selectedAnime.title}.*`);
        }

        pendingAnimeSelection[k] = {
          anime: selectedAnime,
          episodes,
          timestamp: Date.now(),
        };

        const poster = extractPoster(selectedAnime);

        let captionText = `╭━━━〔 🎌 *${toSmallCaps(selectedAnime.title)}* 〕━━━\n┃\n`;
        captionText += `┃ 📥 *Available Episodes:* ${episodes.length}\n┃\n`;
        captionText += `╰━━━───────━━━━► ❥\n\n`;
        captionText += `*[ 00 ]* 📦 Download ALL Episodes\n`;

        episodes.forEach((ep, idx) => {
          const numStr = String(idx + 1).padStart(2, "0");
          const epName = ep.name || `Episode ${idx + 1}`;
          captionText += `*[ ${numStr} ]* 📌 ${epName}\n`;
        });

        captionText += `\n───────────────────\n`;
        captionText += `💡 *Reply "00" or "all" for ALL episodes.*\n`;
        captionText += `💡 *Or reply with numbers (e.g., "1,3,5") for specific episodes.*`;

        const channelMeta = getChannelContext();

        if (poster) {
          await bot.sendMessage(from, {
            image: { url: poster },
            caption: captionText,
            ...channelMeta,
          }, { quoted: mek });
        } else {
          await bot.sendMessage(from, {
            text: captionText,
            ...channelMeta,
          }, { quoted: mek });
        }

        episodes = null;
      } catch (e) {
        console.error("ANIME EPISODES ERROR:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`❌ *Failed to fetch episodes for ${selectedAnime.title}.*`);
      }
      return;
    }

    // --- STEP 2: EPISODE SELECTION & DOWNLOAD ---
    // Mapping: "0"/"00"/"all" = every episode.
    // Otherwise each typed number maps directly to that episode:
    // "1" -> Episode 1 (episodes[0]), "2" -> Episode 2 (episodes[1]), etc.
    if (pendingAnimeSelection[k]) {
      const { anime, episodes } = pendingAnimeSelection[k];

      let selectedIndices = [];
      const lowerInput = input.toLowerCase();

      if (lowerInput === "0" || lowerInput === "00" || lowerInput === "all") {
        selectedIndices = episodes.map((_, idx) => idx);
      } else {
        const numbers = input.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));

        numbers.forEach((num) => {
          if (num === 0) {
            episodes.forEach((_, idx) => selectedIndices.push(idx));
          } else if (num >= 1 && num <= episodes.length) {
            selectedIndices.push(num - 1);
          }
        });
      }

      selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);

      if (selectedIndices.length === 0) {
        return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ sᴇʟᴇᴄᴛɪᴏɴ.* Valid Range: 01 - ${String(episodes.length).padStart(2, "0")} (or 00 / all)`);
      }

      delete pendingAnimeSelection[k];

      await reply(`🚀 *sᴛᴀʀᴛɪɴɢ ʙᴀᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ:* ${selectedIndices.length} episode(s) selected...`);

      const channelMeta = getChannelContext();

      for (let i = 0; i < selectedIndices.length; i++) {
        const epIndex = selectedIndices[i];
        const ep = episodes[epIndex];
        const epName = ep.name || `Episode ${epIndex + 1}`;

        try {
          await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Downloading ${epName}...*`);

          let videoUrl = await scraper.getVideoLink(ep.id, anime.link);

          if (!videoUrl) {
            await reply(`⚠️ *Skipping ${epName}: Extraction failed.*`);
            continue;
          }

          await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

          const cleanTitle = anime.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);
          const cleanEpName = epName.replace(/[^\w\s.-]/gi, "");
          const fileName = `MALIYA-MD ${cleanTitle} - ${cleanEpName}.mp4`;

          const caption =
            `🎌 *${toSmallCaps(anime.title)}*\n` +
            `🎬 *${toSmallCaps(epName)}*\n\n` +
            `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

          await bot.sendMessage(
            from,
            {
              document: { url: videoUrl },
              mimetype: "video/mp4",
              fileName: fileName,
              caption: caption,
              ...channelMeta,
            },
            { quoted: mek }
          );

          await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

          videoUrl = null;
          await delay(4000);
        } catch (epErr) {
          console.error(`Error sending ${epName}:`, epErr.message);
          await reply(`❌ *Failed to send ${epName}: ${epErr.message || "Unknown Error"}*`);
        }
      }

      await reply(`🎉 *All Selected Episode Downloads Completed Successfully!*`);
    }
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
  for (const key in pendingAnimeSelection) {
    if (now - pendingAnimeSelection[key].timestamp > SESSION_TIMEOUT) {
      delete pendingAnimeSelection[key];
    }
  }
  for (const key in lastProcessedMsg) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingAnimeSearch, pendingAnimeSelection };
