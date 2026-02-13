const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

// -----------------------------
// Quality Normalize
// -----------------------------
function normalizeQuality(text) {
  if (!text) return null;
  text = text.toUpperCase();
  if (/1080|FHD/.test(text)) return "1080p";
  if (/720|HD/.test(text)) return "720p";
  if (/480|SD/.test(text)) return "480p";
  return text;
}

// -----------------------------
// Google Drive Direct Link Generator
// -----------------------------
function getDirectDownloadUrl(url) {
  if (!url) return null;
  
  // Google Drive
  if (url.includes("drive.google.com")) {
    const fileId = url.match(/\/d\/(.*?)\/|\/file\/d\/(.*?)\/|id=(.*?)&|id=(.*?)$/)?.[1] || 
                  url.match(/\/d\/(.*?)\/|\/file\/d\/(.*?)\/|id=(.*?)&|id=(.*?)$/)?.[2] ||
                  url.match(/\/d\/(.*?)\/|\/file\/d\/(.*?)\/|id=(.*?)&|id=(.*?)$/)?.[3] ||
                  url.match(/\/d\/(.*?)\/|\/file\/d\/(.*?)\/|id=(.*?)&|id=(.*?)$/)?.[4];
    
    if (fileId) {
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
  }
  
  // Direct Links (cinesubz.lk own download)
  if (url.includes("cinesubz.lk/download") || url.includes("direct")) {
    return url;
  }
  
  return url;
}

// -----------------------------
// Search Movies from Cinesubz.lk
// -----------------------------
async function searchMovies(query) {
  const searchUrl = `https://cinesubz.lk/?s=${encodeURIComponent(query)}`;
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  
  const page = await browser.newPage();
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
  
  const results = await page.$$eval(".display-item .item-box", boxes =>
    boxes.slice(0, 10).map((box, index) => {
      const a = box.querySelector("a");
      const img = box.querySelector(".thumb");
      const lang = box.querySelector(".item-desc-giha .language")?.textContent || "";
      const quality = box.querySelector(".item-desc-giha .quality")?.textContent || "";
      const qty = box.querySelector(".item-desc-giha .qty")?.textContent || "";
      
      return {
        id: index + 1,
        title: a?.title?.trim() || "",
        movieUrl: a?.href || "",
        thumb: img?.src || "",
        language: lang.trim(),
        quality: quality.trim(),
        qty: qty.trim(),
      };
    }).filter(m => m.title && m.movieUrl)
  );
  
  await browser.close();
  return results;
}

// -----------------------------
// Get Movie Metadata (Details)
// -----------------------------
async function getMovieMetadata(url) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  
  const metadata = await page.evaluate(() => {
    const getText = el => el?.textContent?.trim() || "";
    const getList = selector => Array.from(document.querySelectorAll(selector)).map(el => el.textContent.trim());
    
    const title = getText(document.querySelector(".info-details .details-title h3"));
    let language = "", directors = [], stars = [];
    
    document.querySelectorAll(".info-col p").forEach(p => {
      const strong = p.querySelector("strong");
      if (!strong) return;
      const txt = strong.textContent.trim();
      
      if (txt.includes("Language:")) {
        language = strong.nextSibling?.textContent?.trim() || "";
      }
      if (txt.includes("Director:")) {
        directors = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
      }
      if (txt.includes("Stars:")) {
        stars = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
      }
    });
    
    const duration = getText(document.querySelector(".info-details .data-views[itemprop='duration']"));
    const imdb = getText(document.querySelector(".info-details .data-imdb"))?.replace("IMDb:", "").trim();
    const genres = getList(".details-genre a");
    const thumbnail = document.querySelector(".splash-bg img")?.src || "";
    
    return { title, language, duration, imdb, genres, directors, stars, thumbnail };
  });
  
  await browser.close();
  return metadata;
}

// -----------------------------
// Get Download Links (Google Drive + Direct)
// -----------------------------
async function getDownloadLinks(movieUrl) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  
  const page = await browser.newPage();
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 60000 });

  // cinesubz.lk නව Layout එකට අනුව Selectors
  const linksData = await page.$$eval(".link-box, .download-links tbody tr, .pixeldrain-link, .drive-link", (boxes) => {
    return boxes.map(box => {
      // Quality
      let quality = box.querySelector(".quality")?.textContent?.trim() || 
                   box.querySelector("td:nth-child(1)")?.textContent?.trim() || "";
      
      // Size
      let size = box.querySelector(".size")?.textContent?.trim() || 
                box.querySelector("td:nth-child(3) span")?.textContent?.trim() ||
                box.querySelector("td:nth-child(2)")?.textContent?.trim() || "";
      
      // Links - Google Drive, Direct, etc.
      let pageLink = "";
      const selectors = [
        "a[href*='drive.google.com']",
        "a[href*='docs.google.com']",
        "a[href*='cinesubz.lk/download']",
        "a[href*='direct']",
        ".link-opt a",
        "td:nth-child(2) a"
      ];
      
      for (const sel of selectors) {
        const a = box.querySelector(sel);
        if (a?.href) {
          pageLink = a.href;
          break;
        }
      }
      
      return {
        quality,
        size,
        pageLink
      };
    }).filter(item => item.pageLink);
  });

  const downloadLinks = [];

  for (const l of linksData) {
    try {
      let finalUrl = null;
      let sizeMB = 0;
      
      // Size Parse කරලා MB වලට හරවන්න
      const sizeText = l.size.toUpperCase();
      if (sizeText.includes("GB")) {
        sizeMB = parseFloat(sizeText) * 1024;
      } else if (sizeText.includes("MB")) {
        sizeMB = parseFloat(sizeText);
      }
      
      // 2GB ට අඩු Links පමණක් ගන්න
      if (sizeMB > 0 && sizeMB > 2048) {
        console.log(`Skipping ${l.quality} - ${l.size} (>2GB)`);
        continue;
      }

      // Google Drive or Direct Link
      if (l.pageLink.includes("drive.google.com") || l.pageLink.includes("docs.google.com")) {
        finalUrl = l.pageLink;
      } else {
        // Sub Page එකට ගිහින් Link එක හොයන්න
        const subPage = await browser.newPage();
        await subPage.goto(l.pageLink, { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000)); // Wait for page load
        
        // Google Drive Link එක හොයන්න
        finalUrl = await subPage.$eval("a[href*='drive.google.com']", el => el.href).catch(() => null);
        
        // Direct Link එක හොයන්න
        if (!finalUrl) {
          finalUrl = await subPage.$eval("a[href*='cinesubz.lk/download'], a[href*='direct']", el => el.href).catch(() => null);
        }
        
        await subPage.close();
      }

      if (finalUrl) {
        downloadLinks.push({
          link: finalUrl,
          quality: normalizeQuality(l.quality || "Unknown"),
          size: l.size || "Unknown"
        });
      }
      
    } catch (e) {
      console.log("Link extraction error:", e.message);
      continue;
    }
  }

  await browser.close();
  
  // Remove duplicates
  const uniqueLinks = [];
  const seen = new Set();
  
  for (const link of downloadLinks) {
    if (!seen.has(link.link)) {
      seen.add(link.link);
      uniqueLinks.push(link);
    }
  }
  
  return uniqueLinks;
}

// -----------------------------
// Main Command - Search Movies
// -----------------------------
cmd({
  pattern: "film",
  alias: ["sinhalasub", "films", "cinema", "movie", "gd", "gdrive"],
  react: "🎬",
  desc: "Search and download Sinhala subbed movies from Cinesubz.lk",
  category: "download",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  
  if (!q) {
    return reply(`*🎬 Movie Search Plugin*\n\nUsage: .film <movie name>\nExample: .film avengers\nExample: .film jawan`);
  }
  
  reply("*🔍 Searching for movies from Cinesubz.lk...*");
  
  try {
    const searchResults = await searchMovies(q);
    
    if (!searchResults.length) {
      return reply("*❌ No movies found! Try another name.*");
    }
    
    pendingSearch[sender] = { 
      results: searchResults, 
      timestamp: Date.now() 
    };
    
    let text = "*🎬 CINESUBZ.LK - SEARCH RESULTS:*\n\n";
    text += `*🔎 Query:* ${q}\n*📊 Results:* ${searchResults.length}\n\n`;
    
    searchResults.forEach((m, i) => {
      text += `*${i+1}.* ${m.title}\n`;
      text += `   📝 *Language:* ${m.language || "N/A"}\n`;
      text += `   📊 *Quality:* ${m.quality || "N/A"}\n`;
      text += `   🎞️ *Format:* ${m.qty || "N/A"}\n\n`;
    });
    
    text += `*✅ Reply with movie number (1-${searchResults.length})*`;
    
    await maliya.sendMessage(from, { 
      image: { url: searchResults[0]?.thumb || "" }, 
      caption: text 
    }, { quoted: mek }).catch(() => {
      maliya.sendMessage(from, { text: text }, { quoted: mek });
    });
    
  } catch (error) {
    console.error("Search error:", error);
    reply(`*❌ Search failed:* ${error.message}`);
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
  
  await maliya.sendMessage(from, { 
    react: { text: "✅", key: m.key } 
  });
  
  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  delete pendingSearch[sender];
  
  reply(`*📥 Fetching movie details for:*\n${selected.title}`);
  
  try {
    const metadata = await getMovieMetadata(selected.movieUrl);
    
    let msg = `*🎬 ${metadata.title || selected.title}*\n\n`;
    msg += `*📝 Language:* ${metadata.language || selected.language || "N/A"}\n`;
    msg += `*⏱️ Duration:* ${metadata.duration || "N/A"}\n`;
    msg += `*⭐ IMDb:* ${metadata.imdb || "N/A"}\n`;
    msg += `*🎭 Genres:* ${metadata.genres?.join(", ") || "N/A"}\n`;
    msg += `*🎥 Directors:* ${metadata.directors?.join(", ") || "N/A"}\n`;
    msg += `*🌟 Stars:* ${metadata.stars?.slice(0,5).join(", ") || "N/A"}${metadata.stars?.length > 5 ? "..." : ""}\n\n`;
    msg += "*🔗 Fetching download links from Google Drive...*\n*⏳ Please wait...*";
    
    if (metadata.thumbnail) {
      await maliya.sendMessage(from, { 
        image: { url: metadata.thumbnail }, 
        caption: msg 
      }, { quoted: mek });
    } else {
      await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    }
    
    const downloadLinks = await getDownloadLinks(selected.movieUrl);
    
    if (!downloadLinks.length) {
      return reply("*❌ No download links found! (Maybe file >2GB or link expired)*");
    }
    
    pendingQuality[sender] = { 
      movie: { 
        metadata: metadata.title ? metadata : selected, 
        downloadLinks 
      }, 
      timestamp: Date.now() 
    };
    
    let qualityMsg = "*📥 AVAILABLE QUALITIES (≤2GB):*\n\n";
    
    downloadLinks.forEach((d, i) => {
      qualityMsg += `*${i+1}.* ${d.quality} - ${d.size}\n`;
      qualityMsg += `   🔗 ${d.link.includes("drive.google") ? "Google Drive" : "Direct Link"}\n\n`;
    });
    
    qualityMsg += `*✅ Reply with quality number (1-${downloadLinks.length})*\n`;
    qualityMsg += `*📤 Movie will be sent as Document (MP4)*`;
    
    await maliya.sendMessage(from, { text: qualityMsg }, { quoted: mek });
    
  } catch (error) {
    console.error("Metadata error:", error);
    reply(`*❌ Failed to get movie details:* ${error.message}`);
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
           parseInt(text) <= pendingQuality[sender].movie.downloadLinks.length;
  }
}, async (maliya, mek, m, { body, sender, reply, from }) => {
  
  await maliya.sendMessage(from, { 
    react: { text: "✅", key: m.key } 
  });
  
  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];
  
  const selectedLink = movie.downloadLinks[index];
  
  reply(`*⬇️ Preparing ${selectedLink.quality}...*\n*📦 Size:* ${selectedLink.size}\n*☁️ Source:* ${selectedLink.link.includes("drive.google") ? "Google Drive" : "Direct"}\n*⏳ Please wait...*`);
  
  try {
    // Get direct download URL
    const directUrl = getDirectDownloadUrl(selectedLink.link);
    
    if (!directUrl) {
      return reply("*❌ Failed to generate download link!*");
    }
    
    // Clean filename
    const movieTitle = (movie.metadata?.title || "Movie").substring(0, 50);
    const cleanTitle = movieTitle.replace(/[^\w\s.-]/gi, '').trim();
    const fileName = `${cleanTitle} - ${selectedLink.quality}.mp4`;
    
    // Send as document
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype: "video/mp4",
      fileName: fileName,
      caption: `*🎬 ${movie.metadata?.title || "Movie"}*\n` +
               `*📊 Quality:* ${selectedLink.quality}\n` +
               `*💾 Size:* ${selectedLink.size}\n` +
               `*☁️ Source:* Google Drive\n\n` +
               `*✅ Downloaded via MALIYA-MD Bot*\n` +
               `*🍿 Enjoy your movie!*`
    }, { quoted: mek });
    
    // Send success reaction
    await maliya.sendMessage(from, { 
      react: { text: "📤", key: m.key } 
    });
    
  } catch (error) {
    console.error("Send document error:", error);
    
    // Try alternative method if document fails
    if (selectedLink.link.includes("drive.google.com")) {
      reply(`*❌ Document send failed!*\n\n*🔗 Direct Link:*\n${selectedLink.link}\n\n*📱 Copy and open in browser.*`);
    } else {
      reply(`*❌ Failed to send movie:* ${error.message || "Unknown error"}`);
    }
  }
});

// -----------------------------
// Cleanup - Remove expired sessions
// -----------------------------
setInterval(() => {
  const now = Date.now();
  const timeout = 10 * 60 * 1000; // 10 minutes
  
  for (const s in pendingSearch) {
    if (now - pendingSearch[s].timestamp > timeout) {
      delete pendingSearch[s];
    }
  }
  
  for (const s in pendingQuality) {
    if (now - pendingQuality[s].timestamp > timeout) {
      delete pendingQuality[s];
    }
  }
  
}, 5 * 60 * 1000); // Every 5 minutes

module.exports = { 
  pendingSearch, 
  pendingQuality,
  searchMovies,
  getMovieMetadata,
  getDownloadLinks
};
