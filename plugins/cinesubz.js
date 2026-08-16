const { cmd } = require("../command");
const { scrapeMovieData } = require("films365-scraper");
const axios = require("axios");
const cheerio = require("cheerio");

cmd(
  {
    pattern: "film",
    alias: ["films365", "f365", "movie365"],
    desc: "Search movies on Films365 with Cheerio fallback and download",
    category: "download",
    react: "🎬",
    filename: __filename,
  },
  async (conn, mek, m, { reply, q }) => {
    try {
      if (!q) {
        return await reply(
          "❌ කරුණාකර චිත්‍රපටයේ නම හෝ Link එක ලබාදෙන්න.\n\n*උදාහරණ:* .film spider man"
        );
      }

      let movieUrl = q.trim();

      // direct URL එකක් නොවේ නම් Search Scraping ආරම්භ කිරීම
      if (!q.startsWith("http://") && !q.startsWith("https://")) {
        await reply(`🔎 *Searching for "${q}" on Films365...*`);

        // Search Query එක පිරිසිදු කිරීම
        const searchQuery = q.replace(/\(\d{4}\)/g, "").trim();

        // 1. Cheerio/Axios මගින් Films365 Direct Web Search එක Scrap කිරීම
        try {
          const searchPageUrl = `https://www.films365.org/?search=${encodeURIComponent(searchQuery)}`;
          const { data: html } = await axios.get(searchPageUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            timeout: 10000,
          });

          const $ = cheerio.load(html);
          let foundHref = null;

          // HTML Elements ඇතුළෙන් movie/tvshow links සෙවීම
          $("a[href*='/movie/'], a[href*='/tvshows/']").each((i, el) => {
            const href = $(el).attr("href");
            if (href && !foundHref) {
              foundHref = href;
            }
          });

          if (foundHref) {
            movieUrl = foundHref.startsWith("http")
              ? foundHref
              : `https://www.films365.org${foundHref}`;
          }
        } catch (err) {
          console.error("Web Scrape Search Failed:", err.message);
        }

        // 2. Web search එක සාර්ථක නොවුණහොත් Search API Attempts පරීක්ෂා කිරීම
        if (!movieUrl.startsWith("http://") && !movieUrl.startsWith("https://")) {
          const apiEndpoints = [
            `https://www.films365.org/api/search?q=${encodeURIComponent(searchQuery)}`,
            `https://www.films365.org/api/v1/search?q=${encodeURIComponent(searchQuery)}`
          ];

          for (const endpoint of apiEndpoints) {
            try {
              const res = await axios.get(endpoint, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                timeout: 8000
              });

              const results = res.data?.results || res.data?.data || res.data;
              if (Array.isArray(results) && results.length > 0) {
                const item = results[0];
                const id = item.id || item._id || item.uuid || item.slug;
                if (id) {
                  const mediaType = item.type === "tv" ? "tvshows" : "movie";
                  movieUrl = `https://www.films365.org/${mediaType}/${id}`;
                  break;
                }
              }
            } catch (e) {
              // Ignore API fails
            }
          }
        }

        // Link එකක් සොයා ගැනීමට නොහැකි නම්
        if (!movieUrl.startsWith("http://") && !movieUrl.startsWith("https://")) {
          return await reply(
            "❌ සොයන ලද චිත්‍රපටය සොයා ගැනීමට නොහැකි විය.\n\n💡 *Tip:* Films365 direct URL එක ලබාදී උත්සාහ කරන්න."
          );
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

      // 1. Details Caption යැවීම
      await conn.sendMessage(m.chat, { text: caption }, { quoted: mek });

      // 2. Direct Video File එක Upload කිරීම
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
