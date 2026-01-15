const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys')

// 🔥 FINAL FIX (THIS LINE IS THE KEY)
const makeInMemoryStore = require('@whiskeysockets/baileys/lib/store')

const fs = require('fs')
const P = require('pino')
const express = require('express')
const path = require('path')

const config = require('./config')
const { sms } = require('./lib/msg')
const { File } = require('megajs')
const { commands, replyHandlers } = require('./command')

const app = express()
const port = process.env.PORT || 8000

const prefix = '.'
const ownerNumber = ['94701369636']
const credsPath = path.join(__dirname, '/auth_info_baileys/creds.json')

/* ================= SESSION ================= */

async function ensureSessionFile() {
  if (!fs.existsSync(credsPath)) {
    if (!config.SESSION_ID) {
      console.error('❌ SESSION_ID missing!')
      process.exit(1)
    }

    console.log("🔄 Downloading WhatsApp session from MEGA...")

    const filer = File.fromURL(`https://mega.nz/file/${config.SESSION_ID}`)
    filer.download((err, data) => {
      if (err) {
        console.error("❌ Session download failed:", err)
        process.exit(1)
      }

      fs.mkdirSync(path.join(__dirname, '/auth_info_baileys/'), { recursive: true })
      fs.writeFileSync(credsPath, data)

      console.log("✅ Session restored! Restarting...")
      setTimeout(connectToWA, 1500)
    })
  } else {
    setTimeout(connectToWA, 800)
  }
}

/* ================= CONNECT ================= */

async function connectToWA() {
  console.log("🔌 Connecting MALIYA-MD ...")

  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, '/auth_info_baileys/')
  )
  const { version } = await fetchLatestBaileysVersion()

  // 🔥 MESSAGE STORE (ANTI DELETE)
  const store = makeInMemoryStore({
    logger: P({ level: 'silent' })
  })

  const bot = makeWASocket({
    logger: P({ level: 'silent' }),
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version
  })

  // 🔥 MUST
  store.bind(bot.ev)
  bot.store = store

  bot.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        connectToWA()
      }
    } else if (connection === "open") {
      console.log("✅ MALIYA-MD connected!")
    }
  })

  bot.ev.on("creds.update", saveCreds)

  bot.ev.on("messages.upsert", async ({ messages }) => {
    const mek = messages[0]
    if (!mek?.message) return

    mek.message =
      getContentType(mek.message) === "ephemeralMessage"
        ? mek.message.ephemeralMessage.message
        : mek.message

    if (mek.key.remoteJid === "status@broadcast") return

    const m = sms(bot, mek)
    const from = mek.key.remoteJid
    const type = getContentType(mek.message)

    const body =
      type === "conversation"
        ? mek.message.conversation
        : mek.message[type]?.text || mek.message[type]?.caption || ""

    const isCmd = body.startsWith(prefix)
    const commandName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : ""
    const args = body.split(" ").slice(1)
    const q = args.join(" ")

    const sender =
      mek.key.fromMe
        ? bot.user.id
        : mek.key.participant || mek.key.remoteJid

    const senderNumber = sender.split("@")[0]
    const isOwner = ownerNumber.includes(senderNumber)

    const reply = (txt) =>
      bot.sendMessage(from, { text: txt }, { quoted: mek })

    if (isCmd) {
      const cmd = commands.find(
        c => c.pattern === commandName ||
        (c.alias && c.alias.includes(commandName))
      )

      if (cmd) {
        try {
          cmd.function(bot, mek, m, {
            from,
            sender,
            senderNumber,
            isOwner,
            args,
            q,
            reply
          })
        } catch (e) {
          console.log("❌ Command Error:", e)
        }
      }
    }

    for (const handler of replyHandlers) {
      try {
        if (handler.filter(body, { sender, message: mek })) {
          await handler.function(bot, mek, m, { from, body, sender, reply })
          break
        }
      } catch (err) {
        console.log("Reply handler error:", err)
      }
    }
  })
}

/* ================= START ================= */

ensureSessionFile()

app.get("/", (req, res) => res.send("MALIYA-MD Started ⚡"))
app.listen(port, () =>
  console.log(`Server running on http://localhost:${port}`)
)
