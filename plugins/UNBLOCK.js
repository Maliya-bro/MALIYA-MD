// plugins/blockManager.js
// WhatsApp Block, Unblock & Block List Management

const { cmd } = require("../command");
const config = require("../config");
const { getCustomImage } = require("../lib/botSettings");

const DEFAULT_IMG =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_j34rhwj34rhwj34r.png?raw=true";

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

// Helper: Target JID එක සොයා ගැනීම
function getTargetJid(q, m, mek) {
  let targetJid = null;

  // 1. Text Query (Phone Number)
  if (q && q.trim()) {
    const cleanPhone = q.replace(/[^0-9]/g, "");
    if (cleanPhone.length >= 7) {
      targetJid = `${cleanPhone}@s.whatsapp.net`;
    }
  }

  // 2. Mentioned User
  const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!targetJid && mentioned && mentioned.length > 0) {
    targetJid = mentioned[0];
  }

  // 3. Quoted Message Participant
  const quotedParticipant = mek.message?.extendedTextMessage?.contextInfo?.participant;
  if (!targetJid && quotedParticipant) {
    targetJid = quotedParticipant;
  }

  return targetJid;
}

// ── Command 1: .block ─────────────────────────────────────────
cmd(
  {
    pattern: "block",
    alias: ["b"],
    react: "🚫",
    desc: "Block a user or number on WhatsApp",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply, isOwner, sessionId, pushname }) => {
    try {
      if (!isOwner) {
        return reply("❌ *This command is owner only.*");
      }

      const targetJid = getTargetJid(q, m, mek);

      if (!targetJid) {
        return reply(
          "⚠️ *කරුණාකර Block කිරීමට අවශ්‍ය අංකය හෝ User ව සඳහන් කරන්න!*\n\n" +
          "📌 *භාවිතය:*\n" +
          "• `.block 947xxxxxxxx`\n" +
          "• `.block @user`\n" +
          "• පණිවිඩයකට reply කර `.block`"
        );
      }

      // WhatsApp Socket Block Execution
      await sock.updateBlockStatus(targetJid, "block");

      const targetNumber = targetJid.split("@")[0];

      let blockImg = DEFAULT_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "block");
          if (custom?.data) blockImg = custom.data;
        } catch (e) {}
      }

      const userName = pushname || m?.pushName || "Owner";

      const blockCaption = `
╭━〔 USER BLOCKED 〕━╮
┃
┃ 👤 *Target User:* @${targetNumber}
┃ 🛠️ *Action:* WhatsApp Block
┃ ⚡ *Status:* Blocked Successfully
┃ 👑 *By:* ${userName}
┃
╰━━━━━━━━━━╯

🔒 _මෙම අංකය WhatsApp Block List එකට ඇතුළත් කරන ලදී._`;

      await sock.sendMessage(
        from,
        {
          image: { url: blockImg },
          caption: blockCaption,
          mentions: [targetJid],
          buttons: [
            { buttonId: `.unblock ${targetNumber}`, buttonText: { displayText: "🔓 Unblock" }, type: 1 },
            { buttonId: ".listblock", buttonText: { displayText: "📑 Block List" }, type: 1 },
          ],
          headerType: 4,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: CHANNEL_JID,
              newsletterName: CHANNEL_NAME,
              serverMessageId: -1,
            },
          },
        },
        { quoted: mek }
      );
    } catch (err) {
      console.log("BLOCK ERROR:", err);
      reply(`❌ Block Error: ${err.message}`);
    }
  }
);

// ── Command 2: .unblock ───────────────────────────────────────
cmd(
  {
    pattern: "unblock",
    alias: ["ub"],
    react: "🔓",
    desc: "Unblock a user or number from WhatsApp",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply, isOwner, sessionId, pushname }) => {
    try {
      if (!isOwner) {
        return reply("❌ *This command is owner only.*");
      }

      let targetJid = null;

      let currentBlocklist = [];
      try {
        currentBlocklist = await sock.fetchBlocklist();
      } catch (e) {}

      // List එකේ number එකෙන් (1, 2, 3...) unblock කිරීමට
      if (q && q.trim()) {
        const cleanInput = q.trim();
        const indexNumber = parseInt(cleanInput, 10);

        if (!isNaN(indexNumber) && indexNumber >= 1 && indexNumber <= currentBlocklist.length && cleanInput.length <= 3) {
          targetJid = currentBlocklist[indexNumber - 1];
        }
      }

      // සාමාන්‍ය query, mention, reply check
      if (!targetJid) {
        targetJid = getTargetJid(q, m, mek);
      }

      if (!targetJid) {
        return reply(
          "⚠️ *කරුණාකර අංකයක්, List අංකයක් හෝ User ව mention කරන්න!*\n\n" +
          "📌 *භාවිතය:*\n" +
          "• `.unblock 1` (List එකේ Index අංකයෙන්)\n" +
          "• `.unblock 947xxxxxxxx`\n" +
          "• `.unblock @user`\n" +
          "• පණිවිඩයකට reply කර `.unblock`"
        );
      }

      const targetNumber = targetJid.split("@")[0];

      // WhatsApp Socket Unblock Execution
      await sock.updateBlockStatus(targetJid, "unblock");

      let unblockImg = DEFAULT_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "unblock");
          if (custom?.data) unblockImg = custom.data;
        } catch (e) {}
      }

      const userName = pushname || m?.pushName || "Owner";

      const unblockCaption = `
╭━〔 USER UNBLOCKED 〕━╮
┃
┃ 👤 *User:* @${targetNumber}
┃ 🛠️ *Action:* WhatsApp Unblock
┃ ⚡ *Status:* Unblocked Successfully
┃ 👑 *By:* ${userName}
┃
╰━━━━━━━━━━━╯

✅ _අදාළ අංකය WhatsApp Block List එකෙන් ඉවත් කරන ලදී._`;

      await sock.sendMessage(
        from,
        {
          image: { url: unblockImg },
          caption: unblockCaption,
          mentions: [targetJid],
          buttons: [
            { buttonId: ".listblock", buttonText: { displayText: "📑 Block List" }, type: 1 },
            { buttonId: ".menu", buttonText: { displayText: "📜 Menu" }, type: 1 },
          ],
          headerType: 4,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: CHANNEL_JID,
              newsletterName: CHANNEL_NAME,
              serverMessageId: -1,
            },
          },
        },
        { quoted: mek }
      );
    } catch (err) {
      console.log("UNBLOCK ERROR:", err);
      reply(`❌ Unblock Error: ${err.message}`);
    }
  }
);

// ── Command 3: .listblock ─────────────────────────────────────
cmd(
  {
    pattern: "listblock",
    alias: ["blocklist", "blockedlist"],
    react: "📑",
    desc: "View all numbers blocked on WhatsApp",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, isOwner, sessionId, pushname }) => {
    try {
      if (!isOwner) {
        return reply("❌ *This command is owner only.*");
      }

      let blocklist = [];
      try {
        blocklist = await sock.fetchBlocklist();
      } catch (e) {
        console.log("Blocklist fetch error:", e.message);
        return reply("⚠️ *Blocked numbers ලබා ගැනීමට නොහැකි විය.*");
      }

      if (!blocklist || blocklist.length === 0) {
        return reply("✅ *දැනට WhatsApp එකේ කිසිදු අංකයක් Block කර නොමැත.*");
      }

      const mentions = [];
      let listText = "";

      blocklist.forEach((jid, index) => {
        mentions.push(jid);
        const number = jid.split("@")[0];
        const count = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
        listText += `┃ ${count}. @${number}\n`;
      });

      let bannerImg = DEFAULT_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "blocklist");
          if (custom?.data) bannerImg = custom.data;
        } catch (e) {}
      }

      const userName = pushname || m?.pushName || "Owner";

      const listCaption = `
╭━〔 BLOCKED NUMBERS 〕━╮
┃
┃ 👑 *Requested By:* ${userName}
┃ 📊 *Total Blocked:* \`${blocklist.length}\`
┃
${listText.trimEnd()}
┃
╰━━━━━━━━━━━╯

💡 *Tip:* අංකයක් unblock කිරීමට:
• \`.unblock <index_number>\` (උදා: \`.unblock 1\`)
• \`.unblock <phone_number>\` (උදා: \`.unblock 947xxxxxxxx\`)`;

      await sock.sendMessage(
        from,
        {
          image: { url: bannerImg },
          caption: listCaption,
          mentions: mentions,
          buttons: [
            { buttonId: ".menu", buttonText: { displayText: "📜 Menu" }, type: 1 },
            { buttonId: ".ping", buttonText: { displayText: "⚡ Ping" }, type: 1 },
          ],
          headerType: 4,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: CHANNEL_JID,
              newsletterName: CHANNEL_NAME,
              serverMessageId: -1,
            },
          },
        },
        { quoted: mek }
      );
    } catch (err) {
      console.log("LISTBLOCK ERROR:", err);
      reply(`❌ Listblock Error: ${err.message}`);
    }
  }
);
