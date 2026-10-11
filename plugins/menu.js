const { cmd, commands } = require("../command");
const config = require("../config");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const pendingMenu = {}; // Exact sudda memory store
const DEFAULT_HEADER_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2027,%202026,%2007_25_52%20PM.png?raw=true";
const PREFIX = ".";

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str).split("").map((c) => {
    const i = normal.indexOf(c);
    return i !== -1 ? small[i] : c;
  }).join("");
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data)).resize(800, 800, { fit: "contain", background: { r: 18, g: 18, b: 24, alpha: 1 } }).jpeg({ quality: 80 }).toBuffer();
  } catch (e) {
    return url;
  }
}

/* ================= 1. .menu COMMAND WITH INSPECTOR ================= */
cmd(
  {
    pattern: "menu",
    alias: ["list", "botmenu", "help"],
    react: "📜",
    desc: "Show command categories with full debugger",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, sender, pushname, reply, sessionId }) => {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: mek.key } });

      const commandMap = {};
      for (const command of commands) {
        if (command.dontAddCommandList) continue;
        const category = (command.category || "MISC").toUpperCase();
        if (!commandMap[category]) commandMap[category] = [];
        commandMap[category].push(command);
      }
      const categories = Object.keys(commandMap).sort();
      if (!categories.length) return reply("❌ No commands found!");

      let botDisplayName = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
      let btnsOn = true;
      try {
        const settings = await readSettings(sessionId);
        if (settings?.bot_name) botDisplayName = String(settings.bot_name).trim();
        if (settings && typeof settings.btns_enabled !== "undefined") btnsOn = Boolean(settings.btns_enabled);
      } catch (e) {}

      let headerImg = DEFAULT_HEADER_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "menu_header");
          if (custom && custom.data) headerImg = custom.data;
        } catch (e) {}
      }

      // 🛠️ SUDDA STYLE INSPECTOR HEADER
      let menuText = `╭───〔 🛠️ MENU FULL INSPECTOR 〕───┈➤\n`;
      menuText += `┃ 🆔 Chat From       : ${from}\n`;
      menuText += `┃ 👤 Sender          : ${sender}\n`;
      menuText += `┃ 🔖 Message ID      : ${mek?.key?.id}\n`;
      menuText += `┃ 🔘 Buttons State   : ${btnsOn ? "ON" : "OFF"}\n`;
      menuText += `╰────────────────────────────────────┈➤\n\n`;

      menuText += `*MAIN MENU*\n───────────────────────\n`;
      categories.forEach((cat, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        menuText += `┃ [ ${numStr} ] *${cat}* (${commandMap[cat].length})\n`;
      });
      menuText += `───────────────────────\n`;
      menuText += `> 💬 Reply with an option number (e.g. 1, 2)`;

      console.log("\n================ [MENU TRIGGERED] ================");
      console.log("From JID   :", from);
      console.log("Sender JID :", sender);
      console.log("Msg ID     :", mek?.key?.id);
      console.log("==================================================\n");

      let sentMsg = null;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const listRows = categories.map((cat, i) => ({
            title: `${toSmallCaps(cat)} MENU`,
            description: `${commandMap[cat].length} commands available`,
            id: String(i + 1)
          }));

          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(menuText)
            .setFooter("MALIYA-MD SYSTEM")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: "menu_list_main",
            buttonText: { displayText: "≡ List Menu" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Select Category ↯",
                sections: [{ title: "Categories", rows: listRows }],
              }),
            },
          });

          btn.addButton("📊 Ping", ".ping");
          sentMsg = await btn.send(from, { quoted: mek });
        } catch (err) {
          sentMsg = await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
        }
      } else {
        sentMsg = await sock.sendMessage(from, { image: { url: headerImg }, caption: menuText }, { quoted: mek });
      }

      // Memory Store (Exact Sudda pattern)
      const stateData = {
        step: "category",
        commandMap,
        categories,
        savedSender: sender,
        savedFrom: from,
        savedMsgId: sentMsg?.key?.id || mek?.key?.id,
        botDisplayName,
        sessionId,
        userName: pushname || "User"
      };

      pendingMenu[sender] = stateData;
      pendingMenu[from] = stateData;

    } catch (e) {
      console.log("MENU ERROR:", e);
      reply("❌ Error sending menu: " + e.message);
    }
  }
);

/* ================= 2. SUDDA STYLE REPLY HANDLER WITH LOGGER ================= */
cmd(
  {
    filter: (text, { sender, from, m, mek }) => {
      const rawText = String(text || "").trim();
      const isNum = /^[1-9][0-9]*$/.test(rawText);

      const hasSenderState = Boolean(pendingMenu[sender] && pendingMenu[sender].step === "category");
      const hasFromState = Boolean(pendingMenu[from] && pendingMenu[from].step === "category");

      console.log("\n---------------- [MENU FILTER CHECK] ----------------");
      console.log("Incoming Text     :", `"${rawText}"`);
      console.log("Pure Number Check :", isNum);
      console.log("Sender Key State  :", hasSenderState, `(${sender})`);
      console.log("From Key State    :", hasFromState, `(${from})`);
      console.log("Filter Result     :", (hasSenderState || hasFromState) && isNum ? "PASS ✅" : "REJECT ❌");
      console.log("-----------------------------------------------------\n");

      return (hasSenderState || hasFromState) && isNum;
    }
  },
  async (sock, mek, m, { from, body, sender, reply }) => {
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const activeState = pendingMenu[sender] || pendingMenu[from];
    if (!activeState) {
      return reply("❌ Debug: State memory එකෙන් හමු නොවීය.");
    }

    const { commandMap, categories, savedSender, savedFrom, savedMsgId, botDisplayName } = activeState;
    const index = parseInt(String(body).trim(), 10) - 1;

    if (index < 0 || index >= categories.length
