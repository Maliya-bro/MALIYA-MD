// index.js (MULTI USER FULL CODE)
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
const { MongoClient } = require("mongodb");

const config = require("./config");
const { readSettings } = require("./lib/botSettings");
const { sms } = require("./lib/msg");
const { commands, replyHandlers } = require("./command");


// ✅ auto msg plugin


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
const baseOwnerNumber = [String(config.BOT_OWNER || "").replace(/\D/g, "")].filter(Boolean);
const sessionsBaseDir = path.join(__dirname, "multi_auth_sessions");
const MAX_ACTIVE_SESSIONS = Number(process.env.MAX_ACTIVE_SESSIONS || 50);

/* ================= MONGODB ================= */

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://MALIYA-MD:279221@maliya-md.uzal3aa.mongodb.net/?appName=maliya-md";

const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const SESSION_COLLECTION = process.env.SESSION_COLLECTION || "wa_sessions";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  cachedClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: 30,
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  console.log("✅ Connected to MongoDB");
  return cachedDb;
}

function normalizeSessionId(value) {
  return String(value || "").trim();
}

function safeSessionFolderName(sessionId) {
  return String(sessionId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 150);
}

async function getSessionById(sessionId) {
  const db = await getDb();
  const col = db.collection(SESSION_COLLECTION);
  return col.findOne({ sessionId: normalizeSessionId(sessionId) });
}

async function getConnectableSessions(limit = MAX_ACTIVE_SESSIONS) {
  const db = await getDb();
  const col = db.collection(SESSION_COLLECTION);

  return col
    .find({
      connectBot: true,
      status: { $nin: ["logged_out", "deleted", "disabled"] },
      primaryFile: { $exists: true },
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
}

async function updateSessionStatus(sessionId, data = {}) {
  if (!sessionId) return;

  try {
    const db = await getDb();
    const col = db.collection(SESSION_COLLECTION);

    await col.updateOne(
      { sessionId: normalizeSessionId(sessionId) },
      {
        $set: {
          ...data,
          updatedAt: new Date(),
        },
      }
    );
  } catch (e) {
    console.log("Session status update error:", e?.message || e);
  }
}

async function restoreCredsToFile(sessionId, targetFilePath) {
  const doc = await getSessionById(sessionId);

  if (!doc) {
    throw new Error(`Session not found in MongoDB: ${sessionId}`);
  }

  if (!doc.primaryFile?.data) {
    throw new Error(`No primaryFile.data found for session: ${sessionId}`);
  }

  fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
  fs.writeFileSync(targetFilePath, Buffer.from(doc.primaryFile.data, "base64"));
  return targetFilePath;
}

/* ================= PLUGINS ================= */

const antiDeletePlugin = require("./plugins/antidelete.js");

global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin);

let pluginsLoaded = false;

function loadCommandPluginsOnce() {
  if (pluginsLoaded) return;
  pluginsLoaded = true;

  try {
    fs.readdirSync("./plugins/").forEach((plugin) => {
      if (plugin === "auto_msg.js") return;
      if (plugin === "antidelete.js") return;
      if (plugin.endsWith(".js")) {
        require(`./plugins/${plugin}`);
      }
    });
    console.log("✅ Plugins loaded from local plugins folder");
  } catch (e) {
    console.log("⚠️ Plugin load error:", e?.message || e);
  }
}

loadCommandPluginsOnce();

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

function normalizeJidUser(jid = "") {
  return String(jid || "").split(":")[0];
}

function getSessionSettings(sessionCtx) {
  return readSettings();
}

async function forwardStatusToOwner(sock, ownerJid, payload) {
  if (!ownerJid) return;
  try {
    await sock.sendMessage(ownerJid, payload);
  } catch (e) {
    console.log("Status forward error:", e?.message || e);
  }
}

/* ================= MULTI SESSION MANAGER ================= */

const activeSessions = new Map();
const reconnectTimers = new Map();
let watcherStarted = false;

function getSessionPaths(sessionId) {
  const safeId = safeSessionFolderName(sessionId);
  const authDir = path.join(sessionsBaseDir, safeId);
  const credsPath = path.join(authDir, "creds.json");
  return { authDir, credsPath, safeId };
}

function getOwnerNumberForSock(sock) {
  const jid = sock.user?.id || "";
  const number = String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
  return number ? [number] : [...baseOwnerNumber];
}

async function cleanupSessionFolder(sessionId) {
  try {
    const { authDir } = getSessionPaths(sessionId);
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}
}

async function scheduleReconnect(sessionId, delayMs = 5000) {
  if (!sessionId) return;
  if (reconnectTimers.has(sessionId)) return;

  const timer = setTimeout(async () => {
    reconnectTimers.delete(sessionId);

    if (activeSessions.has(sessionId)) return;

    console.log(`🔁 Reconnecting session ${sessionId}...`);
    await startSessionBot(sessionId);
  }, delayMs);

  reconnectTimers.set(sessionId, timer);
}

async function startSessionBot(sessionId) {
  sessionId = normalizeSessionId(sessionId);
  if (!sessionId) return null;

  if (activeSessions.has(sessionId)) {
    return activeSessions.get(sessionId);
  }

  if (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
    console.log(`⚠️ Active session limit reached (${MAX_ACTIVE_SESSIONS}). Skipping ${sessionId}`);
    return null;
  }

  const existingDoc = await getSessionById(sessionId);
  if (!existingDoc || existingDoc.connectBot !== true) {
    return null;
  }

  const { authDir, credsPath } = getSessionPaths(sessionId);

  try {
    fs.mkdirSync(authDir, { recursive: true });
    await restoreCredsToFile(sessionId, credsPath);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sessionCtx = {
      sessionId,
      authDir,
      credsPath,
      ownerNumber: [...baseOwnerNumber],
      connected: false,
      connecting: true,
      sock: null,
    };

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

    sessionCtx.sock = sock;
    activeSessions.set(sessionId, sessionCtx);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        sessionCtx.connected = true;
        sessionCtx.connecting = false;
        sessionCtx.ownerNumber = getOwnerNumberForSock(sock);

        await updateSessionStatus(sessionId, {
          status: "connected",
          connectBot: true,
          botJid: sock.user?.id || null,
        });

        console.log(`✅ Session connected: ${sessionId}`);

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
🛡️🔐 Mode      : ${String(getSessionSettings(sessionCtx).mode || "public").toUpperCase()}
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
          if (sessionCtx.ownerNumber[0]) {
            await sock.sendMessage(sessionCtx.ownerNumber[0] + "@s.whatsapp.net", {
              image: {
                url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Screenshot%202026-01-18%20122855.png?raw=true",
              },
              caption: up,
            });
          }
        } catch (e) {
          console.log("⚠️ Connect msg send failed:", e?.message || e);
        }
      }

      if (connection === "close") {
        sessionCtx.connected = false;
        sessionCtx.connecting = false;

        const code = lastDisconnect?.error?.output?.statusCode;
        activeSessions.delete(sessionId);

        if (code !== DisconnectReason.loggedOut) {
          console.log(`🔁 Session disconnected, reconnecting: ${sessionId}`);

          await updateSessionStatus(sessionId, {
            status: "disconnected",
            connectBot: true,
          });

          await scheduleReconnect(sessionId, 5000);
        } else {
          console.log(`❌ Session logged out: ${sessionId}`);

          await updateSessionStatus(sessionId, {
            status: "logged_out",
            connectBot: false,
          });

          await cleanupSessionFolder(sessionId);
        }
      }
    });

    attachSessionHandlers(sock, sessionCtx);

    await updateSessionStatus(sessionId, {
      status: "connecting",
      connectBot: true,
    });

    return sessionCtx;
  } catch (e) {
    console.log(`❌ Failed to start session ${sessionId}:`, e?.message || e);
    activeSessions.delete(sessionId);

    await updateSessionStatus(sessionId, {
      status: "connect_error",
      lastError: String(e?.message || e),
    });

    return null;
  }
}

async function ensureConfiguredSession() {
  if (!config.SESSION_ID) return;
  await startSessionBot(config.SESSION_ID);
}

function startSessionWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;

  const tick = async () => {
    try {
      const docs = await getConnectableSessions(MAX_ACTIVE_SESSIONS);

      for (const doc of docs) {
        if (!doc?.sessionId) continue;
        if (activeSessions.has(doc.sessionId)) continue;
        if (activeSessions.size >= MAX_ACTIVE_SESSIONS) break;

        await startSessionBot(doc.sessionId);
      }
    } catch (e) {
      console.log("Watcher tick error:", e?.message || e);
    }
  };

  tick();
  setInterval(tick, 10000);
}

/* ================= SESSION MESSAGE HANDLERS ================= */

function attachSessionHandlers(sock, sessionCtx) {
  sock.ev.on("call", async (calls) => {
    try {
      const settings = getSessionSettings(sessionCtx);
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
        const settings = getSessionSettings(sessionCtx);

        const participantRaw = mek.key.participant;
        const id = mek.key.id;

        if (!participantRaw || !id) continue;

        const participant = jidNormalizedUser(participantRaw);
        const myJid = jidNormalizedUser(sock.user?.id || "");
        const ownerJid = sessionCtx.ownerNumber[0]
          ? sessionCtx.ownerNumber[0] + "@s.whatsapp.net"
          : null;

        const mentionJid = participant.includes("@s.whatsapp.net")
          ? participant
          : participant + "@s.whatsapp.net";

        const statusKey = {
          remoteJid: "status@broadcast",
          id,
          participant,
          fromMe: false,
        };

        if (settings.auto_status_seen === true) {
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

        if (settings.auto_status_react === true) {
          try {
            const emojis = [
              "❤️", "💸", "😇", "🍂", "💥", "💯", "🔥", "💫", "💎", "💗",
              "🤍", "🖤", "👀", "🙌", "🙆", "🚩", "🥰", "💐", "😎", "✅",
              "🫀", "😁", "😄", "🌸", "🕊️", "🌷", "⛅", "🌟", "🗿", "💜", "🌝"
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
              if (settings.auto_download_status === true) {
                await forwardStatusToOwner(sock, ownerJid, {
                  text: `📝 *Text Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${text}`,
                  mentions: [mentionJid],
                });
              }
              console.log(`✅ Text-only status from ${mentionJid} handled.`);
            } catch (e) {
              console.error("❌ Failed to forward text status:", e?.message || e);
            }
          }
        }

        if (mek.message?.imageMessage || mek.message?.videoMessage) {
          try {
            const msgType = mek.message.imageMessage ? "imageMessage" : "videoMessage";
            const mediaMsg = mek.message[msgType];

            if (settings.auto_download_status === true) {
              const stream = await downloadContentFromMessage(
                mediaMsg,
                msgType === "imageMessage" ? "image" : "video"
              );

              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

              const mimetype =
                mediaMsg.mimetype || (msgType === "imageMessage" ? "image/jpeg" : "video/mp4");
              const captionText = mediaMsg.caption || "";

              await forwardStatusToOwner(sock, ownerJid, {
                [msgType === "imageMessage" ? "image" : "video"]: buffer,
                mimetype,
                caption: `📥 *Forwarded Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${captionText}`,
                mentions: [mentionJid],
              });
            }

            console.log(`✅ Media status from ${mentionJid} handled.`);
          } catch (err) {
            console.error("❌ Failed to download or forward media status:", err?.message || err);
          }
        }

        continue;
      }

      const m = sms(sock, mek);

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

      const rawSenderNumber = (sender || "").split("@")[0];
      const senderNumber = rawSenderNumber.split(":")[0].replace(/\D/g, "");
      const isGroup = from.endsWith("@g.us");
      const isOwner = sessionCtx.ownerNumber.includes(senderNumber);

      const reply = (text) =>
        sock.sendMessage(from, { text }, { quoted: mek });

      try {
        const presenceMode = getSessionSettings(sessionCtx).always_presence;

        if (presenceMode === "typing") {
          await sock.sendPresenceUpdate("composing", from);
        } else if (presenceMode === "recording") {
          await sock.sendPresenceUpdate("recording", from);
        }
      } catch {}

     

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

      if (isCmd) {
        const botSettings = getSessionSettings(sessionCtx);

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
              senderNumber: String((key.participant || key.remoteJid || "").split("@")[0]).split(":")[0].replace(/\D/g, ""),
              isOwner: false,
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

ensureConfiguredSession();
startSessionWatcher();

app.get("/", (req, res) => {
  res.send(
    `Hey There, MALIYA-MD started ✅ | Active Sessions: ${activeSessions.size}/${MAX_ACTIVE_SESSIONS}`
  );
});

app.get("/sessions", async (req, res) => {
  try {
    const docs = await getConnectableSessions(200);
    res.json({
      active: activeSessions.size,
      max: MAX_ACTIVE_SESSIONS,
      sessions: docs.map((d) => ({
        sessionId: d.sessionId,
        phone: d.phone || null,
        status: d.status || null,
        updatedAt: d.updatedAt || null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`🔥 Multi-user mode ready | Max active sessions: ${MAX_ACTIVE_SESSIONS}`);
});
