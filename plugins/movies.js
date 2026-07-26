const { cmd } = require("../command");
const puppeteer = require("puppeteer");
const lk21dl = require('lk21dl-core');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { exec } = require('child_process');

const pipelineAsync = promisify(pipeline);
const execAsync = promisify(exec);

// ============ CONFIGURATION ============
const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ============ STATE MANAGEMENT ============
const pendingSearch = {};
const pendingQuality = {};
const pendingLK21 = {};

// ============ HELPER FUNCTIONS ============
function normalizeQuality(text) {
  if (!text) return null;
  text = text.toUpperCase();
  if (/1080|FHD/.test(text)) return "1080p";
  if (/720|HD/.test(text)) return "720p";
  if (/480|SD/.test(text)) return "480p";
  return text;
}

function getDirectPixeldrainUrl(url) {
  const match = url.match(/pixeldrain\.com\/u\/(\w+)/);
  if (!match) return null;
  return `https://pixeldrain.com/api/file/${match[1]}?download`;
}

function cleanFileName(name) {
  return name.replace(/[^\w\s.-]/gi, '').substring(0, 50);
}

// ============ SINHALASUB.LK FUNCTIONS ============
async function searchMovies(query) {
  const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}&post_type=movies`;
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  const page = await browser.newPage();
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
  
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

async function getMovieMetadata(url) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  
  const metadata = await page.evaluate(() => {
    const getText = el => el?.textContent.trim() || "";
    const getList = selector => Array.from(document.querySelectorAll(selector)).map(el => el.textContent.trim());
    const title = getText(document.querySelector(".info-details .details-title h3"));
    
    let language = "", directors = [], stars = [];
    document.querySelectorAll(".info-col p").forEach(p => {
      const strong = p.querySelector("strong");
      if (!strong) return;
      const txt = strong.textContent.trim();
      if (txt.includes("Language:")) language = strong.nextSibling?.textContent?.trim() || "";
      if (txt.includes("Director:")) directors = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
      if (txt.includes("Stars:")) stars = Array.from(p.querySelectorAll("a")).map(a => a.textContent.trim());
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

async function getPixeldrainLinks(movieUrl) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });
  const page = await browser.newPage();
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 30000 });
  
  const linksData = await page.$$eval(".link-pixeldrain tbody tr", rows =>
    rows.map(row => {
      const a = row.querySelector(".link-opt a");
      const quality = row.querySelector(".quality")?.textContent.trim() || "";
      const size = row.querySelector("td:nth-child(3) span")?.textContent.trim() || "";
      return { pageLink: a?.href || "", quality, size };
    })
  );
  
  const directLinks = [];
  for (const l of linksData) {
    try {
      const subPage = await browser.newPage();
      await subPage.goto(l.pageLink, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(r => setTimeout(r, 12000));
      const finalUrl = await subPage.$eval(".wait-done a[href^='https://pixeldrain.com/']", el => el.href).catch(() => null);
      if (finalUrl) {
        let sizeMB = 0;
        const sizeText = l.size.toUpperCase();
        if (sizeText.includes("GB")) sizeMB = parseFloat(sizeText) * 1024;
        else if (sizeText.includes("MB")) sizeMB = parseFloat(sizeText);
        if (sizeMB <= 2048) {
          directLinks.push({ link: finalUrl, quality: normalizeQuality(l.quality), size: l.size });
        }
      }
      await subPage.close();
    } catch (e) { continue; }
  }
  await browser.close();
  return directLinks;
}

// ============ LK21 FUNCTIONS ============
async function downloadLK21Movie(url, outputPath) {
  try {
    // Check if FFmpeg is installed
    try {
      await execAsync('ffmpeg -version');
    } catch {
      throw new Error('FFmpeg is not installed. Please install FFmpeg to download HLS streams.');
    }

    // Validate URL
    const urlObj = new URL(url);
    const allowedDomains = ['tv.lk21official.us', 'lk21official.us', 'lk21official.com'];
    if (!allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
      throw new Error('Invalid LK21 domain. Only lk21official domains are supported.');
    }

    const stream = await lk21dl(url, outputPath);
    return stream;
  } catch (error) {
    throw error;
  }
}

// ============ COMMAND: MOVIE SEARCH (SINHALASUB) ============
cmd({
  pattern: "movie",
  alias: ["sinhalasub", "films", "cinema"],
  react: "🎬",
  desc: "Search and send movies from Sinhalasub.lk",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply(`*🎬 Movie Search Plugin*\nUsage: movie <movie_name>\nExample: movie avengers`);
  
  await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });
  reply("*🔍 Searching for movies...*");
  
  const searchResults = await searchMovies(q);
  if (!searchResults.length) return reply("*❌ No movies found!*");
  
  pendingSearch[sender] = { results: searchResults, timestamp: Date.now() };
  
  let text = "*🎬 Search Results:*\n━━━━━━━━━━━━━━━━━━\n";
  searchResults.forEach((m, i) => {
    text += `*${i+1}.* ${m.title}\n`;
    text += `   📝 Language: ${m.language || 'N/A'}\n`;
    text += `   📊 Quality: ${m.quality || 'N/A'}\n`;
    text += `   🎞️ Format: ${m.qty || 'N/A'}\n\n`;
  });
  text += `━━━━━━━━━━━━━━━━━━\n*Reply with movie number (1-${searchResults.length})*`;
  
  reply(text);
});

// ============ COMMAND: MOVIE SELECTION HANDLER ============
cmd({
  filter: (text, { sender }) => {
    if (!pendingSearch[sender]) return false;
    const num = parseInt(text);
    return !isNaN(num) && num > 0 && num <= pendingSearch[sender].results.length;
  }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
  
  const index = parseInt(body.trim()) - 1;
  const selected = pendingSearch[sender].results[index];
  delete pendingSearch[sender];
  
  // Send metadata
  const metadata = await getMovieMetadata(selected.movieUrl);
  
  let msg = `*🎬 ${metadata.title || selected.title}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `*📝 Language:* ${metadata.language || 'N/A'}\n`;
  msg += `*⏱️ Duration:* ${metadata.duration || 'N/A'}\n`;
  msg += `*⭐ IMDb:* ${metadata.imdb || 'N/A'}\n`;
  msg += `*🎭 Genres:* ${metadata.genres?.join(", ") || 'N/A'}\n`;
  msg += `*🎥 Directors:* ${metadata.directors?.join(", ") || 'N/A'}\n`;
  msg += `*🌟 Stars:* ${metadata.stars?.slice(0,5).join(", ") || 'N/A'}${metadata.stars?.length > 5 ? "..." : ""}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += "*🔗 Fetching download links, please wait...*";
  
  if (metadata.thumbnail) {
    await danuwa.sendMessage(from, { 
      image: { url: metadata.thumbnail }, 
      caption: msg 
    }, { quoted: m });
  } else {
    await danuwa.sendMessage(from, { text: msg }, { quoted: m });
  }
  
  // Get download links
  const downloadLinks = await getPixeldrainLinks(selected.movieUrl);
  if (!downloadLinks.length) return reply("*❌ No download links found (<2GB)!*");
  
  pendingQuality[sender] = { 
    movie: { metadata, downloadLinks }, 
    timestamp: Date.now() 
  };
  
  let qualityMsg = "*📥 Available Qualities (Max 2GB):*\n";
  qualityMsg += `━━━━━━━━━━━━━━━━━━\n`;
  downloadLinks.forEach((d, i) => {
    qualityMsg += `*${i+1}.* ${d.quality || 'Unknown'} - ${d.size || 'N/A'}\n`;
  });
  qualityMsg += `━━━━━━━━━━━━━━━━━━\n`;
  qualityMsg += `*Reply with quality number to receive the movie.*`;
  
  await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: m });
});

// ============ COMMAND: QUALITY SELECTION HANDLER ============
cmd({
  filter: (text, { sender }) => {
    if (!pendingQuality[sender]) return false;
    const num = parseInt(text);
    return !isNaN(num) && num > 0 && num <= pendingQuality[sender].movie.downloadLinks.length;
  }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "⬇️", key: m.key } });
  
  const index = parseInt(body.trim()) - 1;
  const { movie } = pendingQuality[sender];
  delete pendingQuality[sender];
  
  const selectedLink = movie.downloadLinks[index];
  
  reply(`*⬇️ Sending ${selectedLink.quality || 'movie'} as document...*\n⏳ Please wait.`);
  
  try {
    const directUrl = getDirectPixeldrainUrl(selectedLink.link);
    if (!directUrl) throw new Error('Invalid Pixeldrain URL');
    
    const fileName = `${cleanFileName(movie.metadata.title || 'movie')} - ${selectedLink.quality || 'unknown'}.mp4`;
    
    await danuwa.sendMessage(from, {
      document: { url: directUrl },
      mimetype: "video/mp4",
      fileName: fileName,
      caption: `*🎬 ${movie.metadata.title || 'Movie'}*\n` +
               `*📊 Quality:* ${selectedLink.quality || 'Unknown'}\n` +
               `*💾 Size:* ${selectedLink.size || 'N/A'}\n\n` +
               `*Enjoy your movie! 🍿*`
    }, { quoted: m });
    
  } catch (error) {
    console.error("Send document error:", error);
    reply(`*❌ Failed to send movie:* ${error.message || "Unknown error"}`);
  }
});

// ============ COMMAND: LK21 MOVIE DOWNLOAD ============
cmd({
  pattern: "film",
  alias: ["lk21dl", "downloadmovie", "films", "movie", "movies"],
  react: "🎞️",
  desc: "Download movies from LK21",
  category: "download",
  filename: __filename,
  use: ".lk21 <lk21-url>"
}, async (danuwa, mek, m, { from, q, sender, reply, args }) => {
  if (!q || !args || args.length === 0) {
    return reply(`*🎞️ LK21 Movie Downloader*\n\nUsage:\n.lk21 <movie-url>\n\nExample:\n.lk21 https://tv.lk21official.us/the-family-plan-2023`);
  }

  await danuwa.sendMessage(from, { react: { text: "🎞️", key: m.key } });

  const movieUrl = args[0];
  
  // Validate URL
  if (!movieUrl.includes('lk21')) {
    return reply('❌ Please provide a valid LK21 movie URL.\n\nExample:\n.lk21 https://tv.lk21official.us/movie-name');
  }

  // Generate filename
  const urlParts = movieUrl.split('/');
  const movieName = urlParts[urlParts.length - 1] || 'movie';
  const outputPath = path.join(DOWNLOAD_DIR, `${movieName}.mp4`);

  // Check if file already exists
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Ask user if they want to re-download
    pendingLK21[sender] = { 
      url: movieUrl, 
      outputPath, 
      action: 'confirm',
      timestamp: Date.now() 
    };
    
    return reply(`⚠️ *Movie already exists!*\n\n📁 ${movieName}.mp4\n📦 Size: ${sizeMB} MB\n\n*Reply with:*\n1️⃣ - Download Again\n2️⃣ - Cancel`);
  }

  // Start download
  await startLK21Download(danuwa, from, sender, reply, m, movieUrl, outputPath, movieName);
});

// ============ LK21 DOWNLOAD HANDLER ============
async function startLK21Download(danuwa, from, sender, reply, m, movieUrl, outputPath, movieName) {
  try {
    reply(`🎬 *Starting LK21 Download...*\n\n📥 URL: ${movieUrl}\n📁 File: ${movieName}.mp4\n⏳ Please wait...\n\n*This may take a few minutes.*`);

    // Download the movie
    const stream = await downloadLK21Movie(movieUrl, outputPath);
    
    // Write to file
    const writeStream = fs.createWriteStream(outputPath);
    await pipelineAsync(stream, writeStream);

    // Check if file was created successfully
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      await danuwa.sendMessage(from, { 
        react: { text: "✅", key: m.key } 
      });

      // Send success message
      let successMsg = `✅ *Download Complete!*\n\n`;
      successMsg += `🎬 Movie: ${movieName}\n`;
      successMsg += `📦 Size: ${fileSizeMB} MB\n`;
      successMsg += `📁 Saved: ${outputPath}\n\n`;

      // If file is under 100MB, send it directly
      if (stats.size < 100 * 1024 * 1024) {
        successMsg += `📤 *Sending movie...*`;
        await danuwa.sendMessage(from, { text: successMsg }, { quoted: m });

        await danuwa.sendMessage(from, {
          document: fs.readFileSync(outputPath),
          mimetype: 'video/mp4',
          fileName: `${cleanFileName(movieName)}.mp4`,
          caption: `🎬 *${movieName}*\n📦 Size: ${fileSizeMB} MB\n\n✨ Downloaded using LK21 Downloader`
        }, { quoted: m });
      } else {
        successMsg += `📁 File is too large (${fileSizeMB}MB) to send via WhatsApp.\n`;
        successMsg += `💾 Saved to server: ${outputPath}`;
        await danuwa.sendMessage(from, { text: successMsg }, { quoted: m });
      }

      // Clean up old downloads (keep last 5)
      cleanOldDownloads();
    } else {
      throw new Error('File not created');
    }

  } catch (error) {
    console.error('LK21 DOWNLOAD ERROR:', error);
    
    let errorMessage = '❌ *LK21 Download Failed*\n\n';
    
    if (error.message.includes('FFmpeg')) {
      errorMessage += 'FFmpeg is not installed. Please install FFmpeg:\n';
      errorMessage += '• Ubuntu: sudo apt install ffmpeg\n';
      errorMessage += '• macOS: brew install ffmpeg\n';
      errorMessage += '• Windows: choco install ffmpeg';
    } else if (error.message.includes('iframe')) {
      errorMessage += 'Could not find video iframe. The URL might be invalid or the site structure changed.';
    } else if (error.message.includes('domain')) {
      errorMessage += 'Invalid domain. Only lk21official domains are supported.';
    } else {
      errorMessage += error.message;
    }
    
    reply(errorMessage);
  }
}

// ============ LK21 CONFIRMATION HANDLER ============
cmd({
  filter: (text, { sender }) => {
    if (!pendingLK21[sender]) return false;
    const num = parseInt(text);
    return !isNaN(num) && (num === 1 || num === 2);
  }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
  await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });
  
  const choice = parseInt(body.trim());
  const data = pendingLK21[sender];
  
  if (choice === 1) {
    // Re-download
    const movieName = path.basename(data.outputPath, '.mp4');
    await startLK21Download(danuwa, from, sender, reply, m, data.url, data.outputPath, movieName);
  } else {
    // Cancel
    reply('❌ Download cancelled.');
  }
  
  delete pendingLK21[sender];
});

// ============ COMMAND: LIST DOWNLOADS ============
cmd({
  pattern: "downloads",
  react: "📂",
  desc: "List downloaded movies",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, sender, reply }) => {
  await danuwa.sendMessage(from, { react: { text: "📂", key: m.key } });

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    return reply('📂 No downloads folder found.');
  }

  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => f.endsWith('.mp4'))
    .sort((a, b) => {
      const statsA = fs.statSync(path.join(DOWNLOAD_DIR, a));
      const statsB = fs.statSync(path.join(DOWNLOAD_DIR, b));
      return statsB.mtime - statsA.mtime;
    });

  if (files.length === 0) {
    return reply('📂 No movies downloaded yet.');
  }

  let list = `📂 *Downloaded Movies*\n━━━━━━━━━━━━━━━━━━\n\n`;
  
  files.forEach((file, index) => {
    const filePath = path.join(DOWNLOAD_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    list += `${index + 1}. ${file}\n`;
    list += `   📦 ${sizeMB} MB\n`;
    list += `   📅 ${stats.mtime.toLocaleDateString()}\n`;
    list += `   🕐 ${stats.mtime.toLocaleTimeString()}\n\n`;
  });

  list += `━━━━━━━━━━━━━━━━━━\n`;
  list += `📁 Total: ${files.length} files\n`;
  list += `💾 Total Size: ${getTotalDownloadSize(files)} MB`;
  
  reply(list);
});

// ============ HELPER: GET TOTAL SIZE ============
function getTotalDownloadSize(files) {
  let total = 0;
  files.forEach(file => {
    const stats = fs.statSync(path.join(DOWNLOAD_DIR, file));
    total += stats.size / (1024 * 1024);
  });
  return total.toFixed(2);
}

// ============ HELPER: CLEAN OLD DOWNLOADS ============
function cleanOldDownloads() {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(f => ({
        name: f,
        path: path.join(DOWNLOAD_DIR, f),
        stats: fs.statSync(path.join(DOWNLOAD_DIR, f))
      }))
      .sort((a, b) => a.stats.mtime - b.stats.mtime);

    // Keep only last 5 files
    if (files.length > 5) {
      const toDelete = files.slice(0, files.length - 5);
      toDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`Deleted old download: ${file.name}`);
      });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// ============ COMMAND: DELETE DOWNLOAD ============
cmd({
  pattern: "deletedl",
  alias: ["rmdl", "removemovie"],
  react: "🗑️",
  desc: "Delete a downloaded movie",
  category: "download",
  filename: __filename,
  use: ".deletedl <file-number>"
}, async (danuwa, mek, m, { from, q, sender, reply, args }) => {
  if (!q) return reply(`🗑️ *Delete Movie*\n\nUsage:\n.deletedl <file-number>\n\nExample:\n.deletedl 1`);

  await danuwa.sendMessage(from, { react: { text: "🗑️", key: m.key } });

  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => f.endsWith('.mp4'))
    .sort((a, b) => {
      const statsA = fs.statSync(path.join(DOWNLOAD_DIR, a));
      const statsB = fs.statSync(path.join(DOWNLOAD_DIR, b));
      return statsB.mtime - statsA.mtime;
    });

  const index = parseInt(args[0]) - 1;
  if (isNaN(index) || index < 0 || index >= files.length) {
    return reply(`❌ Invalid file number. Use .downloads to see the list.`);
  }

  const fileName = files[index];
  const filePath = path.join(DOWNLOAD_DIR, fileName);
  
  fs.unlinkSync(filePath);
  reply(`✅ Deleted: ${fileName}`);
});

// ============ COMMAND: CHECK FFMPEG ============
cmd({
  pattern: "checkffmpeg",
  react: "🔧",
  desc: "Check if FFmpeg is installed",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, sender, reply }) => {
  await danuwa.sendMessage(from, { react: { text: "🔧", key: m.key } });
  
  try {
    const result = await execAsync('ffmpeg -version');
    const version = result.stdout.split('\n')[0];
    
    reply(`✅ *FFmpeg is installed*\n\n${version}\n\n✨ LK21 downloads are ready!`);
  } catch {
    reply(`❌ *FFmpeg is NOT installed*\n\nPlease install FFmpeg:\n• Ubuntu: sudo apt install ffmpeg\n• macOS: brew install ffmpeg\n• Windows: choco install ffmpeg`);
  }
});

// ============ AUTO CLEANUP ============
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
  for (const s in pendingLK21) {
    if (now - pendingLK21[s].timestamp > timeout) {
      delete pendingLK21[s];
    }
  }
}, 5 * 60 * 1000);

// ============ EXPORTS ============
module.exports = { 
  pendingSearch, 
  pendingQuality, 
  pendingLK21 
};
