// plugins/cmd_autofix_confirm.js
// ✅ Friendly command auto-fix with confirmation (1=run / 2=cancel)
// ✅ FIXED: uses ctx.commands (from index.js) to avoid empty/mismatch commands list

const prefix = ".";
const ENABLED = true;
const THRESHOLD = 0.62;   // 0.55~0.70 best
const TIMEOUT_MS = 25000; // 45 seconds

// pending confirm per chat
const pending = new Map(); // chatId -> { fixedBody, expiresAt, suggestName, wrongName }

function normCmd(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

// simple prefix similarity (good for typos)
function similarity(a, b) {
  a = normCmd(a);
  b = normCmd(b);
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);

  let same = 0;
  for (let i = 0; i < minLen; i++) if (a[i] === b[i]) same++;
  return same / maxLen;
}

function isYes(text) {
  const t = String(text || "").trim().toLowerCase();
  return ["1", "yes", "y", "ok", "okay", "ow", "hari", "ha", "ela", "gammak"].includes(t);
}
function isNo(text) {
  const t = String(text || "").trim().toLowerCase();
  return ["2", "no", "n", "epa", "na", "cancel", "oka neme", "eeya"].includes(t);
}

function cmdExists(commandName, commandsList) {
  const cn = normCmd(commandName);
  if (!cn) return false;

  for (const c of commandsList || []) {
    const p = c?.pattern;

    // pattern string
    if (typeof p === "string" && normCmd(p) === cn) return true;

    // alias array
    if (Array.isArray(c?.alias)) {
      for (const a of c.alias) {
        if (typeof a === "string" && normCmd(a) === cn) return true;
      }
    }
  }
  return false;
}

function bestMatch(commandName, commandsList) {
  const cn = normCmd(commandName);
  if (!cn) return null;

  let best = null;
  let bestScore = 0;

  for (const c of commandsList || []) {
    const p = c?.pattern;
    if (typeof p === "string" && p.trim()) {
      const s1 = similarity(cn, p);
      if (s1 > bestScore) {
        bestScore = s1;
        best = p; // return real pattern
      }
    }

    if (Array.isArray(c?.alias)) {
      for (const a of c.alias) {
        if (typeof a !== "string") continue;
        const s2 = similarity(cn, a);
        if (s2 > bestScore) {
          bestScore = s2;
          best = typeof c.pattern === "string" ? c.pattern : a; // execute main pattern if possible
        }
      }
    }
  }

  if (best && bestScore >= THRESHOLD) {
    return { name: best, score: bestScore };
  }
  return null;
}

async function onMessage(conn, mek, m, ctx = {}) {
  if (!ENABLED) return { handled: false };

  const from = ctx.from || mek?.key?.remoteJid;
  const body = String(ctx.body || "").trim();
  const reply = ctx.reply;

  // IMPORTANT: use commands list passed from index.js (correct one)
  const commandsList = Array.isArray(ctx.commands) ? ctx.commands : [];

  if (!from || !body || typeof reply !== "function") return { handled: false };

  // If commands list is empty, don't block anything (prevents "everything is wrong" bug)
  if (!commandsList.length) return { handled: false };

  // 1) pending confirm
  const p = pending.get(from);
  if (p) {
    if (Date.now() > p.expiresAt) {
      pending.delete(from);
      await reply("⏳ හරි ංdear, confirm time එක ඉවරයි. ආයෙ command එක type කරන්න 🙂");
      return { handled: true, newBody: null };
    }

    if (isYes(body)) {
      pending.delete(from);
      await reply(`✅ හරි! *${prefix}${p.suggestName}* run කරනවා… ⚡`);
      return { handled: true, newBody: p.fixedBody };
    }

    if (isNo(body)) {
      pending.delete(from);
      await reply("👌 Okay dear. Command එක ආයෙ හරි විදිහට දාලා try කරන්න 🙂");
      return { handled: true, newBody: null };
    }

    // allow normal chat while pending (keep pending)
    return { handled: false };
  }

  // 2) only process if it's a command
  if (!body.startsWith(prefix)) return { handled: false };

  const raw = body.slice(prefix.length).trim();
  const commandName = raw.split(" ")[0].toLowerCase();
  const args = raw.split(/ +/).slice(1);
  const q = args.join(" ");

  // ✅ if command exists, do NOTHING (very important)
  if (cmdExists(commandName, commandsList)) return { handled: false };

  // ✅ suggest best match
  const best = bestMatch(commandName, commandsList);
  if (!best?.name) {
    await reply(`😕 මේ command එක අඳුරගන්න බැරිවුනා: *${prefix}${commandName}*\nTry: *.menu*`);
    return { handled: true, newBody: null };
  }

  const fixedBody = `${prefix}${best.name}${q ? " " + q : ""}`;

  pending.set(from, {
    fixedBody,
    expiresAt: Date.now() + TIMEOUT_MS,
    suggestName: best.name,
    wrongName: commandName,
  });

  await reply(
    `😅 hey buddy මේ command එක හරි නෑ වගේ: *${prefix}${commandName}*\n\n` +
      `ඔයා කියන්නෙ මේකද? 👉 *${prefix}${best.name}*\n\n` +
      `✅ Run කරන්න නම් *1* reply කරන්න\n` +
      `❌ Cancel කරන්න නම් *2* reply කරන්න\n\n` +
      `⏳ (25 seconds ඇතුළත)`
  );

  return { handled: true, newBody: null };
}

module.exports = { onMessage };
