// index.js (FULL CODE)
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
const { execSync } = require("child_process");

const config = require("./config");
const { readSettings } = require("./lib/botSettings");
const { sms } = require("./lib/msg");
const { File } = require("megajs");
const { commands, replyHandlers } = require("./command");

function ensurePluginsRepo() {
  try {
    const pluginsPath = path.join(__dirname, "plugins");

    if (!fs.existsSync(pluginsPath)) {
      execSync("git clone https://github.com/Maliya-bro/my-plugins.git plugins", {
        stdio: "ignore",
      });
    }
  } catch (e) {
    console.log("Plugin repo setup failed:", e?.message || e);
  }
}

ensurePluginsRepo();

// ✅ auto msg plugin
const autoMsgPlugin = require("./plugins/auto_msg.js");

// ✅ PDF scanner plugin
let pdfScannerPlugin = null;
try {
  pdfScannerPlugin = require("./plugins/PDF scanner.js");
} catch (e) {
  console.log("⚠️ PDF scanner.js not found or failed to load:", e?.message || e);
}

// ✅ Cmd AutoFix Confirm plugin
let cmdFixPlugin = null;
try {
  cmdFixPlugin = require("./plugins/cmd_autofix_confirm.js");
} catch (e) {
  console.log("⚠️ cmd_autofix_confirm.js not found or failed to load:", e?.message || e);
}

const app = express();
const port = process.env.PORT || 8000;

const prefix = ".";
const ownerNumber = [String(config.BOT_OWNER || "94702135392")];
const authDir = path.join(__dirname, "/auth_info_baileys/");
const credsPath = path.join(authDir, "creds.json");

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
global.pluginHooks.push(antiDeletePlugin);

/* ================= HELPERS ================= */

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function getBodyFromMessage(message) {
  if (!message) return "";

  const direct =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.templateButtonReplyMessage?.selectedId ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.listResponseMessage?.title ||
    message.interactiveResponseMessage?.body?.text ||
    "";

  if (direct) return String(direct).trim();

  const paramsJson =
    message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;

  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);

    if (parsed) {
      return String(
        parsed.id ||
          parsed.selectedId ||
          parsed.selectedRowId ||
          parsed.title ||
          parsed.display_text ||
          parsed.text ||
          parsed.name ||
          paramsJson
      ).trim();
    }

    return String(paramsJson).trim();
  }

  return "";
}

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
🛡️🔐 Mode      : ${String(readSettings().mode || "public").toUpperCase()}
🎯🧩 Prefix    : ${prefix}

🧑‍💻👑 Owner    : ${OWNER_NAME}
🚀📦 Version  : ${BOT_VERSION}

🕒⏳ Time      : ${time}
📅🗓️ Date      : ${date}

💬📖 Type .menu to start
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

      try {
        fs.readdirSync("./plugins/").forEach((plugin) => {
          if (plugin === "auto_msg.js") return;
          if (plugin === "antidelete.js") return;
          if (plugin.endsWith(".js")) {
            require(`./plugins/${plugin}`);
          }
        });
      } catch (e) {
        console.log("⚠️ Plugin load error:", e?.message || e);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  /* ================= AUTO REJECT CALLS ================= */

  sock.ev.on("call", async (calls) => {
    try {
      const settings = readSettings();
      if (!settings.auto_reject_calls) return;

      for (const call of calls) {
        const callId = call.id;
        const callerId = call.from;

        if (!callId || !callerId) continue;

        try {
          await sock.rejectCall(callId, callerId);
          await sock.sendMessage(callerId, {
            text: "❌ Calls are not allowed on this bot.",
          });
        } catch (e) {
          console.log("Call reject error:", e?.message || e);
        }
      }
    } catch (e) {
      console.log("Call event error:", e?.message || e);
    }
  });

  /* ================= MESSAGE HANDLER ================= */

  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!messages || !messages.length) return;

    for (const mek of messages) {
      if (!mek?.message) continue;

      mek.message =
        getContentType(mek.message) === "ephemeralMessage"
          ? mek.message.ephemeralMessage.message
          : mek.message;

      if (global.pluginHooks) {
        for (const plugin of global.pluginHooks) {
          if (plugin.onMessage) {
            try {
              await plugin.onMessage(sock, mek);
            } catch {}
          }
        }
      }

      if (mek.key?.remoteJid === "status@broadcast") {
        const participantRaw = mek.key.participant;
        const id = mek.key.id;

        if (!participantRaw || !id) continue;

        const participant = jidNormalizedUser(participantRaw);
        const myJid = jidNormalizedUser(sock.user?.id || "");

        const mentionJid = participant.includes("@s.whatsapp.net")
          ? participant
          : participant + "@s.whatsapp.net";

        const statusKey = {
          remoteJid: "status@broadcast",
          id,
          participant,
          fromMe: false,
        };

        if (readSettings().auto_status_seen === true) {
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

        if (readSettings().auto_status_react === true) {
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

        continue;
      }

      const m = sms(sock, mek);
      const type = getContentType(mek.message);

      let body = getBodyFromMessage(mek.message);
      body = String(body || "").trim();

      let isCmd = body.startsWith(prefix);
      let commandName = isCmd
        ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
        : "";

      let args = body.trim().split(/ +/).slice(1);
      let q = args.join(" ");

      const from = mek.key.remoteJid;
      const sender = mek.key.fromMe
        ? sock.user.id
        : mek.key.participant || mek.key.remoteJid;

      const senderNumber = (sender || "").split("@")[0];
      const isGroup = from.endsWith("@g.us");
      const isOwner = ownerNumber.includes(senderNumber);

      const reply = (text) =>
        sock.sendMessage(from, { text }, { quoted: mek });

      try {
        const presenceMode = readSettings().always_presence;

        if (presenceMode === "typing") {
          await sock.sendPresenceUpdate("composing", from);
        } else if (presenceMode === "recording") {
          await sock.sendPresenceUpdate("recording", from);
        }
      } catch {}

      /* ================= AUTO AI ================= */

      try {
        const botSettings = readSettings();

        if (botSettings.mode === "private" && !isOwner) {
          if (isCmd) continue;
        }

        if (
          botSettings.auto_msg === true &&
          autoMsgPlugin &&
          typeof autoMsgPlugin.onMessage === "function"
        ) {
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

      /* ================= CMD AUTOFIX ================= */

      try {
        if (cmdFixPlugin && typeof cmdFixPlugin.onMessage === "function") {
          const res = await cmdFixPlugin.onMessage(sock, mek, m, {
            from,
            body,
            args,
            q,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            reply,
            prefix,
            isCmd,
            commandName,
            commands,
          });

          if (res?.handled && !res?.newBody) continue;

          if (res?.handled && res?.newBody) {
            body = String(res.newBody || "");

            isCmd = body.startsWith(prefix);
            commandName = isCmd
              ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
              : "";

            args = body.trim().split(/ +/).slice(1);
            q = args.join(" ");
          }
        }
      } catch (e) {
        console.log("cmdFixPlugin error:", e?.message || e);
      }

      /* ================= PDF SCANNER AUTO ================= */

      try {
        if (pdfScannerPlugin && typeof pdfScannerPlugin.onMessage === "function") {
          await pdfScannerPlugin.onMessage(sock, mek, m, {
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
        console.log("pdfScannerPlugin error:", e?.message || e);
      }

      /* ================= REPLY HANDLERS ================= */

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

      /* ================= COMMAND HANDLER ================= */

      if (isCmd) {
        const botSettings = readSettings();

        if (botSettings.mode === "private" && !isOwner) {
          continue;
        }

        const cmd = commands.find(
          (c) => c.pattern === commandName || c.alias?.includes(commandName)
        );

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

  /* ================= DELETE & POLL HANDLER ================= */

  sock.ev.on("messages.update", async (updates) => {
    if (global.pluginHooks) {
      for (const plugin of global.pluginHooks) {
        if (typeof plugin.onDelete === "function") {
          try {
            await plugin.onDelete(sock, updates);
          } catch (e) {
            console.log("AntiDelete onDelete error:", e?.message);
          }
        }
      }
    }

    for (const { key, update } of updates) {
      if (update.pollUpdates && key.fromMe === false) {
        try {
          const pollVote = update.pollUpdates[0].vote;
          const pollName = pollVote.selectedOptions[0];

          if (autoMsgPlugin && typeof autoMsgPlugin.onMessage === "function") {
            await autoMsgPlugin.onMessage(sock, { key, message: {} }, {}, {
              from: key.remoteJid,
              body: pollName,
              isGroup: key.remoteJid.endsWith("@g.us"),
              sender: key.participant || key.remoteJid,
              reply: (text) => sock.sendMessage(key.remoteJid, { text }, { quoted: { key } })
            });
          }
        } catch (e) {
          console.log("Poll handling error:", e.message);
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
