const { writeFileSync } = require('fs');
const { default: ffmpeg } = require('fluent-ffmpeg');
const { join } = require('path');

async function createSticker(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const tempFile = join(__dirname, '../temp/sticker.webp');
      ffmpeg(buffer)
        .inputFormat('image2pipe')
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
          '-lossless', '1',
          '-compression_level', '6',
          '-q:v', '50'
        ])
        .toFormat('webp')
        .save(tempFile)
        .on('end', () => {
          const data = require('fs').readFileSync(tempFile);
          resolve(data);
        });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { createSticker };
