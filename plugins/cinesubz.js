const { cmd } = require("../command");
const axios = require("axios");

const pendingSearch = {};
const pendingQuality = {};

const API_BASE = "https://chama-movie-api.koyeb.app";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// 1. Search Command
cmd({
  pattern: "cinesubz",
  alias: ["cinesub", "cs", "cssearch", "film", "movie"],
  react: "🎬",
  desc: "Search and send movies from Cinesubz.co",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("*🎬 Cinesubz Movie Downloader*\n\n*Usage:* .cinesubz <movie_name>\n*Example:* .cinesubz avengers");

  reply("*🔍 Searching Cinesubz for movies...*");

  try {
    const searchUrl = `${API_BASE}/api/v1/movie/cinesubz/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`;
    const res = await axios.get(searchUrl, { headers, timeout: 60000 });

    if (!res.data || !res.data.status || !res.data.data || res.data.data.length === 0) {
      return reply("*❌ No movies found on Cinesubz!*");
    }

    const results = res.data.data.slice(0, 10);
    pendingSearch[sender] = { results, timestamp: Date.now() };

    let text = "*🎬 Cinesubz Search Results:*\n\n";
    results.forEach((item, index) => {
      const typeIcon = item.type === "tvshows" ? "📺" : "🎥";
      text += `*${index + 1}.* ${typeIcon} ${item.title}\n`;
    });

    text += `\n*Reply with movie number (1-${results.length})*`;
    reply(text);

  } catch (error) {
    console.error("Cinesubz Search Error:", error.message);
    reply("*❌ Error searching movies. Please try again later.*");
  }
});

// 2. Movie Selection Listener
cmd({
  filter: (text, { sender }) => pendingSearch[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingSearch[sender].results.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  delete pendingSearch[sender];

  reply("*🔗 Fetching movie details and download links...*");

  try {
    const movieUrl = `${API_BASE}/api/v1/movie/cinesubz/infodl?q=${encodeURIComponent(selected.link)}&api_key=${API_KEY}`;
    const res = await axios.get(movieUrl, { headers, timeout: 60000 });
    const movieInfo = res.data?.data;

    if (!movieInfo || !movieInfo.downloads || movieInfo.downloads.length === 0) {
      return reply("*❌ No download links available for this movie!*");
    }

    let msg = `*🎬 ${movieInfo.title}*\n\n`;
    if (movieInfo.imdb || movieInfo.rating) msg += `*⭐ IMDb:* ${movieInfo.imdb || movieInfo.rating}\n`;
    if (movieInfo.year) msg += `*📅 Year:* ${movieInfo.year}\n`;

    const downloadLinks = movieInfo.downloads;
    pendingQuality[sender] = { movie: { metadata: movieInfo, downloadLinks }, timestamp: Date.now() };

    let qualityMsg = msg + "\n*📥 Available Qualities:*\n";
    downloadLinks.forEach((d, i) => {
      qualityMsg += `*${i + 1}.* ${d.quality} - ${d.size || "N/A"}\n`;
    });
    qualityMsg += `\n*Reply with quality number (1-${downloadLinks.length}) to receive the movie.*`;

    if (movieInfo.image || movieInfo.thumbnail) {
      await danuwa.sendMessage(from, { image: { url: movieInfo.image || movieInfo.thumbnail }, caption: qualityMsg }, { quoted: mek });
    } else {
      await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
    }

  } catch (error) {
    console.error("Fetch Movie Details Error:", error.message);
    reply("*❌ Failed to load download links.*");
  }
});

// 3. Quality Selection & Document Send Listener
cmd({
  filter: (text, { sender }) => pendingQuality[sender] && !isNaN(text) && parseInt(text) > 0 && parseInt(text) <= pendingQuality[sender].movie.downloadLinks.length
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "📥", key: m.key } });

  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];

  const selectedLink = movie.downloadLinks[index];
  reply(`*⬇️ Uploading ${selectedLink.quality} movie as a document...*\nPlease wait a moment.`);

  try {
    const cleanTitle = movie.metadata.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);

    await danuwa.sendMessage(from, {
      document: { url: selectedLink.link },
      mimetype: "video/mp4",
      fileName: `${cleanTitle} - ${selectedLink.quality}.mp4`,
      caption: `*🎬 ${movie.metadata.title}*\n*📊 Quality:* ${selectedLink.quality}\n*💾 Size:* ${selectedLink.size || "N/A"}\n\n*Enjoy your movie! 🍿*`
    }, { quoted: mek });

  } catch (error) {
    console.error("Send Document Error:", error.message);
    reply(`*❌ Failed to send movie document:* ${error.message || "Unknown error"}`);
  }
});

// Auto Cleanup for Expired Sessions (10 mins)
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000;
  for (const s in pendingSearch) if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
