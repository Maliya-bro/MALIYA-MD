const { cmd, replyHandlers } = require("../command");
const config = require("../config");
const {
  readSettings,
  setSetting,
  toggleSetting,
} = require("../lib/botSettings");

let sendInteractiveMessage = null;
try {
  ({ sendInteractiveMessage } = require("gifted-btns"));
} catch {}

const SETTINGS_IMAGE =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/ChatGPT%20Image%20Mar%2022,%202026,%2008_42_52%20AM.png?raw=true";

const pendingSettingsMenu = Object.create(null);

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function isRealOwner(sender = "") {
  const owner = String(
    config.BOT_OWNER || config.OWNER_NUMBER || config.SUDO || ""
  ).replace(/\D/g, "");

  let user = String(sender).split("@")[0].replace(/\D/g, "");

  if (user.startsWith("0")) user = "94" + user.slice(1);

  return !!owner && user === owner;
}

function onOff(val) {
  return val ? "🟢 ᴏɴ" : "🔴 ᴏғғ";
}

function presenceText(val) {
  if (val === "typing") return "⌨️ ᴀᴜᴛᴏ ᴛʏᴘɪɴɢ";
  if (val === "recording") return "🎙️ ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ";
  return "🔴 ᴏғғ";
}

function reactModeText(val) {
  if (val === "private") return "🔒 ᴘʀɪᴠᴀᴛᴇ ᴏɴʟʏ";
  if (val === "group") return "👥 ɢʀᴏᴜᴘ ᴏɴʟʏ";
  return "🌍 ᴀʟʟ ᴄʜᴀᴛs";
}

function workScopeText(val) {
  if (val === "private") return "🔒 ᴘʀɪᴠᴀᴛᴇ ᴄʜᴀᴛ ᴏɴʟʏ";
  if (val === "group") return "👥 ɢʀᴏᴜᴘ ᴄʜᴀᴛ ᴏɴʟʏ";
  return "🌍 ᴀʟʟ ᴄʜᴀᴛs (ᴘʀɪᴠᴀᴛᴇ + ɢʀᴏᴜᴘ)";
}

function btnsModeText(val) {
  return val ? "🔘 ɪɴᴛᴇʀᴀᴄᴛɪᴠᴇ ʙᴜᴛᴛᴏɴs" : "🔢 ɴᴜᴍʙᴇʀ ʀᴇᴘʟʏ (ᴛᴇxᴛ ᴍᴇɴᴜ)";
}

async function getStatusCard(sessionId) {
  const s = await readSettings(sessionId);
  return `
┌❮ 🌟 *ᴍᴀʟɪʏᴀ-ᴍᴅ sᴇᴛᴛɪɴɢs* 🌟 ❯─
│
├► ⚙️ *ᴡᴏʀᴋ ᴛʏᴘᴇ:* ${String(s.mode || "public").toUpperCase()}
├► 🎯 *ᴡᴏʀᴋ sᴄᴏᴘᴇ:* ${workScopeText(String(s.work_scope || "private"))}
├► 🕹️ *ᴍᴇɴᴜ ᴍᴏᴅᴇ:* ${btnsModeText(!!s.btns_enabled)}
├► 🎭 *ᴘʀᴇsᴇɴᴄᴇ:* ${presenceText(String(s.always_presence || "off"))}
├► 🤖 *ᴀɪ ᴄʜᴀᴛ:* ${onOff(!!s.auto_msg)}
├► 👁️ *sᴇᴇɴ ᴀʟʟ ᴍsɢ:* ${onOff(!!s.seen_all_msg)}
├► 💖 *ᴀᴜᴛᴏ ᴍsɢ ʀᴇᴀᴄᴛ:* ${onOff(!!s.auto_react_msg)}
├► 🔮 *ʀᴇᴀᴄᴛ ᴍᴏᴅᴇ:* ${reactModeText(String(s.auto_react_mode || "all"))}
├► 🛡️ *ᴀɴᴛɪ ᴅᴇʟᴇᴛᴇ:* ${onOff(!!s.anti_delete)} _(Private Only)_
├► 🛡️ *ᴀɴᴛɪ sᴘᴀᴍ:* ${onOff(!!s.anti_spam)} 
├► 🚫 *ᴀɴᴛɪ ᴄᴀʟʟ:* ${onOff(!!s.auto_reject_calls)}
├► 👁️‍🗨️ *ᴀᴜᴛᴏ sᴛᴀᴛᴜs:* ${onOff(!!s.auto_status_seen)}
├► ❤️ *sᴛᴀᴛᴜs ʀᴇᴀᴄᴛ:* ${onOff(!!s.auto_status_react)}
├► 📥 *sᴛᴀᴛᴜs ᴅᴏᴡɴʟᴏᴀᴅ:* ${onOff(!!s.auto_download_status)}
│
└❮ 📌 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ* ❯─
`.trim();
}

function mapKey(name = "") {
  const k = String(name).toLowerCase().trim();

  if (["autoseen", "auto_seen", "statusseen", "auto_status_seen"].includes(k)) return "auto_status_seen";
  if (["autoreact", "auto_react", "statusreact", "auto_status_react"].includes(k)) return "auto_status_react";
  if (["autodownloadstatus", "auto_download_status", "statusdownload", "downloadstatus"].includes(k)) return "auto_download_status";
  if (["automsg", "auto_msg", "msg", "aichat", "ai"].includes(k)) return "auto_msg";
  if (["seenallmsg", "seen_all_msg", "seenall", "allmsgseen"].includes(k)) return "seen_all_msg";
  if (["antidelete", "anti_delete", "delete"].includes(k)) return "anti_delete";
  if (["antispam", "anti_spam", "spam"].includes(k)) return "anti_spam";
  if (["rejectcalls", "auto_reject_calls", "calls", "anticall"].includes(k)) return "auto_reject_calls";
  if (["mode", "botmode", "privatepublic"].includes(k)) return "mode";
  if (["autoreactmsg", "auto_react_msg", "msgreact"].includes(k)) return "auto_react_msg";
  if (["reactmode", "auto_react_mode"].includes(k)) return "auto_react_mode";
  if (["workscope", "work_scope", "worktype", "work_type", "scope"].includes(k)) return "work_scope";
  if (["btns", "buttons", "btns_enabled", "menumode", "menu_mode"].includes(k)) return "btns_enabled";
  return null;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getIncomingText(body, mek, m) {
  const paramsJson =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    
  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
      if (btnId) return String(btnId).trim().toLowerCase();
    }
  }

  const directId =
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId ||
    m?.message?.templateButtonReplyMessage?.selectedId ||
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    mek?.message?.buttonsResponseMessage?.selectedButtonId ||
    mek?.message?.templateButtonReplyMessage?.selectedId;
    
  if (directId) return String(directId).trim().toLowerCase();

  const text =
    m?.message?.interactiveResponseMessage?.body?.text ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    mek?.message?.interactiveResponseMessage?.body?.text ||
    mek?.message?.conversation ||
    mek?.message?.extendedTextMessage?.text ||
    body ||
    "";
    
  return String(text).trim().toLowerCase();
}

async function applySettingAction(sessionId, action, value) {
  if (action === "status") {
    return await getStatusCard(sessionId);
  }
  if (action === "private") {
    await setSetting(sessionId, "mode", "private");
    return "✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘʀɪᴠᴀᴛᴇ ]`*";
  }
  if (action === "public") {
    await setSetting(sessionId, "mode", "public");
    return "✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘᴜʙʟɪᴄ ]`*";
  }
  if (action === "reactmode") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ *`[ ɪɴᴠᴀʟɪᴅ ʀᴇᴀᴄᴛ ᴍᴏᴅᴇ ]`*";
    }
    await setSetting(sessionId, "auto_react_mode", value);
    return `✨ *\`[ ✅ ʀᴇᴀᴄᴛ ᴍᴏᴅᴇ: ${reactModeText(value)} ]\`*`;
  }
  if (action === "workscope") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ *`[ ɪɴᴠᴀʟɪᴅ ᴡᴏʀᴋ sᴄᴏᴘᴇ ]`*";
    }
    await setSetting(sessionId, "work_scope", value);
    return `✨ *\`[ ✅ ᴡᴏʀᴋ sᴄᴏᴘᴇ: ${workScopeText(value)} ]\`*`;
  }
  if (action === "presence") {
    if (!["off", "typing", "recording"].includes(value)) {
      return "❌ *`[ ɪɴᴠᴀʟɪᴅ ᴘʀᴇsᴇɴᴄᴇ ᴍᴏᴅᴇ ]`*";
    }
    await setSetting(sessionId, "always_presence", value);
    return `✨ *\`[ ✅ ᴘʀᴇsᴇɴᴄᴇ: ${presenceText(value)} ]\`*`;
  }

  if (action === "on" || action === "off" || action === "toggle") {
    const key = mapKey(value);
    if (!key) {
      return "❌ *`[ ɪɴᴠᴀʟɪᴅ sᴇᴛᴛɪɴɢ ɴᴀᴍᴇ ]`*";
    }
    
    let updated;
    if (action === "toggle") {
      updated = await toggleSetting(sessionId, key);
    } else {
      const boolVal = action === "on";
      updated = await setSetting(sessionId, key, boolVal);
    }

    const responses = {
      auto_status_seen: `✨ *\`[ ✅ ᴀᴜᴛᴏ sᴛᴀᴛᴜs sᴇᴇɴ: ${onOff(updated.auto_status_seen)} ]\`*`,
      auto_status_react: `✨ *\`[ ✅ ᴀᴜᴛᴏ sᴛᴀᴛᴜs ʀᴇᴀᴄᴛ: ${onOff(updated.auto_status_react)} ]\`*`,
      auto_download_status: `✨ *\`[ ✅ ᴀᴜᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ sᴛᴀᴛᴜs: ${onOff(updated.auto_download_status)} ]\`*`,
      auto_msg: `✨ *\`[ ✅ ᴀɪ ᴄʜᴀᴛ: ${onOff(updated.auto_msg)} ]\`*`,
      seen_all_msg: `✨ *\`[ ✅ sᴇᴇɴ ᴀʟʟ ᴍsɢ: ${onOff(updated.seen_all_msg)} ]\`*`,
      anti_delete: `✨ *\`[ ✅ ᴀɴᴛɪ ᴅᴇʟᴇᴛᴇ: ${onOff(updated.anti_delete)} ]\`*`,
      anti_spam: `✨ *\`[ ✅ ᴀɴᴛɪ sᴘᴀᴍ: ${onOff(updated.anti_spam)} ]\`*`,
      auto_reject_calls: `✨ *\`[ ✅ ʀᴇᴊᴇᴄᴛ ᴄᴀʟʟs: ${onOff(updated.auto_reject_calls)} ]\`*`,
      auto_react_msg: `✨ *\`[ ✅ ᴀᴜᴛᴏ ᴍsɢ ʀᴇᴀᴄᴛ: ${onOff(updated.auto_react_msg)} ]\`*`,
      btns_enabled: `✨ *\`[ ✅ ᴍᴇɴᴜ ᴍᴏᴅᴇ: ${btnsModeText(!!updated.btns_enabled)} ]\`*`,
    };

    return responses[key] || `✨ *\`[ ✅ sᴇᴛ ${key.toUpperCase()} ᴛᴏ ${action.toUpperCase()} ]\`*`;
  }

  return await getStatusCard(sessionId);
}

function resolveSettingsActionFromText(text = "") {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;

  if (t.startsWith(".setting ")) {
    const parts = t.replace(".setting ", "").trim().split(" ");
    const action = parts[0];
    const value = parts.slice(1).join(" ");
    return { action, value };
  }

  if (t.includes("menuopen") || t.includes("change settings")) return { action: "menuopen" };
  if (t.includes("show full status")) return { action: "status" };
  if (t.includes("public mode")) return { action: "public" };
  if (t.includes("private mode")) return { action: "private" };
  if (t.includes("presence typing") || t.includes("auto typing")) return { action: "presence", value: "typing" };
  if (t.includes("presence recording") || t.includes("auto recording")) return { action: "presence", value: "recording" };
  if (t.includes("presence off")) return { action: "presence", value: "off" };
  if (t.includes("work scope private")) return { action: "workscope", value: "private" };
  if (t.includes("work scope group")) return { action: "workscope", value: "group" };
  if (t.includes("work scope all") || t.includes("all chats")) return { action: "workscope", value: "all" };
  if (t.includes("enable btns") || t.includes("interactive buttons on")) return { action: "on", value: "btns" };
  if (t.includes("disable btns") || t.includes("interactive buttons off")) return { action: "off", value: "btns" };
  if (t.includes("enable auto react msg") || t.includes("auto react msg on")) return { action: "on", value: "autoreactmsg" };
  if (t.includes("disable auto react msg") || t.includes("auto react msg off")) return { action: "off", value: "autoreactmsg" };
  if (t.includes("react mode: private")) return { action: "reactmode", value: "private" };
  if (t.includes("react mode: group")) return { action: "reactmode", value: "group" };
  if (t.includes("react mode: all")) return { action: "reactmode", value: "all" };
  if (t.includes("enable ai chat")) return { action: "on", value: "automsg" };
  if (t.includes("disable ai chat")) return { action: "off", value: "automsg" };
  if (t.includes("seen all msg on") || t.includes("enable seen all msg")) return { action: "on", value: "seenallmsg" };
  if (t.includes("seen all msg off") || t.includes("disable seen all msg")) return { action: "off", value: "seenallmsg" };
  if (t.includes("enable anti delete")) return { action: "on", value: "antidelete" };
  if (t.includes("disable anti delete")) return { action: "off", value: "antidelete" };
  if (t.includes("enable anti spam") || t.includes("anti spam on")) return { action: "on", value: "antispam" };
  if (t.includes("disable anti spam") || t.includes("anti spam off")) return { action: "off", value: "antispam" };
  if (t.includes("toggle anti spam")) return { action: "toggle", value: "antispam" };
  if (t.includes("reject calls on")) return { action: "on", value: "rejectcalls" };
  if (t.includes("reject calls off")) return { action: "off", value: "rejectcalls" };
  if (t.includes("auto status view on")) return { action: "on", value: "autoseen" };
  if (t.includes("auto status view off")) return { action: "off", value: "autoseen" };
  if (t.includes("auto status react on")) return { action: "on", value: "autoreact" };
  if (t.includes("auto status react off")) return { action: "off", value: "autoreact" };
  if (t.includes("auto download status on")) return { action: "on", value: "autodownloadstatus" };
  if (t.includes("auto download status off")) return { action: "off", value: "autodownloadstatus" };

  return null;
}

function buildStyledMenu(title, options, footer = "") {
  let msg = `\n`;
  msg += `┌❮ 👑 *${title.toUpperCase()}* 👑 ❯─\n`;
  msg += `│\n`;
  options.forEach((opt, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    msg += `├► *[ ${num} ]* ➔ \`${opt.label}\`\n`;
  });
  msg += `│\n`;
  msg += `└❮ 💬 *ʀᴇᴘʟʏ ᴛᴏ ᴛʜɪs ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ᴛʜᴇ ɴᴜᴍʙᴇʀ* ❯─\n`;
  if (footer) msg += `\n*${footer}*`;

  return msg;
}

async function sendNumberedMenu(conn, from, mek, title, options, footer = "", imageUrl = SETTINGS_IMAGE) {
  const caption = buildStyledMenu(title, options, footer);
  return await conn.sendMessage(
    from,
    {
      image: { url: imageUrl },
      caption: caption,
    },
    { quoted: mek }
  );
}

async function sendSettingsHome(conn, from, mek, reply, sender, sessionId) {
  const text = await getStatusCard(sessionId);
  const key = makePendingKey(sender, from);
  
  pendingSettingsMenu[key] = {
    createdAt: Date.now(),
    sessionId,
    stage: "home",
    options: null,
    menuMsgId: null,
    processedMsgIds: [] // Double trigger වළක්වන්න Message IDs Save කරන තැන
  };

  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      const sentMsg = await sendInteractiveMessage(
        conn,
        from,
        {
          image: { url: SETTINGS_IMAGE },
          text,
          footer: "MALIYA-MD SETTINGS",
          interactiveButtons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "⚙️ Change Settings",
                id: ".setting menuopen",
              }),
            },
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "📊 Show Full Status",
                id: ".setting status",
              }),
            },
          ],
        },
        { quoted: mek }
      );
      if (sentMsg?.key?.id) pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
      return sentMsg;
    } catch (e) {
      console.log("SETTINGS HOME ERROR:", e);
    }
  }

  const options = [
    { label: "⚙️ Change Settings", action: "menuopen" },
    { label: "📊 Show Full Status", action: "status" },
  ];
  pendingSettingsMenu[key].options = options;
  
  const sentMsg = await sendNumberedMenu(
    conn,
    from,
    mek,
    text + "\n\n✨ *ᴄʜᴏᴏsᴇ ᴀɴ ᴏᴘᴛɪᴏɴ:*",
    options,
    "© MALIYA-MD",
    SETTINGS_IMAGE
  );
  
  if (sentMsg?.key?.id) pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
  return sentMsg;
}

async function sendSettingsRolesMenu(conn, from, mek, reply, sender, sessionId) {
  const key = makePendingKey(sender, from);
  
  // පරණ Process කරපු IDs තියාගෙන අනිත් Data විතරක් Update කරනවා
  const existingProcessedIds = pendingSettingsMenu[key]?.processedMsgIds || [];
  
  pendingSettingsMenu[key] = {
    createdAt: Date.now(),
    sessionId,
    stage: "roles",
    menuMsgId: null,
    processedMsgIds: existingProcessedIds
  };

  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      const sentMsg = await sendInteractiveMessage(
        conn,
        from,
        {
          image: { url: SETTINGS_IMAGE },
          text: "⚙️ *ᴄʜᴏᴏsᴇ ᴀ sᴇᴛᴛɪɴɢ ʀᴏʟᴇ ʙᴇʟᴏᴡ*",
          footer: "Change Settings",
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Change Settings",
                sections: [
                  {
                    title: "🛠 MAIN SETTINGS",
                    rows: [
                      { title: "Public Mode", description: "Set bot mode to public", id: ".setting public" },
                      { title: "Private Mode", description: "Set bot mode to private", id: ".setting private" },
                    ],
                  },
                  {
                    title: "💬 WORK SCOPE (WHERE BOT WORKS)",
                    rows: [
                      { title: "🔒 Private Chat Only", description: "Bot works in private chats only", id: ".setting workscope private" },
                      { title: "👥 Group Chat Only", description: "Bot works in groups only", id: ".setting workscope group" },
                      { title: "🌍 All Chats", description: "Bot works in both private and group chats", id: ".setting workscope all" },
                    ],
                  },
                  {
                    title: "🔘 MENU MODE (BUTTONS)",
                    rows: [
                      { title: "✅ Interactive Buttons ON", description: "Use WhatsApp buttons/lists", id: ".setting on btns" },
                      { title: "❌ Interactive Buttons OFF", description: "Use plain text menus", id: ".setting off btns" },
                    ],
                  },
                  {
                    title: "✨ BOT PRESENCE",
                    rows: [
                      { title: "Auto Typing", description: "Set typing presence mode", id: ".setting presence typing" },
                      { title: "Auto Recording", description: "Set recording presence mode", id: ".setting presence recording" },
                      { title: "Presence OFF", description: "Turn presence off", id: ".setting presence off" },
                    ],
                  },
                  {
                    title: "🛡️ ANTI SPAM PROTECTION",
                    rows: [
                      { title: "✅ Anti Spam ON", description: "Protect bot from spam messages", id: ".setting on antispam" },
                      { title: "❌ Anti Spam OFF", description: "Disable spam protection", id: ".setting off antispam" },
                      { title: "🔄 Toggle Anti Spam", description: "Switch anti-spam on/off", id: ".setting toggle antispam" },
                    ],
                  },
                  {
                    title: "🤖 AUTO REACT SETTINGS",
                    rows: [
                      { title: "✅ Auto React Msg ON", description: "Enable message auto react", id: ".setting on autoreactmsg" },
                      { title: "❌ Auto React Msg OFF", description: "Disable message auto react", id: ".setting off autoreactmsg" },
                      { title: "🔒 React Mode: Private Only", description: "React only in private chats", id: ".setting reactmode private" },
                      { title: "👥 React Mode: Group Only", description: "React only in groups", id: ".setting reactmode group" },
                      { title: "🌍 React Mode: All Chats", description: "React in all chats", id: ".setting reactmode all" },
                    ],
                  },
                  {
                    title: "🤖 AI & TOOLS",
                    rows: [
                      { title: "Enable AI Chat", description: "Turn ON auto msg", id: ".setting on automsg" },
                      { title: "Disable AI Chat", description: "Turn OFF auto msg", id: ".setting off automsg" },
                      { title: "✅ Seen All Msg ON", description: "Auto-read every private + group msg", id: ".setting on seenallmsg" },
                      { title: "❌ Seen All Msg OFF", description: "Stop auto-reading every message", id: ".setting off seenallmsg" },
                      { title: "Enable Anti Delete", description: "Turn ON anti delete (private chats only)", id: ".setting on antidelete" },
                      { title: "Disable Anti Delete", description: "Turn OFF anti delete", id: ".setting off antidelete" },
                      { title: "Reject Calls ON", description: "Turn ON reject calls", id: ".setting on rejectcalls" },
                      { title: "Reject Calls OFF", description: "Turn OFF reject calls", id: ".setting off rejectcalls" },
                    ],
                  },
                  {
                    title: "👁 AUTO FUNCTIONS",
                    rows: [
                      { title: "Auto Status View ON", description: "Enable auto status seen", id: ".setting on autoseen" },
                      { title: "Auto Status View OFF", description: "Disable auto status seen", id: ".setting off autoseen" },
                      { title: "Auto Status React ON", description: "Enable auto react", id: ".setting on autoreact" },
                      { title: "Auto Status React OFF", description: "Disable auto react", id: ".setting off autoreact" },
                      { title: "Auto Download Status ON", description: "Enable auto status download", id: ".setting on autodownloadstatus" },
                      { title: "Auto Download Status OFF", description: "Disable auto status download", id: ".setting off autodownloadstatus" },
                      { title: "Show Full Status", description: "View current settings", id: ".setting status" },
                    ],
                  },
                ],
              }),
            },
          ],
        },
        { quoted: mek }
      );
      if (sentMsg?.key?.id) pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
      return sentMsg;
    } catch (e) {
      console.log("SETTINGS ROLES MENU ERROR:", e);
    }
  }

  const allOptions = [
    { label: "🌐 Public Mode", action: "public" },
    { label: "🔒 Private Mode", action: "private" },
    { label: "🔒 Work Scope: Private", action: "workscope", value: "private" },
    { label: "👥 Work Scope: Group", action: "workscope", value: "group" },
    { label: "🌍 Work Scope: All", action: "workscope", value: "all" },
    { label: "✅ Buttons ON", action: "on", value: "btns" },
    { label: "❌ Buttons OFF", action: "off", value: "btns" },
    { label: "⌨️ Presence: Typing", action: "presence", value: "typing" },
    { label: "🎙️ Presence: Recording", action: "presence", value: "recording" },
    { label: "⛔ Presence: OFF", action: "presence", value: "off" },
    { label: "🛡️ Anti Spam ON", action: "on", value: "antispam" },
    { label: "🛡️ Anti Spam OFF", action: "off", value: "antispam" },
    { label: "🔄 Toggle Anti Spam", action: "toggle", value: "antispam" },
    { label: "✅ Auto React Msg ON", action: "on", value: "autoreactmsg" },
    { label: "❌ Auto React Msg OFF", action: "off", value: "autoreactmsg" },
    { label: "🔒 React Mode: Private", action: "reactmode", value: "private" },
    { label: "👥 React Mode: Group", action: "reactmode", value: "group" },
    { label: "🌍 React Mode: All", action: "reactmode", value: "all" },
    { label: "🤖 AI Chat ON", action: "on", value: "automsg" },
    { label: "🤖 AI Chat OFF", action: "off", value: "automsg" },
    { label: "✅ Seen All Msg ON", action: "on", value: "seenallmsg" },
    { label: "❌ Seen All Msg OFF", action: "off", value: "seenallmsg" },
    { label: "🛡️ Anti Delete ON", action: "on", value: "antidelete" },
    { label: "🛡️ Anti Delete OFF", action: "off", value: "antidelete" },
    { label: "📞 Reject Calls ON", action: "on", value: "rejectcalls" },
    { label: "📞 Reject Calls OFF", action: "off", value: "rejectcalls" },
    { label: "👁️ Auto Status View ON", action: "on", value: "autoseen" },
    { label: "👁️ Auto Status View OFF", action: "off", value: "autoseen" },
    { label: "❤️ Auto Status React ON", action: "on", value: "autoreact" },
    { label: "❤️ Auto Status React OFF", action: "off", value: "autoreact" },
    { label: "📥 Auto Download Status ON", action: "on", value: "autodownloadstatus" },
    { label: "📥 Auto Download Status OFF", action: "off", value: "autodownloadstatus" },
    { label: "📊 Show Full Status", action: "status" },
  ];

  pendingSettingsMenu[key].options = allOptions;
  const header = "⚙️ *sᴇᴛᴛɪɴɢs ᴄᴏɴғɪɢᴜʀᴀᴛɪᴏɴ ᴍᴇɴᴜ*";
  
  const sentMsg = await sendNumberedMenu(conn, from, mek, header, allOptions, "© MALIYA-MD", SETTINGS_IMAGE);
  if (sentMsg?.key?.id) pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
  return sentMsg;
}

cmd(
  {
    pattern: "setting",
    alias: ["settings", "setbot", "botset"],
    react: "⚙️",
    category: "owner",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, args, reply, isOwner, sessionId }) => {
    if (!(isOwner || isRealOwner(sender))) {
      return reply("❌ *`[ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ᴏᴡɴᴇʀ ᴏɴʟʏ. ]`*");
    }

    const action = String(args[0] || "menu").toLowerCase().trim();
    const value = String(args.slice(1).join(" ") || "").toLowerCase().trim();

    try {
      if (action === "menu") {
        return await sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      }
      if (action === "menuopen") {
        return await sendSettingsRolesMenu(conn, from, mek, reply, sender, sessionId);
      }
      // ... අනිත් Actions ...
      if (action === "status") return reply(await getStatusCard(sessionId));
      if (action === "private") { await setSetting(sessionId, "mode", "private"); return reply("✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘʀɪᴠᴀᴛᴇ ]`*"); }
      if (action === "public") { await setSetting(sessionId, "mode", "public"); return reply("✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘᴜʙʟɪᴄ ]`*"); }
      
      if (action === "on" || action === "off" || action === "toggle") {
        const key = mapKey(value);
        if (!key) return reply("❌ *`[ ɪɴᴠᴀʟɪᴅ sᴇᴛᴛɪɴɢ ɴᴀᴍᴇ ]`*");
        
        let updated;
        if (action === "toggle") updated = await toggleSetting(sessionId, key);
        else updated = await setSetting(sessionId, key, action === "on");

        return reply(`✨ *\`[ ✅ sᴇᴛ ${key.toUpperCase()} ᴛᴏ ${action.toUpperCase()} ]\`*`);
      }

      return reply(await getStatusCard(sessionId));
    } catch (e) {
      console.log("SETTING COMMAND ERROR:", e);
      return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴄʜᴀɴɢɪɴɢ sᴇᴛᴛɪɴɢs. ]`*");
    }
  }
);

if (!global.__maliya_settings_reply_handler_added) {
  global.__maliya_settings_reply_handler_added = true;

  replyHandlers.push({
    filter: (_body, { sender, from }) => {
      const key = makePendingKey(sender, from);
      return !!pendingSettingsMenu[key];
    },

    function: async (conn, mek, m, { from, body, sender, reply, isOwner, sessionId }) => {
      if (!(isOwner || isRealOwner(sender))) return;

      const key = makePendingKey(sender, from);
      const state = pendingSettingsMenu[key];
      if (!state) return;

      const sid = sessionId || state.sessionId;
      const text = getIncomingText(body, mek, m);
      
      // Message ID එක ලබාගැනීම (Double trigger නවත්වන්න)
      const incomingMsgId = mek?.key?.id || m?.key?.id;

      const resolved = resolveSettingsActionFromText(text);

      if (resolved) {
        // Double trigger Check (Button click එකකදී)
        if (incomingMsgId) {
            state.processedMsgIds = state.processedMsgIds || [];
            if (state.processedMsgIds.includes(incomingMsgId)) return;
            state.processedMsgIds.push(incomingMsgId);
        }

        try {
          if (resolved.action === "menuopen") {
            state.createdAt = Date.now();
            return await sendSettingsRolesMenu(conn, from, mek, reply, sender, sid);
          }
          const result = await applySettingAction(sid, resolved.action, resolved.value);
          state.createdAt = Date.now();
          
          await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return reply(result);
        } catch (e) {
          console.log("SETTINGS REPLY HANDLER ERROR:", e);
          return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴘʀᴏssᴇssɪɴɢ sᴇᴛᴛɪɴɢs ᴀᴄᴛɪᴏɴ. ]`*");
        }
      }

      const num = parseInt(text, 10);
      if (!isNaN(num) && state.options && state.options.length >= num && num > 0) {
        
        // 🔴 1. අනිවාර්යයෙන්ම Reply එකක් විය යුතුයි 🔴
        const msgObj = mek?.message || m?.message || {};
        const contextInfo = msgObj?.extendedTextMessage?.contextInfo || msgObj?.imageMessage?.contextInfo || {};
        const quotedId = contextInfo?.stanzaId;

        // Reply කරලා නැත්නම් (නිකම්ම 1 ගැහුවොත්) එතනින්ම නවතිනවා
        if (!quotedId) return;

        // 🔴 2. හරියටම අදාළ Menu මැසේජ් එකටමයි Reply කරලා තියෙන්නේ කියලා තහවුරු කිරීම
        if (state.menuMsgId && quotedId !== state.menuMsgId) return;

        // 🔴 3. Double Trigger Check (Text Reply එකකදී එකම මැසේජ් එක දෙපාරක් process වෙන එක නවත්වන්න)
        if (incomingMsgId) {
            state.processedMsgIds = state.processedMsgIds || [];
            if (state.processedMsgIds.includes(incomingMsgId)) return;
            state.processedMsgIds.push(incomingMsgId);
        }

        const opt = state.options[num-1];

        try {
          if (opt.action === "menuopen") {
            state.createdAt = Date.now();
            return await sendSettingsRolesMenu(conn, from, mek, reply, sender, sid);
          }
          const result = await applySettingAction(sid, opt.action, opt.value);
          state.createdAt = Date.now();
          
          await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return reply(result);
        } catch (e) {
          console.log("SETTINGS NUMERIC ERROR:", e);
          return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴀᴘᴘʟʏɪɴɢ sᴇᴛᴛɪɴɢ. ]`*");
        }
      }
    },
  });
}

setInterval(() => {
  const now = Date.now();
  const timeout = 2 * 60 * 1000;
  for (const key of Object.keys(pendingSettingsMenu)) {
    if (now - pendingSettingsMenu[key].createdAt > timeout) {
      delete pendingSettingsMenu[key];
    }
  }
}, 30000);

module.exports = { sendSettingsHome, sendSettingsRolesMenu };
