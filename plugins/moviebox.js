const { cmd } = require("../command");
const axios = require("axios");

// Session Memory for Pending Selection
const pendingMovie = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes

// Helper: Convert to Small Caps Text
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

// 1. MOVIE SEARCH COMMAND
cmd(
  {
    pattern: "moviebox",
    alias: ["mv"],
    desc: "Search and download movies via Moviebox API",
    category: "download",
    react: "🎬",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("🎬 *ᴜsᴀɢᴇ:* `.movie <Movie / Series Name>`");
    }

    const queryStr = q.trim();
    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴍᴏᴠɪᴇʙᴏx...*");

    try {
      // Dynamic ESM Import for @weroperking/invenio-scraper
      const { MovieboxSession, search } = await import("@weroperking/invenio-scraper");
      const session = new MovieboxSession();

      const searchRes = await search(session, {
        query: queryStr,
        type: "all", // 'all' | 'movie' | 'tv'
        page: 1,
        perPage: 10,
      });

      if (!searchRes || !searchRes.results || searchRes.results.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴍᴏᴠɪᴇs ᴏʀ sᴇʀɪᴇs ғᴏᴜɴᴅ ғᴏʀ:* _${queryStr}_`);
      }

      const results = searchRes.results.slice(0, 10);

      // Store results in memory for selection
      pendingMovie[sender] = {
        results: results,
        timestamp: Date.now(),
      };

      let text = `╭━━━〔 🎬 *ᴍᴏᴠɪᴇ sᴇᴀʀᴄʜ* 〕━━━\n┃\n`;
      text += `┃ 🔎 *ǫᴜᴇʀʏ:* ${toSmallCaps(queryStr)}\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${results.length} Results\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      results.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        const title = item.title || "Unknown Title";
        const year = item.releaseYear ? `(${item.releaseYear})` : "";
        const rating = item.rating ? `⭐ ${item.rating}/10` : "";
        const type = item.type ? `[${item.type.toUpperCase()}]` : "";

        text += `*[ ${numStr} ]* 🎥 *${toSmallCaps(title)}* ${year}\n`;
        text += `      ${type} ${rating}\n\n`;
      });

      text += `───────────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴛʜᴇ ɴᴜᴍʙᴇʀ (1-${results.length}) ᴛᴏ ɢᴇᴛ ᴍᴏᴠɪᴇ/sᴛʀᴇᴀᴍ*`;

      await reply(text);

    } catch (err) {
      console.error("MOVIE SEARCH ERROR:", err.message);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇᴀʀᴄʜ ᴍᴏᴠɪᴇs. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.*");
    }
  }
);

// 2. NUMBER REPLY LISTENER
cmd(
  {
    filter: (text, { sender }) => {
      return (
        pendingMovie[sender] &&
        !isNaN(text) &&
        parseInt(text) > 0 &&
        parseInt(text) <= pendingMovie[sender].results.length
      );
    },
  },
  async (bot, mek, m, { body, sender, reply, from }) => {
    await bot.sendMessage(from, { react: { text: "⚡", key: m.key } });

    const index = parseInt(body.trim()) - 1;
    const selected = pendingMovie[sender].results[index];
    delete pendingMovie[sender];

    await reply(`⬇️ *ғᴇᴛᴄʜɪɴɢ ᴍᴇᴛᴀᴅᴀᴛᴀ & sᴛʀᴇᴀᴍ ʟɪɴᴋ...*`);

    try {
      const {
        MovieboxSession,
        getMovieDetails,
        getMovieStreamUrl,
        getEpisodeStreamUrl,
      } = await import("@weroperking/invenio-scraper");

      const session = new MovieboxSession();
      const detailPath = selected.raw ? selected.raw.detailPath : selected.detailPath;

      let streamUrl = null;
      let details = null;

      if (selected.type === "tv") {
        // Fetch Season 1 Episode 1 Stream for TV Series
        const streamData = await getEpisodeStreamUrl(session, {
          detailPath: detailPath,
          season: 1,
          episode: 1,
          quality: "best",
        });
        streamUrl = streamData.stream?.url;
      } else {
        // Fetch Movie Details & Stream
        details = await getMovieDetails(session, { detailPath: detailPath });
        const streamData = await getMovieStreamUrl(session, {
          detailPath: detailPath,
          quality: "best",
        });
        streamUrl = streamData.stream?.url;
      }

      if (!streamUrl) {
        return reply("❌ *ᴄᴏᴜʟᴅ ɴᴏᴛ ᴇxᴛʀᴀᴄᴛ Direct ᴅᴏᴡɴʟᴏᴀᴅ/sᴛʀᴇᴀᴍ ʟɪɴᴋ!*");
      }

      // Check File Size via Head Request
      let fileSizeInMB = 0;
      try {
        const headRes = await axios.head(streamUrl, { timeout: 5000 });
        const contentLength = headRes.headers["content-length"];
        if (contentLength) fileSizeInMB = parseInt(contentLength) / (1024 * 1024);
      } catch (err) {
        console.log("Size check skipped, sending video directly.");
      }

      const titleName = details ? details.title : selected.title;
      const synopsis = details ? details.synopsis : "No synopsis available.";
      const rating = details ? details.rating : selected.rating || "N/A";

      const caption =
        `🎬 *${titleName.toUpperCase()}*\n\n` +
        `⭐ *ʀᴀᴛɪɴɢ:* ${rating}/10\n` +
        `📝 *sʏɴᴏᴘsɪs:* ${synopsis.substring(0, 200)}...\n\n` +
        `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

      const fileName = `MALIYA-MD_${titleName.replace(/\s+/g, "_")}.mp4`;

      // If Size > 40MB -> Send as Document
      if (fileSizeInMB > 40) {
        await bot.sendMessage(
          from,
          {
            document: { url: streamUrl },
            mimetype: "video/mp4",
            fileName: fileName,
            caption: caption,
          },
          { quoted: mek }
        );
      } else {
        // If Size <= 40MB -> Send as Playable Video
        await bot.sendMessage(
          from,
          {
            video: { url: streamUrl },
            mimetype: "video/mp4",
            caption: caption,
          },
          { quoted: mek }
        );
      }

      await bot.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (err) {
      console.error("MOVIE PROCESSING ERROR:", err.message);
      reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ᴏʀ sᴇɴᴅ ᴍᴏᴠɪᴇ/sᴇʀɪᴇs!*");
    }
  }
);

// Auto-Clear Pending Sessions
setInterval(() => {
  const now = Date.now();
  for (const s in pendingMovie) {
    if (now - pendingMovie[s].timestamp > SESSION_TIMEOUT) {
      delete pendingMovie[s];
    }
  }
}, 5 * 60 * 1000);
