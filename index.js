const fs = require("fs");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

async function startBot(userId) {
  const sessionPath = `./sessions/${userId}`;
  if (!fs.existsSync(sessionPath)) return;

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text === ".ping") {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "🏓 PONG from MALIYA-MD"
      });
    }

    if (text === ".menu") {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "📜 MALIYA-MD MENU\n\n.ping\n.menu"
      });
    }
  });

  console.log("🤖 Bot running for", userId);
}

// AUTO LOAD ALL USERS
if (fs.existsSync("./sessions")) {
  fs.readdirSync("./sessions").forEach(user => {
    startBot(user);
  });
}
