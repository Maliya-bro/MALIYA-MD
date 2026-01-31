// ===================== MALIYA-MD INDEX =====================

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

const app = express();
const port = process.env.PORT || 8000;

const prefix = ".";

// ✅ SINGLE OWNER (FROM config.js)
const ownerNumber = [String(config.BOT_OWNER).trim()];

const authDir = path.join(__dirname, "auth_info_baileys");
const credsPath = path.join(authDir, "creds.json");

/* ================= SESSION CHECK ================= */
async function ensureSessionFile() {
  if (!fs.existsSync(credsPath)) {
    if (!config.SESSION_ID) {
      console.log("❌ SESSION_ID missing");
      process.exit(1);
    }

    console.log("🔄 Downloading session from MEGA...");
    const file = File.fromURL(`https://mega.nz/file/${config.SESSION_ID}`);

    file.download((err, data) => {
      if (err) {
        console.log("❌ Session download failed:", err);
        process.exit(1);
      }
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(credsPath, data);
      console.log("✅ Session restored");
      setTimeout(connectToWA, 1500);
    });
  } else {
    connectToWA();
  }
}

/* ================= CONNECT ================= */
async function connectToWA() {
  console.log("Connecting MALIYA-MD 🧬...");

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state,
    version,
    browser: Browsers.macOS("Firefox"),
    markOnlineOnConnect: true,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ MALIYA-MD connected");

      sock.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
        text: `🤖 *MALIYA-MD CONNECTED*\n\nOwner: ${ownerNumber[0]}\nPrefix: ${prefix}`,
      });
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting...");
        connectToWA();
      } else {
        console.log("❌ Logged out");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  /* ================= MESSAGE HANDLER ================= */
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const mek of messages) {
      if (!mek.message) continue;

      mek.message =
        getContentType(mek.message) === "ephemeralMessage"
          ? mek.message.ephemeralMessage.message
          : mek.message;

      const m = sms(sock, mek);
      const type = getContentType(mek.message);

      const body =
        type === "conversation"
          ? mek.message.conversation
          : mek.message[type]?.text ||
            mek.message[type]?.caption ||
            "";

      const isCmd = body.startsWith(prefix);
      const commandName = isCmd
        ? body.slice(prefix.length).split(" ")[0].toLowerCase()
        : "";

      const args = body.trim().split(/ +/).slice(1);
      const from = mek.key.remoteJid;
      const sender =
        mek.key.fromMe ? sock.user.id : mek.key.participant || from;
      const senderNumber = sender.split("@")[0];

      const isOwner = ownerNumber.includes(senderNumber);
      const reply = (txt) =>
        sock.sendMessage(from, { text: txt }, { quoted: mek });

      // COMMANDS
      if (isCmd) {
        const cmd = commands.find(
          (c) => c.pattern === commandName || c.alias?.includes(commandName)
        );
        if (cmd) {
          await cmd.function(sock, mek, m, {
            from,
            args,
            sender,
            senderNumber,
            isOwner,
            reply,
          });
        }
      }
    }
  });
}

/* ================= SERVER ================= */
ensureSessionFile();

app.get("/", (req, res) => {
  res.send("MALIYA-MD running ✅");
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
