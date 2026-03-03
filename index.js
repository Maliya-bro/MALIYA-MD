// index.js (FULL CODE) ✅ Status Auto Seen + React FIXED (Baileys latest) + Cmd Auto-Fix
// ------------------------------------------------------------

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const P = require("pino");
const express = require("express");
const path = require("path");

const config = require("./config");
const { sms } = require("./lib/msg");
const { File } = require("megajs");
const { commands, replyHandlers } = require("./command");

// ✅ auto msg plugin (GEMINI_API_KEY2 uses in plugin)
const autoMsgPlugin = require("./plugins/auto_msg.js");

const app = express();
const port = process.env.PORT || 8000;

const prefix = ".";
const ownerNumber = ["94701369636"];
const authDir = path.join(__dirname, "/auth_info_baileys/");
const credsPath = path.join(authDir, "creds.json");

/* ================= COMMAND AUTO-FIX SETTINGS ================= */
const CMD_AUTOFIX_ENABLED = true;
const CMD_AUTOFIX_THRESHOLD = 0.62; // 0.55~0.70 best, tune if needed

function _normCmd(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// prefix-based similarity (fast & good for typos)
function _cmdSimilarity(a, b) {
  a = _normCmd(a);
  b = _normCmd(b);
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);

  let same = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) same++;
  }
  return same / maxLen;
}

function findBestCommandName(input) {
  const inCmd = _normCmd(input);
  if (!inCmd) return null;

  let best = null;
  let bestScore = 0;

  for (const c of commands || []) {
    const name = c?.pattern;
    if (!name) continue;

    const score = _cmdSimilarity(inCmd, name);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }

    if (Array.isArray(c.alias)) {
      for (const al of c.alias) {
        const s2 = _cmdSimilarity(inCmd, al);
        if (s2 > bestScore) {
          bestScore = s2;
          best = name; // execute main pattern
        }
      }
    }
  }

  if (best && bestScore >= CMD_AUTOFIX_THRESHOLD) {
    return { name: best, score: bestScore };
  }
  return null;
}

/* ================= SESSION CHECK ================= */
async function ensureSessionFile() {
  try {
    if (!fs.existsSync(credsPath)) {
      if (!config.SESSION_ID) {
        console.error("❌ SESSION_ID missing");
        process.exit(1);
      }

      console.log("🔄 Downloading session from MEGA...");
      const filer = File.fromURL(`https://mega.nz/file/${config.SESSION_ID}`);

      filer.download((err, data) => {
        if (err) {
          console.error("❌ Session download failed:", err);
          process.exit(1);
        }
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(credsPath, data);
        console.log("✅ Session restored. Restarting...");
        setTimeout(connectToWA, 2000);
      });
    } else {
      setTimeout(connectToWA, 1000);
    }
  } catch (e) {
    console.error("❌ ensureSessionFile error:", e);
    process.exit(1);
  }
}

/* ================= PLUGINS ================= */
const antiDeletePlugin = require("./plugins/antidelete.js");
global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin); // ✅ keep as-is

/* ================= CONNECT ================= */
async function connectToWA() {
  console.log("Connecting MALIYA-MD 🧬...");

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  /* ========== CONNECTION UPDATE ========== */
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting...");
        connectToWA();
      } else {
        console.log("❌ Logged out. Delete auth_info_baileys and re-pair.");
      }
    }

    if (connection === "open") {
      console.log("✅ MALIYA-MD connected");

      /* ===== PREMIUM CONNECT MESSAGE ===== */
      const OWNER_NAME = "Malindu Nadith";
      const BOT_VERSION = "v4.0.0";

      const now = new Date();
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);

      const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      const up = `
 🌈━━━━━━━━━━━━━🌈
🔥🤖 *MALIYA-MD* 🤖🔥
 🌈━━━━━━━━━━━━━🌈

✅✨ Connection : CONNECTED & ONLINE
⚡🧬 System     : STABLE | FAST | SECURE
🛡️🔐 Mode       : PUBLIC
🎯🧩 Prefix     : ${prefix}

🧑‍💻👑 Owner      : ${OWNER_NAME}
🚀📦 Version    : ${BOT_VERSION}

🕒⏳ Time       : ${time}
📅🗓️ Date       : ${date}

💬📖 Type  .menu  to start
🔥🚀 Powered by MALIYA-MD Engine
🌈━━━━━━━━━━━🌈
`.trim();

      try {
        await sock.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
          image: {
            url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Screenshot%202026-01-18%20122855.png?raw=true",
          },
          caption: up,
        });
      } catch (e) {
        console.log("⚠️ Connect msg send failed:", e?.message || e);
      }

      // load plugins
      try {
        fs.readdirSync("./plugins/").forEach((plugin) => {
          if (plugin.endsWith(".js")) require(`./plugins/${plugin}`);
        });
      } catch (e) {
        console.log("⚠️ Plugin load error:", e?.message || e);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  /* ================= MESSAGE HANDLER ================= */
  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!messages || !messages.length) return;

    for (const mek0 of messages) {
      const mek = mek0;
      if (!mek?.message) continue;

      // unwrap ephemeral
      mek.message =
        getContentType(mek.message) === "ephemeralMessage"
          ? mek.message.ephemeralMessage.message
          : mek.message;

      // ✅ plugins onMessage (keep as-is)  [antidelete etc.]
      if (global.pluginHooks) {
        for (const plugin of global.pluginHooks) {
          if (plugin.onMessage) {
            try {
              await plugin.onMessage(sock, mek);
            } catch {}
          }
        }
      }

      /* ============================================================
         ✅✅✅ STATUS AUTO SEEN + REACT + FORWARD (FIXED)
         ============================================================ */
      if (mek.key?.remoteJid === "status@broadcast") {
        const participantRaw = mek.key.participant; // status owner
        const id = mek.key.id;

        if (!participantRaw || !id) continue;

        // normalize jids
        const participant = jidNormalizedUser(participantRaw);
        const myJid = jidNormalizedUser(sock.user?.id || "");

        const mentionJid = participant.includes("@s.whatsapp.net")
          ? participant
          : participant + "@s.whatsapp.net";

        // ✅ Proper status key
        const statusKey = {
          remoteJid: "status@broadcast",
          id,
          participant,
          fromMe: false,
        };

        // ✅ Seen
        if (String(config.AUTO_STATUS_SEEN).toLowerCase() === "true") {
          try {
            await sock.readMessages([statusKey]);
            try {
              await sock.sendReadReceipt("status@broadcast", participant, [id]);
            } catch {}
            console.log(`[✓] Status seen: ${id} (${participant})`);
          } catch (e) {
            console.error("❌ Failed to mark status as seen:", e?.message || e);
          }
        }

        // ✅ React
        if (String(config.AUTO_STATUS_REACT).toLowerCase() === "true") {
          try {
            const emojis = [
              "❤️","💸","😇","🍂","💥","💯","🔥","💫","💎","💗","🤍","🖤","👀","🙌","🙆","🚩",
              "🥰","💐","😎","✅","🫀","😁","😄","🌸","🕊️","🌷","⛅","🌟","🗿","💜","🌝"
            ];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            await sock.sendMessage(
              "status@broadcast",
              { react: { text: randomEmoji, key: statusKey } },
              { statusJidList: [participant, myJid].filter(Boolean) }
            );

            console.log(`[✓] Reacted to status of ${participant} with ${randomEmoji}`);
          } catch (e) {
            console.error("❌ Failed to react to status:", e?.message || e);
          }
        }

        // ✅ Forward text-only status to owner
        if (
          mek.message?.extendedTextMessage &&
          !mek.message.imageMessage &&
          !mek.message.videoMessage
        ) {
          const text = mek.message.extendedTextMessage.text || "";
          if (text.trim().length > 0) {
            try {
              await sock.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                text: `📝 *Text Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${text}`,
                mentions: [mentionJid],
              });
              console.log(`✅ Text-only status from ${mentionJid} forwarded.`);
            } catch (e) {
              console.error("❌ Failed to forward text status:", e?.message || e);
            }
          }
        }

        // ✅ Forward image/video status to owner
        if (mek.message?.imageMessage || mek.message?.videoMessage) {
          try {
            const msgType = mek.message.imageMessage ? "imageMessage" : "videoMessage";
            const mediaMsg = mek.message[msgType];

            const stream = await downloadContentFromMessage(
              mediaMsg,
              msgType === "imageMessage" ? "image" : "video"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const mimetype =
              mediaMsg.mimetype || (msgType === "imageMessage" ? "image/jpeg" : "video/mp4");
            const captionText = mediaMsg.caption || "";

            await sock.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
              [msgType === "imageMessage" ? "image" : "video"]: buffer,
              mimetype,
              caption: `📥 *Forwarded Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${captionText}`,
              mentions: [mentionJid],
            });

            console.log(`✅ Media status from ${mentionJid} forwarded.`);
          } catch (err) {
            console.error("❌ Failed to download or forward media status:", err?.message || err);
          }
        }

        continue; // ✅ status වලට normal handler run නොවෙන්න
      }
      /* ===================== END STATUS BLOCK ===================== */

      const m = sms(sock, mek);
      const type = getContentType(mek.message);

      let body =
        type === "conversation"
          ? mek.message.conversation
          : mek.message[type]?.text || mek.message[type]?.caption || "";

      body = String(body || "");

      let isCmd = body.startsWith(prefix);
      let commandName = isCmd
        ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
        : "";

      let args = body.trim().split(/ +/).slice(1);
      let q = args.join(" ");

      const from = mek.key.remoteJid;
      const sender = mek.key.fromMe ? sock.user.id : mek.key.participant || mek.key.remoteJid;
      const senderNumber = (sender || "").split("@")[0];

      const isGroup = (from || "").endsWith("@g.us");
      const isOwner = ownerNumber.includes(senderNumber);

      const reply = (text) => sock.sendMessage(from, { text }, { quoted: mek });

      // ✅ auto-msg plugin ONLY here (so status won't trigger)
      try {
        if (autoMsgPlugin && typeof autoMsgPlugin.onMessage === "function") {
          await autoMsgPlugin.onMessage(sock, mek, m, {
            from,
            body,
            args,
            q,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            reply,
            isCmd,
            commandName,
            prefix,
          });
        }
      } catch (e) {
        console.log("AutoMsg hook error:", e?.message || e);
      }

      // ===================== REPLY HANDLERS (NO PREFIX) =====================
      if (!isCmd && replyHandlers && replyHandlers.length) {
        for (const h of replyHandlers) {
          if (typeof h.filter !== "function") continue;

          let ok = false;
          try {
            ok = h.filter(body, { sender, from, isGroup, senderNumber });
          } catch {
            ok = false;
          }

          if (ok) {
            if (h.react) {
              sock.sendMessage(from, { react: { text: h.react, key: mek.key } });
            }

            await h.function(sock, mek, m, {
              from,
              body,
              args,
              q,
              sender,
              senderNumber,
              isGroup,
              isOwner,
              reply,
            });
            break;
          }
        }
      }

      // ===================== COMMAND HANDLER =====================
      if (isCmd) {
        let cmd = (commands || []).find(
          (c) => c.pattern === commandName || c.alias?.includes(commandName)
        );

        // ✅ AUTO FIX for wrong/typo command
        if (!cmd && CMD_AUTOFIX_ENABLED) {
          const best = findBestCommandName(commandName);
          if (best?.name) {
            const fixedName = best.name;

            // rebuild body -> keep same args
            const fixedBody = `${prefix}${fixedName}${q ? " " + q : ""}`;

            // update parsed vars
            body = fixedBody;
            commandName = fixedName;
            args = fixedBody.trim().split(/ +/).slice(1);
            q = args.join(" ");

            cmd = (commands || []).find(
              (c) => c.pattern === commandName || c.alias?.includes(commandName)
            );

            // notify user (short)
            try {
              await sock.sendMessage(from, { text: `⚡ Fixed command → *${prefix}${fixedName}*\nRunning...` }, { quoted: mek });
            } catch {}
          }
        }

        if (cmd) {
          if (cmd.react) {
            sock.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
          }

          await cmd.function(sock, mek, m, {
            from,
            body,
            args,
            q,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            reply,
          });
        }
      }
    }
  });

  /* ================= DELETE HANDLER (FIXED) ================= */
  sock.ev.on("messages.update", async (updates) => {
    if (!global.pluginHooks) return;

    for (const plugin of global.pluginHooks) {
      if (typeof plugin.onDelete === "function") {
        try {
          await plugin.onDelete(sock, updates);
        } catch (e) {
          console.log("AntiDelete onDelete error:", e?.message);
        }
      }
    }
  });
}

/* ================= SERVER ================= */
ensureSessionFile();

app.get("/", (req, res) => {
  res.send("Hey There, MALIYA-MD started ✅");
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
