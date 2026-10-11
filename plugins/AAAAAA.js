const { cmd, commands } = require("../command");
const fs = require("fs");
const path = require("path");

const pendingMenu = {};
const numberEmojis = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];
const headerImage = "https://github.com/DANUWA-MD/DANUWA-MD/blob/main/images/DANUWA-MD.png?raw=true";

/* ================= 1. .sudda COMMAND ================= */
cmd({
  pattern: "sudda",
  react: "📋",
  desc: "Show command categories with full detailed inspection",
  category: "main",
  filename: __filename
}, async (test, m, msg, { from, sender, reply }) => {
  await test.sendMessage(from, { react: { text: "📋", key: m.key } });

  const commandMap = {};
  for (const command of commands) {
    if (command.dontAddCommandList) continue;
    const category = (command.category || "MISC").toUpperCase();
    if (!commandMap[category]) commandMap[category] = [];
    commandMap[category].push(command);
  }

  const categories = Object.keys(commandMap);

  const rawStanzaId = m?.quoted?.id || msg?.message?.extendedTextMessage?.contextInfo?.stanzaId || "None";
  const remoteJid = m?.key?.remoteJid || from;
  const participant = m?.key?.participant || sender;

  let menuText = `╭───〔 🛠️ SUDDA FULL INSPECTOR 〕───┈➤\n`;
  menuText += `┃ 🆔 Chat From       : ${from}\n`;
  menuText += `┃ 👤 Sender          : ${sender}\n`;
  menuText += `┃ 🔑 Remote JID      : ${remoteJid}\n`;
  menuText += `┃ 👥 Participant     : ${participant}\n`;
  menuText += `┃ 🔖 Message ID      : ${m?.key?.id}\n`;
  menuText += `┃ 💬 Quoted StanzaId : ${rawStanzaId}\n`;
  menuText += `╰────────────────────────────────────┈➤\n\n`;

  menuText += `*MAIN MENU*\n`;
  menuText += `───────────────────────\n`;

  categories.forEach((cat, i) => {
    const emojiIndex = (i + 1).toString().split("").map(n => numberEmojis[n]).join("");
    menuText += `┃ ${emojiIndex} *${cat}* (${commandMap[cat].length})\n`;
  });

  menuText += `───────────────────────\n`;
  menuText += `> 💬 Reply with an option number (e.g. 1, 2)`;

  console.log("\n================ [SUDDA MENU TRIGGERED] ================");
  console.log("From JID        :", from);
  console.log("Sender JID      :", sender);
  console.log("Msg Key ID      :", m?.key?.id);
  console.log("Remote JID      :", remoteJid);
  console.log("Participant     :", participant);
  console.log("========================================================\n");

  const sentMsg = await test.sendMessage(from, {
    image: { url: headerImage },
    caption: menuText,
  }, { quoted: m });

  const stateData = {
    step: "category",
    commandMap,
    categories,
    savedSender: sender,
    savedFrom: from,
    savedMsgId: sentMsg?.key?.id || m?.key?.id,
    remoteJid,
    participant
  };

  pendingMenu[sender] = stateData;
  pendingMenu[from] = stateData;
});

/* ================= 2. SUDDA REPLY HANDLER ================= */
cmd({
  filter: (text, { sender, from, m, mek }) => {
    const rawText = String(text || "").trim();
    const isNum = /^[1-9][0-9]*$/.test(rawText);

    const hasSenderState = Boolean(pendingMenu[sender] && pendingMenu[sender].step === "category");
    const hasFromState = Boolean(pendingMenu[from] && pendingMenu[from].step === "category");

    const quotedStanzaId =
      m?.quoted?.id ||
      mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
      m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
      "None";

    console.log("\n---------------- [SUDDA FILTER CHECK] ----------------");
    console.log("Incoming Text     :", `"${rawText}"`);
    console.log("Pure Number Check :", isNum);
    console.log("Sender Key State  :", hasSenderState, `(${sender})`);
    console.log("From Key State    :", hasFromState, `(${from})`);
    console.log("Quoted StanzaId   :", quotedStanzaId);
    console.log("Filter Result     :", (hasSenderState || hasFromState) && isNum ? "PASS ✅" : "REJECT ❌");
    console.log("------------------------------------------------------\n");

    return (hasSenderState || hasFromState) && isNum;
  }
}, async (test, m, msg, { from, body, sender, reply }) => {
  await test.sendMessage(from, { react: { text: "✅", key: m.key } });

  const activeState = pendingMenu[sender] || pendingMenu[from];
  if (!activeState) {
    return reply("❌ Debug: State memory theke paowa jayni.");
  }

  const { commandMap, categories, savedSender, savedFrom, savedMsgId } = activeState;
  const index = parseInt(String(body).trim(), 10) - 1;

  if (index < 0 || index >= categories.length) {
    return reply(`❌ Invalid selection. 1 theke ${categories.length}-er moddhe select korun.`);
  }

  const selectedCategory = categories[index];
  const cmdsInCategory = commandMap[selectedCategory] || [];

  const replyQuotedId = m?.quoted?.id || msg?.message?.extendedTextMessage?.contextInfo?.stanzaId || "Direct Number";

  let cmdText = `╭〔 🛠️ SUDDA EXECUTION DETAILS 〕┈➤\n`;
  cmdText += `┃ 📥 Selected Input : ${String(body).trim()}\n`;
  cmdText += `┃ 🗂️ Category       : ${selectedCategory}\n`;
  cmdText += `┃ 👤 Sender Found   : ${sender}\n`;
  cmdText += `┃ 🆔 Chat From      : ${from}\n`;
  cmdText += `┃ 💾 Original MsgId : ${savedMsgId}\n`;
  cmdText += `┃ 🔗 Reply QuotedId : ${replyQuotedId}\n`;
  cmdText += `╰────────────┈➤\n\n`;

  cmdText += `*${selectedCategory} COMMANDS*\n`;
  cmdText += `───────────────────────\n`;

  cmdsInCategory.forEach((c) => {
    const patterns = [c.pattern, ...(c.alias || [])].filter(Boolean).map((p) => `.${p}`);
    cmdText += `${patterns.join(", ")} - ${c.desc || "No description"}\n`;
  });

  cmdText += `───────────────────────\n`;
  cmdText += `Total Commands: ${cmdsInCategory.length}\n`;

  await test.sendMessage(from, {
    image: { url: headerImage },
    caption: cmdText,
  }, { quoted: m });

  delete pendingMenu[sender];
  delete pendingMenu[from];
});

module.exports = {};
