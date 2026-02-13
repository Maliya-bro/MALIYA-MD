const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

// -----------------------------
// Quality Normalize
// -----------------------------
function normalizeQuality(text) {
  if (!text) return "Unknown";
  text = text.toUpperCase();
  if (/1080|FHD/.test(text)) return "1080p";
  if (/720|HD/.test(text)) return "720p";
  if (/480|SD/.test(text)) return "480p";
  if (/360/.test(text)) return "360p";
  return text;
}

// -----------------------------
// Google Drive Direct Link Generator
// -----------------------------
function getDirectGoogleDriveUrl(url) {
  if (!url) return null;
  
  // Google Drive URLs
  const patterns = [
    /\/d\/(.*?)\//,
    /\/file\/d\/(.*?)\//,
    /id=(.*?)&/,
    /id=(.*?)$/,
    /\/open\?id=(.*)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  
  return url;
}

// -----------------------------
// Search Movies
// -----------------------------
async function searchMovies(query) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const searchUrl = `https://cinesubz.lk/?s=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
    
    await page.waitForSelector(".display-item .item-box", { timeout: 10000 }).catch(() => null);
    
    const results = await page.$$eval(".display-item .item-box", boxes =>
      boxes.slice(0, 10).map((box, index) => {
        const a = box.querySelector("a");
        const img = box.querySelector(".thumb img, img");
        const lang = box.querySelector(".language, .item-desc-giha .language")?.textContent || "";
        const quality = box.querySelector(".quality, .item-desc-giha .quality")?.textContent || "";
        const qty = box.querySelector(".qty, .item-desc-giha .qty")?.textContent || "";
        
        return {
          id: index + 1,
          title: a?.title?.trim() || a?.textContent?.trim() || "",
          movieUrl: a?.href || "",
          thumb: img?.src || img?.getAttribute('data-src') || "",
          language: lang.trim(),
          quality: quality.trim(),
          qty: qty.trim(),
        };
      }).filter(m => m.title && m.movieUrl)
    );
    
    return results;
  } catch (error) {
    console.error("Search error:", error);
    return [];
  } finally {
    await browser.close();
  }
}

// -----------------------------
// Get Movie Metadata
// -----------------------------
async function getMovieMetadata(url) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    
    const metadata = await page.evaluate(() => {
      const getText = (el) => el?.textContent?.trim() || "";
      
      // Title
      const title = getText(document.querySelector("h1, .details-title h3, .info-details .details-title h3, .post-title"));
      
      // Thumbnail
      let thumbnail = "";
      const thumbSelectors = [".splash-bg img", ".post-thumbnail img", "meta[property='og:image']"];
      for (const sel of thumbSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          thumbnail = el.src || el.content || "";
          if (thumbnail) break;
        }
      }
      
      // Language, Directors, Stars
      let language = "", directors = [], stars = [], duration = "", imdb = "", genres = [];
      
      // Get all paragraphs
      document.querySelectorAll("p, .info-col p, .info-col div").forEach(p => {
        const text = p.textContent || "";
        
        if (text.includes("Language:")) {
          language = text.replace("Language:", "").trim();
        }
        if (text.includes("Director:")) {
          directors = text.replace("Director:", "").split(",").map(d => d.trim());
        }
        if (text.includes("Stars:")) {
          stars = text.replace("Stars:", "").split(",").map(s => s.trim());
        }
        if (text.includes("Duration:")) {
          duration = text.replace("Duration:", "").trim();
        }
        if (text.includes("IMDb:")) {
          imdb = text.replace("IMDb:", "").trim();
        }
        if (text.includes("Genre:")) {
          genres = text.replace("Genre:", "").split(",").map(g => g.trim());
        }
      });
      
      return { title, language, duration, imdb, genres, directors, stars, thumbnail };
    });
    
    return metadata;
  } catch (error) {
    console.error("Metadata error:", error);
    return { title: "", language: "", duration: "", imdb: "", genres: [], directors: [], stars: [], thumbnail: "" };
  } finally {
    await browser.close();
  }
}

// -----------------------------
// IMPORTANT: Get Google Drive Download Links
// -----------------------------
async function getGoogleDriveLinks(movieUrl) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 60000 });
    
    // Method 1: Look for Google Drive links directly on the page
    const driveLinks = await page.$$eval('a[href*="drive.google.com"], a[href*="docs.google.com"]', links => {
      return links.map(link => {
        // Find parent row for quality and size
        let quality = "Unknown";
        let size = "Unknown";
        
        // Try to find quality in same row/container
        const row = link.closest('tr, .link-box, .download-item, li, div');
        if (row) {
          const qualityEl = row.querySelector('.quality, td:nth-child(1), .link-quality');
          const sizeEl = row.querySelector('.size, td:nth-child(3) span, .link-size');
          
          if (qualityEl) quality = qualityEl.textContent.trim();
          if (sizeEl) size = sizeEl.textContent.trim();
        }
        
        return {
          link: link.href,
          quality: quality,
          size: size
        };
      });
    });
    
    // Method 2: Look for download buttons that lead to Google Drive
    const downloadPageLinks = await page.$$eval('a[href*="cinesubz.lk/download"], a.download-btn, .link-opt a', links => {
      return links.map(link => ({
        pageLink: link.href,
        quality: link.closest('tr, div')?.querySelector('.quality, td:nth-child(1)')?.textContent?.trim() || "Unknown",
        size: link.closest('tr, div')?.querySelector('.size, td:nth-child(3) span')?.textContent?.trim() || "Unknown"
      }));
    });
    
    let allLinks = [...driveLinks];
    
    // If no direct Drive links, check download pages
    if (driveLinks.length === 0 && downloadPageLinks.length > 0) {
      for (const item of downloadPageLinks) {
        try {
          const subPage = await browser.newPage();
          await subPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
          await subPage.goto(item.pageLink, { waitUntil: "networkidle2", timeout: 30000 });
          await new Promise(r => setTimeout(r, 3000));
          
          // Look for Google Drive link on the download page
          const driveLink = await subPage.$eval('a[href*="drive.google.com"], a[href*="docs.google.com"]', el => el.href).catch(() => null);
          
          if (driveLink) {
            allLinks.push({
              link: driveLink,
              quality: item.quality,
              size: item.size
            });
          }
          
          await subPage.close();
        } catch (e) {
          console.log("Subpage error:", e.message);
        }
      }
    }
    
    // Process and filter links
    const processedLinks = [];
    const seen = new Set();
    
    for (const link of allLinks) {
      if (!link.link || seen.has(link.link)) continue;
      
      // Parse size to check if <2GB
      let sizeMB = 0;
      const sizeText = link.size.toUpperCase();
      if (sizeText.includes("GB")) {
        sizeMB = parseFloat(sizeText) * 1024;
      } else if (sizeText.includes("MB")) {
        sizeMB = parseFloat(sizeText);
      } else {
        // If size unknown, still include (might be small)
        sizeMB = 500; // Assume 500MB
      }
      
      // Only include if size < 2GB
      if (sizeMB <= 2048) {
        processedLinks.push({
          link: link.link,
          quality: normalizeQuality(link.quality),
          size: link.size || "~500MB"
        });
        seen.add(link.link);
      }
    }
    
    return processedLinks;
    
  } catch (error) {
    console.error("Get links error:", error);
    return [];
  } finally {
    await browser.close();
  }
}

// -----------------------------
// Main Command - Search
// -----------------------------
cmd({
  pattern: "film",
  alias: ["sinhalasub", "movies", "cinema", "gdrive", "gd"],
  react: "🎬",
  desc: "Search and download Sinhala subbed movies from Cinesubz.lk",
  category: "download",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  
  if (!q) {
    return reply(`*🎬 Movie Downloader*\n\nUsage: .film <movie name>\nExample: .film avengers\nExample: .film jawan\nExample: .film leo`);
  }
  
  reply("*🔍 Searching Cinesubz.lk for:* `" + q + "`");
  
  try {
    const results = await searchMovies(q);
    
    if (!results || results.length === 0) {
      return reply("*❌ No movies found! Try a different name.*");
    }
    
    pendingSearch[sender] = {
      results: results,
      timestamp: Date.now()
    };
    
    let msg = "*🎬 CINESUBZ.LK - MOVIES FOUND:*\n\n";
    results.forEach((movie, i) => {
      msg += `*${i+1}.* ${movie.title}\n`;
      msg += `   📝 *Lang:* ${movie.language || "Sinhala Sub"}\n`;
      msg += `   📊 *Quality:* ${movie.quality || "N/A"}\n`;
      msg += `   🎞️ *Format:* ${movie.qty || "MP4"}\n\n`;
    });
    msg += `*✅ Reply with number (1-${results.length}) to get details*`;
    
    await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    
  } catch (error) {
    console.error(error);
    reply("*❌ Search failed! Try again later.*");
  }
});

// -----------------------------
// Filter 1 - Select Movie
// -----------------------------
cmd({
  filter: (text, { sender }) => {
    return pendingSearch[sender] && 
           !isNaN(text) && 
           parseInt(text) > 0 && 
           parseInt(text) <= pendingSearch[sender].results.length;
  }
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  
  await maliya.sendMessage(from, { react: { text: "✅", key: m.key } });
  
  const index = parseInt(body) - 1;
  const selected = pendingSearch[sender].results[index];
  delete pendingSearch[sender];
  
  reply(`*📥 Getting details for:*\n${selected.title}`);
  
  try {
    const metadata = await getMovieMetadata(selected.movieUrl);
    
    let details = `*🎬 ${metadata.title || selected.title}*\n\n`;
    details += `*📝 Language:* ${metadata.language || selected.language || "Sinhala Sub"}\n`;
    details += `*⏱️ Duration:* ${metadata.duration || "N/A"}\n`;
    details += `*⭐ IMDb:* ${metadata.imdb || "N/A"}\n`;
    details += `*🎭 Genres:* ${metadata.genres?.join(", ") || "N/A"}\n`;
    details += `*🎥 Directors:* ${metadata.directors?.join(", ") || "N/A"}\n`;
    details += `*🌟 Stars:* ${metadata.stars?.slice(0, 3).join(", ") || "N/A"}\n\n`;
    details += `*🔍 Fetching Google Drive links...*\n*⏳ Please wait...*`;
    
    await maliya.sendMessage(from, { text: details }, { quoted: mek });
    
    // Get Google Drive links
    const driveLinks = await getGoogleDriveLinks(selected.movieUrl);
    
    if (!driveLinks || driveLinks.length === 0) {
      return reply("*❌ No Google Drive links found!\n\nReason:*\n• Movie might be removed\n• Links are expired\n• File size >2GB\n\n*Try another movie.*");
    }
    
    // Store for quality selection
    pendingQuality[sender] = {
      movie: {
        title: metadata.title || selected.title,
        links: driveLinks
      },
      timestamp: Date.now()
    };
    
    let qualityMsg = `*📥 AVAILABLE (Google Drive):*\n\n`;
    qualityMsg += `*🎬 ${metadata.title || selected.title}*\n\n`;
    
    driveLinks.forEach((link, i) => {
      qualityMsg += `*${i+1}.* *${link.quality}*\n`;
      qualityMsg += `   💾 Size: ${link.size || "~500MB"}\n\n`;
    });
    
    qualityMsg += `*✅ Reply with quality number (1-${driveLinks.length})*\n`;
    qualityMsg += `*📤 Movie will be sent as Document*`;
    
    await maliya.sendMessage(from, { text: qualityMsg }, { quoted: mek });
    
  } catch (error) {
    console.error(error);
    reply("*❌ Failed to get movie details!*");
  }
});

// -----------------------------
// Filter 2 - Select Quality & Send
// -----------------------------
cmd({
  filter: (text, { sender }) => {
    return pendingQuality[sender] && 
           !isNaN(text) && 
           parseInt(text) > 0 && 
           parseInt(text) <= pendingQuality[sender].movie.links.length;
  }
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  
  await maliya.sendMessage(from, { react: { text: "✅", key: m.key } });
  
  const index = parseInt(body) - 1;
  const data = pendingQuality[sender];
  const selected = data.movie.links[index];
  const movieTitle = data.movie.title;
  
  delete pendingQuality[sender];
  
  reply(`*⬇️ Preparing ${selected.quality}...*\n*💾 Size:* ${selected.size || "Unknown"}\n*☁️ Source:* Google Drive\n*⏳ Sending as document...*`);
  
  try {
    // Get direct download URL
    const directUrl = getDirectGoogleDriveUrl(selected.link);
    
    if (!directUrl) {
      return reply("*❌ Cannot generate download link!*\n\n🔗 Direct Link:\n" + selected.link);
    }
    
    // Clean filename
    const cleanTitle = movieTitle.replace(/[^\w\s]/gi, '').substring(0, 40).trim();
    const fileName = `${cleanTitle} - ${selected.quality}.mp4`;
    
    // Send as document
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype: "video/mp4",
      fileName: fileName,
      caption: `*🎬 ${movieTitle}*\n` +
               `*📊 Quality:* ${selected.quality}\n` +
               `*💾 Size:* ${selected.size || "Unknown"}\n` +
               `*☁️ Source:* Google Drive\n\n` +
               `*✅ Downloaded via MALIYA-MD Bot*\n` +
               `*🍿 Enjoy your movie!*`
    }, { quoted: mek });
    
    await maliya.sendMessage(from, { react: { text: "📤", key: m.key } });
    
  } catch (error) {
    console.error("Send error:", error);
    
    // Fallback: Send direct link
    reply(`*❌ Cannot send as document!*\n\n*🔗 Direct Download Link:*\n${selected.link}\n\n*📱 Copy and open in browser.*`);
  }
});

// -----------------------------
// Cleanup old sessions
// -----------------------------
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000; // 10 mins
  
  for (const s in pendingSearch) {
    if (now - pendingSearch[s].timestamp > timeout) delete pendingSearch[s];
  }
  for (const s in pendingQuality) {
    if (now - pendingQuality[s].timestamp > timeout) delete pendingQuality[s];
  }
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
