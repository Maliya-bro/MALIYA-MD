const { cmd } = require("../command");
const yts = require("yt-search");
const { ytmp3 } = require("@vreden/youtube_scraper");

const songCache = {}; // temporary cache for audio/doc links

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

      // Search video
      const search = await yts(q);
      if (!search.videos || search.videos.length === 0)
        return reply("*❌ No results found!*");

      const data = search.videos[0];
      const url = data.url;

      // Download audio
      const songData = await ytmp3(url, "192");
      if (!songData || !songData.download || !songData.download.url)
        return reply("*❌ Failed to fetch song link.*");

      // Store in cache temporarily
      songCache[from] = {
        title: data.title,
        audioUrl: songData.download.url,
        docUrl: songData.download.url,
      };

      // Reply #1 → Thumbnail + info
      const desc = `
🎬 *Title:* ${data.title}
⏱️ *Duration:* ${data.timestamp}
📅 *Uploaded:* ${data.ago}
👀 *Views:* ${data.views.toLocaleString()}
🔗 *Watch Here:* ${data.url}

*Reply with 1 to get audio file, 2 to get document file*
`;

      await bot.sendMessage(
        from,
        { image: { url: data.thumbnail }, caption: desc },
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

      if (step === "1") {
        // Reply #2 → Audio only
        await bot.sendMessage(
          from,
          { audio: { url: song.audioUrl }, mimetype: "audio/mpeg", fileName: `${song.title}.mp3` },
          { quoted: mek }
        );
      } else if (step === "2") {
        // Reply #3 → Document only
        await bot.sendMessage(
          from,
          {
            document: { url: song.docUrl },
            mimetype: "audio/mpeg",
            fileName: `${song.title}.mp3`,
            caption: "🎶 Your song document file",
          },
          { quoted: mek }
        );
        // Remove cache after document sent
        delete songCache[from];
      }
    } catch (e) {
      console.log(e);
    }
  }
);
