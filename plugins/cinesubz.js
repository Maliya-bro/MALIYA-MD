const { cmd } = require("../command");
const { scrapeMovieData } = require("films365-scraper");
const axios = require("axios");

// MALIYA-MD AI API Configs
const AI_API_KEY = "MALIYA-MD-1F8F414EDA13073B9B6B3E0BF503AA4B022AEBF4";
const AI_API_URL = "https://maliya--md-pro.replit.app/api/chat/v1";

// Helper function to call MALIYA-MD AI
async function askAI(prompt) {
  try {
    const res = await axios.post(
      AI_API_URL,
      {
        message: prompt,
        sessionId: "films365-search-session",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": AI_API_KEY,
        },
        timeout: 10000,
      }
    );
    return res.data?.reply || null;
  } catch (err) {
    console.error("AI API Error:", err.message);
    return null;
  }
}

cmd(
  {
    pattern: "m365",
    alias: ["films365", "f365", "movie365"],
    desc: "Search movies using AI & download directly from Films365",
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

      // Direct Link එකක් නොවේ නම් AI Support එකෙන් Movie Query එක Resolve කරගැනීම
      if (!q.startsWith("http://") && !q.startsWith("https://")) {
        await reply(`🔎 *Searching for "${q}" on Films365 via AI...*`);

        // 1. AI එකෙන් Exact Title එක සහ Search Formatting සකසා ගැනීම
        const aiPrompt = `You are a helper for a movie downloader bot. Fix and format this movie search query into the official movie title. Return ONLY the clean official movie name, nothing else. Query: "${q}"`;
        const formattedTitle = (await askAI(aiPrompt)) || q;

        const cleanQuery = formattedTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim();

        // 2. Films365 Search Endpoint එක පරීක්ෂා කිරීම
        const searchApi = `https://www.films365.org/api/search?q=${encodeURIComponent(cleanQuery)}`;
        
        try {
          const searchRes = await axios.get(searchApi, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json, text/plain, */*",
            },
            timeout: 8000,
          });

          const results = searchRes.data?.results || searchRes.data;

          if (Array.isArray(results) && results.length > 0) {
            const item = results[0];
            const movieId = item.id || item._id || item.uuid || item.slug;
            const mediaType = item.type === "tv" ? "tvshows" : "movie";
            
            if (movieId) {
              movieUrl = `https://www.films365.org/${mediaType}/${movieId}`;
            }
          }
        } catch (e) {
          console.error("Direct Search API Error:", e.message);
        }

        // 3. Search API අසාර්ථක වුවහොත් AI එකෙන් Films365 URL Structure එක / Slug එක Predict කරගැනීම
        if (!movieUrl.startsWith("http://") && !movieUrl.startsWith("https://")) {
          const fallbackPrompt = `Give me only the Films365 URL format or movie UUID/slug for "${cleanQuery}" if known, or write "UNKNOWN".`;
          const aiResponse = await askAI(fallbackPrompt);

          if (aiResponse && aiResponse.includes("films365.org")) {
            const urlMatch = aiResponse.match(/https?:\/\/[^\s]+/);
            if (urlMatch) movieUrl = urlMatch[0];
          }
        }

        // තවමත් Link එක නැත්නම් Error එක යැවීම
        if (!movieUrl.startsWith("http://") && !movieUrl.startsWith("https://")) {
          return await reply(
            `❌ "*${q}*" චිත්‍රපටය සොයා ගැනීමට නොහැකි විය.\n\n💡 *Tip:* Films365 Direct Movie Link එක ලබා දී උත්සාහ කරන්න.`
          );
        }
      }

      await reply("⏳ *Extracting movie details and download links...*");

      // films365-scraper මගින් Meta Data & Download URL එක ලබා ගැනීම
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

      // 1. Details Message එක යැවීම
      await conn.sendMessage(m.chat, { text: caption }, { quoted: mek });

      // 2. Direct Video File එක WhatsApp Document එකක් ලෙස Upload කිරීම
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
