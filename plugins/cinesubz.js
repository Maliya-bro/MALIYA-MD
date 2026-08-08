/**
 * 🎬 Cinesubz Downloader Plugin (Bug Fixed & RAM Optimized)
 * ────────────────────────────────────────────────────────────────────────
 * Pure Axios + Cheerio Scraping + CloakBrowser Engine for Sonic-Cloud
 */

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const { launch } = require("cloakbrowser");

// User Sessions Store
const cinesubzSessions = {};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// 1. Pure Axios + Cheerio Search Function
async function searchCineSubz(query) {
  try {
    const searchUrl = `https://cinesubz.co/?s=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const results = [];

    $(".result-item, article").each((i, el) => {
      const title = $(el).find(".title a, .entry-title a").text().trim();
      const link = $(el).find(".title a, .entry-title a").attr("href");
      const image = $(el).find("img").attr("src");

      if (title && link) {
        results.push({ title, url: link, image });
      }
    });

    return results;
  } catch (error) {
    console.error("❌ Search Scraping Error:", error.message);
    return [];
  }
}

// 2. Pure Axios + Cheerio Movie Details & Download Link Scraper
async function scrapeCineSubzDetails(movieUrl) {
  try {
    const { data } = await axios.get(movieUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);

    const title = $("h1.entry-title, h1").text().trim() || "Cinesubz Movie";
    const poster = $('meta[property="og:image"]').attr("content") || $(".poster img").attr("src");
    const imdb = $(".imdb-rate, .rating").text().trim() || "N/A";
    const duration = $(".runtime, .duration").text().trim() || "N/A";

    const downloadLinks = [];

    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href) {
        if (href.includes("sonic-cloud.online") || href.includes("pixeldrain.com")) {
          downloadLinks.push(href);
        }
      }
    });

    return { title, poster, imdb, duration, downloadLinks };
  } catch (error) {
    console.error("❌ Movie Page Scraping Error:", error.message);
    return null;
  }
}

// 3. CloakBrowser Sonic Cloud Bypass Helper (RAM Optimized)
async function resolveSonicCloudDirectLink(sonicCloudUrl) {
  let browser;
  try {
    console.log(`🚀 CloakBrowser Launching for: ${sonicCloudUrl}`);

    browser = await launch({
      headless: true,
      humanize: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage();
    let capturedDownloadUrl = null;

    page.on("response", (response) => {
      const url = response.url();
      if ((url.includes("token=") || url.includes(".mp4")) && !url.includes("sonic-cloud") && !url.includes("fordev.jpg")) {
        capturedDownloadUrl = url;
        console.log("🎯 REAL DIRECT MP4 TOKEN LINK CAPTURED: ", url);
      }
    });

    await page.goto(sonicCloudUrl, { waitUntil: "networkidle2", timeout: 40000 });

    const btnSelector = "#dl-links button, #dl-links a, .direct-download";

    try {
      await page.waitForSelector(btnSelector, { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 1500));
      await page.click(btnSelector);
    } catch (e) {
      console.log("⚠️ Direct click skipped / auto-redirecting...");
    }

    let waited = 0;
    while (!capturedDownloadUrl && waited < 10000) {
      await new Promise((r) => setTimeout(r, 500));
      waited += 500;
    }

    await browser.close();
    return capturedDownloadUrl || sonicCloudUrl;

  } catch (error) {
    if (browser) await browser.close();
    console.error("❌ Sonic Bypass Error:", error.message);
    return sonicCloudUrl;
  }
}

// ─── 1. SEARCH COMMAND (.cs / .cinesubz) ───────────────────────────
cmd({
  pattern: "cinesubz",
  alias: ["cine", "cs"],
  react: "🎬",
  desc: "Search & Download movies from Cinesubz",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) {
      return reply("*🎬 Usage: .cs <movie name>*\n\n_Example: .cs Jungle Cruise_");
    }

    await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });

    const results = await searchCineSubz(q);

    if (!results || results.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply(`*❌ "${q}" සඳහා Cinesubz හි කිසිදු චිත්‍රපටයක් හමුවූයේ නැත.*`);
    }

    const topResults = results.slice(0, 10);
    let text = `*🎬 CINESUBZ MOVIE SEARCH RESULTS*\n${"─".repeat(30)}\n\n`;

    topResults.forEach((item, index) => {
      text += `*${index + 1}.* ${item.title}\n`;
    });
    text += `\n*📌 Reply with the number (1-${topResults.length}) to download.*`;

    const sentMsg = await maliya.sendMessage(from, { text: text }, { quoted: mek });

    // Store session
    cinesubzSessions[sender] = {
      results: topResults,
      messageId: sentMsg?.key?.id || null,
      timestamp: Date.now()
    };

    // Auto clear session after 5 minutes to free memory
    setTimeout(() => {
      if (cinesubzSessions[sender]) {
        delete cinesubzSessions[sender];
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error("❌ Search Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Search Error:* ${error.message}`);
  }
});

// ─── 2. SELECTION LISTENER (Safe for other plugins) ───────────────
cmd({
  on: "text",
  filename: __filename
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  try {
    // Session එකක් නැත්නම් කෙළින්ම return වෙනවා (අනික් Plugins වලට ඉඩ දෙනවා)
    if (!cinesubzSessions[sender]) return;

    const text = body ? body.trim() : "";
    const n = parseInt(text);

    // Number එකක් නෙවෙයි නම් හෝ පරාසයෙන් පිට නම් Return වෙනවා
    if (isNaN(n) || n <= 0 || n > cinesubzSessions[sender].results.length) return;

    const session = cinesubzSessions[sender];
    const index = n - 1;
    const selectedMovie = session.results[index];

    // Session Clear කිරීම
    delete cinesubzSessions[sender];

    const moviePageUrl = selectedMovie.url;

    await maliya.sendMessage(from, { react: { text: "⏳", key: mek.key } });
    reply("*⏳ Fetching details & resolving direct CDN link...*");

    // Pure Details Scraper
    const metadata = await scrapeCineSubzDetails(moviePageUrl);

    if (!metadata) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *Movie විස්තර ලබාගැනීමට නොහැකි විය.*");
    }

    let movieTitle = metadata.title || selectedMovie.title || "Cinesubz Movie";
    let posterUrl = metadata.poster || selectedMovie.image;
    let imdb = metadata.imdb || "N/A";
    let duration = metadata.duration || "N/A";

    let captionText = `*🎬 ${movieTitle}*\n${"─".repeat(30)}\n`;
    captionText += `⭐ *IMDb Rating:* ${imdb}\n`;
    captionText += `⏱️ *Duration:* ${duration}\n\n`;
    captionText += `_⏳ Extracting direct MP4 stream URL from sonic-cloud..._`;

    if (posterUrl) {
      await maliya.sendMessage(from, { image: { url: posterUrl }, caption: captionText }, { quoted: mek });
    } else {
      await reply(captionText);
    }

    if (!metadata.downloadLinks || metadata.downloadLinks.length === 0) {
      await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
      return reply("❌ *Download Links සොයාගැනීමට නොහැකි විය.*");
    }

    let intermediateUrl = metadata.downloadLinks[0];
    let finalDirectMp4Url = intermediateUrl;

    // Sonic Cloud Bypass
    if (intermediateUrl.includes("sonic-cloud")) {
      finalDirectMp4Url = await resolveSonicCloudDirectLink(intermediateUrl);
    } else if (intermediateUrl.includes("pixeldrain.com/u/")) {
      finalDirectMp4Url = intermediateUrl.replace("pixeldrain.com/u/", "pixeldrain.com/api/file/");
    }

    // Send Document
    await maliya.sendMessage(from, { react: { text: "📤", key: mek.key } });
    reply(`*📥 Downloading Movie Document...*\n_Resolved CDN Link: ✅_`);

    await maliya.sendMessage(from, {
      document: { url: finalDirectMp4Url },
      mimetype: "video/mp4",
      fileName: `${movieTitle.replace(/[^a-zA-Z0-9 ]/g, "_")}.mp4`,
      caption: `*🎬 ${movieTitle}*\n\n_Delivered by MALIYA-MD_`
    }, { quoted: mek });

    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  } catch (error) {
    console.error("❌ Selection Handler Error:", error.message);
    await maliya.sendMessage(from, { react: { text: "❌", key: mek.key } });
    reply(`*❌ Download Failed:* ${error.message}`);
  }
});
