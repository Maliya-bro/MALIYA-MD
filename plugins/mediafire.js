// plugins/mediafire_dl.js
// Download files from MediaFire links (supports all file types: .exe, .rar, .zip, .apk, etc.)

const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Helper: Generate temp file path ──────────────────────
function makeTempFile(ext = "") {
  const id = crypto.randomBytes(8).toString("hex");
  return path.join(TEMP_DIR, `${Date.now()}_${id}${ext}`);
}

// ── Helper: Clean filename ───────────────────────────────
function sanitizeFileName(name) {
  return String(name || "file")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim() || "file";
}

// ── Helper: Get file extension ────────────────────────────
function getFileExtension(filename = "") {
  const ext = path.extname(filename).toLowerCase();
  return ext || ".bin";
}

// ── Helper: Get mime type from extension ──────────────────
function getMimeType(filename = "") {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.exe': 'application/x-msdownload',
    '.rar': 'application/vnd.rar',
    '.zip': 'application/zip',
    '.7z': 'application/x-7z-compressed',
    '.apk': 'application/vnd.android.package-archive',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.iso': 'application/x-iso9660-image',
    '.img': 'application/x-iso9660-image',
    '.msi': 'application/x-msi',
    '.deb': 'application/vnd.debian.binary-package',
    '.rpm': 'application/x-rpm',
    '.dmg': 'application/x-apple-diskimage',
    '.pkg': 'application/x-newton-compatible-pkg',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// ── Helper: Parse MediaFire URL ──────────────────────────
function parseKey(url) {
  const m = url.match(/mediafire\.com\/file\/([a-z0-9]+)/);
  return m ? m[1] : null;
}

function deduplicateName(raw) {
  const clean = String(raw || "").trim().replace(/\s+/g, " ");
  const half = Math.ceil(clean.length / 2);
  const first = clean.slice(0, half);
  const second = clean.slice(half).trim();
  return second.startsWith(first.trim()) ? first.trim() : clean;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

// ── Helper: Try page extraction ──────────────────────────
async function tryPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const link = $('a#downloadButton').attr('href') || $('a.input').attr('href');
  if (!link) throw new Error('Download link not found on page');
  const name = deduplicateName($('div.filename').text() || $('div.file-name').text() || '');
  const size = $('ul.details li').first().text().replace('File size:', '').trim();
  return { link, name, size };
}

// ── Helper: Try API extraction ────────────────────────────
async function tryAPI(key) {
  const res = await axios.get(
    `https://www.mediafire.com/api/1.5/file/get_links.php?quick_key=${key}&link_type=normal_download&response_format=json`,
    { headers: HEADERS, timeout: 15000 }
  );
  const data = res.data?.response;
  if (data?.result !== 'Success') throw new Error('API: ' + (data?.message || 'No result'));
  const dl = data?.links?.[0]?.normal_download;
  if (!dl) throw new Error('API: No download link');
  return dl;
}

// ── Main: Get MediaFire info ─────────────────────────────
async function getMediaFireInfo(url) {
  if (!url.includes('mediafire.com')) throw new Error('Invalid MediaFire URL');

  const key = parseKey(url);
  const errors = [];
  let info = null;

  try {
    info = await tryPage(url);
  } catch (e) {
    errors.push('Page: ' + e.message);
  }

  if (!info?.link && key) {
    try {
      const link = await tryAPI(key);
      info = { ...(info || {}), link };
    } catch (e) {
      errors.push('API: ' + e.message);
    }
  }

  if (!info?.link) {
    throw new Error('Could not get download link. Errors: ' + errors.join(' | '));
  }

  return {
    key: key || '',
    name: info.name || 'file',
    size: info.size || 'Unknown',
    download: info.link,
    url,
  };
}

// ── Helper: Download file from URL ────────────────────────
async function downloadFile(url, outputPath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    headers: HEADERS,
    timeout: 60000,
    maxRedirects: 5,
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}

// ── Helper: Get file size in MB ──────────────────────────
function getFileSizeMB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
  } catch {
    return 0;
  }
}

// ── Command: .mediafire / .mf ────────────────────────────
cmd(
  {
    pattern: "mediafire",
    alias: ["mf", "mfdl"],
    react: "📦",
    desc: "Download files from MediaFire (supports .exe, .rar, .zip, etc.)",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply }) => {
    try {
      if (!q) {
        return reply(
          "📦 *MediaFire Downloader*\n\n" +
          "Usage: `.mf <mediafire_link>`\n" +
          "Example: `.mf https://www.mediafire.com/file/abc123/file.zip`\n\n" +
          "📌 Supports all file types: .exe, .rar, .zip, .apk, .pdf, .mp3, .mp4, and more!"
        );
      }

      // Validate URL
      const url = q.trim();
      if (!url.includes('mediafire.com')) {
        return reply("❌ *Invalid URL.* Please provide a valid MediaFire link.");
      }

      await reply("⏳ *Fetching MediaFire file information...*");

      // Get file info
      const info = await getMediaFireInfo(url);

      if (!info.download) {
        return reply("❌ *Failed to get download link. Please check the URL and try again.*");
      }

      // Generate temp file name
      const originalName = info.name || 'file';
      const ext = getFileExtension(originalName);
      const tempFile = makeTempFile(ext);
      const cleanName = sanitizeFileName(originalName);

      await reply(`⬇️ *Downloading:* ${cleanName}\n📦 *Size:* ${info.size || 'Unknown'}\n⏳ Please wait...`);

      // Download file
      await downloadFile(info.download, tempFile);

      if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
        throw new Error("Downloaded file is empty or missing.");
      }

      const sizeMB = getFileSizeMB(tempFile);
      const mimeType = getMimeType(originalName);

      // Send as document
      await sock.sendMessage(
        from,
        {
          document: fs.readFileSync(tempFile),
          mimetype: mimeType,
          fileName: cleanName,
          caption: `📥 *MediaFire Download Complete*\n\n📄 *File:* ${cleanName}\n📦 *Size:* ${info.size || sizeMB.toFixed(2) + ' MB'}\n🔗 *Source:* MediaFire\n\n📌 *Powered by MALIYA-MD*`
        },
        { quoted: mek }
      );

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (_) {}

      // React with success
      try {
        await sock.sendMessage(from, { 
          react: { text: "✅", key: mek.key }
        });
      } catch (_) {}

    } catch (e) {
      console.log("MEDIAFIRE ERROR:", e?.message || e);
      
      // Clean up any temp files
      try {
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        for (const file of files) {
          const filePath = path.join(TEMP_DIR, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > 60000) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (_) {}

      if (e.message && e.message.includes('API')) {
        reply("❌ *MediaFire API error.* Please try again later or check the URL.");
      } else if (e.message && e.message.includes('Invalid')) {
        reply("❌ *Invalid MediaFire URL.* Please check and try again.");
      } else if (e.message && e.message.includes('timeout')) {
        reply("❌ *Download timeout.* The file may be too large. Please try again.");
      } else {
        reply(`❌ *Failed to download file.*\n\nError: ${e.message || 'Unknown error'}\n\nPlease try again later.`);
      }
    }
  }
);

// ── Auto cleanup temp files every 5 minutes ──────────────
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 300000) { // 5 minutes
        fs.unlinkSync(filePath);
      }
    }
  } catch (_) {}
}, 300000);

console.log("✅ MediaFire Download Plugin loaded! (Commands: .mediafire, .mf, .mfdl)");
