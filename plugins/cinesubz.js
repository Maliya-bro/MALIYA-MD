const { cmd } = require("../command");
const { scrapeMovieData } = require("films365-scraper");
const axios = require("axios");

cmd(
  {
    pattern: "film",
    alias: ["films365", "f365", "movie365"],
    desc: "Search and download movies directly from Films365",
    category: "download",
    react: "🎬",
    filename: __filename,
  },
  async (conn, mek, m, { reply, q }) => {
    try {
      if (!q) {
        return await reply(
          "❌ කරුණාකර චිත්‍රපටයේ නම හෝ Link එක ලබාදෙන්න.\n\n*උදාහරණ:* .film Airplane Mode"
        );
      }

      let movieUrl = q.trim();

      // Query එක Link එකක් නොවේ නම් Search API එක හරහා Movie Link එක සොයා ගැනීම
      if (!q.startsWith("http://") && !q.startsWith("https://")) {
        await reply(`🔎 *Searching for "${q}" on Films365...*`);

        // Search Query එක පිරිසිදු කර ගැනීම (වසර හෝ අනවශ්‍ය ලකුණු ඉවත් කිරීම)
        const cleanQuery = q.replace(/\(\d{4}\)/g, "").trim();

        const searchEndpoints = [
          `https://www.films365.org/api/search?q=${encodeURIComponent(cleanQuery)}`,
          `https://www.films365.org/api/v1/search?q=${encodeURIComponent(cleanQuery)}`
        ];

        let searchResults = null;

        for (const endpoint of searchEndpoints) {
          try {
            const res = await axios.get(endpoint, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*"
              },
              timeout: 10000
            });
            
            if (res.data) {
              searchResults = res.data.results || res.data.data || res.data;
              if (Array.isArray(searchResults) && searchResults.length > 0) break;
            }
          } catch (err) {
            // endpoint අසාර්ථක වූ විට ඊළඟ එක උත්සාහ කරයි
          }
        }

        if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
          return await reply("❌ සොයන ලද චිත්‍රපටය Films365 හි හමු නොවීය. කරුණාකර නම නැවත පරීක්ෂා කරන්න.");
        }

        // Search Results අතරින් පළමු සාර්ථක Item එක තෝරාගැනීම
        const item = searchResults[0];

        // Dynamic key detection (id, _id, uuid, slug, path)
        const idOrPath = item.id || item._id || item.uuid || item.slug || item.url || item.path;

        if (!idOrPath) {
          return await reply("❌ Search result එකෙන් Movie ID එක ලබා ගැනීමට නොහැකි විය.");
        }

        if (idOrPath.startsWith("http")) {
          movieUrl = idOrPath;
        } else {
          const mediaType = item.type === "tv" || item.isTv ? "tvshow" : "movie";
          const cleanId = idOrPath.replace(/^\/(movie|tvshow)\//, "");
          movieUrl = `https://www.films365.org/${mediaType}/${cleanId}`;
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

      // 1. Details Caption එක යැවීම
      await conn.sendMessage(m.chat, { text: caption }, { quoted: mek });

      // 2. Direct Video / Document File එක Upload කිරීම
      const cleanFileName = (metadata.title || "Movie")
        .replace(/[^a-zA-Z0-9 space]/g, "")
        .trim();

      await conn.sendMessage(
        m.chat,
        {
          document: { url: metadata.downloadUrl },
          mimetype: "video/mp4",
          fileName: `${cleanFileName}.mp4`,
          caption: `✨ *${metadata.title}*\n\nDownloaded successfully!`,
        },
        { quoted: mek }
      );

    } catch (e) {
      console.error("Films365 Plugin Error:", e);
      await reply("❌ Error occurred: " + (e?.message || e));
    }
  }
);
