const fs = require("fs");
const path = require("path");
const P = require("pino");
const { MongoClient } = require("mongodb");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const { cmd, replyHandlers } = require("../command");
const config = require("../config");

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
    maxPoolSize: 10,
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  return cachedDb;
}

/* ================= HELPERS ================= */

function normalizePhone(num = "") {
  return String(num).replace(/[^0-9]/g, "");
}

function isValidPhone(num) {
  return /^[1-9][0-9]{7,14}$/.test(num);
}

function normalizeSessionId(value) {
  return String(value || "").trim();
}

function generateSessionId(phone = "") {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function randomString(len) {
    let out = "";
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  return normalizeSessionId(`${phone}_${randomString(8)}_${Date.now()}`);
}

function formatPairCode(code = "") {
  return String(code).match(/.{1,4}/g)?.join("-") || code;
}

async function deleteFolderSafe(folderPath) {
  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("PAIR cleanup error:", e);
  }
}

function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString("base64");
}

async function uploadSessionToMongo({
  sessionId,
  phone,
  filePath,
  fileName,
  source,
}) {
  const db = await getDb();
  const col = db.collection(SESSION_COLLECTION);
  const now = new Date();

  const normalizedId = normalizeSessionId(sessionId);

  const uploadDoc = {
    sessionId: normalizedId,
    fileName: fileName || path.basename(filePath),
    primaryFile: {
      name: fileName || path.basename(filePath),
      mimeType: "application/json",
      data: fileToBase64(filePath),
    },
    status: "ready",
    connectBot: true,
    source: source || "bot-pair",
    phone: phone || null,
    updatedAt: now,
  };

  await col.updateOne(
    { sessionId: normalizedId },
    {
      $set: uploadDoc,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return normalizedId;
}

/* ================= PENDING ================= */

const pendingPairRequests = Object.create(null);

/* ================= COMMAND ================= */

cmd(
  {
    pattern: "pair",
    alias: ["paircode", "getpair"],
    react: "🔗",
    category: "main",
    desc: "Get WhatsApp pair code from bot chat",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, args, reply }) => {
    try {
      const phoneArg = normalizePhone(args[0] || "");

      if (phoneArg) {
        if (!isValidPhone(phoneArg)) {
          return reply("❌ Invalid number.\n\nExample:\n.pair 94712345678");
        }

        return await generatePairCode({
          conn,
          from,
          reply,
          sender,
          phone: phoneArg,
        });
      }

      pendingPairRequests[sender] = {
        createdAt: Date.now(),
      };

      return reply(
        "📱 *Send the phone number to generate pair code.*\n\n" +
          "Example:\n" +
          "`94712345678`\n\n" +
          "Or use directly:\n" +
          "`.pair 94712345678`"
      );
    } catch (e) {
      console.error("PAIR CMD ERROR:", e);
      return reply("❌ Failed to start pair process.");
    }
  }
);

/* ================= REPLY HANDLER ================= */

replyHandlers.push({
  react: "🔗",
  filter: (body, { sender }) => {
    if (!pendingPairRequests[sender]) return false;
    return true;
  },
  function: async (conn, mek, m, { from, sender, body, reply }) => {
    try {
      if (!pendingPairRequests[sender]) return;

      const req = pendingPairRequests[sender];

      if (Date.now() - req.createdAt > 3 * 60 * 1000) {
        delete pendingPairRequests[sender];
        await reply("⌛ Pair request expired. Use `.pair` again.");
        return;
      }

      const phone = normalizePhone(body || "");

      if (!isValidPhone(phone)) {
        await reply("❌ Invalid number.\n\nSend like this:\n`94712345678`");
        return;
      }

      delete pendingPairRequests[sender];

      await generatePairCode({
        conn,
        from,
        reply,
        sender,
        phone,
      });
    } catch (e) {
      console.error("PAIR REPLY HANDLER ERROR:", e);
      delete pendingPairRequests[sender];
      await reply("❌ Failed to read number.");
    }
  },
});

/* ================= CORE ================= */

async function generatePairCode({ conn, from, reply, phone }) {
  const sessionId = generateSessionId(phone);
  const tempSessionId = `pair_${phone}_${Date.now()}`;
  const authDir = path.join(__dirname, "../temp", tempSessionId);

  let finished = false;
  let codeSent = false;
  let overallTimeout = null;

  overallTimeout = setTimeout(async () => {
    if (finished) return;
    finished = true;
    try { await reply("⌛ Pair code timed out. Please try again."); } catch {}
    await deleteFolderSafe(authDir);
  }, 90 * 1000);

  async function connectSocket() {
    if (finished) return;

    let state, saveCreds;
    try {
      ({ state, saveCreds } = await useMultiFileAuthState(authDir));
    } catch (e) {
      console.error("PAIR useMultiFileAuthState error:", e);
      return;
    }

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (e) {
      console.error("PAIR fetchLatestBaileysVersion error:", e);
      return;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Firefox"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      if (finished) return;

      try {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          finished = true;
          clearTimeout(overallTimeout);

          try {
            const credsPath = path.join(authDir, "creds.json");

            if (fs.existsSync(credsPath)) {
              const savedSessionId = await uploadSessionToMongo({
                sessionId,
                phone,
                filePath: credsPath,
                fileName: `creds_${phone}_${Date.now()}.json`,
                source: "bot-pair",
              });

              await conn.sendMessage(from, {
                text:
                  "✅ *Number linked successfully!*\n\n" +
                  `📱 Number: ${phone}\n` +
                  `🔑 Session ID:\n\`${savedSessionId}\`\n\n` +
                  "💾 Session saved to database.\n" +
                  "🤖 Session watcher will connect this bot automatically.",
              });
            } else {
              await reply("✅ Number linked, but session file was not found.");
            }
          } catch (uploadErr) {
            console.error("PAIR UPLOAD ERROR:", uploadErr);
            await reply("✅ Linked, but failed to save session to database.");
          }

          sock.ev.removeAllListeners();
          try { sock.ws.close(); } catch {}
          await deleteFolderSafe(authDir);
          return;
        }

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.data?.statusCode;

          if (statusCode === DisconnectReason.loggedOut) {
            finished = true;
            clearTimeout(overallTimeout);
            await reply("❌ Logged out. Try `.pair` again.");
            await deleteFolderSafe(authDir);
            return;
          }

          console.log(`PAIR: socket closed (code ${statusCode}) — reconnecting to await pairing...`);
          sock.ev.removeAllListeners();
          try { sock.ws.close(); } catch {}

          await new Promise((r) => setTimeout(r, 3000));
          await connectSocket();
        }
      } catch (e) {
        console.error("PAIR connection.update error:", e);
      }
    });

    if (!codeSent) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (finished) return;

      try {
        const rawCode = await sock.requestPairingCode(phone);
        const code = formatPairCode(rawCode);
        codeSent = true;

        await conn.sendMessage(
          from,
          {
            text:
              "🔗 *MALIYA-MD PAIR CODE*\n\n" +
              `📱 Number: ${phone}\n\n` +
              "📌 Open WhatsApp > Linked Devices > Link with phone number\n" +
              "Then enter the code sent below.\n\n" +
              "⏱️ Code expires in about 1 minute.",
          },
          { quoted: null }
        );

        await conn.sendMessage(from, { text: code }, { quoted: null });
      } catch (e) {
        console.error("PAIR CODE REQUEST ERROR:", e);
        if (!finished) {
          finished = true;
          clearTimeout(overallTimeout);
          await reply(
            "❌ Failed to generate pair code.\n\n" +
              (e?.message ? `Error: ${e.message}` : "")
          );
          sock.ev.removeAllListeners();
          try { sock.ws.close(); } catch {}
          await deleteFolderSafe(authDir);
        }
      }
    }
  }

  try {
    await reply("⏳ Generating pair code... Please wait.");
    await connectSocket();
  } catch (e) {
    console.error("PAIR GENERATE ERROR:", e);
    if (!finished) {
      finished = true;
      clearTimeout(overallTimeout);
      await reply(
        "❌ Failed to generate pair code.\n\n" +
          (e?.message ? `Error: ${e.message}` : "")
      );
      await deleteFolderSafe(authDir);
    }
  }
}
