const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

cmd({
  pattern: "lyrics",
  alias: ["ly", "lyric", "lyr","l"],
  desc: "Get Sinhala song lyrics",
  category: "search",
  react: "🎼",
  filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("❌ *enter song name*!\nExample: .lyrics api kawuruda");

    // search page
    const searchUrl = `https://sinhalasongbook.com/?s=${encodeURIComponent(q)}`;
    const searchRes = await axios.get(searchUrl);
    const $ = cheerio.load(searchRes.data);

    let songLink = $("h2.entry-title a").attr("href");
    if (!songLink) return reply("❌ *Song not found!*");

    // open song page
    const songRes = await axios.get(songLink);
    const $$ = cheerio.load(songRes.data);

    let title = $$("h1.entry-title").text().trim();
    let lyrics = $$("div.entry-content").text().trim();

    if (!lyrics) return reply("❌ *Lyrics not found!*");

    // trim long lyrics
    if (lyrics.length > 3500) {
      lyrics = lyrics.slice(0, 3500) + "\n\n...Lyrics Too Long";
    }

    const msg = `🎶 *${title}*\n\n${lyrics}`;

    await conn.sendMessage(from, { text: msg }, { quoted: mek });

  } catch (e) {
    console.log(e);
    reply("⚠️ Error downloading lyrics!");
  }
});
