const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { generateProfilePicture } = require("@whiskeysockets/baileys");

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

async function getImageBuffer(conn, mek, from, sender) {
  const hasDirectImage = !!mek.message?.imageMessage;
  const hasQuotedImage =
    !!mek.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

  if (!hasDirectImage && !hasQuotedImage) return null;

  if (hasDirectImage) {
    return await conn.downloadMediaMessage(mek);
  }

  const quoted = {
    key: {
      remoteJid: from,
      id: mek.message.extendedTextMessage.contextInfo.stanzaId,
      participant:
        mek.message.extendedTextMessage.contextInfo.participant || sender,
    },
    message: mek.message.extendedTextMessage.contextInfo.quotedMessage,
  };

  return await conn.downloadMediaMessage(quoted);
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
        return reply("📸 Image ekak caption .setpp ekka yawanna nathnam image ekakata reply karala .setpp danna.");
      }

      reply("⬇️ Downloading image...");

      const mediaBuffer = await getImageBuffer(conn, mek, from, sender);
      if (!mediaBuffer) return reply("❌ Could not download image.");

      reply("🎨 Processing profile picture...");

      const canvasSize = 1080;
      const fitSize = 820;

      const processed = await sharp(mediaBuffer)
        .rotate()
        .resize(fitSize, fitSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .extend({
          top: Math.floor((canvasSize - fitSize) / 2),
          bottom: Math.floor((canvasSize - fitSize) / 2),
          left: Math.floor((canvasSize - fitSize) / 2),
          right: Math.floor((canvasSize - fitSize) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 95 })
        .toBuffer();

      const profilePic = await generateProfilePicture(processed);

      const jid = conn.user?.id;
      if (!jid) return reply("❌ Bot JID not found.");

      await conn.updateProfilePicture(jid, profilePic);

      return reply("✅ Bot profile picture updated successfully.");
    } catch (e) {
      console.log("SETPP ERROR FULL:", e);
      return reply(`❌ Error while setting DP\n\n${e?.message || e}`);
    }
  }
);
