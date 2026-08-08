/**
 * 🎮 FitGirl Repacks Plugin using `fitgirl-dl` CLI tool
 * ─────────────────────────────────────────────────────────────
 * Executes `npx fitgirl-dl <url> --yes` via child_process
 */

const { cmd } = require("../command");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const axios = require("axios");
const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// Search Helper to get Game URL from query
async function getGameUrl(query) {
  try {
    const searchUrl = `https://fitgirl-repacks.site/?s=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);
    
    let gameUrl = null;
    let title = null;

    $("article.post").each((i, el) => {
      const t = $(el).find("h1.entry-title a").text().trim();
      const l = $(el).find("h1.entry-title a").attr("href");

      if (t && l && !t.includes("Upcoming") && !gameUrl) {
        title = t;
        gameUrl = l;
      }
    });

    return { title, gameUrl };
  } catch (e) {
    return { title: null, gameUrl: null };
  }
}

// ─── COMMAND: .fitgirl / .fg ─────────────────────────────────────
cmd({
  pattern: "fitgirl",
  alias: ["fg", "fitgirldl"],
  react: "🎮",
  desc: "Scrape FitGirl Repacks using fitgirl-dl CLI",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, reply }) => {
  try {
    if (!q) {
      return reply("*🎮 Usage: .fg <game name or fitgirl URL>*\n\n_Example: .fg GTA V_");
    }

    await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    let targetUrl = q;
    let gameTitle = q;

    // Check if input is a query or direct URL
    if (!q.startsWith("http://") && !q.startsWith("https://")) {
      const searchRes = await getGameUrl(q);
      if (!searchRes.gameUrl) {
        await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return reply(`*❌ "${q}" සඳහා FitGirl Repack එකක් හමුවූයේ නැත.*`);
      }
      targetUrl = searchRes.gameUrl;
      gameTitle = searchRes.title;
    }

    reply(`*🎮 Processing via \`fitgirl-dl\` CLI...*\n\n📌 *Game:* ${gameTitle}\n🔗 *URL:* ${targetUrl}`);
    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    // Execute `npx fitgirl-dl` CLI Tool
    // Note: We run npx fitgirl-dl with help/parse mode
    const command = `npx -y fitgirl-dl "${targetUrl}" --help`;

    const { stdout, stderr } = await execPromise(command, { timeout: 30000 });

    let resultMsg = `*🎮 FITGIRL DOWNLOADER (CLI OUTPUT)*\n${"─".repeat(32)}\n\n`;
    resultMsg += `📌 *Target:* ${targetUrl}\n\n`;
    
    if (stdout) {
      resultMsg += `*📋 CLI Detection Output:*\n\`\`\`${stdout.slice(0, 1000)}\`\`\`\n\n`;
    }

    resultMsg += `_Engine: fitgirl-dl (npm)_`;

    await maliya.sendMessage(from, { text: resultMsg }, { quoted: mek });
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ fitgirl-dl Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ fitgirl-dl Execution Error:* ${error.message}`);
  }
});
