// plugins/song.js  (FINAL – repo‑compatible, buttons added)

const { cmd } = require("../command");
const yts = require("yt-search");

cmd(
  {
    pattern: "song",
    react: "🎶",
    desc: "Download Song",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("❌ *Please provide a song name*");

      const search = await yts(q);
      const data = search.videos[0];
      if (!data) return reply("❌ *Song not found*");

      global.songCache = global.songCache || {};
      global.songCache[from] = {
        url: data.url,
        title: data.title,
      };

      const caption = `
🎵 *Title:* ${data.title}
⏱️ *Duration:* ${data.timestamp}
👀 *Views:* ${data.views.toLocaleString()}
📅 *Uploaded:* ${data.ago}
`;

      await bot.sendMessage(
        from,
        {
          image: { url: data.thumbnail },
          caption,
          footer: "MALIYA‑MD SONG",
          buttonText: "Click Here ↴",
          sections: [
            {
              title: "DOWNLOAD OPTIONS",
              rows: [
                {
                  title: "🎧 Get Audio File",
                  description: "MP3 audio format",
                  rowId: "song_audio",
                },
                {
                  title: "📁 Get Document File",
                  description: "MP3 as document",
                  rowId: "song_doc",
                },
              ],
            },
          ],
        },
        { quoted: mek }
      );
    } catch (e) {
      reply("❌ *Error occurred*");
    }
  }
);
