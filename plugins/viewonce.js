const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const tempFolder = path.join(__dirname, "../temp");
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  return message;
}

function detectMedia(m) {
  if (!m) return null;

  if (m.imageMessage) {
    const mime = m.imageMessage.mimetype || "";
    const ext = mime.includes("png") ? ".png" : ".jpg";
    return { type: "image", node: m.imageMessage, ext };
  }

  if (m.videoMessage) {
    return { type: "video", node: m.videoMessage, ext: ".mp4" };
  }

  if (m.audioMessage) {
    const isPtt = m.audioMessage.ptt === true;
    return {
      type: "audio",
      node: m.audioMessage,
      ext: isPtt ? ".ogg" : ".mp3",
      ptt: isPtt,
    };
  }

  return null;
}

/**
 * ✅ View Once detect for BOTH styles:
 * 1) wrapper: viewOnceMessage / viewOnceMessageV2 (incoming)
 * 2) flag: imageMessage.viewOnce === true / videoMessage.viewOnce === true (quotedMessage often)
 */
function isViewOnceMessage(rawQuoted) {
  if (!rawQuoted) return false;

  // wrapper forms
  if (rawQuoted.viewOnceMessage || rawQuoted.viewOnceMessageV2) return true;

  // quotedMessage sometimes keeps it inside ephemeral
  const ep = rawQuoted.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2) return true;

  // direct flag forms (common in reply/quote)
  if (rawQuoted.imageMessage?.viewOnce) return true;
  if (rawQuoted.videoMessage?.viewOnce) return true;
  if (rawQuoted.audioMessage?.viewOnce) return true;

  // sometimes nested after unwrap too
  const clean = unwrapMessage(rawQuoted);
  if (clean?.imageMessage?.viewOnce) return true;
  if (clean?.videoMessage?.viewOnce) return true;
  if (clean?.audioMessage?.viewOnce) return true;

  return false;
}

cmd(
  {
    pattern: "vv",
    desc: "Convert View Once media to normal (reply to it)",
    category: "tools",
    react: "👁️",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, reply }) => {
    try {
      // ✅ get quoted message from contextInfo (reliable)
      const ctx =
        mek.message?.extendedTextMessage?.contextInfo ||
        mek.message?.imageMessage?.contextInfo ||
        mek.message?.videoMessage?.contextInfo ||
        mek.message?.documentMessage?.contextInfo ||
        mek.message?.audioMessage?.contextInfo ||
        null;

      const quotedMessage = ctx?.quotedMessage;
      const stanzaId = ctx?.stanzaId;
      const participant = ctx?.participant;

      if (!quotedMessage || !stanzaId) {
        return reply("❌ *View Once msg ekata reply karala `.vv` danna.*");
      }

      // ✅ fixed VO detection
      if (!isViewOnceMessage(quotedMessage)) {
        return reply("❌ *Oya reply kare View Once msg ekakata nemei.*");
      }

      // unwrap to get image/video/audio node
      const clean = unwrapMessage(quotedMessage);
      const media = detectMedia(clean);

      if (!media) {
        return reply("❌ *Image / Video / Audio / Voice witharai support.*");
      }

      // prevent "Cannot derive from empty media key"
      if (!media.node?.mediaKey) {
        return reply("❌ *Me media eka download karanna ba (mediaKey missing).*");
      }

      // build correct key for quoted message
      const quotedKey = { remoteJid: from, fromMe: false, id: stanzaId };
      if (isGroup && participant) quotedKey.participant = participant;

      // download
      const buffer = await downloadMediaMessage(
        { key: quotedKey, message: clean },
        "buffer",
        {}
      );

      if (!buffer || !buffer.length) return reply("❌ *Download fail una.*");

      const filePath = path.join(tempFolder, `vv_${stanzaId}_${Date.now()}${media.ext}`);
      await fs.promises.writeFile(filePath, buffer);

      // send as normal
      if (media.type === "image") {
        await conn.sendMessage(
          from,
          { image: { url: filePath }, caption: media.node.caption || undefined },
          { quoted: mek }
        );
      } else if (media.type === "video") {
        await conn.sendMessage(
          from,
          { video: { url: filePath }, caption: media.node.caption || undefined },
          { quoted: mek }
        );
      } else if (media.type === "audio") {
        await conn.sendMessage(
          from,
          {
            audio: { url: filePath },
            mimetype: media.ptt
              ? "audio/ogg; codecs=opus"
              : media.node.mimetype || "audio/mpeg",
            ptt: media.ptt === true,
          },
          { quoted: mek }
        );
      }

      // cleanup
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch {}
      }, 60 * 1000);

    } catch (e) {
      console.log("❌ .vv error:", e?.message || e);
      reply("❌ *View Once convert error.*");
    }
  }
);
