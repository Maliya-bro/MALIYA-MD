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
      let targetPhone = "";

      if (args && args[0]) {
        targetPhone = normalizePhone(args[0]);
      }

      if (!targetPhone) {
        if (sender) {
          const rawNum = String(sender).split("@")[0].split(":")[0];
          targetPhone = normalizePhone(rawNum);
        }
      }

      if (targetPhone) {
        if (!isValidPhone(targetPhone)) {
          return reply(
            "╭━━━〔 ⚠️ *INVALID NUMBER* 〕━━━╮\n" +
            "┃ ❌ Invalid phone number format.\n" +
            "┃ 💡 *Example:* `.pair 94712345678`\n" +
            "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
          );
        }

        return await generatePairCode({
          conn,
          from,
          reply,
          sender,
          phone: targetPhone,
        });
      }

      pendingPairRequests[sender] = {
        createdAt: Date.now(),
      };

      return reply(
        "╭───「 🔗 *PAIRING PORTAL* 」───╮\n" +
        "│\n" +
        "│ 📱 Send your phone number:\n" +
        "│ 💡 *Format:* `94712345678`\n" +
        "│\n" +
        "│ ⚡ Or run directly:\n" +
        "│ ➔ `.pair 94712345678`\n" +
        "│\n" +
        "╰──────────────────────────────╯"
      );
    } catch (e) {
      console.error("PAIR CMD ERROR:", e);
      return reply("❌ Failed to initiate pairing process.");
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
        await reply("⌛ Pairing request expired. Please type `.pair` again.");
        return;
      }

      const phone = normalizePhone(body || "");

      if (!isValidPhone(phone)) {
        await reply(
          "╭━━━〔 ⚠️ *INVALID NUMBER* 〕━━━╮\n" +
          "┃ ❌ Please enter a valid number.\n" +
          "┃ 💡 *Example:* `94712345678`\n" +
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯"
        );
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
      await reply("❌ Failed to parse phone number.");
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
                "░▒▓█►─═ [ 🌟 LINK SUCCESSFUL 🌟 ] ═─◄█▓▒░\n\n" +
                "✅ *Device successfully connected!*\n\n" +
                "╭───────────────────────────────╮\n" +
                `│ 📱 *Target Number :* +${phone}\n` +
                "│ 🔐 *Security Level :* End-to-End Encrypted\n" +
                "│ 💾 *Database State :* Cloud Synced & Saved\n" +
                "│ 🤖 *Bot Engine     :* Online & Ready\n" +
                "╰───────────────────────────────╯\n\n" +
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
          "╔═════ ≪ • ❈ • ≫ ═════╗\n" +
          "   🍁 *MALIYA-MD PAIR* 🍁\n" +
          "╚═════ ≪ • ❈ • ≫ ═════╝\n\n" +
          `  📲 *Phone Number :* +${phone}\n` +
          `  🔑 *Pairing Code :* \`${code}\`\n\n` +
          "┌─── ❖ 『 How to Connect 』 ❖ ───┐\n" +
          "  1. Go to WhatsApp > Linked Devices > Link with phone number\n" +
          "  2. Click *Copy Code* below and paste it into WhatsApp\n" +
          "  3. Or tap *Get QR* to pair using QR code instead\n" +
          "└─────────────────────────────────┘\n\n" +
          "⏱️ _Code expires in approximately 60 seconds._";

        let buttonSent = false;

        // ── 🔘 Native Flow Copy Button + QR Button (ButtonV2) ──
        try {
          const { ButtonV2 } = require("@vanzxy/baileys");
          const btn = new ButtonV2(conn)
            .setBody(bodyMsg)
            .setFooter("© 2026 MALIYA-MD BOT SYSTEM");

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

          btn.addButton("📷 Get QR", ".qr");

          await btn.send(from, { quoted: null });
          buttonSent = true;
        } catch (btnErr) {
          console.log("PAIR BUTTONV2 ERROR:", btnErr?.message || btnErr);
        }

        // ── 🔘 Raw CTA Fallback ──
        if (!buttonSent) {
          try {
            await conn.sendMessage(from, {
              text: bodyMsg,
              footer: "© 2026 MALIYA-MD BOT SYSTEM",
              buttons: [
                {
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
                },
                {
                  buttonId: ".qr",
                  buttonText: { displayText: "📷 Get QR" },
                  type: 1,
                }
              ]
            }, { quoted: null });
            buttonSent = true;
          } catch (_) {}
        }

        // ── 🔘 Plain Text Fallback ──
        if (!buttonSent) {
          await conn.sendMessage(from, { text: bodyMsg }, { quoted: null });
          await conn.sendMessage(from, { text: code }, { quoted: null });
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

module.exports = {};
