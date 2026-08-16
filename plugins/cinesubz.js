const { cmd } = require("../command");
const { scrapeMovieData } = require("films365-scraper");

cmd(
  {
    pattern: "film",
    alias: ["f365", "movie365"],
    desc: "Scrape movie details from Films365",
    category: "download",
    react: "🎬",
    filename: __filename,
  },
  async (conn, mek, m, { reply, q, args }) => {
    try {
      // Check if URL is provided
      if (!q) {
        return await reply("❌ Please provide a valid Films365 URL.\n\n*Example:* .films365 https://www.films365.org/movie/0ec08e4e-56ed-4231-8aae-45fb0dc26651");
      }

      // Basic URL validation
      if (!q.includes("films365.org")) {
        return await reply("❌ Invalid URL. Please provide a valid Films365 link.");
      }

      await reply("🔎 *Scraping movie details, please wait...*");

      // Fetch metadata using the package
      const metadata = await scrapeMovieData(q.trim());

      if (!metadata || !metadata.title) {
        return await reply("❌ Failed to fetch movie details. Please try again later.");
      }

      // Formatting response text
      const caption = 
        `🎬 *${metadata.title}*\n\n` +
        `📅 *Release Date:* ${metadata.date || "N/A"}\n` +
        `⏱️ *Duration:* ${metadata.duration || "N/A"}\n` +
        `⭐ *Rating:* ${metadata.rate || "N/A"}/10\n\n` +
        `📝 *Description:* ${metadata.desc || "No description available."}\n\n` +
        `📥 *Download Link:*\n${metadata.downloadUrl || "N/A"}`;

      await conn.sendMessage(m.chat, { text: caption }, { quoted: mek });
    } catch (e) {
      console.error("Films365 Error:", e);
      await reply("❌ Error fetching data: " + (e?.message || e));
    }
  }
);
