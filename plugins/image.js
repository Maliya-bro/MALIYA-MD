const { cmd } = require("../command");
const Jimp = require("jimp");

cmd(
  {
    pattern: "imgpro",
    react: "🎨",
    desc: "Convert image to grayscale",
    category: "image",
    filename: __filename,
  },
  async (
    danuwa,
    mek,
    m,
    {
      from,
      quoted,
      body,
      isCmd,
      command,
      args,
      q,
      isGroup,
      sender,
      senderNumber,
      botNumber2,
      botNumber,
      pushname,
      isMe,
      isOwner,
      groupMetadata,
      groupName,
      participants,
      groupAdmins,
      isBotAdmins,
      isAdmins,
      reply,
    }
  ) => {
    try {
      if (!quoted) return reply("❌ Please send an image!");

      const buffer = await danuwa.downloadAndSaveMediaMessage(quoted, "temp");
      const image = await Jimp.read(buffer);
      image.grayscale();
      const processedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

      await danuwa.sendMessage(from, { image: processedBuffer }, { quoted: mek });

    } catch (e) {
      console.error(e);
      reply(`❌ Error: ${e.message}`);
    }
  }
);
