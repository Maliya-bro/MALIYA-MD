const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

async function downloadMediaMessage(message, sock) {
  const msg =
    message?.message?.imageMessage
      ? message.message.imageMessage
      : message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
      ? message.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
      : null;

  if (!msg) return null;

  const stream = await sock.downloadMediaMessage(message);
  return stream;
}

cmd(
  {
    pattern: "setpp",
    alias: ["setdp", "fullpp"],
    desc: "Set bot profile picture with full-body fit",
    category: "owner",
    react: "🖼️",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, isOwner, reply }) => {
    try {
      if (!isOwner) return reply("❌ This command is owner only.");

      const hasDirectImage = !!mek.message?.imageMessage;
      const hasQuotedImage =
        !!mek.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

      if (!hasDirectImage && !hasQuotedImage) {
        return reply(
          "📸 Send an image with .setpp caption\nor\nReply to an image with .setpp"
        );
      }

      reply("⬇️ Downloading image...");

      let mediaBuffer = null;

      if (hasDirectImage) {
        mediaBuffer = await conn.downloadMediaMessage(mek);
      } else {
        const quoted = {
          key: mek.message.extendedTextMessage.contextInfo.stanzaId
            ? {
                remoteJid: from,
                id: mek.message.extendedTextMessage.contextInfo.stanzaId,
                participant:
                  mek.message.extendedTextMessage.contextInfo.participant || sender,
              }
            : undefined,
          message:
            mek.message.extendedTextMessage.contextInfo.quotedMessage || {},
        };

        mediaBuffer = await conn.downloadMediaMessage(quoted);
      }

      if (!mediaBuffer) {
        return reply("❌ Could not download image.");
      }

      reply("🎨 Processing image for full-body profile photo...");

      const baseSize = 1080;
      const innerSize = 820;

      const outputBuffer = await sharp(mediaBuffer)
        .rotate()
        .resize(innerSize, innerSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .extend({
          top: Math.floor((baseSize - innerSize) / 2),
          bottom: Math.floor((baseSize - innerSize) / 2),
          left: Math.floor((baseSize - innerSize) / 2),
          right: Math.floor((baseSize - innerSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .resize(640, 640)
        .jpeg({ quality: 95 })
        .toBuffer();

      const jid = conn.user?.id;

      if (!jid) return reply("❌ Bot JID not found.");

      await conn.updateProfilePicture(jid, outputBuffer);

      return reply(
        "✅ Bot profile picture updated successfully.\n🖼️ Full-body fit mode applied."
      );
    } catch (e) {
      console.log("SETPP ERROR:", e);
      return reply("❌ Error while setting profile picture.");
    }
  }
);
