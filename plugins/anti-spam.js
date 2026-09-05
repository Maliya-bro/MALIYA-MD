// plugins/anti-spam.js
// Hybrid Anti-Spam (Virtex Auto-Delete + Normal Spam Tiered Mute/Block)

const { cmd } = require("../command");
const { readSettings } = require("../lib/botSettings");

const spamStore = new Map(); 
// key: "chatJid::senderJid" => { timestamps, state, until, lastWarned, warned }

function getKey(chatJid, senderJid) {
  return `${chatJid}::${senderJid}`;
}

// 🔥 VIRTEX / BUG PAYLOAD DETECTOR 🔥
function isVirtexPayload(mek) {
    if (!mek || !mek.message) return false;
    
    try {
        let text = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
        if (text.length > 10000) return true; // අකුරු 10,000 ට වැඩි නම්

        const weirdChars = text.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u0300-\u036F]/g);
        if (weirdChars && weirdChars.length > 500) return true; // නොපෙනෙන අකුරු 500 ට වැඩි නම්

        const rawJson = JSON.stringify(mek.message);
        if (rawJson.length > 25000) return true; // ලොකු Contact/Location Bug එකක් නම්

        return false;
    } catch (e) {
        return false;
    }
}

// ── Main logic ──────────────────────────────────
async function handleAntiSpam(sock, mek, m, { from, sender, senderNumber, isOwner, reply, sessionId }) {
  const settings = await readSettings(sessionId);
  if (!settings.anti_spam) return true; 

  if (isOwner) return true; // Owner ට මේ නීති අදාල නෑ! 😎

  const chatJid = from;
  const senderJid = sender;
  const key = getKey(chatJid, senderJid);
  const now = Date.now();

  let record = spamStore.get(key);
  if (!record) {
    record = { timestamps: [], state: 'normal', until: 0, lastWarned: 0, warned: false };
    spamStore.set(key, record);
  }

  // ==========================================
  // 🐛 1. VIRTEX / CRASH BUG ACTION
  // ==========================================
  if (isVirtexPayload(mek)) {
      // Bug එකක් ආපු ගමන්, ඒ මැසේජ් එක Auto Delete කරනවා! 🗑️
      try {
          await sock.sendMessage(chatJid, { delete: mek.key });
      } catch(e) {}

      // යූසර්ව කෙලින්ම විනාඩි 2කට Block කරනවා
      record.state = 'blocked';
      record.until = now + (2 * 60 * 1000); 
      record.lastWarned = now;
      spamStore.set(key, record);

      await reply(`⛔ *VIRTEX / CRASH BUG DETECTED!*\n\n⚠️ මෙම පණිවිඩය WhatsApp Crash කිරීමට එවන ලද්දක් බැවින් එය *Auto Delete* කරන ලදී.\n🚫 *ඔයාව විනාඩි 2කට BLOCK කරනු ලැබුවා!*`);
      return false; // මැසේජ් එක නවත්තනවා
  }

  // ==========================================
  // 💬 2. NORMAL MESSAGE SPAM ACTION
  // ==========================================
  
  // 🚫 දැනටමත් Block වෙලා නම්...
  if (record.state === 'blocked' && record.until > now) {
      if (now - record.lastWarned > 10000) { // තත්පර 10කට සැරයක් විතරක් මතක් කරනවා
          const remaining = Math.ceil((record.until - now) / 1000);
          const minutes = Math.floor(remaining / 60);
          const seconds = remaining % 60;
          await reply(`🚫 *ඔයා දැනට බ්ලොක් කරලයි තියෙන්නේ!*\n⏳ ඉතුරු කාලය: ${minutes}m ${seconds}s\n_(කාලය ඉවර වුණාම Auto Unblock වෙනවා)_`);
          record.lastWarned = now;
      }
      return false; 
  }

  // 🔇 දැනටමත් Mute වෙලා නම්...
  if (record.state === 'muted' && record.until > now) {
      if (now - record.lastWarned > 3000) { // තත්පර 3කට සැරයක් මතක් කරනවා
          const remaining = Math.ceil((record.until - now) / 1000);
          await reply(`🔇 *ඔයා දැනට MUTE කරලයි තියෙන්නේ!*\n⏳ තව තත්පර ${remaining} ක් ඉන්න.`);
          record.lastWarned = now;
      }
      return false; 
  }

  // කාලය ඉවර නම්, එයාව නිදහස් කරනවා (Auto Unblock / Unmute)
  if ((record.state === 'blocked' || record.state === 'muted') && record.until <= now) {
      record.state = 'normal';
      record.until = 0;
      record.warned = false;
  }

  // තත්පර 10ක් ඇතුලත දාපු මැසේජ් විතරක් මතක තියාගන්නවා
  record.timestamps = record.timestamps.filter(t => now - t < 10000);
  record.timestamps.push(now);
  
  // ⏱️ තත්පර 3ක් ඇතුලත දාපු මැසේජ් ගාන ගන්නවා
  const count3s = record.timestamps.filter(t => now - t < 3000).length;

  if (count3s >= 5) {
      // 🚫 Strike 3: මැසේජ් 5ක් තත්පර 3ක් ඇතුලත - විනාඩි 2ක් Block!
      record.state = 'blocked';
      record.until = now + (2 * 60 * 1000); // 2 Minutes
      record.lastWarned = now;
      await reply(`⛔ *SPAM DETECTED!*\n\n🚫 *ඔයා දිගටම ස්පෑම් කරපු නිසා විනාඩි 2කට BLOCK කරනු ලැබුවා!*\n_(විනාඩි 2කට පසුව Auto Unblock වනු ඇත)_`);
      spamStore.set(key, record);
      return false;

  } else if (count3s === 4) {
      // 🔇 Strike 2: මැසේජ් 4ක් තත්පර 3ක් ඇතුලත - තත්පර 5ක් Mute!
      record.state = 'muted';
      record.until = now + 5000; // 5 Seconds
      record.lastWarned = now;
      await reply(`🔇 *Warning!* ඔයා වේගෙන් මැසේජ් දානවා වැඩියි. ඔයාව තත්පර 5කට MUTE කරා!`);
      spamStore.set(key, record);
      return false;

  } else if (count3s === 3 && !record.warned) {
      // ⚠️ Strike 1: මැසේජ් 3ක් තත්පර 3ක් ඇතුලත - Warning!
      record.warned = true;
      await reply(`⚠️ *Warning!* කරුණාකර ටිකක් හිමින් මැසේජ් දාන්න. නැත්නම් ඔයාව Block වෙයි.`);
      spamStore.set(key, record);
  }

  spamStore.set(key, record);
  return true; // සාමාන්‍ය මැසේජ් එකක් නම් යන්න දෙනවා
}

// ── Command: .unblock (Owner Only) ────────────────────────
cmd(
  {
    pattern: "unblock",
    alias: ["ub"],
    react: "🔓",
    desc: "Unblock a user from anti-spam in this chat (owner only)",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, reply, isOwner }) => {
    if (!isOwner) {
      return reply("❌ *This command is owner only.*");
    }

    const chatJid = from;
    const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    let targetJid = sender;
    if (mentioned && mentioned.length > 0) {
      targetJid = mentioned[0];
    } else if (mek.message?.extendedTextMessage?.contextInfo?.participant) {
      targetJid = mek.message.extendedTextMessage.contextInfo.participant;
    }

    const key = getKey(chatJid, targetJid);
    const record = spamStore.get(key);
    if (!record || (record.state !== 'blocked' && record.state !== 'muted')) {
      return reply(`✅ *User is not currently blocked or muted.*`);
    }

    record.state = 'normal';
    record.until = 0;
    record.warned = false;
    record.timestamps = [];
    spamStore.set(key, record);

    const targetName = targetJid.split('@')[0];
    await reply(`🔓 *Unblocked @${targetName} successfully!*\n✅ දැන් ආයෙමත් මැසේජ් දාන්න පුළුවන්.`);
  }
);

// ── Auto cleanup ──────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of spamStore.entries()) {
    if (record.state === 'normal' && record.timestamps.length > 0) {
      const last = record.timestamps[record.timestamps.length - 1];
      if (now - last > 120000) {
        spamStore.delete(key);
        continue;
      }
    }
    if (record.state !== 'normal' && record.until > 0 && now > record.until + 60000) {
      spamStore.delete(key);
    }
  }
}, 300000);

module.exports = { handleAntiSpam };
