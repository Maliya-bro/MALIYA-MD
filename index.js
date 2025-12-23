const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const axios = require('axios');
const path = require('path');
const qrcode = require('qrcode-terminal');

const config = require('./config');
const { sms, downloadMediaMessage } = require('./lib/msg');
const {
  getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { File } = require('megajs');
const { commands, replyHandlers } = require('./command');

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94701369636'];
const credsPath = path.join(__dirname, '/auth_info_baileys/creds.json');

async function ensureSessionFile() {
  if (!fs.existsSync(credsPath)) {
    if (!config.SESSION_ID) {
      console.error('❌ SESSION_ID missing!');
      process.exit(1);
    }

    console.log("🔄 Downloading WhatsApp session from MEGA...");

    const sessdata = config.SESSION_ID;
    const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);

    filer.download((err, data) => {
      if (err) {
        console.error("❌ Failed to download session:", err);
        process.exit(1);
      }

      fs.mkdirSync(path.join(__dirname, '/auth_info_baileys/'), { recursive: true });
      fs.writeFileSync(credsPath, data);

      console.log("✅ Session restored! Restarting...");
      setTimeout(connectToWA, 1500);
    });
  } else {
    setTimeout(connectToWA, 800);
  }
}

async function connectToWA() {
  console.log("🔌 Connecting MALIYA-MD ...");

  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '/auth_info_baileys/'));
  const { version } = await fetchLatestBaileysVersion();

  const bot = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
  });

  bot.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
        connectToWA();

    } else if (connection === "open") {
      console.log("✅ MALIYA-MD connected!");

      await bot.sendMessage(
        ownerNumber[0] + "@s.whatsapp.net",
        {
          image: {
            url: "https://github.com/nadithmalindu-source/Malindu-AI-BOT/blob/main/image/Gemini_Generated_Image_unjbleunjbleunjb.png?raw=true"
          },
          caption: "MALIYA-MD connected successfully ⚡"
        }
      );

      console.log("🔄 Loading plugins...");
      fs.readdirSync("./plugins/")
        .filter(file => file.endsWith(".js"))
        .forEach(file => {
          try {
            require(`./plugins/${file}`);
            console.log("✔️ Plugin Loaded:", file);
          } catch (err) {
            console.log("❌ Plugin Error:", file, err);
          }
        });
      console.log("✅ All plugins loaded!");
    }
  });

  bot.ev.on("creds.update", saveCreds);

  bot.ev.on("messages.upsert", async ({ messages }) => {
    const mek = messages[0];
    if (!mek?.message) return;

    mek.message =
      getContentType(mek.message) === "ephemeralMessage"
        ? mek.message.ephemeralMessage.message
        : mek.message;

    if (mek.key.remoteJid === "status@broadcast") return;

    const m = sms(bot, mek);
    const from = mek.key.remoteJid;
    const type = getContentType(mek.message);

    const body =
      type === "conversation"
        ? mek.message.conversation
        : mek.message[type]?.text || mek.message[type]?.caption || "";

    const isCmd = body.startsWith(prefix);
    const commandName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : "";
    const args = body.split(" ").slice(1);
    const q = args.join(" ");

    const sender = mek.key.fromMe ? bot.user.id : mek.key.participant || mek.key.remoteJid;
    const senderNumber = sender.split("@")[0];
    const isGroup = from.endsWith("@g.us");

    const botNumber = bot.user.id.split(":")[0];
    const pushname = mek.pushName || "User";

    const isOwner = ownerNumber.includes(senderNumber);

    const reply = (txt) => bot.sendMessage(from, { text: txt }, { quoted: mek });

    // Command Handler
    if (isCmd) {
      const cmd = commands.find(
        (c) =>
          c.pattern === commandName ||
          (c.alias && c.alias.includes(commandName))
      );

      if (cmd) {
        try {
          if (cmd.react) {
            bot.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
          }

          cmd.function(bot, mek, m, {
            from,
            quoted: mek,
            body,
            command: commandName,
            args,
            q,
            isGroup,
            sender,
            senderNumber,
            isOwner,
            reply,
          });
        } catch (e) {
          console.log("❌ Plugin Error:", e);
        }
      }
    }

    // Reply Handlers
    for (const handler of replyHandlers) {
      try {
        if (handler.filter(body, { sender, message: mek })) {
          await handler.function(bot, mek, m, {
            from,
            body,
            sender,
            reply,
          });
          break;
        }
      } catch (err) {
        console.log("Reply handler error:", err);
      }
    }
  });
}

ensureSessionFile();

app.get("/", (req, res) => res.send("MALIYA-MD Started ⚡"));
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
