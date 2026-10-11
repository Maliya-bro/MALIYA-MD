// plugins/blockManager.js
// WhatsApp Block List & Unblock Commands

const { cmd } = require("../command");
const config = require("../config");
const { getCustomImage } = require("../lib/botSettings");

// ── Default images ────────────────────────────────────────────
const DEFAULT_IMG =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Gemini_Generated_Image_j34rhwj34rhwj34r.png?raw=true";

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

// ── Command 1: .listblock ─────────────────────────────────────
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

      // ── 1. Fetch blocked contacts from Baileys ─────────────
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

      // ── 2. Format list ──────────────────────────────────────
      const mentions = [];
      let listText = "";

      blocklist.forEach((jid, index) => {
        mentions.push(jid);
        const number = jid.split("@")[0];
        const count = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
        listText += `┃ ${count}. @${number}\n`;
      });

      // ── 3. Load Custom Image ────────────────────────────────
      let bannerImg = DEFAULT_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "blocklist");
          if (custom?.data) bannerImg = custom.data;
        } catch (e) {
          console.log("⚠️ Failed to load custom image:", e.message);
        }
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

💡 *Tip:* අංකයක් unblock කිරීමට \`.unblock <number>\` භාවිතා කරන්න.`;

      // ── 4. Send Message ─────────────────────────────────────
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

// ── Command 2: .unblock ───────────────────────────────────────
cmd(
  {
    pattern: "unblock",
    alias: ["ub", "unmute"],
    react: "🔓",
    desc: "Unblock a user or number from WhatsApp & Bot",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply, isOwner, sessionId, pushname }) => {
    try {
      if (!isOwner) {
        return reply("❌ *This command is owner only.*");
      }

      let targetJid = null;

      // 1. Parameter එකක් ලෙස number එක දුන් විට (.unblock 947xxxxxxxx)
      if (q && q.trim()) {
        const cleanNumber = q.replace(/[^0-9]/g, "");
        if (cleanNumber.length >= 7) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      // 2. Mention කර ඇත්නම් (@user)
      const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!targetJid && mentioned && mentioned.length > 0) {
        targetJid = mentioned[0];
      }

      // 3. Message එකකට reply කර ඇත්නම්
      const quotedParticipant =
        mek.message?.extendedTextMessage?.contextInfo?.participant;
      if (!targetJid && quotedParticipant) {
        targetJid = quotedParticipant;
      }

      if (!targetJid) {
        return reply(
          "⚠️ *කරුණාකර අංකයක් ඇතුළත් කරන්න හෝ User ව mention කරන්න!*\n\n" +
          "📌 *භාවිතය:*\n" +
          "• `.unblock 94712345678`\n" +
          "• `.unblock @user`\n" +
          "• මැසේජ් එකකට reply කර `.unblock`"
        );
      }

      const targetNumber = targetJid.split("@")[0];

      // ── 1. WhatsApp Level Unblock ───────────────────────────
      try {
        await sock.updateBlockStatus(targetJid, "unblock");
      } catch (err) {
        console.log("⚠️ WhatsApp updateBlockStatus error:", err.message);
      }

      // ── 2. Anti-Spam Memory Reset (Plugin එක load කර ඇත්නම්) ─
      try {
        const antiSpam = require("./anti-spam");
        if (antiSpam && typeof antiSpam.resetSpamUser === "function") {
          antiSpam.resetSpamUser(targetJid);
        }
      } catch {}

      // ── 3. Load Custom Image ────────────────────────────────
      let unblockImg = DEFAULT_IMG;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "unblock");
          if (custom?.data) unblockImg = custom.data;
        } catch (e) {
          console.log("⚠️ Failed to load custom image:", e.message);
        }
      }

      const userName = pushname || m?.pushName || "Owner";

      const unblockCaption = `
╭━〔 🔓 USER UNBLOCKED 🔓 〕━╮
┃
┃ 👤 *Target User:* @${targetNumber}
┃ 🛠️ *Action:* WhatsApp & Spam Unblock
┃ ⚡ *Status:* Active / Whitelisted
┃ 👑 *Executed By:* ${userName}
┃ 🧩 *Bot:* ${config.BOT_NAME || "🌀 MALIYA-MD 🌀"}
┃
╰━━━━━━━━━━━━╯

✅ _දැන් මෙම අංකයට සාමාන්‍ය පරිදි බොට් භාවිතා කිරීමට හැකියාව ඇත._`;

      // ── 4. Send Message ─────────────────────────────────────
      await sock.sendMessage(
        from,
        {
          image: { url: unblockImg },
          caption: unblockCaption,
          mentions: [targetJid],
          buttons: [
            { buttonId: ".listblock", buttonText: { displayText: "🚫 Block List" }, type: 1 },
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
