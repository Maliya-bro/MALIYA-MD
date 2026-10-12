// plugins/anti-spam.js
// Hybrid Anti-Spam (Virtex Auto-Delete + Normal Spam Tiered Mute/Block)

const { cmd } = require("../command");
const { readSettings } = require("../lib/botSettings");

const spamStore = new Map(); 
// key: senderJid => { timestamps, state, until, lastWarned, strikes }

function getKey(senderJid) {
  return senderJid;
}

// 🔥 VIRTEX / BUG PAYLOAD DETECTOR 🔥
function isVirtexPayload(mek) {
  if (!mek || !mek.message) return false;

  try {
    const text =
      mek.message.conversation ||
      mek.message.extendedTextMessage?.text ||
      "";

    if (text.length > 10000) return true;

    const weirdChars = text.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u0300-\u036F]/g);
    if (weirdChars && weirdChars.length > 500) return true;

    const rawJson = JSON.stringify(mek.message);
    if (rawJson.length > 25000) return true;

    return false;
  } catch (e) {
    return false;
  }
}

// ── Main logic ──────────────────────────────────
async function handleAntiSpam(sock, mek, m, { from, sender, senderNumber, isOwner, reply, sessionId }) {
  let settings = { anti_spam: true };
  try {
    settings = await readSettings(sessionId);
  } catch {}

  if (!settings.anti_spam) return true;
  if (isOwner) return true; // Owner exempt

  const chatJid = from;
  const senderJid = sender;
  const key = getKey(senderJid);
  const now = Date.now();

  let record = spamStore.get(key);
  if (!record) {
    record = {
      timestamps: [],
      state: "normal",
      until: 0,
      lastWarned: 0,
      strikes: 0 // Track strike level: 0 = none, 1 = warned, 2 = muted, 3 = blocked
    };
    spamStore.set(key, record);
  }

  // ==========================================
  // 🐛 1. VIRTEX / CRASH BUG ACTION
  // ==========================================
  if (isVirtexPayload(mek)) {
    try {
      await sock.sendMessage(chatJid, { delete: mek.key });
    } catch (e) {}

    record.state = "blocked";
    record.until = now + 5 * 60 * 1000; // 5 Minutes
    record.lastWarned = now;
    record.strikes = 3;
    spamStore.set(key, record);

    await reply(
      `⛔ *VIRTEX / CRASH BUG DETECTED!*\n\n` +
      `⚠️ _මෙම පණිවිඩය WhatsApp Crash කිරීමට එවන ලද්දක් බැවින් එය Auto-Delete කරන ලදී._\n` +
      `🚫 *ඔයාව විනාඩි 5කට BLOCK කරනු ලැබුවා!*`
    );
    return false;
  }

  // ==========================================
  // 🚫 2. CURRENTLY BLOCKED / MUTED CHECK
  // ==========================================
  if (record.until > now) {
    if (record.state === "blocked") {
      if (now - record.lastWarned > 10000) {
        const remaining = Math.ceil((record.until - now) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;

        await reply(
          `🚫 *ඔයා දැනට BLOCK කරලයි තියෙන්නේ!*\n` +
          `⏳ *ඉතිරි කාලය:* \`${mins}m${secs}s\`\n` +
          `_කාලය අවසන් වූ පසු ස්වයංක්‍රීයව Unblock වේ._`
        );
        record.lastWarned = now;
        spamStore.set(key, record);
      }
      return false;
    }

    if (record.state === "muted") {
      if (now - record.lastWarned > 3000) {
        const remaining = Math.ceil((record.until - now) / 1000);
        await reply(`🔇 *ඔයා දැනට MUTE කරලයි තියෙන්නේ!*\n⏳ තව තත්පර \`${remaining}s\` ක් රැඳී සිටින්න.`);
        record.lastWarned = now;
        spamStore.set(key, record);
      }
      return false;
    }
  }

  // කාලය අවසන් වූ විට State Reset කිරීම (Strike count එක පහත හෙලීම)
  if (record.until > 0 && record.until <= now) {
    record.state = "normal";
    record.until = 0;
    // Cool down strikes gradually
    if (record.strikes > 0) record.strikes -= 1;
  }

  // ==========================================
  // 💬 3. SPAM RATE CALCULATION
  // ==========================================
  // තත්පර 5ක් ඇතුලත timestamps පමණක් තබා ගැනීම
  record.timestamps = record.timestamps.filter((t) => now - t < 5000);
  record.timestamps.push(now);

  const msgCountIn5s = record.timestamps.length;

  // Strike Escalation Logic:
  // - 3 මැසේජ් තත්පර 5ක් ඇතුලත -> Warning (Strike 1)
  // - 5 මැසේජ් තත්පර 5ක් ඇතුලත -> Mute (Strike 2, 10 seconds)
  // - 7+ මැසේජ් තත්පර 5ක් ඇතුලත -> Block (Strike 3, 2 minutes)

  if (msgCountIn5s >= 7) {
    // 🚫 Tier 3: Block
    record.state = "blocked";
    record.until = now + 2 * 60 * 1000; // 2 Minutes
    record.lastWarned = now;
    record.strikes = 3;
    spamStore.set(key, record);

    await reply(
      `⛔ *SPAM DETECTED!*\n\n` +
      `🚫 *ඔයා දිගටම spam කළ නිසා විනාඩි 2කට BLOCK කරනු ලැබුවා!*\n` +
      `_කාලය අවසන් වූ පසු Auto Unblock වනු ඇත._`
    );
    return false;
  } else if (msgCountIn5s >= 5) {
    // 🔇 Tier 2: Mute
    record.state = "muted";
    record.until = now + 10 * 1000; // 10 Seconds
    record.lastWarned = now;
    record.strikes = 2;
    spamStore.set(key, record);

    await reply(
      `🔇 *MUTE WARNING!*\n\n` +
      `⚠️ ඔයා ඉතා වේගයෙන් පණිවිඩ එවයි. ඔයාව තත්පර 10කට *MUTE* කරන ලදී.`
    );
    return false;
  } else if (msgCountIn5s >= 3 && record.strikes < 1) {
    // ⚠️ Tier 1: Warning
    record.strikes = 1;
    record.lastWarned = now;
    spamStore.set(key, record);

    await reply(
      `⚠️ *SLOW DOWN!*\n\n` +
      `_කරුණාකර පණිවිඩ එවන වේගය අඩු කරන්න. දිගටම එවුවහොත් Mute හෝ Block විය හැක._`
    );
    return true;
  }

  spamStore.set(key, record);
  return true;
}

// ── Command: .unblock (Owner Only) ────────────────────────
cmd(
  {
    pattern: "unlock",
    alias: ["ul", "unmute"],
    react: "🔓",
    desc: "Unblock/Unmute a user from anti-spam (Owner only)",
    category: "owner",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, reply, isOwner }) => {
    if (!isOwner) {
      return reply("❌ *This command is owner only.*");
    }

    const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    let targetJid = sender;
    if (mentioned && mentioned.length > 0) {
      targetJid = mentioned[0];
    } else if (mek.message?.extendedTextMessage?.contextInfo?.participant) {
      targetJid = mek.message.extendedTextMessage.contextInfo.participant;
    }

    const key = getKey(targetJid);
    const record = spamStore.get(key);

    if (!record || (record.state !== "blocked" && record.state !== "muted")) {
      return reply("✅ *User is not currently blocked or muted.*");
    }

    record.state = "normal";
    record.until = 0;
    record.strikes = 0;
    record.timestamps = [];
    spamStore.set(key, record);

    const targetName = targetJid.split("@")[0];
    await reply(`🔓 *@${targetName} unblocked successfully!*\n_දැන් සාමාන්‍ය පරිදි පණිවිඩ එවිය හැක._`);
  }
);

// ── Auto cleanup ──────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of spamStore.entries()) {
    if (record.state === "normal" && record.timestamps.length > 0) {
      const last = record.timestamps[record.timestamps.length - 1];
      if (now - last > 120000) {
        spamStore.delete(key);
        continue;
      }
    }
    if (record.state !== "normal" && record.until > 0 && now > record.until + 60000) {
      spamStore.delete(key);
    }
  }
}, 300000);

module.exports = { handleAntiSpam };
