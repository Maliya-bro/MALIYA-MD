const os = require("os");
const { cmd } = require("../command");
const { searchCineSubz, scrapeCineSubz, scrapeCineSubzServerLink } = require('cinesubz-scraper');

// Helper: format a date or file size if needed (not used here)

cmd(
  {
    pattern: "cinesubz",
    alias: ["cs", "movie"],
    desc: "Search, get info or decrypt links from CineSubz",
    category: "utility",
    react: "🎬",
    filename: __filename,
  },
  async (conn, mek, m, { reply, args }) => {
    try {
      // No arguments → show usage
      if (!args || args.length === 0) {
        return reply(
          `🎬 *CineSubz Helper*\n\n` +
          `Usage:\n` +
          `  .cinesubz search <query>\n` +
          `  .cinesubz info <url>\n` +
          `  .cinesubz dl <telegram-server-url>\n\n` +
          `Example:\n` +
          `  .cs search 2026\n` +
          `  .cs info https://cinesubz.lk/movies/...\n` +
          `  .cs dl https://bot3.sonic-cloud.online/...`
        );
      }

      const sub = args[0].toLowerCase();

      // ---- SEARCH ----
      if (sub === "search") {
        const query = args.slice(1).join(" ");
        if (!query) return reply("❌ Please provide a search term.");

        await reply(`🔍 Searching for *${query}* ...`);

        const results = await searchCineSubz(query);
        if (!results || results.length === 0) {
          return reply(`😕 No results found for "${query}".`);
        }

        // Build result list (max 10 entries)
        const list = results.slice(0, 10).map((item, i) => 
          `${i+1}. *${item.title}*\n   Rating: ${item.rating || 'N/A'}\n   ${item.url}`
        ).join("\n\n");

        const text = `📋 *Search Results for "${query}"*\n\n${list}` +
          (results.length > 10 ? `\n\n_... and ${results.length - 10} more_` : '');

        return reply(text);
      }

      // ---- INFO (details from a movie/TV page) ----
      if (sub === "info") {
        const url = args[1];
        if (!url) return reply("❌ Please provide the CineSubz URL.");

        await reply(`📖 Fetching details from ${url} ...`);

        const data = await scrapeCineSubz(url);
        if (!data) return reply("❌ Failed to retrieve page data.");

        // Build a readable summary
        let details = `🎬 *${data.title || 'Untitled'}*\n\n`;
        if (data.vote) details += `⭐ Rating: ${data.vote}\n`;
        if (data.genre) details += `🎭 Genre: ${data.genre}\n`;
        if (data.info) details += `📅 ${data.info}\n`;
        if (data.imdb_rate) details += `🎬 IMDb: ${data.imdb_rate}\n`;
        if (data.duration) details += `⏱️ Duration: ${data.duration}\n`;
        if (data.description) {
          const desc = data.description.length > 200 ? data.description.slice(0, 200) + '…' : data.description;
          details += `\n📝 *Synopsis:*\n${desc}\n`;
        }
        if (data.cast && data.cast.length) {
          details += `\n👥 *Cast:*\n`;
          data.cast.slice(0, 5).forEach(actor => {
            details += `  • ${actor.name}\n`;
          });
          if (data.cast.length > 5) details += `  … and ${data.cast.length - 5} more\n`;
        }

        // Download links (if any)
        if (data.downloadLinks && data.downloadLinks.length) {
          details += `\n📥 *Download Links:*\n`;
          data.downloadLinks.slice(0, 3).forEach(link => {
            details += `  • ${link.quality}: ${link.directUrl}\n`;
          });
          if (data.downloadLinks.length > 3) details += `  … and ${data.downloadLinks.length - 3} more\n`;
        }

        // Poster image (optional) – we can send as image if we want, but we'll just show the URL
        if (data.poster) {
          details += `\n🖼️ Poster: ${data.poster}`;
        }

        details += `\n\n🔗 Source: ${url}`;

        return reply(details);
      }

      // ---- DL (decrypt Telegram server link) ----
      if (sub === "dl") {
        const url = args[1];
        if (!url) return reply("❌ Please provide the Telegram server URL.");

        await reply(`🔓 Decrypting link ...`);

        const result = await scrapeCineSubzServerLink(url);
        if (!result) return reply("❌ Failed to decrypt the link.");

        let msg = `🔓 *Decrypted Link*\n\n`;
        if (result.title) msg += `📄 Title: ${result.title}\n`;
        if (result.size) msg += `📦 Size: ${result.size}\n`;
        if (result.telegram) msg += `📱 Telegram: ${result.telegram}\n`;
        msg += `\n🔗 Original: ${url}`;

        return reply(msg);
      }

      // Unknown sub‑command
      return reply(`❌ Unknown sub‑command: ${sub}\nUse: search, info, or dl`);

    } catch (error) {
      console.error("CineSubz plugin error:", error);
      return reply(`❌ An error occurred:\n${error.message || 'Unknown error'}`);
    }
  }
);
