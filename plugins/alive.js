// ------------------ Alive Plugin ------------------
cmd(
  {
    pattern: "alive",
    react: "👀",
    desc: "Check if the bot is online and functioning.",
    category: "main",
    filename: __filename,
  },
  async (danuwa, mek, m, { from, quoted, reply }) => {
    try {
      const uptime = formatUptime(process.uptime());
      const platform = os.platform();
      const userName = m.pushName || "User";

      const videoPath = path.join(__dirname, "../media/0908.mp4");
      const aliveImg =
        "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/WhatsApp%20Image%202026-01-18%20at%2012.37.23.jpeg?raw=true";
      const voicePath = "./media/alive.ogg";

      const channelJid = "120363427174988449@newsletter";
      const channelName = "🍁 ＭＡＬＩＹＡ－ 〽️ＭＤ 🍁";

      const aliveCaption = `╭─────── ⭓ ⭓ ⭓  ─────────╮
│          🧿 SYSTEM ONLINE 🧿       │
╰──────────────⟡───────╯
│ 👋 𝗛𝗲𝘆 ${userName},
│ 🍁 *PREFIX:* "."
│ ⚡ *BOT NAME:* ${config.BOT_NAME || "🌀 MALIYA-MD 🌀"}
│ 🧭 *UPTIME:* ${uptime}
│ 🔋 *PLATFORM:* ${platform}
│ 🧩 *VERSION:* ${config.VERSION || "1.0.0"}
╰───────────────⬣
⚙️ Made with ❤️ by
╰🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥`;
