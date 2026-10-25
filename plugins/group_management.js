// ╔══════════════════════════════════════════════════════════════════╗
//   MALIYA-MD — Group Security, Moderation & Auto Welcome Suite
//   Features: Anti-Link, Anti-Badwords, Anti-Spam Flood, Auto Welcome
//   Admin Commands: tagall, hidetag, mute, unmute, kick, promote, demote
// ╚══════════════════════════════════════════════════════════════════╝

const { cmd } = require("../command");
const { readSettings } = require("../lib/botSettings");
const { jidNormalizedUser } = require("@whiskeysockets/baileys");

const BAD_WORDS = [
// ── ENGLISH TOXIC & HARASSMENT ──
  "fuck", "fucking", "fucker", "motherfucker", "mf", "bitch", "bitches", "asshole", 
  "dick", "pussy", "bastard", "cunt", "slut", "whore", "dumbass", "jackass", 
  "retard", "nigger", "nigga", "fag", "faggot", "idiot", "moron", "stfu", "bullshit", 
  "shit", "cock", "suck", "dickhead", "scumbag", "dipshit", "prick", "twat", "wanker",
  "douche", "douchebag", "creep", "pervert", "porn", "pornhub", "xvideos", "xxx",
  "nude", "nudes", "hentai", "sex", "boobs", "horny", "rapist", "pedophile",

  // ── SINGLISH INSULTS, ABUSES & VULGAR WORDS ──
  "paka", "pakaya", "pakao", "pakata", "pakiya", "pakis", "pakwal",
  "ponnaya", "ponz", "ponzla", "ponsiya", "ponna", "ponnayo",
  "hutta", "hutti", "hutto", "hutte", "huththa", "huththi", "hukanna", "hukanawa", "hukala", "hukapan", "hukan",
  "kariyo", "kariya", "kariyaa", "kari", "kariyek",
  "ammatapuka", "ammatasiri", "ammapa", "ammapala", "ammatahukanna", "ammatasikana",
  "balla", "balli", "ballek", "ballo", "balu", "walballa",
  "wesige", "wesi", "wesiyo", "wesikama", "wesikeliya",
  "paraya", "paratti", "parayo", "para",
  "thoththa", "thotha", "gona", "meeharaka", "haraka", "modaya", "modi",
  "kalakanniya", "kalakanni", "walatha", "walathaya", "walaththeya",
  "bada", "lolz", "buruwa", "chithra", "jaraa", "jarawa", "chater", "chaater",
  "keriya", "kehilla", "guu", "gukariya", "guuwa", "guukapan", "pukapan", "pukata", "puka",
  "baduwa", "baduwak", "badu", "baduwada", "konda", "lollu", "lollek", "atheparak",
  "athanahapan", "athanawata", "pukshana", "bijja", "biya", "chater",

  // ── SINHALA UNICODE (සිංහල අකුරු) ──
  "පක", "පකයා", "පකයො", "පකෝ", "පකා", "පකී",
  "හුත්ත", "හුත්ති", "හුත්තෝ", "හුකන්නා", "හුකනවා", "හුකපන්", "හුකලා", "හුක්",
  "පොන්නයා", "පොන්න", "පොන්නයෝ", "පොන්සි",
  "කැරියා", "කැරියෝ", "කැරි", "කැරියෙක්",
  "වේසි", "වේසියෙ", "වේසිකම", "වේසියෝ", "වේසිගෙ",
  "අම්මටහුකන්නා", "අම්මටපුක", "අම්මටසිකෙන්න",
  "බල්ලා", "බැල්ලි", "බල්ලෝ", "බල්ලෙක්", "බලුකම",
  "පරයා", "පරට්ටි", "පරයෝ",
  "මෝඩයා", "මෝඩි", "මෝඩයෝ", "මීහරකා", "හරකා", "බූරුවා",
  "කාලකන්නියා", "කාලකන්නි",
  "වල්", "වලත්තයා", "වලත්ත", "වල්පරයා",
  "ගූ", "ගූකන්නා", "ගූකැරියා", "ගූගොඩ",
  "පුක", "පුකට", "පුකේ", "පුකදෙන්න", "පුකදෙනවා",
  "බඩුව", "බඩු", "බඩුවක්",
  "බිජ්ජ", "බිජ්ජා",
  "ලොල්ලා", "ලොල්ලෝ"
];

const spamTracker = new Map();
const userWarnings = new Map();

// Helper: Safely normalize any JID (removes :device, handles undefined)
function cleanJid(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return jidNormalizedUser(jid.split(":")[0] + "@s.whatsapp.net");
}

// Helper: Check if sender is Group Admin
async function checkAdmin(conn, from, sender) {
  try {
    const meta = await conn.groupMetadata(from);
    const target = cleanJid(sender);
    const participant = meta.participants.find(
      (p) => cleanJid(p.id) === target
    );
    return Boolean(participant && (participant.admin === "admin" || participant.admin === "superadmin"));
  } catch (e) {
    return false;
  }
}

// Helper: Check if Bot is Group Admin (Bulletproof device ID match)
async function checkBotAdmin(conn, from) {
  try {
    const meta = await conn.groupMetadata(from);
    const botRaw = conn.user?.id || conn.authState?.creds?.me?.id || "";
    const botClean = cleanJid(botRaw);
    const botNumber = botClean.split("@")[0];

    const botPart = meta.participants.find((p) => {
      const pClean = cleanJid(p.id);
      return pClean === botClean || pClean.split("@")[0] === botNumber;
    });

    return Boolean(botPart && (botPart.admin === "admin" || botPart.admin === "superadmin"));
  } catch (e) {
    console.log("⚠️ Error checking bot admin status:", e?.message || e);
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

    const rawSender = mek.key.participant || mek.participant || from;
    const sender = cleanJid(rawSender);
    const body = String(
      mek.message?.conversation ||
      mek.message?.extendedTextMessage?.text ||
      mek.message?.imageMessage?.caption ||
      mek.message?.videoMessage?.caption ||
      ""
    ).trim();

    if (!body || !sender) return false;

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
        try {
          await sock.sendMessage(from, { delete: mek.key });
        } catch (_) {}
      }
      await sock.sendMessage(from, {
        text: `╭─「 *⚠️ SPAM WARNING* 」─◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ 🚫 *Reason:* Message flooding\n│ ⏳ *Action:* Messages suppressed\n╰──────◆──◆──◆──◆`,
        mentions: [sender]
      });
      return true;
    }

    // ── 🔗 ANTI-LINK PROTECTION (3/3 KICK GUARANTEED) ──
    const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+)/gi;
    if (linkRegex.test(body)) {
      // 1. Link message එක delete කිරීම
      if (isBotAdmin) {
        try {
          await sock.sendMessage(from, { delete: mek.key });
        } catch (delErr) {
          console.log("Delete error:", delErr?.message);
        }
      }

      // 2. Warnings ගණනය කිරීම
      let currentWarn = (userWarnings.get(warnKey) || 0) + 1;

      if (currentWarn >= 3) {
        userWarnings.delete(warnKey);

        if (isBotAdmin) {
          try {
            // Kick action execution
            await sock.groupParticipantsUpdate(from, [sender], "remove");

            await sock.sendMessage(from, {
              text: `╭──「 *⛔ ANTI-LINK REMOVAL* 」──◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ ❌ *Reason:* Sent link 3 times\n│ 🚪 *Status:* Removed from group\n╰───────◆──◆──◆──◆`,
              mentions: [sender]
            });
          } catch (kickErr) {
            console.log("Kick error:", kickErr?.message);
            await sock.sendMessage(from, {
              text: `⚠️ *Kick Failed:* කරුණාකර Bot හට Admin Permissions නිසි පරිදි ලබා දී ඇත්දැයි බලන්න.`
            });
          }
        } else {
          await sock.sendMessage(from, {
            text: `╭──「 *⚠️ ANTI-LINK VIOLATION* 」──◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ ❌ *Attempts:* [ 3 / 3 ] Exceeded!\n│ ⚠️ *Alert:* Bot හට Admin නැති බැවින් සාමාජිකයා ඉවත් කළ නොහැක.\n╰───────◆──◆──◆──◆`,
            mentions: [sender]
          });
        }
      } else {
        userWarnings.set(warnKey, currentWarn);
        await sock.sendMessage(from, {
          text: `╭──「 *⚠️ ANTI-LINK GUARD* 」──◆\n│ 👤 *User:* @${sender.split("@")[0]}\n│ 🚫 *Reason:* Links are strictly prohibited\n│ ⚠️ *Warning:* [ ${currentWarn} / 3 ]\n│ 📢 *Notice:* අවස්ථා 3 ම අවසන් වූ විට සමූහයෙන් ඉවත් කරනු ලැබේ.\n╰───────◆──◆──◆──◆`,
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
        try {
          await sock.sendMessage(from, { delete: mek.key });
        } catch (_) {}
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

    for (const participant of participants) {
      const rawJid = typeof participant === "string" 
        ? participant 
        : (participant?.id || participant?.jid);

      if (!rawJid || typeof rawJid !== "string") continue;

      const user = cleanJid(rawJid);
      const userNum = user.split("@")[0] || "Member";

      let ppUrl = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/ChatGPT%20Image%20Jan%2018%2C%202026%2C%2012_27_25%20PM.png";
      try {
        const fetched = await sock.profilePictureUrl(user, "image");
        if (fetched) ppUrl = fetched;
      } catch (_) {}

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
      const normalizedP = cleanJid(p.id);
      text += `│ *[ ${num} ]* @${normalizedP.split("@")[0]}\n`;
      mentions.push(normalizedP);
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
    const mentions = meta.participants.map((p) => cleanJid(p.id));
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

    let rawTarget = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                    mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!rawTarget) return reply("⚠️ *කරුණාකර ඉවත් කිරීමට අවශ්‍ය සාමාජිකයාගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");
    
    const target = cleanJid(rawTarget);
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

    let rawTarget = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                    mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!rawTarget) return reply("⚠️ *කරුණාකර Admin කිරීමට අවශ්‍ය කෙනාගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");

    const target = cleanJid(rawTarget);
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

    let rawTarget = mek.message?.extendedTextMessage?.contextInfo?.participant ||
                    mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!rawTarget) return reply("⚠️ *කරුණාකර Dismiss කිරීමට අවශ්‍ය Admin ගේ message එකක් quote කරන්න හෝ @mention කරන්න.*");

    const target = cleanJid(rawTarget);
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
