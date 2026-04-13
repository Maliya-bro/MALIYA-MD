// index.js (FINAL FIXED MULTI USER)

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

const app = express();
const port = process.env.PORT || 8000;

const sessionsBaseDir = path.join(__dirname, "multi_auth_sessions");
const MAX_ACTIVE_SESSIONS = 50;

/* ================= MONGO ================= */

const MONGODB_URI = "mongodb+srv://MALIYA-MD:279221@maliya-md.uzal3aa.mongodb.net/?appName=maliya-md";
const MONGODB_DB = "maliya_md";
const SESSION_COLLECTION = "wa_sessions";

let client;
let db;

async function connectDB() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(MONGODB_DB);
  console.log("✅ MongoDB Connected");
  return db;
}

/* ================= HELPERS ================= */

function normalizeSessionId(id) {
  return String(id || "").trim();
}

function getSessionPath(id) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    dir: path.join(sessionsBaseDir, safe),
    creds: path.join(sessionsBaseDir, safe, "creds.json"),
  };
}

async function getSessions() {
  const db = await connectDB();
  return db.collection(SESSION_COLLECTION)
    .find({ connectBot: true })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();
}

async function updateStatus(id, status) {
  const db = await connectDB();
  await db.collection(SESSION_COLLECTION).updateOne(
    { sessionId: id },
    { $set: { status, updatedAt: new Date() } }
  );
}

async function restoreCreds(id, filePath) {
  const db = await connectDB();
  const doc = await db.collection(SESSION_COLLECTION).findOne({ sessionId: id });

  if (!doc || !doc.primaryFile?.data) throw "NO SESSION DATA";

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(doc.primaryFile.data, "base64"));
}

/* ================= SESSION SYSTEM ================= */

const active = new Map();

async function startSession(id) {
  if (!id) return;
  if (active.has(id)) return;

  const { dir, creds } = getSessionPath(id);

  try {
    await restoreCreds(id, creds);

    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      logger: P({ level: "silent" }),
      browser: Browsers.macOS("Chrome"),
    });

    active.set(id, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {

      if (connection === "open") {
        console.log("✅ CONNECTED:", id);
        await updateStatus(id, "connected");
      }

      if (connection === "close") {
        active.delete(id);

        const code = lastDisconnect?.error?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.log("❌ LOGGED OUT:", id);
          await updateStatus(id, "logged_out");
        } else {
          console.log("🔁 RECONNECT:", id);
          await updateStatus(id, "disconnected");

          setTimeout(() => startSession(id), 5000);
        }
      }
    });

  } catch (e) {
    console.log("❌ FAIL:", id);
  }
}

/* ================= WATCHER ================= */

async function watcher() {
  const sessions = await getSessions();

  for (const s of sessions) {
    if (!active.has(s.sessionId)) {
      await startSession(s.sessionId);
    }
  }
}

setInterval(watcher, 10000);
watcher();

/* ================= SERVER ================= */

app.get("/", (req, res) => {
  res.send(`🔥 MALIYA-MD RUNNING | Active: ${active.size}`);
});

app.get("/sessions", async (req, res) => {
  const sessions = await getSessions();
  res.json(sessions);
});

app.listen(port, () => {
  console.log("🚀 Server started:", port);
});
