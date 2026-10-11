const { cmd } = require("../command");

cmd(
  {
    pattern: "testnumber",
    alias: ["myinfo", "whoami", "details"],
    react: "🔍",
    desc: "Get user and chat details from Baileys",
    category: "utility",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, isGroup, isOwner, reply }) => {
    try {
      // 1. User ගේ WhatsApp Number එක (:15 වැනි Multi-device කෑලි ඉවත් කර)
      const userNumber = sender.split("@")[0].split(":")[0];
      
      // 2. Bot ගේ Number එක
      const botNumber = sock.user.id.split("@")[0].split(":")[0];
      
      // 3. Chat Type එක හඳුනාගැනීම
      const chatType = isGroup ? "Group Chat 👥" : "Private Chat 👤";
      
      // 4. Message ID එක (Mek object එකෙන්)
      const messageID = mek.key.id;

      // 5. විස්තර ටික ලස්සනට Format කිරීම
      const infoText = `╭━━━〔 *BAILEYS INFO* 〕━━━┈➤
┃
┃ 👤 *Name :* ${pushname || "Unknown"}
┃ 📞 *Your Number :* +${userNumber}
┃ 👑 *Is Owner :* ${isOwner ? "Yes ✅" : "No ❌"}
┃
┃ 🤖 *Bot Number :* +${botNumber}
┃ 🏷️ *Chat Type :* ${chatType}
┃ 🆔 *Chat ID :* ${from}
┃ 🔖 *Msg ID :* ${messageID}
┃
╰━━━━━━━━━━━━━━━━━━━┈➤

> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      // Reply කිරීම
      await reply(infoText);
      
    } catch (e) {
      console.log("TestNumber Error:", e?.message);
      reply("❌ Error fetching details.");
    }
  }
);
