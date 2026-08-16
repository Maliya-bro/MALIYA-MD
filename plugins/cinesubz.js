const { cmd } = require("../command");
const { scrapeMovieData } = require("films365-scraper");
const axios = require("axios");

cmd(
  {
    pattern: "film",
    alias: ["f365", "movie365", "f365dl"],
    desc: "Search movies on Films365 and download movie file",
    category: "download",
    react: "🎬",
    filename: __filename,
  },
  async (conn, mek, m, { reply, q }) => {
    try {
      if (!q) {
        return await reply(
          "❌ කරුණාකර චිත්‍රපටයේ නම හෝ Films365 Link එක ලබාදෙන්න.\n\n*උදාහරණ:* .films365 spider man"
        );
      }

      let movieUrl = q.trim();

      // යොමු කළ query එක Link එකක් නොවේ නම් Search API / Query හරහා Link එක සොයාගැනීම
      if (!q.startsWith("http://") && !q.startsWith("https://")) {
        await reply(`🔎 *Searching for "${q}" on Films365...*`);

        try {
          // Films365 Search Endpoint එකට Request එකක් යැවීම
          const searchResponse = await axios.get(
            `https://www.films365.org/api/search?q=${encodeURIComponent(q.trim())}`,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            }
          );

          const searchResults = searchResponse.data?.results || searchResponse.data;

          if (!searchResults || searchResults.length === 0) {
            return await reply("❌ සොයන ලද චිත්‍රපටය Films365 හි හමු නොවීය. කරුණාකර නම නැවත පරීක්ෂා කරන්න.");
          }

          // Search results වලින් මුල්ම Movie Item එක තෝරාගැනීම
          const firstMovie = Array.isArray(searchResults) ? searchResults[0] : searchResults;
          const movieId = firstMovie.id || firstMovie.uuid || firstMovie.slug;

          if (!movieId) {
            return await reply("❌ Search result එකෙන් Movie ID එක ලබා ගැනීමට නොහැකි විය.");
          }

          const type = firstMovie.type === "tv" ? "tvshow" : "movie";
          movieUrl = `https://www.films365.org/${type}/${movieId}`;
        } catch (searchError) {
          console.error("Search API Failed, trying direct scrape attempt:", searchError.message);
          return await reply("❌ Search කිරීමට යාමේදී දෝෂයක් සිදු විය. කරුණාකර Films365 URL එක සෘජුව ලබාදෙන්න.");
        }
      }

      await reply("⏳ *Extracting movie details and download links...*");

      // films365-scraper මගින් metadata & downloadUrl ලබා ගැනීම
      const metadata = await scrapeMovieData(movieUrl);

      if (!metadata || !metadata.downloadUrl) {
        return await reply("❌ චිත්‍රපටයේ Download Link එක ලබා ගැනීමට නොහැකි විය.");
      }

      const caption =
        `🎬 *${metadata.title || "Films365 Movie"}*\n\n` +
        `📅 *Release Date:* ${metadata.date || "N/A"}\n` +
        `⏱️ *Duration:* ${metadata.duration || "N/A"}\n` +
        `⭐ *Rating:* ${metadata.rate || "N/A"}/10\n\n` +
        `📝 *Description:* ${metadata.desc || "N/A"}\n\n` +
        `📥 *Uploading movie file... Please wait!*`;

      // 1. මුලින්ම Details Caption එක යැවීම
      await conn.sendMessage(m.chat, { text: caption }, { quoted: mek });

      // 2. Direct Video / Document File එක WhatsApp එකට Upload කිරීම
      const fileName = `${(metadata.title || "Movie").replace(/[^a-zA-Z0-9 ]/g, "")}.mp4`;

      await conn.sendMessage(
        m.chat,
        {
          document: { url: metadata.downloadUrl },
          mimetype: "video/mp4",
          fileName: fileName,
          caption: `✨ *${metadata.title}*\n\nDownloaded successfully!`,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.error("Films365 Download Error:", e);
      await reply("❌ Error occurred: " + (e?.message || e));
    }
  }
);
