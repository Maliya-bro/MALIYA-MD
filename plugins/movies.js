const { cmd } = require("../command");
const lk21dl = require('lk21dl-core');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const path = require('path');

const pipelineAsync = promisify(pipeline);

// Create downloads directory if it doesn't exist
const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/* ============ MOVIE DOWNLOAD COMMAND ============ */
cmd(
  {
    pattern: "movie",
    react: "🎬",
    desc: "Download movies from LK21",
    category: "download",
    filename: __filename,
    use: ".movie <lk21-url>",
  },
  async (sock, mek, m, { from, sender, pushname, reply, args }) => {
    try {
      // Send initial reaction
      await sock.sendMessage(from, { react: { text: "🎬", key: mek.key } });

      // Check if URL is provided
      if (!args || args.length === 0) {
        return reply(`❌ Please provide an LK21 movie URL.\n\nExample:\n.movie https://tv.lk21official.us/movie-name`);
      }

      const movieUrl = args[0];
      
      // Validate URL
      if (!movieUrl.includes('lk21') && !movieUrl.includes('tv.lk21official.us')) {
        return reply('❌ Please provide a valid LK21 movie URL.');
      }

      // Send processing message
      await reply(`🎬 *Processing movie download...*\n\n📥 URL: ${movieUrl}\n⏳ Please wait...`);

      // Generate filename from URL
      const urlParts = movieUrl.split('/');
      const movieName = urlParts[urlParts.length - 1] || 'movie';
      const outputPath = path.join(DOWNLOAD_DIR, `${movieName}.mp4`);

      // Download the movie
      const stream = await lk21dl(movieUrl, outputPath);
      
      // Send progress notification
      await reply(`📥 *Downloading...*\n🎬 Movie: ${movieName}\n⏳ This may take a few minutes.`);

      // Pipe the stream to file
      const writeStream = fs.createWriteStream(outputPath);
      await pipelineAsync(stream, writeStream);

      // Check if file was created
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        // Send success message
        await reply(`✅ *Download Complete!*\n\n🎬 Movie: ${movieName}\n📦 Size: ${fileSizeMB} MB\n📁 Saved to: ${outputPath}`);

        // Optional: Send the file to WhatsApp (if under 100MB limit)
        if (stats.size < 100 * 1024 * 1024) {
          await sock.sendMessage(from, {
            document: fs.readFileSync(outputPath),
            mimetype: 'video/mp4',
            fileName: `${movieName}.mp4`,
            caption: `🎬 *${movieName}*\n📦 Size: ${fileSizeMB} MB\n\n✨ Downloaded using ${BOT_NAME}`,
          });
        } else {
          await reply(`📁 File too large (${fileSizeMB}MB) to send via WhatsApp. Saved to server: ${outputPath}`);
        }
      } else {
        throw new Error('File not created');
      }

    } catch (error) {
      console.error('MOVIE ERROR:', error);
      
      let errorMessage = '❌ Movie download failed. ';
      
      if (error.message.includes('iframe')) {
        errorMessage += 'Could not find video iframe. The URL might be invalid or the site structure changed.';
      } else if (error.message.includes('FFmpeg')) {
        errorMessage += 'FFmpeg is not installed or not in PATH. Please install FFmpeg.';
      } else if (error.message.includes('ENOENT')) {
        errorMessage += 'File system error. Check permissions.';
      } else {
        errorMessage += error.message;
      }
      
      reply(errorMessage);
    }
  }
);

/* ============ DOWNLOAD STATUS COMMAND ============ */
cmd(
  {
    pattern: "downloads",
    react: "📂",
    desc: "List downloaded movies",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📂", key: mek.key } });

      if (!fs.existsSync(DOWNLOAD_DIR)) {
        return reply('📂 No downloads folder found.');
      }

      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.mp4'));
      
      if (files.length === 0) {
        return reply('📂 No movies downloaded yet.');
      }

      let list = `📂 *Downloaded Movies*\n━━━━━━━━━━━━━━━━━━\n\n`;
      
      files.forEach((file, index) => {
        const stats = fs.statSync(path.join(DOWNLOAD_DIR, file));
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        list += `${index + 1}. ${file}\n   📦 ${sizeMB} MB\n`;
        list += `   📅 ${stats.mtime.toLocaleDateString()}\n\n`;
      });

      list += `━━━━━━━━━━━━━━━━━━\n📁 Total: ${files.length} files`;
      
      reply(list);
    } catch (error) {
      console.error('DOWNLOADS ERROR:', error);
      reply('❌ Failed to list downloads.');
    }
  }
);
