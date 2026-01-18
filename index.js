const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  AnyMessageContent,
  prepareWAMessageMedia,
  areJidsSameUser,
  downloadContentFromMessage,
  MessageRetryMap,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  makeInMemoryStore,
  jidDecode,
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

/* ================= SESSION CHECK ================= */
async function ensureSessionFile() {
  if (!fs.existsSync(credsPath)) {
    if (!config.SESSION_ID) {
      console.error('❌ SESSION_ID missing');
      process.exit(1);
    }

    console.log("🔄 Downloading session from MEGA...");
    const filer = File.fromURL(`https://mega.nz/file/${config.SESSION_ID}`);

    filer.download((err, data) => {
      if (err) {
        console.error("❌ Session download failed:", err);
        process.exit(1);
      }
      fs.mkdirSync(path.join(__dirname, '/auth_info_baileys/'), { recursive: true });
      fs.writeFileSync(credsPath, data);
      console.log("✅ Session restored. Restarting...");
      setTimeout(connectToWA, 2000);
    });
  } else {
    setTimeout(connectToWA, 1000);
  }
}

/* ================= PLUGINS ================= */
const antiDeletePlugin = require('./plugins/antidelete.js');
global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin);

/* ================= CONNECT ================= */
async function connectToWA() {
  console.log("Connecting MALIYA-MD 🧬...");
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, '/auth_info_baileys/')
  );
  const { version } = await fetchLatestBaileysVersion();

  const test = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  /* ========== CONNECTION UPDATE ========== */
  test.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        connectToWA();
      }
    }

    if (connection === 'open') {
      console.log('✅ MALIYA-MD connected');

      /* ===== PREMIUM CONNECT MESSAGE ===== */
      const OWNER_NAME = "Malindu Nadith";
      const BOT_VERSION = "v4.0.0";

      const now = new Date();
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(now);

      const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(now);

      const up = `
 🌈━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🌈
 🔥🤖        *MALIYA-MD*         🤖🔥
 🌈━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🌈

✅✨ Connection : CONNECTED & ONLINE
⚡🧬 System     : STABLE | FAST | SECURE
🛡️🔐 Mode       : PUBLIC
🎯🧩 Prefix     : ${prefix}

🧑‍💻👑 Owner     : ${OWNER_NAME}
🚀📦 Version    : ${BOT_VERSION}

🕒⏳ Time       : ${time}
📅🗓️ Date       : ${date}

💬📖 Type  .menu  to start
🔥🚀 Powered by MALIYA-MD Engine
🌈━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🌈
`.trim();

      await test.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
        image: {
          url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Screenshot%202026-01-18%20122855.png?raw=true"
        },
        caption: up
      });

      fs.readdirSync("./plugins/").forEach((plugin) => {
        if (plugin.endsWith(".js")) {
          require(`./plugins/${plugin}`);
        }
      });
    }
  });

  test.ev.on('creds.update', saveCreds);

  /* ================= MESSAGE HANDLER ================= */
  test.ev.on('messages.upsert', async ({ messages }) => {
    const mek = messages[0];
    if (!mek?.message) return;

    mek.message =
      getContentType(mek.message) === 'ephemeralMessage'
        ? mek.message.ephemeralMessage.message
        : mek.message;

    if (global.pluginHooks) {
      for (const plugin of global.pluginHooks) {
        if (plugin.onMessage) {
          try {
            await plugin.onMessage(test, mek);
          } catch {}
        }
      }
    }

    const m = sms(test, mek);
    const type = getContentType(mek.message);
    const body =
      type === 'conversation'
        ? mek.message.conversation
        : mek.message[type]?.text || mek.message[type]?.caption || '';

    const isCmd = body.startsWith(prefix);
    const commandName = isCmd
      ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
      : '';
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(' ');

    const from = mek.key.remoteJid;
    const sender = mek.key.fromMe
      ? test.user.id
      : (mek.key.participant || mek.key.remoteJid);
    const senderNumber = sender.split('@')[0];
    const isGroup = from.endsWith('@g.us');
    const botNumber = test.user.id.split(':')[0];
    const isOwner = ownerNumber.includes(senderNumber);

    const reply = (text) =>
      test.sendMessage(from, { text }, { quoted: mek });

    if (isCmd) {
      const cmd = commands.find(
        (c) => c.pattern === commandName || c.alias?.includes(commandName)
      );
      if (cmd) {
        if (cmd.react) {
          test.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
        }
        cmd.function(test, mek, m, {
          from, body, args, q, sender, senderNumber,
          isGroup, isOwner, reply
        });
      }
    }
  });

  /* ================= DELETE HANDLER (FIXED) ================= */
  test.ev.on("messages.update", async (updates) => {
    if (!global.pluginHooks) return;

    for (const plugin of global.pluginHooks) {
      if (typeof plugin.onDelete === "function") {
        try {
          await plugin.onDelete(test, updates);
        } catch (e) {
          console.log("AntiDelete onDelete error:", e?.message);
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
