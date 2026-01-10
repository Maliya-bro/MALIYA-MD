const { cmd } = require("../command");
const yts = require("yt-search");
const { ytmp3 } = require("@vreden/youtube_scraper");

cmd(
  {
    pattern: "song",
    react: "🎵",
    desc: "Search song with buttons",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("❌ *Song name එකක් දාන්න*");

      const search = await yts(q);
      if (!search.videos.length) return reply("❌ *Song not found*");

      const data = search.videos[0];
      const url = data.url;

      const caption = `
🎵 *${data.title}*
⏱️ Duration: ${data.timestamp}
👀 Views: ${data.views.toLocaleString()}
📅 Uploaded: ${data.ago}
      `;

      // 🔹 Buttons message
      await bot.sendMessage(
        from,
        {
          image: { url: data.thumbnail },
          caption,
          footer: "MALIYA-MD 🎶",
          buttons: [
            {
              buttonId: `song_audio|${url}`,
              buttonText: { displayText: "🎧 Get Audio" },
              type: 1,
            },
            {
              buttonId: `song_doc|${url}`,
              buttonText: { displayText: "📁 Get Document" },
              type: 1,
            },
          ],
          headerType: 4,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log(e);
      reply("❌ Error occurred");
    }
  }
);

// 🔹 Button handler
cmd(
  {
    filter: (text) =>
      text.startsWith("song_audio|") || text.startsWith("song_doc|"),
  },
  async (bot, mek, m, { from, body, reply }) => {
    try {
      const [type, url] = body.split("|");

      const songData = await ytmp3(url, "192");

      if (type === "song_audio") {
        await bot.sendMessage(
          from,
          {
            audio: { url: songData.download.url },
            mimetype: "audio/mpeg",
          },
          { quoted: mek }
        );
      }

      if (type === "song_doc") {
        await bot.sendMessage(
          from,
          {
            document: { url: songData.download.url },
            mimetype: "audio/mpeg",
            fileName: "MALIYA-MD.mp3",
          },
          { quoted: mek }
        );
      }
    } catch (err) {
      console.log(err);
      reply("❌ Download failed");
    }
  }
);
