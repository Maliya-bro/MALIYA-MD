const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const { downloadMediaMessage, getContentType } = require("@whiskeysockets/baileys");

console.log("✅ vv diagnostic plugin loaded");

const tempFolder = path.join(__dirname, "../temp");
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

function unwrapMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2Extension) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function detectMedia(m) {
  if (!m) return null;

  if (m.imageMessage) {
    const mime = m.imageMessage.mimetype || "";
    const ext = mime.includes("png") ? ".png" : ".jpg";
    return { type: "image", node: m.imageMessage, ext };
  }

  if (m.videoMessage) return { type: "video", node: m.videoMessage, ext: ".mp4" };

  if (m.audioMessage) {
    const isPtt = m.audioMessage.ptt === true;
    return { type: "audio", node: m.audioMessage, ext: isPtt ? ".ogg" : ".mp3", ptt: isPtt };
  }

  return null;
}

function isViewOnceMessage(rawQuoted) {
  if (!rawQuoted) return false;

  const jsonStr = JSON.stringify(rawQuoted);
  if (jsonStr.includes("viewOnceMessage") || jsonStr.includes('"viewOnce":true')) return true;

  if (rawQuoted.viewOnceMessage || rawQuoted.viewOnceMessageV2 || rawQuoted.viewOnceMessageV2Extension) return true;

  const ep = rawQuoted.ephemeralMessage?.message;
  if (ep?.viewOnceMessage || ep?.viewOnceMessageV2 || ep?.viewOnceMessageV2Extension) return true;

  const clean = unwrapMessage(rawQuoted);
  if (clean?.imageMessage?.viewOnce) return true;
  if (clean?.videoMessage?.viewOnce) return true;
  if (clean?.audioMessage?.viewOnce) return true;

  return false;
}

cmd(
  {
    pattern: "vv",
    desc: "Diagnose and convert View Once media",
    category: "tools",
    react: "🔍",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, reply }) => {
    let report = [];
    const log = (text) => report.push(text);

    log("🛠️ *[ VIEW ONCE DIAGNOSTIC REPORT ]* 🛠️\n");

    try {
      // 1. Quoted Context Inspection
      const ctx =
        mek.message?.extendedTextMessage?.contextInfo ||
        mek.message?.imageMessage?.contextInfo ||
        mek.message?.videoMessage?.contextInfo ||
        mek.message?.documentMessage?.contextInfo ||
        mek.message?.audioMessage?.contextInfo ||
        m?.quoted ||
        null;

      const quotedMessage = ctx?.quotedMessage || ctx?.message || (m?.quoted?.msg ? m.quoted : null);
      const stanzaId = ctx?.stanzaId || ctx?.id;
      const participant = ctx?.participant || ctx?.sender;

      log(`📍 *Chat Type:* ${isGroup ? "Group" : "Private DM"}`);
      log(`🆔 *Stanza ID:* ${stanzaId || "Not Found"}`);
      log(`👤 *Participant:* ${participant || "N/A"}`);

      if (!quotedMessage || !stanzaId) {
        log("\n❌ *FAIL:* Quoted message or stanzaId not found. Please reply directly to a message.");
        return reply(report.join("\n"));
      }

      // Raw keys
      const rawKeys = Object.keys(quotedMessage).join(", ");
      log(`🔑 *Raw Quoted Keys:* [ ${rawKeys} ]`);

      // 2. View Once check
      const isVO = isViewOnceMessage(quotedMessage);
      log(`👁️ *isViewOnce Detected:* ${isVO ? "✅ YES" : "❌ NO"}`);

      // 3. Unwrap message
      const clean = unwrapMessage(quotedMessage);
      if (!clean) {
        log("\n❌ *FAIL:* unwrapMessage() returned null.");
        return reply(report.join("\n"));
      }

      const cleanKeys = Object.keys(clean).join(", ");
      log(`📦 *Clean Unwrapped Keys:* [ ${cleanKeys} ]`);

      // 4. Media Detection
      const media = detectMedia(clean);
      if (!media) {
        log("\n❌ *FAIL:* detectMedia() could not find image/video/audio in clean message.");
        return reply(report.join("\n"));
      }

      log(`🎥 *Media Type:* ${media.type}`);
      log(`🔐 *mediaKey Present:* ${media.node?.mediaKey ? "✅ YES" : "❌ NO"}`);
      log(`📄 *Mimetype:* ${media.node?.mimetype || "N/A"}`);
      log(`📏 *File Length:* ${media.node?.fileLength || "N/A"}`);

      if (!media.node?.mediaKey) {
        log("\n❌ *FAIL:* mediaKey is missing. Cannot fetch decrypt keys from WhatsApp servers.");
        return reply(report.join("\n"));
      }

      // 5. Download test
      const quotedKey = { remoteJid: from, fromMe: false, id: stanzaId };
      if (isGroup && participant) quotedKey.participant = participant;

      log("\n⏳ *Downloading Media...*");

      let buffer = null;
      let downloadMethod = "downloadMediaMessage";

      try {
        buffer = await downloadMediaMessage(
          { key: quotedKey, message: clean },
          "buffer",
          {},
          {
            logger: P({ level: "silent" }),
            reuploadRequest: conn.updateMediaMessage,
          }
        );
      } catch (err) {
        log(`⚠️ *downloadMediaMessage Error:* ${err?.message || err}`);
      }

      // Fallback: If buffer failed and m.quoted.download exists
      if ((!buffer || !buffer.length) && m?.quoted?.download) {
        log("🔄 *Trying fallback method: m.quoted.download()...*");
        try {
          buffer = await m.quoted.download();
          downloadMethod = "m.quoted.download()";
        } catch (fbErr) {
          log(`⚠️ *Fallback Error:* ${fbErr?.message || fbErr}`);
        }
      }

      if (!buffer || !buffer.length) {
        log("\n❌ *FAIL:* Buffer is empty or download failed completely.");
        return reply(report.join("\n"));
      }

      log(`✅ *Download Success!*`);
      log(`📥 *Method Used:* ${downloadMethod}`);
      log(`📊 *Buffer Size:* ${(buffer.length / 1024).toFixed(2)} KB`);

      const filePath = path.join(tempFolder, `vv_diag_${stanzaId}_${Date.now()}${media.ext}`);
      await fs.promises.writeFile(filePath, buffer);

      const finalCaption = `${report.join("\n")}\n\n💬 *Original Caption:* ${media.node?.caption || "None"}`;

      if (media.type === "image") {
        await conn.sendMessage(
          from,
          { image: { url: filePath }, caption: finalCaption },
          { quoted: mek }
        );
      } else if (media.type === "video") {
        await conn.sendMessage(
          from,
          { video: { url: filePath }, caption: finalCaption },
          { quoted: mek }
        );
      } else if (media.type === "audio") {
        await conn.sendMessage(
          from,
          {
            audio: { url: filePath },
            mimetype: media.ptt ? "audio/ogg; codecs=opus" : media.node.mimetype || "audio/mpeg",
            ptt: media.ptt === true,
          },
          { quoted: mek }
        );
        await reply(finalCaption);
      }

      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch {}
      }, 60 * 1000);

    } catch (e) {
      log(`\n💥 *CRITICAL EXCEPTION:* ${e?.message || e}`);
      reply(report.join("\n"));
    }
  }
);
