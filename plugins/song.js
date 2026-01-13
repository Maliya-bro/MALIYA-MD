const { cmd } = require("../command");
const yts = require("yt-search");
const ytdl = require("ytdl-core");

const songCache = {}; // temporary cache for step replies

cmd(
  {
    pattern: "song",
    react: "🎶",
    desc: "Download Song with audio/document step control",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, reply, q }) => {
    try {
      if (!q) return reply("❌ *Please provide a song name or YouTube link*");

      // Check if direct YouTube link or search term
      let url = q.match(/(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/);
      let videoInfo;

      if (url) {
        // Direct link
        videoInfo = await ytdl.getInfo(q);
      } else {
        // Search YouTube
        const search = await yts(q);
        if (!search.videos || search.videos.length === 0)
          return reply("*❌ No results found!*");

        const data = search.videos[0];
        url = data.url;
        videoInfo = await ytdl.getInfo(url);
      }

      const title = videoInfo.videoDetails.title;
      const lengthSec = parseInt(videoInfo.videoDetails.lengthSeconds);
      if (lengthSec > 1800)
        return reply("⏳ *Sorry, audio files longer than 30 minutes are not supported.*");

      const thumbnail = videoInfo.videoDetails.thumbnails.slice(-1)[0].url;

      // Store in cache
      songCache[from] = {
        title,
        url,
      };

      // Reply #1 → thumbnail + info
      const desc = `
🎬 *Title:* ${title}
⏱️ *Duration:* ${Math.floor(lengthSec / 60)}:${lengthSec % 60}
👤 *Uploader:* ${videoInfo.videoDetails.author.name}
🔗 *Watch Here:* ${url}

*Reply with 1 to get audio file, 2 to get document file*
`;

      await bot.sendMessage(
        from,
        { image: { url: thumbnail }, caption: desc },
        { quoted: mek }
      );
    } catch (e) {
      console.log(e);
      reply(`❌ *Error:* ${e.message}`);
    }
  }
);

// Listen to step replies
cmd(
  {
    on: "message",
  },
  async (bot, mek, m, { from, body, reply }) => {
    try {
      if (!songCache[from]) return;

      const step = body.trim();
      const song = songCache[from];

      if (!song) return;

      if (step === "1") {
        // Reply #2 → audio only
        await bot.sendMessage(
          from,
          {
            audio: {
              url: song.url,
            },
            mimetype: "audio/mpeg",
            fileName: `${song.title}.mp3`,
          },
          { quoted: mek }
        );
      } else if (step === "2") {
        // Reply #3 → document only
        await bot.sendMessage(
          from,
          {
            document: {
              url: song.url,
            },
            mimetype: "audio/mpeg",
            fileName: `${song.title}.mp3`,
            caption: "🎶 Your song document file",
          },
          { quoted: mek }
        );

        // Remove cache
        delete songCache[from];
      }
    } catch (e) {
      console.log(e);
    }
  }
);
