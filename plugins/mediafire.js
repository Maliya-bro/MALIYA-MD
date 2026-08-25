/**
 * ╔══════════════════════════════════════════════════════════════╗
 *   MALIYA-MD — MEDIAFIRE AUTO DOWNLOADER PLUGIN
 * ╚══════════════════════════════════════════════════════════════╝
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cmd } = require("../command"); // ES6 imports භාවිත කරයි නම් dynamic require/import භාවිත කරන්න

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

function parseKey(url) {
  const m = url.match(/mediafire\.com\/file\/([a-z0-9]+)/);
  return m ? m[1] : null;
}

function deduplicateName(raw) {
  const clean = raw.trim().replace(/\s+/g, ' ');
  const half = Math.ceil(clean.length / 2);
  const first = clean.slice(0, half);
  const second = clean.slice(half).trim();
  return second.startsWith(first.trim()) ? first.trim() : clean;
}

async function tryPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);
  const link = $('a#downloadButton').attr('href') || $('a.input').attr('href');
  if (!link) throw new Error('page: sin link de descarga');
  const name = deduplicateName($('div.filename').text());
  const size = $('ul.details li').first().text().replace('File size:', '').trim();
  return { link, name, size };
}

async function tryAPI(key) {
  const res = await axios.get(
    `https://www.mediafire.com/api/1.5/file/get_links.php?quick_key=${key}&link_type=normal_download&response_format=json`,
    { headers: HEADERS, timeout: 15000 }
  );
  const data = res.data?.response;
  if (data?.result !== 'Success') throw new Error('api: ' + (data?.message || 'sin resultado'));
  const dl = data?.links?.[0]?.normal_download;
  if (!dl) throw new Error('api: sin download link');
  return dl;
}

export async function mediafireInfo(url) {
  if (!url.includes('mediafire.com')) throw new Error('URL de MediaFire inválida');
  const key = parseKey(url);
  const errors = [];
  let info = null;
  try {
    info = await tryPage(url);
  } catch (e) { errors.push('page: ' + e.message); }
  if (!info?.link && key) {
    try {
      const link = await tryAPI(key);
      info = { ...(info || {}); link; }
    } catch (e) { errors.push('api: ' + e.message); }
  }
  if (!info?.link) throw new Error('No se pudo obtener el link. Errores: ' + errors.join(' | '));
  return {
    key: key || '',
    name: info.name || 'file',
    size: info.size || '',
    download: info.link,
    url,
  };
}

// -------------------------------------------------------------
// WHATSAPP BOT COMMAND
// -------------------------------------------------------------

cmd({
    pattern: "mediafire",
    alias: ["mfire", "mf"],
    react: "📥",
    desc: "Download and send MediaFire files",
    category: "download",
    filename: __filename
}, async (danuwa, mek, m, { from, q, reply }) => {
    try {
        if (!q || !q.includes("mediafire.com")) {
            return reply(`📥 *ᴍᴇᴅɪᴀғɪʀᴇ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n📌 *ᴜsᴀɢᴇ:* \`.mf <mediafire_url>\`\n💡 *ᴇxᴀᴍᴘʟᴇ:* \`.mf https://www.mediafire.com/file/xxxxx/file.zip/file\``);
        }

        await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });
        await reply(`🔎 *ғᴇᴛᴄʜɪɴɢ ᴍᴇᴅɪᴀғɪʀᴇ ғɪʟᴇ ɪɴғᴏ...*`);

        // Get info using your function
        const data = await mediafireInfo(q.trim());

        const caption = `╭〔 📥 *ᴍᴇᴅɪᴀғɪʀᴇ ᴅᴏᴡɴʟᴏᴀᴅ* 〕━\n┃\n` +
                        `┃ 📁 *ғɪʟᴇ ɴᴀᴍᴇ:* ${data.name}\n` +
                        `┃ 💾 *ғɪʟᴇ sɪᴢᴇ:* ${data.size}\n` +
                        `┃\n` +
                        `╰━━━───────► ❥\n\n` +
                        `⬆️ *sᴇɴᴅɪɴɢ ᴅᴏᴄᴜᴍᴇɴᴛ... ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ!*`;

        await reply(caption);

        // Send File directly as WhatsApp Document using Direct Stream Link
        await danuwa.sendMessage(
            from,
            {
                document: { url: data.download },
                fileName: data.name,
                mimetype: "application/octet-stream",
                caption: `✅ *Downloaded via MALIYA-MD*\n📁 *Name:* ${data.name}`
            },
            { quoted: mek }
        );

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("MediaFire Error:", error);
        await danuwa.sendMessage(from, { react: { text: "❌", key: m.key } });
        return reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ:* ${error.message}`);
    }
});
