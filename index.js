// ╔══════════════════════════════════════════════════════════════╗
//  MALIYA-MD — Multi-User WhatsApp Bot  (index.js)
//  FIX: sessionId now passed to all commands and reply handlers
//  ADDED: /api/settings routes for website integration (Heroku)
// ╚══════════════════════════════════════════════════════════════╝

/* ==================== GLOBAL CRASH GUARD ==================== */
process.on("unhandledRejection", (reason) => {
  const msg = String(reason?.message || reason || "");
  if (
    msg.includes("Bad MAC") ||
    msg.includes("Failed to decrypt") ||
    msg.includes("Stream Errored") ||
    msg.includes("Connection Closed") ||
    msg.includes("Connection Lost") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT")
  ) {
    console.log("⚠️ Non-fatal rejection suppressed:", msg.slice(0, 120));
    return;
  }
  console.error("❌ Unhandled Rejection:", msg);
});

process.on("uncaughtException", (err) => {
  const msg = String(err?.message || err || "");
  if (
    msg.includes("Bad MAC") ||
    msg.includes("Failed to decrypt") ||
    msg.includes("Stream Errored") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT")
  ) {
    console.log("⚠️ Non-fatal exception suppressed:", msg.slice(0, 120));
    return;
  }
  console.error("❌ Uncaught Exception:", msg);
});

/* ==================== IMPORTS ==================== */
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

const fs      = require("fs");
const P       = require("pino");
const express = require("express");
const path    = require("path");
const { MongoClient } = require("mongodb");

const cors              = require("cors");
const os               = require("os");
const config            = require("./config");
const { readSettings, isWorkAllowed } = require("./lib/botSettings");
const { sms }           = require("./lib/msg");
const { commands, replyHandlers } = require("./command");

// ── Settings API Routes (NEW) ──────────────────────────────
const settingsApiRouter = require("./routes/settings-api.js");

// ── Plugins ──────────────────────────────────────────────────
const { handleAutoMsg } = require("./plugins/auto_msg.js");

const autoReactPlugin   = require("./plugins/auto-react.js");

let pdfScannerPlugin = null;
try {
  pdfScannerPlugin = require("./plugins/PDF scanner.js");
} catch (e) {
  console.log("⚠️ PDF scanner.js not found:", e?.message || e);
}

let cmdFixPlugin = null;
try {
  cmdFixPlugin = require("./plugins/cmd_autofix_confirm.js");
} catch (e) {
  console.log("⚠️ cmd_autofix_confirm.js not found:", e?.message || e);
}

const app  = express();
const port = process.env.PORT || 8000;

const prefix         = ".";
const BOT_OWNER_NAME = config.OWNER_NAME || "Malindu Nadith";
const baseOwnerNumber = [String(config.BOT_OWNER || "").replace(/\D/g, "")].filter(Boolean);
const sessionsBaseDir = path.join(__dirname, "multi_auth_sessions");
const MAX_ACTIVE_SESSIONS = Number(process.env.MAX_ACTIVE_SESSIONS || 50);

/* ==================== MONGODB ==================== */
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";

console.log("🔗 MongoDB URI in use:", MONGODB_URI.replace(/:([^@]+)@/, ":****@"));

const MONGODB_DB         = process.env.MONGODB_DB         || "maliya_md";
const SESSION_COLLECTION = process.env.SESSION_COLLECTION || "wa_sessions";

let cachedClient = null;
let cachedDb     = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  cachedClient = new MongoClient(MONGODB_URI, { maxPoolSize: 30 });
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
  const db  = await getDb();
  const col = db.collection(SESSION_COLLECTION);
  return col.findOne({ sessionId: normalizeSessionId(sessionId) });
}

async function getConnectableSessions(limit = MAX_ACTIVE_SESSIONS) {
  const db  = await getDb();
  const col = db.collection(SESSION_COLLECTION);
  return col
    .find({
      connectBot:  true,
      status:      { $nin: ["logged_out", "deleted", "disabled"] },
      primaryFile: { $exists: true },
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
}

async function updateSessionStatus(sessionId, data = {}) {
  if (!sessionId) return;
  try {
    const db  = await getDb();
    const col = db.collection(SESSION_COLLECTION);
    await col.updateOne(
      { sessionId: normalizeSessionId(sessionId) },
      { $set: { ...data, updatedAt: new Date() } }
    );
  } catch (e) {
    console.log("Session status update error:", e?.message || e);
  }
}

async function restoreCredsToFile(sessionId, targetFilePath) {
  const doc = await getSessionById(sessionId);
  if (!doc)                   throw new Error(`Session not found in MongoDB: ${sessionId}`);
  if (!doc.primaryFile?.data) throw new Error(`No primaryFile.data for session: ${sessionId}`);
  fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
  fs.writeFileSync(targetFilePath, Buffer.from(doc.primaryFile.data, "base64"));
  return targetFilePath;
}

// ── FIX 2: push local creds.json back into MongoDB ────────────
const credsSyncTimers = new Map();

function scheduleCredsSync(sessionId, credsPath, delayMs = 2000) {
  if (credsSyncTimers.has(sessionId)) {
    clearTimeout(credsSyncTimers.get(sessionId));
  }
  const timer = setTimeout(async () => {
    credsSyncTimers.delete(sessionId);
    try {
      if (!fs.existsSync(credsPath)) return;
      const data = fs.readFileSync(credsPath).toString("base64");
      const db   = await getDb();
      const col  = db.collection(SESSION_COLLECTION);
      await col.updateOne(
        { sessionId: normalizeSessionId(sessionId) },
        {
          $set: {
            "primaryFile.name":     "creds.json",
            "primaryFile.mimeType": "application/json",
            "primaryFile.data":     data,
            updatedAt:              new Date(),
          },
        }
      );
    } catch (e) {
      console.log(`⚠️ creds sync error (${sessionId}):`, e?.message || e);
    }
  }, delayMs);
  credsSyncTimers.set(sessionId, timer);
}

/* ==================== PLUGINS LOADER ==================== */
const antiDeletePlugin = require("./plugins/antidelete.js");

global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin);

let pluginsLoaded = false;

function loadCommandPluginsOnce() {
  if (pluginsLoaded) return;
  pluginsLoaded = true;
  try {
    fs.readdirSync("./plugins/").forEach((plugin) => {
      if (plugin === "auto_msg.js")   return;
      if (plugin === "antidelete.js") return;
      if (plugin.endsWith(".js")) {
        require(`./plugins/${plugin}`);
      }
    });
    console.log("✅ Command plugins loaded");
  } catch (e) {
    console.log("⚠️ Plugin load error:", e?.message || e);
  }
}

loadCommandPluginsOnce();

/* ==================== HELPERS ==================== */
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
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
        parsed.id || parsed.selectedId || parsed.selectedRowId ||
        parsed.title || parsed.display_text || parsed.text ||
        parsed.name || paramsJson
      ).trim();
    }
    return String(paramsJson).trim();
  }

  return "";
}

/* ==================== MULTI-SESSION MANAGER ==================== */
const activeSessions  = new Map();
const reconnectTimers = new Map();
const startingSessions = new Set();
let   watcherStarted   = false;

// 🔥 EXPOSE activeSessions GLOBALLY for settings API
global.__maliya_active_sessions = activeSessions;

function getSessionPaths(sessionId) {
  const safeId    = safeSessionFolderName(sessionId);
  const authDir   = path.join(sessionsBaseDir, safeId);
  const credsPath = path.join(authDir, "creds.json");
  return { authDir, credsPath, safeId };
}

function getOwnerNumberForSock(sock) {
  const jid    = sock.user?.id || "";
  const number = String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
  return number ? [number] : [...baseOwnerNumber];
}

async function cleanupSessionFolder(sessionId) {
  try {
    const { authDir } = getSessionPaths(sessionId);
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch (_) {}
}

async function scheduleReconnect(sessionId, delayMs = 5000) {
  if (!sessionId)                     return;
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

  if (activeSessions.has(sessionId)) return activeSessions.get(sessionId);

  if (startingSessions.has(sessionId)) {
    console.log(`⏳ Session ${sessionId} is already starting — skipping duplicate start`);
    return null;
  }
  startingSessions.add(sessionId);

  if (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
    console.log(`⚠️ Active session limit reached (${MAX_ACTIVE_SESSIONS}). Skipping ${sessionId}`);
    startingSessions.delete(sessionId);
    return null;
  }

  const { authDir, credsPath } = getSessionPaths(sessionId);

  try {
    fs.mkdirSync(authDir, { recursive: true });

    if (!fs.existsSync(credsPath)) {
      await restoreCredsToFile(sessionId, credsPath);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version }          = await fetchLatestBaileysVersion();

    const sessionCtx = {
      sessionId,
      authDir,
      credsPath,
      ownerNumber: [...baseOwnerNumber],
      connected:   false,
      connecting:  true,
      sock:        null,
    };

    const sock = makeWASocket({
      logger:                         P({ level: "silent" }),
      printQRInTerminal:              false,
      browser:                        Browsers.macOS("Firefox"),
      auth:                           state,
      version,
      syncFullHistory:                true,
      markOnlineOnConnect:            true,
      generateHighQualityLinkPreview: true,
    });

    sessionCtx.sock = sock;
    activeSessions.set(sessionId, sessionCtx);
    startingSessions.delete(sessionId);

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      scheduleCredsSync(sessionId, credsPath);
    });

    sock.ev.on("connection.update", async (update) => {
      try {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          sessionCtx.connected   = true;
          sessionCtx.connecting  = false;
          sessionCtx.ownerNumber = getOwnerNumberForSock(sock);

          await updateSessionStatus(sessionId, {
            status:     "connected",
            connectBot: true,
            botJid:     sock.user?.id || null,
          });

          console.log(`✅ Session connected: ${sessionId}`);

          const now  = new Date();
          const time = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit",
            second: "2-digit", hour12: true,
          }).format(now);
          const date = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Colombo", year: "numeric",
            month: "2-digit", day: "2-digit",
          }).format(now);

          const settings = await readSettings(sessionId);
          const BOT_VERSION = "v4.0.0";
          const up = `
🌈━━━━━━━━━━━━━🌈
🔥🤖 *MALIYA-MD* 🤖🔥
🌈━━━━━━━━━━━━━🌈

✅✨ Connection : CONNECTED & ONLINE
⚡🧬 System     : STABLE | FAST | SECURE
🛡️🔐 Mode      : ${String(settings.mode || "public").toUpperCase()}
🎯🧩 Prefix    : ${prefix}
📍 Work Scope  : ${String(settings.work_scope || "private").toUpperCase()}

🧑‍💻👑 Owner    : ${BOT_OWNER_NAME}
🚀📦 Version  : ${BOT_VERSION}

🕒⏳ Time      : ${time}
📅🗓️ Date      : ${date}

💬📖 Type .menu to start
🔥🚀 Powered by MALIYA-MD Engine
🌈━━━━━━━━━━━🌈`.trim();

          try {
            if (sessionCtx.ownerNumber[0]) {
              await sock.sendMessage(sessionCtx.ownerNumber[0] + "@s.whatsapp.net", {
                image: {
                  url: "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/ChatGPT%20Image%20Jan%2018%2C%202026%2C%2012_27_25%20PM.png",
                },
                caption: up,
              });
            }
          } catch (e) {
            console.log("⚠️ Connect msg send failed:", e?.message || e);
          }
        }

        if (connection === "close") {
          sessionCtx.connected  = false;
          sessionCtx.connecting = false;

          const code = lastDisconnect?.error?.output?.statusCode;
          activeSessions.delete(sessionId);

          if (code !== DisconnectReason.loggedOut) {
            console.log(`🔁 Session disconnected, reconnecting: ${sessionId} (code: ${code})`);
            await updateSessionStatus(sessionId, {
              status:     "disconnected",
              connectBot: true,
            });
            await scheduleReconnect(sessionId, 5000);
          } else {
            console.log(`❌ Session logged out: ${sessionId}`);
            await updateSessionStatus(sessionId, {
              status:     "logged_out",
              connectBot: false,
            });
            await cleanupSessionFolder(sessionId);
          }
        }
      } catch (e) {
        console.log("⚠️ connection.update handler error:", e?.message || e);
      }
    });

    attachSessionHandlers(sock, sessionCtx);

    await updateSessionStatus(sessionId, {
      status:     "connecting",
      connectBot: true,
    });

    return sessionCtx;
  } catch (e) {
    console.log(`❌ Failed to start session ${sessionId}:`, e?.message || e);
    activeSessions.delete(sessionId);
    startingSessions.delete(sessionId);
    await updateSessionStatus(sessionId, {
      status:    "connect_error",
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

  let tickRunning = false;

  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const db  = await getDb();
      const col = db.collection(SESSION_COLLECTION);

      const docs = await col.find({
        connectBot:  true,
        primaryFile: { $exists: true },
      }).toArray();

      console.log(
        `🔍 Watcher tick: found ${docs.length} session(s) in DB [${MONGODB_DB}/${SESSION_COLLECTION}]`
      );

      for (const doc of docs) {
        const id = doc.sessionId;
        if (!id)                      continue;
        if (activeSessions.has(id))   continue;
        if (startingSessions.has(id)) continue;
        console.log("🔌 Connecting NEW session:", id);
        await startSessionBot(id);
      }
    } catch (e) {
      console.log("Watcher tick error:", e?.message || e);
    } finally {
      tickRunning = false;
    }
  };

  tick();
  setInterval(tick, 5000);
}

/* ==================== SESSION MESSAGE HANDLERS ==================== */
function attachSessionHandlers(sock, sessionCtx) {

  sock.ev.on("call", async (calls) => {
    try {
      const settings = await readSettings(sessionCtx.sessionId);
      if (!settings.auto_reject_calls) return;

      for (const call of calls) {
        const callId   = call.id;
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

    messageLoop: for (const mek of messages) {
      try {
        if (!mek?.message) continue messageLoop;

        mek.message =
          getContentType(mek.message) === "ephemeralMessage"
            ? mek.message.ephemeralMessage.message
            : mek.message;

        if (global.pluginHooks) {
          for (const plugin of global.pluginHooks) {
            if (plugin.onMessage) {
              try { await plugin.onMessage(sock, mek); } catch (_) {}
            }
          }
        }

        // ============================================================
        //  STATUS @broadcast HANDLER
        // ============================================================
        if (
          mek.key &&
          mek.key.remoteJid === "status@broadcast" &&
          !mek.message?.reactionMessage
        ) {
          const participantRaw = mek.key.participant;
          const id             = mek.key.id;
          if (!participantRaw || !id) continue messageLoop;
          const participant = participantRaw;
          if (mek.key.fromMe) continue messageLoop;

          const statusSettings = await readSettings(sessionCtx.sessionId);

          if (statusSettings.auto_status_seen === true) {
            try {
              await sock.readMessages([mek.key]);
              console.log(`[✓] Status seen: ${id} (${participant})`);
            } catch (e) {
              console.error("❌ Seen error:", e?.message || e);
            }
          }

          const processedStatuses = global.processedStatuses || new Map();
          global.processedStatuses = processedStatuses;
          const uniqueStatusId = `${participant}:${id}`;
          const now = Date.now();
          if (processedStatuses.has(uniqueStatusId)) {
            if (now - processedStatuses.get(uniqueStatusId) < 300000)
              continue messageLoop;
          }
          processedStatuses.set(uniqueStatusId, now);
          setTimeout(() => processedStatuses.delete(uniqueStatusId), 300000);

          if (statusSettings.auto_status_react === true) {
            try {
              const emojis = [
   "😂", "🤣", "😍", "🥰", "😎", "🤔", "😭", "😱", "🔥", "💀",
  "🥺", "😊", "😈", "👻", "🤖", "😤", "🥳", "🤯", "😨", "🥶",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💕", "💞", "💓",
  "👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "🤙", "💪", "🖕",
  "🙏", "💅", "✨", "⭐", "🌟", "💫", "⚡", "🎉", "🎊", "🥳",
  "🎈", "🎯", "🏆", "💯", "🔞", "❓", "❗", "💢", "🐱", "🐶",
  "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
  "🐷", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤",
  "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄",
  "🐝", "🪲", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️",
  "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞",
  "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🦭", "🐊"
];

              const defaultEmoji =
                emojis[Math.floor(Math.random() * emojis.length)];
              const reactEmoji =
                (typeof statusSettings.auto_status_emoji === "string" &&
                statusSettings.auto_status_emoji.trim() !== ""
                  ? statusSettings.auto_status_emoji.trim()
                  : null) || defaultEmoji;

              await sock.sendMessage(
                "status@broadcast",
                {
                  react: {
                    text: reactEmoji,
                    key:  mek.key,
                  },
                },
                { statusJidList: [participant] }
              );
              console.log(
                `[Reacted] Status: ${id} | Participant: ${participant} | Emoji: ${reactEmoji}`
              );
            } catch (e) {
              console.error("❌ React error:", e?.message || e);
            }
          }

          if (statusSettings.status_download === true) {
            try {
              const myNum = (sock.user?.id || "")
                .split("@")[0]
                .split(":")[0];
              const myJid = myNum ? `${myNum}@s.whatsapp.net` : null;

              if (myJid) {
                const messageType = getContentType(mek.message);
                const captionText = getBodyFromMessage(mek.message);

                const getMediaTypeAndExt = (type) => {
                  switch (type) {
                    case "imageMessage":    return { mediaType: "image", ext: "jpg"  };
                    case "videoMessage":    return { mediaType: "video", ext: "mp4"  };
                    case "audioMessage":    return { mediaType: "audio", ext: "ogg"  };
                    case "documentMessage": return { mediaType: "document", ext: "bin"};
                    default:               return null;
                  }
                };

                const mediaInfo = getMediaTypeAndExt(messageType);

                if (mediaInfo) {
                  try {
                    const stream = await downloadContentFromMessage(
                      mek.message[messageType],
                      mediaInfo.mediaType
                    );
                    let buffer = Buffer.alloc(0);
                    for await (const chunk of stream) {
                      buffer = Buffer.concat([buffer, chunk]);
                    }

                    let forwardObj = {};
                    if (mediaInfo.mediaType === "image") {
                      forwardObj = {
                        image:   buffer,
                        caption: captionText || "Status Downloaded",
                      };
                    } else if (mediaInfo.mediaType === "video") {
                      forwardObj = {
                        video:   buffer,
                        caption: captionText || "Status Downloaded",
                      };
                    } else if (mediaInfo.mediaType === "audio") {
                      forwardObj = { audio: buffer, ptt: false };
                    } else if (mediaInfo.mediaType === "document") {
                      forwardObj = {
                        document: buffer,
                        mimetype: mek.message.documentMessage?.mimetype || "application/octet-stream",
                        fileName: mek.message.documentMessage?.fileName || "status_file",
                        caption:  captionText || "Status Downloaded",
                      };
                    }

                    await sock.sendMessage(myJid, forwardObj);
                    console.log(`[Downloaded Media] Status forwarded to owner (${myJid})`);
                  } catch (e) {
                    console.error("❌ Media Download Error:", e?.message || e);
                  }
                } else if (captionText) {
                  await sock.sendMessage(myJid, {
                    text: `📌 *Text Status Downloaded*\n\n${captionText}`,
                  });
                  console.log(`[Downloaded Text] Status forwarded to owner (${myJid})`);
                }
              }
            } catch (e) {
              console.error("❌ Status Download Handler Error:", e?.message || e);
            }
          }

          continue messageLoop;
        }

        // ============================================================
        //  NORMAL MESSAGE PROCESSING
        // ============================================================
        const from = mek.key.remoteJid;
        if (!from) continue messageLoop;

        const body = getBodyFromMessage(mek.message);
        const m    = sms(sock, mek);

        const settings = await readSettings(sessionCtx.sessionId);

        // Presence Controls
        try {
          if (settings.presence_mode) {
            const mode = String(settings.presence_mode).toLowerCase();
            if (mode === "online") {
              await sock.sendPresenceUpdate("available", from);
            } else if (mode === "typing") {
              await sock.sendPresenceUpdate("composing", from);
            } else if (mode === "recording") {
              await sock.sendPresenceUpdate("recording", from);
            }
          }
        } catch (e) {
          console.log("Presence update error:", e?.message || e);
        }

        if (pdfScannerPlugin) {
          try {
            await pdfScannerPlugin.handlePdfFlow(sock, mek, m, body);
          } catch (e) {
            console.log("pdfScannerPlugin error:", e?.message || e);
          }
        }

        const isGroup   = from.endsWith("@g.us");
        const senderJid = isGroup ? mek.key.participant : mek.key.remoteJid;
        const isOwner   =
          m.isOwner ||
          sessionCtx.ownerNumber.some((n) => senderJid?.includes(n));

        if (!isWorkAllowed(settings.work_scope || "private", isGroup, isOwner)) {
          continue messageLoop;
        }

        const isCmd = body.startsWith(prefix);
        const commandName = isCmd
          ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
          : "";

        const args = body.trim().split(/ +/).slice(1);
        const q    = args.join(" ");

        if (cmdFixPlugin) {
          try {
            const handledFix = await cmdFixPlugin.handleResponse(
              sock,
              mek,
              m,
              body,
              isCmd,
              commandName,
              args,
              q,
              commands
            );
            if (handledFix) continue messageLoop;
          } catch (e) {
            console.log("cmdFixPlugin error:", e?.message || e);
          }
        }

        try {
          const autoMsgHandled = await handleAutoMsg(sock, mek, m, body);
          if (autoMsgHandled) continue messageLoop;
        } catch (e) {
          console.log("handleAutoMsg error:", e?.message || e);
        }

        try {
          const autoReactHandled = await autoReactPlugin(sock, mek, m, body);
          if (autoReactHandled) continue messageLoop;
        } catch (e) {
          console.log("autoReactPlugin error:", e?.message || e);
        }

        const mode = settings.mode || "public";
        if (mode === "private" && !isOwner) {
          continue messageLoop;
        }

        // REPLY HANDLERS
        if (
          mek.message?.extendedTextMessage?.contextInfo?.stanzaId ||
          mek.message?.templateButtonReplyMessage ||
          mek.message?.buttonsResponseMessage ||
          mek.message?.listResponseMessage ||
          mek.message?.interactiveResponseMessage
        ) {
          const quotedId =
            mek.message?.extendedTextMessage?.contextInfo?.stanzaId;

          for (const [key, handler] of replyHandlers.entries()) {
            if (
              (quotedId && key === quotedId) ||
              body.toLowerCase().startsWith(key.toLowerCase())
            ) {
              try {
                await handler(sock, mek, m, {
                  body, args, q, isCmd,
                  commandName, isGroup,
                  senderJid, isOwner,
                  sessionId: sessionCtx.sessionId, // 👈 PASS sessionId
                });
              } catch (err) {
                console.error(`Reply handler error [${key}]:`, err);
              }
              break;
            }
          }
        }

        // COMMAND HANDLER
        if (isCmd) {
          const cmd =
            commands.get(commandName) ||
            Array.from(commands.values()).find(
              (c) => c.alias && c.alias.includes(commandName)
            );

          if (cmd) {
            try {
              console.log(
                `[CMD] ${commandName} from ${senderJid} (session: ${sessionCtx.sessionId})`
              );
              await cmd.function(sock, mek, m, {
                body,
                args,
                q,
                isCmd,
                commandName,
                isGroup,
                senderJid,
                isOwner,
                sessionId: sessionCtx.sessionId, // 👈 PASS sessionId
              });
            } catch (e) {
              console.error(`Error running command .${commandName}:`, e);
              await sock.sendMessage(
                from,
                {
                  text: `❌ An error occurred while executing *.${commandName}*: ${
                    e?.message || e
                  }`,
                },
                { quoted: mek }
              );
            }
          } else if (cmdFixPlugin) {
            try {
              await cmdFixPlugin.handleUnknownCommand(
                sock,
                mek,
                m,
                commandName,
                commands,
                prefix
              );
            } catch (e) {
              console.log("handleUnknownCommand error:", e?.message || e);
            }
          }
        }
      } catch (err) {
        console.error("Message processing error:", err);
      }
    }
  });
}

/* ==================== EXPRESS SERVER & API ROUTES ==================== */

// 1. CORS Setup
app.use(cors({ origin: "*" }));

// 2. Middlewares - JSON & URL-Encoded body parsing (CRITICAL: MUST BE BEFORE ROUTES)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Static Files
app.use(express.static(path.join(__dirname, "public")));

// 4. API Routes
app.use("/api/settings", settingsApiRouter);

app.get("/system-status", (req, res) => {
  const activeList = [];
  for (const [sid, ctx] of activeSessions.entries()) {
    activeList.push({
      sessionId: sid,
      connected: ctx.connected,
      connecting: ctx.connecting,
      ownerNumber: ctx.ownerNumber,
    });
  }
  res.json({
    activeCount: activeSessions.size,
    startingCount: startingSessions.size,
    activeSessions: activeList,
    maxAllowed: MAX_ACTIVE_SESSIONS,
    uptimeSec: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

app.get("/live-sessions", async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db
      .collection(SESSION_COLLECTION)
      .find(
        { connectBot: true },
        { projection: { sessionId: 1, status: 1, updatedAt: 1 } }
      )
      .toArray();

    res.json({
      activeInMemory: Array.from(activeSessions.keys()),
      dbSessions: docs,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/force-reconnect", async (req, res) => {
  try {
    const sid = normalizeSessionId(req.query.sessionId);
    if (!sid) {
      return res.status(400).json({ error: "Missing sessionId query param" });
    }
    const existing = activeSessions.get(sid);
    if (existing?.sock) {
      try { existing.sock.end(undefined); } catch (_) {}
      activeSessions.delete(sid);
    }
    const result = await startSessionBot(sid);
    res.json({
      success: !!result,
      sessionId: sid,
      status: result ? "reconnecting" : "failed",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ==================== BOT INITIALIZATION ==================== */
async function initBot() {
  console.log("🚀 Initializing MALIYA-MD Multi-Session Engine...");

  try {
    await ensureConfiguredSession();
  } catch (e) {
    console.log("⚠️ Configured session start issue:", e?.message || e);
  }

  try {
    const connectables = await getConnectableSessions(MAX_ACTIVE_SESSIONS);
    console.log(
      `📦 Found ${connectables.length} connectable session(s) in MongoDB`
    );

    for (const doc of connectables) {
      const sid = doc.sessionId;
      if (!sid) continue;
      if (activeSessions.has(sid)) continue;
      console.log(`⚡ Auto-starting session from DB: ${sid}`);
      await startSessionBot(sid);
    }
  } catch (e) {
    console.log("⚠️ DB session preload issue:", e?.message || e);
  }

  startSessionWatcher();

  app.listen(port, () => {
    console.log(`🌐 Web server running on port ${port}`);
  });
}

initBot();
