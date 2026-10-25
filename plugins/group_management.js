// ╔══════════════════════════════════════════════════════════════════╗
//   MALIYA-MD — Group Security, Moderation & Auto Welcome Suite
//   Features: Anti-Link, Anti-Badwords, Anti-Spam Flood, Auto Welcome
//   Admin Commands: tagall, hidetag, mute, unmute, kick, promote, demote
// ╚══════════════════════════════════════════════════════════════════╝

const { cmd } = require("../command");
const { readSettings } = require("../lib/botSettings");
const { jidNormalizedUser } = require("@whiskeysockets/baileys");

const BAD_WORDS = [
  "paka", "ponnaya", "hutta", "kariyo", "hukanna", "ammatapuka",
  "fuck", "bitch", "asshole", "dick", "cunt", "bastard"
];

const spamTracker = new Map();
const userWarnings = new Map();

// Helper: Check if sender is Group Admin
async function checkAdmin(conn, from, sender) {
  try {
    const meta = await conn.groupMetadata(from);
    const normSender = jidNormalizedUser(sender);
    const participant = meta.participants.find(
      (p) => jidNormalizedUser(p.id) === normSender
    );
    return Boolean(participant && (participant.admin === "admin" || participant.admin === "superadmin"));
  } catch (e) {
    return false;
  }
}

// Helper: Check if Bot is Group Admin
async function checkBotAdmin(conn, from) {
  try {
    const meta = await conn.groupMetadata(from);
    const botJid = jidNormalizedUser(conn.user.id);
    const botPart = meta.participants.find(
      (p) => jidNormalizedUser(p.id) === botJid
    );
    return Boolean(botPart && (botPart.admin === "admin" || botPart.admin === "superadmin"));
  } catch (e) {
    return false;
  }
}

/* ============================================================================
 * 1. AUTOMATION HOOK (Anti-Link, Anti-Badwords, Anti-Spam Flood)
 * ============================================================================ */
async function handleGroupAutomation(sock, mek, m, sessionCtx) {
  try {
    const from = mek?.key?.remoteJid;
    if (!from || !from.endsWith("@g.us")) return false;
    if (mek.key.fromMe) return false;

    const sessionId = sessionCtx?.sessionId;
    const settings = await readSettings(sessionId);

    // Group Management toggle එක OFF නම් automation ක්‍රියාත්මක නොවේ
    if (!settings.group_management) return false;

    const sender = mek.key.participant || from;
    const body = String(
      mek.message?.conversation ||
      mek.message?.extendedTextMessage?.text ||
      mek.message?.imageMessage?.caption ||
      mek.message?.videoMessage?.caption ||
      ""
    ).trim();

    if (!body) return false;

    // Admins ලාට immunity (bypass) ලබා දීම
    const isAdmin = await checkAdmin(sock, from, sender);
    if (isAdmin) return false;

    const isBotAdmin = await checkBotAdmin(sock, from);
    const warnKey = `${from}_${sender}`;

    // ── ⚡ ANTI-SPAM FLOOD (3 messages in under 2.5s) ──
    const now = Date.now();
    const userSpam = spamTracker.get(sender) || [];
    const recent = userSpam.filter((t) => now - t < 2500);
    recent.push(now);
    spamTracker.set(sender, recent);

    if (recent.length >= 4) {
      if (isBotAdmin) {
        await sock.sendMessage(from, { delete: mek.key });
      }
      await sock.sendMessage(from, {
        text: `╭─「 *⚠️ SPAM WARNING* 」─◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ 🚫 *Reason:* Message flooding\n│ ⏳ *Action:* Messages suppressed\n╰──────◆──◆──◆──◆`,
        mentions: [sender]
      });
      return true;
    }

    // ── 🔗 ANTI-LINK PROTECTION ──
    const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+)/gi;
    if (linkRegex.test(body)) {
      if (isBotAdmin) {
        await sock.sendMessage(from, { delete: mek.key });
      }

      let currentWarn = (userWarnings.get(warnKey) || 0) + 1;
      userWarnings.set(warnKey, currentWarn);

      if (currentWarn >= 3 && isBotAdmin) {
        userWarnings.delete(warnKey);
        await sock.groupParticipantsUpdate(from, [sender], "remove");
        await sock.sendMessage(from, {
          text: `╭──「 *⛔ ANTI-LINK REMOVAL* 」──◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ ❌ *Reason:* Links forbidden (3/3)\n│ 🚪 *Status:* Removed from group\n╰───────◆──◆──◆──◆`,
          mentions: [sender]
        });
      } else {
        await sock.sendMessage(from, {
          text: `╭──「 *⚠️ ANTI-LINK GUARD* 」──◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ 🚫 *Reason:* Links are strictly prohibited\n│ ⚠️ *Warning:* [ ${currentWarn} / 3 ]\n╰───────◆──◆──◆──◆`,
          mentions: [sender]
        });
      }
      return true;
    }

    // ── 🤬 ANTI-BADWORDS FILTER ──
    const lowerBody = body.toLowerCase();
    const hasBadWord = BAD_WORDS.some((word) =>
      new RegExp(`(^|\\s|\\b)${word}(\\b|\\s|$)`, "i").test(lowerBody)
    );

    if (hasBadWord) {
      if (isBotAdmin) {
        await sock.sendMessage(from, { delete: mek.key });
      }
      await sock.sendMessage(from, {
        text: `╭「 *🚫 TOXIC WORD GUARD* 」◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ ⚠️ *Warning:* Inappropriate words detected\n│ ⚖️ *Rule:* Maintain a respectful chat\n╰───────◆──◆──◆──◆`,
        mentions: [sender]
      });
      return true;
    }

  } catch (e) {
    console.log("⚠️ Group automation error:", e?.message || e);
  }
  return false;
}

/* ============================================================================
 * 2. AUTO-WELCOME ON PARTICIPANT JOIN (Crash-proof Profile Picture)
 * ============================================================================ */
async function handleGroupParticipantsUpdate(sock, update, sessionId) {
  try {
    const { id, participants, action } = update;
    if (action !== "add" || !id.endsWith("@g.us")) return;

    const settings = await readSettings(sessionId);
    if (!settings.group_management) return;

    let groupMeta;
    try {
      groupMeta = await sock.groupMetadata(id);
    } catch {
      return;
    }

    const groupName = groupMeta.subject || "Our Community";
    const memberCount = groupMeta.participants.length;

    for (const user of participants) {
      const userNum = user.split("@")[0];

      // Profile Picture retrieval with crash-proof fallback
      let ppUrl = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/ChatGPT%20Image%20Jan%2018%2C%202026%2C%2012_27_25%20PM.png";
      try {
        const fetched = await sock.profilePictureUrl(user, "image");
        if (fetched) ppUrl = fetched;
      } catch (_) {
        // Fallback to default banner if privacy restricts PP
      }

      const welcomeCaption = `
╔══════════════════════╗
  ✨ *WELCOME TO OUR FAMILY* ✨
╚═════════════════════╝

👋 *හායි* @${userNum},
අපගේ *${groupName}* සමූහයට ඔබව සාදරයෙන් පිළිගනිමු!

╭「 *MEMBER PROFILE* 」─◆
│ 👤 *User:* @${userNum}
│ 🏛️ *Group:* ${groupName}
│ 👥 *Total Members:* ${memberCount}
│ 📅 *Date:* ${new Date().toLocaleDateString("en-GB")}
╰───────◆──◆──◆──◆

> 💬 *සමූහයේ සාමකාමීව හා සතුටින් රැඳී සිටින්න!*
> 🔥 *Protected by MALIYA-MD Core*
`.trim();

      await sock.sendMessage(id, {
        image: { url: ppUrl },
        caption: welcomeCaption,
        mentions: [user]
      });
    }
  } catch (err) {
    console.log("⚠️ Welcome handler error:", err?.message || err);
  }
}

/* ============================================================================
 * 3. ADMIN-ONLY DIRECT COMMANDS
 * ============================================================================ */

// ── TAGALL / HIDETAG ──
cmd(
  {
    pattern: "tagall",
    alias: ["tag", "everyone"],
    desc: "Mention all group members",
    category: "group",
    react: "📢",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply, args }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    const isAdmin = await checkAdmin(conn, from, sender);
    if (!isAdmin) return reply("❌ *`[ THIS COMMAND IS ADMIN ONLY. ]`*");

    const meta = await conn.groupMetadata(from);
    const participants = meta.participants || [];
    const message = args.join(" ") || "Attention Everyone!";

    let text = `╔════════════════════╗\n   📢 *GROUP ANNOUNCEMENT* 📢\n╚═══════════════════╝\n\n💬 *Message:* ${message}\n\n`;
    const mentions = [];

    participants.forEach((p, i) => {
      const num = String(i + 1).padStart(2, "0");
      text += `│ *[ ${num} ]* @${p.id.split("@")[0]}\n`;
      mentions.push(p.id);
    });

    text += `╰──────◆──◆──◆──◆\n> 🔥 *Broadcast via MALIYA-MD*`;
    return await conn.sendMessage(from, { text, mentions }, { quoted: mek });
  }
);

cmd(
  {
    pattern: "hidetag",
    desc: "Broadcast message to all silently",
    category: "group",
    react: "📣",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply, q }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    const isAdmin = await checkAdmin(conn, from, sender);
    if (!isAdmin) return reply("❌ *`[ THIS COMMAND IS ADMIN ONLY. ]`*");

    const meta = await conn.groupMetadata(from);
    const mentions = meta.participants.map((p) => p.id);
    const broadcastText = q || "Important Broadcast Notice";

    return await conn.sendMessage(from, { text: broadcastText, mentions });
  }
);

// ── MUTE / UNMUTE GROUP ──
cmd(
  {
    pattern: "mute",
    alias: ["closegroup"],
    desc: "Close group messages to admins only",
    category: "group",
    react: "🔒",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    if (!(await checkAdmin(conn, from, sender))) return reply("❌ *`[ ADMIN ONLY ]`*");
    if (!(await checkBotAdmin(conn, from))) return reply("❌ *`[ BOT IS NOT ADMIN ]`*");

    await conn.groupSettingUpdate(from, "announcement");
    return reply("🔒 *Group has been locked.* (Only admins can send messages)");
  }
);

cmd(
  {
    pattern: "unmute",
    alias: ["opengroup"],
    desc: "Open group messages for everyone",
    category: "group",
    react: "🔓",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    if (!(await checkAdmin(conn, from, sender))) return reply("❌ *`[ ADMIN ONLY ]`*");
    if (!(await checkBotAdmin(conn, from))) return reply("❌ *`[ BOT IS NOT ADMIN ]`*");

    await conn.groupSettingUpdate(from, "not_announcement");
    return reply("🔓 *Group has been unlocked.* (All participants can send messages)");
  }
);

// ── KICK / REMOVE ──
cmd(
  {
    pattern: "kick",
    alias: ["remove"],
    desc: "Remove a member from group",
    category: "group",
    react: "🚪",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    if (!(await checkAdmin(conn, from, sender))) return reply("❌ *`[ ADMIN ONLY ]`*");
    if (!(await checkBotAdmin(conn, from))) return reply("❌ *`[ BOT IS NOT ADMIN ]`*");

    let target = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                 mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!target) return reply("⚠️ *කරුණාකර ඉවත් කිරීමට අවශ්‍ය සාමාජිකයාගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");
    
    await conn.groupParticipantsUpdate(from, [target], "remove");
    return reply(`✅ *@${target.split("@")[0]} has been removed.*`, { mentions: [target] });
  }
);

// ── PROMOTE / DEMOTE ──
cmd(
  {
    pattern: "promote",
    desc: "Promote member to admin",
    category: "group",
    react: "👑",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    if (!(await checkAdmin(conn, from, sender))) return reply("❌ *`[ ADMIN ONLY ]`*");
    if (!(await checkBotAdmin(conn, from))) return reply("❌ *`[ BOT IS NOT ADMIN ]`*");

    let target = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                 mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!target) return reply("⚠️ *කරුණාකර Admin කිරීමට අවශ්‍ය කෙනාගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");

    await conn.groupParticipantsUpdate(from, [target], "promote");
    return reply(`👑 *@${target.split("@")[0]} is now an Admin!*`, { mentions: [target] });
  }
);

cmd(
  {
    pattern: "demote",
    desc: "Demote admin to normal member",
    category: "group",
    react: "📉",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, sender, reply }) => {
    if (!isGroup) return reply("❌ *`[ THIS COMMAND IS FOR GROUPS ONLY. ]`*");
    if (!(await checkAdmin(conn, from, sender))) return reply("❌ *`[ ADMIN ONLY ]`*");
    if (!(await checkBotAdmin(conn, from))) return reply("❌ *`[ BOT IS NOT ADMIN ]`*");

    let target = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                 mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!target) return reply("⚠️ *කරුණාකර Dismiss කිරීමට අවශ්‍ය Admin ගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");

    await conn.groupParticipantsUpdate(from, [target], "demote");
    return reply(`📉 *@${target.split("@")[0]} is no longer an Admin.*`, { mentions: [target] });
  }
);

// ── GROUPMODE ON/OFF TOGGLE COMMAND ──
cmd(
  {
    pattern: "groupmgmt",
    alias: ["groupmode", "groupauto"],
    desc: "Toggle Group Management Automation on or off",
    category: "group",
    react: "🛡️",
    filename: __filename,
  },
  async (conn, mek, m, { args, sessionId, reply, isOwner, sender }) => {
    const { checkOwner } = require("./Settings");
    if (!isOwner) return reply("❌ *`[ THIS COMMAND IS OWNER ONLY. ]`*");

    const sub = (args[0] || "").toLowerCase().trim();
    const { setSetting } = require("../lib/botSettings");

    if (sub === "on") {
      await setSetting(sessionId, "group_management", true);
      return reply("🛡️ *Group Automation Suite: ACTIVATED!* 🟢\n\n> Anti-Link, Anti-Badwords, Anti-Spam සහ Auto-Welcome සක්‍රීය විය.");
    }
    if (sub === "off") {
      await setSetting(sessionId, "group_management", false);
      return reply("🛑 *Group Automation Suite: DEACTIVATED!* 🔴\n\n> Group background automation අක්‍රීය කර ඇත.");
    }

    const { readSettings } = require("../lib/botSettings");
    const s = await readSettings(sessionId);
    return reply(`🛡️ *Group Management Automation*\n\nStatus: ${s.group_management ? "🟢 ON" : "🔴 OFF"}\n\nUse:\n*.groupmgmt on* - සක්‍රීය කරන්න\n*.groupmgmt off* - අක්‍රීය කරන්න`);
  }
);

module.exports = {
  handleGroupAutomation,
  handleGroupParticipantsUpdate
};
