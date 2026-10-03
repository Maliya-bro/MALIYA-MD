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

const { cmd } = require("../command");
const config = require("../config");

/* ================= MONGODB ================= */

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";

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

// 🛡️ LID හෝ Device Port ගැටලුවලින් තොරව නිවැරදි Phone Number එක ලබා ගැනීම
function getCleanSenderPhone(from, sender, m) {
  if (from && from.endsWith("@s.whatsapp.net")) {
    return normalizePhone(from.split("@")[0].split(":")[0]);
  }
  if (sender && sender.endsWith("@s.whatsapp.net")) {
    return normalizePhone(sender.split("@")[0].split(":")[0]);
  }
  if (m && m.sender && m.sender.endsWith("@s.whatsapp.net")) {
    return normalizePhone(m.sender.split("@")[0].split(":")[0]);
  }
  return "";
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
      $set: uploadDoc,$setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return normalizedId;
}

/* ================= COMMAND: .pair ================= */

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
      let targetPhone = "";

      // 1. Argument එකක් ලබා දී ඇත්නම්
      if (args && args[0]) {
        targetPhone = normalizePhone(args[0]);
      }

      // 2. නැතහොත් නිවැරදි Sender Phone Number එක ස්වයංක්‍රීයව ගැනීම
      if (!targetPhone) {
        targetPhone = getCleanSenderPhone(from, sender, m);
      }

      if (!targetPhone || !isValidPhone(targetPhone)) {
        return reply(
          "╭━〔 ⚠️ *INVALID NUMBER* 〕━╮\n" +
          "┃ ❌ Could not detect a valid phone number.\n" +
          "┃ 💡 *Usage:* `.pair` or `.pair 94712345678`\n" +
          "╰━━━━━━━━━━━━━╯"
        );
      }

      return await generatePairCode({
        conn,
        from,
        reply,
        phone: targetPhone,
      });
    } catch (e) {
      console.error("PAIR CMD ERROR:", e);
      return reply("❌ Failed to initiate pairing process.");
    }
  }
);

/* ================= COMMAND: .pairqr (Conflicting .qr Fix) ================= */

cmd(
  {
    pattern: "pairqr",
    alias: ["botqr", "linkqr"],
    react: "📷",
    category: "main",
    desc: "Get WhatsApp Pair QR Code directly",
    filename: __filename,
  },
  async (conn, mek, m, { from, reply }) => {
    try {
      return await generatePairQR({ conn, from, reply });
    } catch (e) {
      console.error("PAIR QR ERROR:", e);
      return reply("❌ Failed to start QR pairing process.");
    }
  }
);

/* ================= CORE: PAIR CODE ================= */

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
    try { await reply("⌛ Pairing code timed out. Please try again."); } catch {}
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
      browser: Browsers.macOS("Safari"),
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
              await uploadSessionToMongo({
                sessionId,
                phone,
                filePath: credsPath,
                fileName: `creds_${phone}_${Date.now()}.json`,
                source: "bot-pair",
              });

              const successText =
                " [ 🌟 LINK SUCCESSFUL 🌟 ]\n\n" +
                "✅ *Device successfully connected!*\n\n" +
                "╭────────────────────╮\n" +
                `│ 📱 *\`Target Number\` :* +${phone}\n` +
                "│ 🔐 *\`Security Level\` :* End-to-End Encrypted\n" +
                "│ 💾 *\`Database State\` :* Cloud Synced & Saved\n" +
                "│ 🤖 *\`Bot Engine\`     :* Online & Ready\n" +
                "╰────────────────────╯\n\n" +
                "> 🍁 ᴍᴀʟɪʏᴀ-ᴍᴅ ᴀᴜᴛᴏᴍᴀᴛɪᴏɴ sʏsᴛᴇᴍ";

              await conn.sendMessage(from, { text: successText });
            } else {
              await reply("✅ Device linked, but session credentials file was not found.");
            }
          } catch (uploadErr) {
            console.error("PAIR UPLOAD ERROR:", uploadErr);
            await reply("✅ Device linked, but failed to save session to database.");
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
            await reply("❌ Device was logged out. Please try `.pair` again.");
            await deleteFolderSafe(authDir);
            return;
          }

          console.log(`PAIR: Socket closed (code ${statusCode}) — reconnecting...`);
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

        const bodyMsg =
          `╔═════ ≪ • ❈ • ≫ ═════╗\n` +
          `   🍁 *MALIYA-MD PAIR* 🍁\n` +
          `╚═════ ≪ • ❈ • ≫ ═════╝\n\n` +
          `  📲 *Phone Number :* +${phone}\n` +
          `  🔑 *Pairing Code :* \`${code}\`\n\n` +
          `┌ ❖『 How to Connect 』❖ ┐\n` +
          `  1. Go to *WhatsApp > Linked Devices > Link with phone number*\n` +
          `  2. Click *Copy Code* below and paste it into WhatsApp\n` +
          `  3. Or tap *Get Pair QR* to pair using QR code instead\n` +
          `└──────────────────┘\n\n` +
          `⏱️ _Code expires in approximately 60 seconds._`;

        let buttonSent = false;

        // ── 🔘 @vanzxy/baileys Button Builder ──
        try {
          const { Button } = await import("@vanzxy/baileys");

          const btn = new Button(conn)
            .setTitle("MALIYA-MD PAIR SYSTEM")
            .setBody(bodyMsg)
            .setFooter("© 2026 MALIYA-MD BOT SYSTEM");

          if (typeof btn.addCopy === "function") {
            btn.addCopy("📋 Copy Code", code);
          } else if (typeof btn.addRawButton === "function") {
            btn.addRawButton({
              buttonId: "copy_pair_code",
              buttonText: { displayText: "📋 Copy Code" },
              type: 1,
              nativeFlowInfo: {
                name: "cta_copy",
                paramsJson: JSON.stringify({
                  display_text: "📋 Copy Code",
                  id: code,
                  copy_code: code,
                }),
              },
            });
          } else {
            btn.addReply("📋 Copy Code", code);
          }

          // 💡 .qr වෙනුවට .pairqr භාවිතා කිරීමෙන් වෙනත් QR plugins සමඟ පැටලීම වළකී
          btn.addReply("📷 Get Pair QR", ".pairqr");

          await btn.send(from);
          buttonSent = true;
        } catch (btnErr) {
          console.error("VANZXY BUTTON ERROR:", btnErr?.message || btnErr);
        }

        // ── 🔘 Fallback to Plain Text (බොත්තම් අසමත් වුවහොත්) ──
        if (!buttonSent) {
          await conn.sendMessage(from, { text: bodyMsg });
          await conn.sendMessage(from, { text: code });
        }

      } catch (e) {
        console.error("PAIR CODE REQUEST ERROR:", e);
        if (!finished) {
          finished = true;
          clearTimeout(overallTimeout);
          await reply(
            "❌ Failed to request pair code.\n\n" +
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
    await reply("⏳ Generating pairing code... Please wait a moment.");
    await connectSocket();
  } catch (e) {
    console.error("PAIR GENERATE ERROR:", e);
    if (!finished) {
      finished = true;
      clearTimeout(overallTimeout);
      await reply(
        "❌ Failed to initiate pairing code.\n\n" +
          (e?.message ? `Error: ${e.message}` : "")
      );
      await deleteFolderSafe(authDir);
    }
  }
}

/* ================= CORE: PAIR QR CODE ================= */

async function generatePairQR({ conn, from, reply }) {
  const tempSessionId = `qr_${Date.now()}`;
  const authDir = path.join(__dirname, "../temp", tempSessionId);

  let finished = false;
  let qrSent = false;
  let overallTimeout = null;

  overallTimeout = setTimeout(async () => {
    if (finished) return;
    finished = true;
    try { await reply("⌛ QR Code timed out. Please try `.pairqr` again."); } catch {}
    await deleteFolderSafe(authDir);
  }, 60 * 1000);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      if (finished) return;

      const { connection, qr, lastDisconnect } = update;

      // 📷 QR එක ලැබුණු සැනින් Image එකක් ලෙස යැවීම
      if (qr && !qrSent) {
        qrSent = true;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qr)}`;
        
        await conn.sendMessage(
          from,
          {
            image: { url: qrImageUrl },
            caption:
              "╭━〔 📷 *MALIYA-MD PAIR QR* 〕━╮\n" +
              "┃ 1. Open WhatsApp Settings\n" +
              "┃ 2. Go to *Linked Devices*\n" +
              "┃ 3. Scan this QR code within 30 seconds!\n" +
              "╰━━━━━━━━━━━━━━━━╯",
          }
        );
      }

      if (connection === "open") {
        finished = true;
        clearTimeout(overallTimeout);

        try {
          const credsPath = path.join(authDir, "creds.json");
          const phone = (sock.user?.id || "").split("@")[0].split(":")[0];
          const sessionId = generateSessionId(phone);

          if (fs.existsSync(credsPath)) {
            await uploadSessionToMongo({
              sessionId,
              phone,
              filePath: credsPath,
              fileName: `creds_${phone}_${Date.now()}.json`,
              source: "bot-pair-qr",
            });

            await conn.sendMessage(from, {
              text:
                "[ 🌟 LINK SUCCESSFUL 🌟 ]\n\n" +
                "✅ *QR Scan Successful! Device Connected!*\n\n" +
                `📱 *Target Number :* +${phone}\n` +
                "💾 *Database State :* Cloud Synced & Saved\n" +
                "🤖 *Bot Engine :* Online & Ready\n\n" +
                "> 🍁 ᴍᴀʟɪʏᴀ-ᴍᴅ ᴀᴜᴛᴏᴍᴀᴛɪᴏɴ sʏsᴛᴇᴍ",
            });
          }
        } catch (e) {
          console.error("QR Mongo Upload Error:", e);
        }

        sock.ev.removeAllListeners();
        try { sock.ws.close(); } catch {}
        await deleteFolderSafe(authDir);
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          finished = true;
          clearTimeout(overallTimeout);
          await reply("❌ QR process closed. Try `.pairqr` again.");
          await deleteFolderSafe(authDir);
        }
      }
    });

    await reply("⏳ Generating pairing QR Code... Please wait.");
  } catch (e) {
    console.error("QR GENERATE ERROR:", e);
    await reply("❌ Failed to generate QR code.");
    await deleteFolderSafe(authDir);
  }
}

module.exports = {};
