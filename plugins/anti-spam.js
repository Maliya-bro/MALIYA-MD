// plugins/anti-spam.js
// Advanced Anti-Spam with tiered protection

const { cmd } = require("../command");
const { readSettings } = require("../lib/botSettings");

// ── In‑memory store ──────────────────────────────────────────
const spamStore = new Map(); // key: "chatJid::senderJid" => { timestamps, state, until, lastWarned }

// ✅ Rules
const WARNING_COUNT = 4;        // 4th message triggers warning
const MUTE_COUNT = 6;           // within 5s
const TEMP_BLOCK_COUNT = 14;    // within 10s
const LONG_BLOCK_COUNT = 30;    // within 20s

const MUTE_DURATION = 10 * 1000;          // 10 seconds
const TEMP_BLOCK_DURATION = 3 * 60 * 1000; // 3 minutes
const LONG_BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

// ✅ Windows
const WINDOW_WARNING = 3 * 1000;   // 3s
const WINDOW_MUTE = 5 * 1000;      // 5s
const WINDOW_TEMP = 10 * 1000;     // 10s
const WINDOW_LONG = 20 * 1000;     // 20s

// ── Helper: Get store key ──────────────────────────────────
function getKey(chatJid, senderJid) {
  return `${chatJid}::${senderJid}`;
}

// ── Helper: Count messages in window ──────────────────────
function countInWindow(timestamps, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  return timestamps.filter(ts => ts > cutoff).length;
}

// ── Helper: Clean old timestamps ──────────────────────────
function cleanTimestamps(timestamps, windowMs = 20000) {
  const now = Date.now();
  const cutoff = now - windowMs;
  return timestamps.filter(ts => ts > cutoff);
}

// ── Main anti‑spam logic ──────────────────────────────────
async function handleAntiSpam(sock, mek, m, { from, sender, senderNumber, isOwner, reply, sessionId }) {
  // 🔥 BUG FIX: Passed sessionId to readSettings
  const settings = await readSettings(sessionId);
  if (!settings.anti_spam) return true; // allow message

  // Owner is exempt
  if (isOwner) return true;

  const chatJid = from;
  const senderJid = sender;
  const key = getKey(chatJid, senderJid);

  // Get or create user record
  let record = spamStore.get(key);
  if (!record) {
    record = { timestamps: [], state: 'normal', until: 0, warned: false, lastWarned: 0 };
    spamStore.set(key, record);
  }

  const now = Date.now();

  // ── Clean old timestamps (keep last 60s for safety) ────
  record.timestamps = cleanTimestamps(record.timestamps, 60000);
  record.timestamps.push(now);

  // ── 🔥 BUG FIX: Rate-limit Bot's own warnings so it doesn't spam back ────
  if (record.state === 'blocked' && record.until > now) {
    if (now - record.lastWarned > 10000) { // Only warn once every 10 seconds
      const remaining = Math.ceil((record.until - now) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      let msg = `🚫 *You are temporarily blocked from using this bot!*\n`;
      msg += `⏳ Remaining: ${minutes}m ${seconds}s\n`;
      msg += `📌 Reason: Spam detected.\n`;
      if (remaining > 300) {
        msg += `\n👑 *Owner can unblock you with:* \`.unblock\` in this chat.`;
      }
      await reply(msg);
      record.lastWarned = now;
    }
    return false; // block message
  }

  if (record.state === 'muted' && record.until > now) {
    if (now - record.lastWarned > 5000) { // Only warn once every 5 seconds
      const remaining = Math.ceil((record.until - now) / 1000);
      await reply(`🔇 *You are muted for ${remaining} seconds due to spam.*`);
      record.lastWarned = now;
    }
    return false; // mute message
  }

  // If block/mute expired, reset state
  if (record.state === 'blocked' && record.until <= now) {
    record.state = 'normal';
    record.until = 0;
    record.warned = false;
    record.timestamps = [];
  }
  if (record.state === 'muted' && record.until <= now) {
    record.state = 'normal';
    record.until = 0;
    record.warned = false;
  }

  // ── Count messages in each window ──────────────────────
  const countWarning = countInWindow(record.timestamps, WINDOW_WARNING);
  const count5s = countInWindow(record.timestamps, WINDOW_MUTE);
  const count10s = countInWindow(record.timestamps, WINDOW_TEMP);
  const count20s = countInWindow(record.timestamps, WINDOW_LONG);

  // ── Apply tiered rules ──────────────────────────────────
  // Tier 4: Long block (1 hour)
  if (count20s >= LONG_BLOCK_COUNT) {
    record.state = 'blocked';
    record.until = now + LONG_BLOCK_DURATION;
    record.lastWarned = now;
    await reply(`🚫 *You have been BLOCKED for 1 HOUR due to excessive spamming!*\n\n📌 Contact owner to unblock: \`.unblock\``);
    spamStore.set(key, record);
    return false;
  }

  // Tier 3: Temp block (3 min)
  if (count10s >= TEMP_BLOCK_COUNT) {
    record.state = 'blocked';
    record.until = now + TEMP_BLOCK_DURATION;
    record.lastWarned = now;
    await reply(`⛔ *You have been TEMPORARILY BLOCKED for 3 minutes due to spam!*`);
    spamStore.set(key, record);
    return false;
  }

  // Tier 2: Mute (10 sec)
  if (count5s >= MUTE_COUNT) {
    record.state = 'muted';
    record.until = now + MUTE_DURATION;
    record.lastWarned = now;
    await reply(`🔇 *You have been MUTED for 10 seconds due to spam!*`);
    spamStore.set(key, record);
    return false;
  }

  // Tier 1: Warning (4 messages within 3 seconds)
  if (countWarning >= WARNING_COUNT && !record.warned) {
    record.warned = true;
    await reply(`⚠️ *Warning!* You are sending too many messages.\n📌 Please slow down to avoid being muted or blocked.`);
    spamStore.set(key, record);
  }

  if (record.warned && countWarning < WARNING_COUNT) {
    record.warned = false;
    spamStore.set(key, record);
  }

  spamStore.set(key, record);
  return true; // allow message
}

// ── Command: .unblock (owner only) ────────────────────────
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
    await reply(`🔓 *Unblocked @${targetName} successfully!*\n✅ They can now use the bot normally.`);
  }
);

// ── Auto cleanup every 5 minutes ──────────────────────────
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
