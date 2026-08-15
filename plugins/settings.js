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
  return val ? "ON" : "OFF";
}

function presenceText(val) {
  if (val === "typing") return "AUTO TYPING";
  if (val === "recording") return "AUTO RECORDING";
  return "OFF";
}

function reactModeText(val) {
  if (val === "private") return "PRIVATE ONLY";
  if (val === "group") return "GROUP ONLY";
  return "ALL CHATS";
}

function workScopeText(val) {
  if (val === "private") return "PRIVATE CHAT ONLY";
  if (val === "group") return "GROUP CHAT ONLY";
  return "ALL CHATS (PRIVATE + GROUP)";
}

function btnsModeText(val) {
  return val ? "INTERACTIVE BUTTONS" : "NUMBER REPLY (TEXT MENU)";
}

function getStatusCard(sessionId) {
  const s = readSettings(sessionId);
  return `
🎀 Ξ *BOT SETTINGS PANEL* Ξ

🍀 | *WORK TYPE:* ${String(s.mode || "public").toUpperCase()}
🍀 | *WORK SCOPE:* ${workScopeText(String(s.work_scope || "private"))}
🍀 | *MENU MODE:* ${btnsModeText(!!s.btns_enabled)}
🍀 | *PRESENCE:* ${presenceText(String(s.always_presence || "off"))}
🍀 | *AI CHAT:* ${onOff(!!s.auto_msg)}
🍀 | *SEEN ALL MSG:* ${onOff(!!s.seen_all_msg)}
🍀 | *AUTO MSG REACT:* ${onOff(!!s.auto_react_msg)}
🍀 | *REACT MODE:* ${reactModeText(String(s.auto_react_mode || "all"))}
🍀 | *ANTI DELETE:* ${onOff(!!s.anti_delete)} _(private chats only)_
🍀 | *ANTI CALL:* ${onOff(!!s.auto_reject_calls)}
🍀 | *AUTO STATUS:* ${onOff(!!s.auto_status_seen)}
🍀 | *AUTO REACT:* ${onOff(!!s.auto_status_react)}
🍀 | *AUTO DOWNLOAD STATUS:* ${onOff(!!s.auto_download_status)}

© MALIYA-MD
`.trim();
}

function mapKey(name = "") {
  const k = String(name).toLowerCase().trim();

  if (["autoseen", "auto_seen", "statusseen", "auto_status_seen"].includes(k)) {
    return "auto_status_seen";
  }
  if (["autoreact", "auto_react", "statusreact", "auto_status_react"].includes(k)) {
    return "auto_status_react";
  }
  if (
    ["autodownloadstatus", "auto_download_status", "statusdownload", "downloadstatus"].includes(k)
  ) {
    return "auto_download_status";
  }
  if (["automsg", "auto_msg", "msg", "aichat", "ai"].includes(k)) {
    return "auto_msg";
  }
  if (["seenallmsg", "seen_all_msg", "seenall", "allmsgseen"].includes(k)) {
    return "seen_all_msg";
  }
  if (["antidelete", "anti_delete", "delete"].includes(k)) {
    return "anti_delete";
  }
  if (["rejectcalls", "auto_reject_calls", "calls", "anticall"].includes(k)) {
    return "auto_reject_calls";
  }
  if (["mode", "botmode", "privatepublic"].includes(k)) {
    return "mode";
  }
  if (["autoreactmsg", "auto_react_msg", "msgreact"].includes(k)) {
    return "auto_react_msg";
  }
  if (["reactmode", "auto_react_mode"].includes(k)) {
    return "auto_react_mode";
  }
  if (["workscope", "work_scope", "worktype", "work_type", "scope"].includes(k)) {
    return "work_scope";
  }
  if (["btns", "buttons", "btns_enabled", "menumode", "menu_mode"].includes(k)) {
    return "btns_enabled";
  }
  return null;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getIncomingText(body, mek, m) {
  const direct = String(
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m?.message?.buttonsResponseMessage?.selectedButtonId ||
      m?.message?.templateButtonReplyMessage?.selectedId ||
      m?.message?.interactiveResponseMessage?.body?.text ||
      m?.message?.conversation ||
      m?.message?.extendedTextMessage?.text ||
      mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      mek?.message?.buttonsResponseMessage?.selectedButtonId ||
      mek?.message?.templateButtonReplyMessage?.selectedId ||
      mek?.message?.interactiveResponseMessage?.body?.text ||
      mek?.message?.conversation ||
      mek?.message?.extendedTextMessage?.text ||
      body ||
      ""
  ).trim();
  if (direct) return direct.toLowerCase();

  const paramsJson =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      return String(
        parsed.id ||
          parsed.selectedId ||
          parsed.selectedRowId ||
          parsed.title ||
          parsed.display_text ||
          parsed.text ||
          parsed.name ||
          paramsJson
      ).trim().toLowerCase();
    }
    return String(paramsJson).trim().toLowerCase();
  }
  return "";
}

function isDuplicateAction(state, sig) {
  const now = Date.now();
  if (state.lastSig === sig && now - (state.lastAt || 0) < 3000) {
    return true;
  }
  state.lastSig = sig;
  state.lastAt = now;
  return false;
}

function applySettingAction(sessionId, action, value) {
  if (action === "status") {
    return getStatusCard(sessionId);
  }
  if (action === "private") {
    setSetting(sessionId, "mode", "private");
    return "✅ Bot mode set to PRIVATE";
  }
  if (action === "public") {
    setSetting(sessionId, "mode", "public");
    return "✅ Bot mode set to PUBLIC";
  }
  if (action === "reactmode") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ Invalid react mode. Use: private, group, or all";
    }
    setSetting(sessionId, "auto_react_mode", value);
    return `✅ React Mode set to ${reactModeText(value)}`;
  }
  if (action === "workscope") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ Invalid work scope. Use: private, group, or all";
    }
    setSetting(sessionId, "work_scope", value);
    return `✅ Work Scope set to ${workScopeText(value)}`;
  }
  if (action === "presence") {
    if (!["off", "typing", "recording"].includes(value)) {
      return "❌ Invalid presence mode.";
    }
    setSetting(sessionId, "always_presence", value);
    return `✅ Always presence set to ${presenceText(value)}`;
  }
  if (action === "toggle") {
    const key = mapKey(value);
    if (!key) return "❌ Invalid setting name.";

    if (key === "mode") {
      const now = readSettings(sessionId);
      const next = now.mode === "private" ? "public" : "private";
      setSetting(sessionId, "mode", next);
      return `✅ Bot mode changed to ${next.toUpperCase()}`;
    }

    const updated = toggleSetting(sessionId, key);

    const responses = {
      auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
      auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
      auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
      auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
      seen_all_msg: `✅ Seen All Msg: ${onOff(updated.seen_all_msg)}`,
      anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)} _(private chats only)_`,
      auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
      auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
      btns_enabled: `✅ Menu Mode: ${btnsModeText(!!updated.btns_enabled)}`,
    };

    return responses[key] || `✅ Toggled ${key}`;
  }

  if (action === "on" || action === "off") {
    const key = mapKey(value);
    if (!key || key === "mode") {
      return "❌ Invalid setting name.";
    }
    const boolVal = action === "on";
    const updated = setSetting(sessionId, key, boolVal);

    const responses = {
      auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
      auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
      auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
      auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
      seen_all_msg: `✅ Seen All Msg: ${onOff(updated.seen_all_msg)}`,
      anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)} _(private chats only)_`,
      auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
      auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
      btns_enabled: `✅ Menu Mode: ${btnsModeText(!!updated.btns_enabled)}`,
    };

    return responses[key] || `✅ Set ${key} to ${action.toUpperCase()}`;
  }

  return getStatusCard(sessionId);
}

function resolveSettingsActionFromText(text = "") {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;

  if (t === ".setting menuopen" || t === "change settings" || t === ".setting menu") {
    return { action: "menuopen" };
  }
  if (t === ".setting status" || t === "show full status" || t === ".setting show") {
    return { action: "status" };
  }
  if (t === ".setting public" || t === "public mode") {
    return { action: "public" };
  }
  if (t === ".setting private" || t === "private mode") {
    return { action: "private" };
  }
  if (t === ".setting toggle mode" || t === "toggle mode") {
    return { action: "toggle", value: "mode" };
  }
  if (t === ".setting presence typing" || t === "auto typing") {
    return { action: "presence", value: "typing" };
  }
  if (t === ".setting presence recording" || t === "auto recording") {
    return { action: "presence", value: "recording" };
  }
  if (t === ".setting presence off" || t === "presence off") {
    return { action: "presence", value: "off" };
  }
  if (t === ".setting workscope private" || t === "work scope private" || t === "private chat only") {
    return { action: "workscope", value: "private" };
  }
  if (t === ".setting workscope group" || t === "work scope group" || t === "group chat only") {
    return { action: "workscope", value: "group" };
  }
  if (t === ".setting workscope all" || t === "work scope all" || t === "all chats") {
    return { action: "workscope", value: "all" };
  }
  if (t === ".setting on btns" || t === "enable btns" || t === "btns on" || t === "interactive buttons on") {
    return { action: "on", value: "btns" };
  }
  if (t === ".setting off btns" || t === "disable btns" || t === "btns off" || t === "interactive buttons off") {
    return { action: "off", value: "btns" };
  }
  if (t === ".setting toggle btns" || t === "toggle btns" || t === "toggle menu mode") {
    return { action: "toggle", value: "btns" };
  }
  if (t === ".setting on autoreactmsg" || t === "enable auto react msg" || t === "auto react msg on" || t === ".setting on auto_react_msg") {
    return { action: "on", value: "autoreactmsg" };
  }
  if (t === ".setting off autoreactmsg" || t === "disable auto react msg" || t === "auto react msg off" || t === ".setting off auto_react_msg") {
    return { action: "off", value: "autoreactmsg" };
  }
  if (t === ".setting toggle autoreactmsg" || t === "toggle auto react msg" || t === "auto react msg toggle" || t === ".setting toggle auto_react_msg") {
    return { action: "toggle", value: "autoreactmsg" };
  }
  if (t === ".setting reactmode private") {
    return { action: "reactmode", value: "private" };
  }
  if (t === ".setting reactmode group") {
    return { action: "reactmode", value: "group" };
  }
  if (t === ".setting reactmode all") {
    return { action: "reactmode", value: "all" };
  }
  if (t === ".setting msg on" || t === "enable ai chat") {
    return { action: "on", value: "automsg" };
  }
  if (t === ".setting msg off" || t === "disable ai chat") {
    return { action: "off", value: "automsg" };
  }
  if (t === ".setting toggle automsg" || t === "toggle ai chat") {
    return { action: "toggle", value: "automsg" };
  }
  if (t === ".setting on seenallmsg" || t === "enable seen all msg" || t === "seen all msg on") {
    return { action: "on", value: "seenallmsg" };
  }
  if (t === ".setting off seenallmsg" || t === "disable seen all msg" || t === "seen all msg off") {
    return { action: "off", value: "seenallmsg" };
  }
  if (t === ".setting toggle seenallmsg" || t === "toggle seen all msg") {
    return { action: "toggle", value: "seenallmsg" };
  }
  if (t === ".setting on antidelete" || t === "enable anti delete") {
    return { action: "on", value: "antidelete" };
  }
  if (t === ".setting off antidelete" || t === "disable anti delete") {
    return { action: "off", value: "antidelete" };
  }
  if (t === ".setting toggle antidelete" || t === "toggle anti delete") {
    return { action: "toggle", value: "antidelete" };
  }
  if (t === ".setting on rejectcalls" || t === "reject calls on") {
    return { action: "on", value: "rejectcalls" };
  }
  if (t === ".setting off rejectcalls" || t === "reject calls off") {
    return { action: "off", value: "rejectcalls" };
  }
  if (t === ".setting toggle rejectcalls" || t === "toggle reject calls") {
    return { action: "toggle", value: "rejectcalls" };
  }
  if (t === ".setting on autoseen" || t === "auto status view on") {
    return { action: "on", value: "autoseen" };
  }
  if (t === ".setting off autoseen" || t === "auto status view off") {
    return { action: "off", value: "autoseen" };
  }
  if (t === ".setting toggle autoseen" || t === "toggle auto seen") {
    return { action: "toggle", value: "autoseen" };
  }
  if (t === ".setting on autoreact" || t === "auto status react on") {
    return { action: "on", value: "autoreact" };
  }
  if (t === ".setting off autoreact" || t === "auto status react off") {
    return { action: "off", value: "autoreact" };
  }
  if (t === ".setting toggle autoreact" || t === "toggle auto react") {
    return { action: "toggle", value: "autoreact" };
  }
  if (t === ".setting on autodownloadstatus" || t === "auto download status on") {
    return { action: "on", value: "autodownloadstatus" };
  }
  if (t === ".setting off autodownloadstatus" || t === "auto download status off") {
    return { action: "off", value: "autodownloadstatus" };
  }
  if (t === ".setting toggle autodownloadstatus" || t === "toggle auto download status") {
    return { action: "toggle", value: "autodownloadstatus" };
  }
  return null;
}

// ----- Helper: build a beautifully styled numbered menu with fancy fonts -----
function buildStyledMenu(title, options, footer = "") {
  const line = "━━━━━━━━━━━";
  const top = "╔" + "═".repeat(36) + "╗";
  const bottom = "╚" + "═".repeat(36) + "╝";
  let msg = `╔════════════════╗\n`;
  msg +=    `║  ★彡 ${title} 彡★  ║\n`;
  msg +=    `╚════════════════╝\n\n`;
  msg += line + "\n";
  options.forEach((opt, idx) => {
    msg += `*${idx+1}.* ${opt.label}\n`;
  });
  msg += line + "\n\n";
  msg += `📌 *Reply with the number of your choice.*`;
  if (footer) msg += "\n" + footer;

  return msg;
}

// ----- Send numbered menu with image and styled text -----
async function sendNumberedMenu(conn, from, mek, title, options, footer = "", imageUrl = SETTINGS_IMAGE) {
  const caption = buildStyledMenu(title, options, footer);
  return conn.sendMessage(
    from,
    {
      image: { url: imageUrl },
      caption: caption,
    },
    { quoted: mek }
  );
}

async function sendSettingsHome(conn, from, mek, reply, sender, sessionId) {
  const text = getStatusCard(sessionId);
  const key = makePendingKey(sender, from);
  pendingSettingsMenu[key] = {
    createdAt: Date.now(),
    lastSig: "",
    lastAt: 0,
    sessionId,
    stage: "home",
    options: null,
  };

  const settings = readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(
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
                display_text: "Change Settings",
                id: ".setting menuopen",
              }),
            },
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "Show Full Status",
                id: ".setting status",
              }),
            },
          ],
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("SETTINGS HOME ERROR:", e);
    }
  }

  const options = [
    { label: "⚙️ Change Settings", action: "menuopen" },
    { label: "📊 Show Full Status", action: "status" },
  ];
  pendingSettingsMenu[key].options = options;
  return sendNumberedMenu(
    conn,
    from,
    mek,
    text + "\n\n*✨ Choose an option:*",
    options,
    "© MALIYA-MD",
    SETTINGS_IMAGE
  );
}

async function sendSettingsRolesMenu(conn, from, mek, reply, sender, sessionId) {
  const key = makePendingKey(sender, from);
  pendingSettingsMenu[key] = pendingSettingsMenu[key] || {
    createdAt: Date.now(),
    lastSig: "",
    lastAt: 0,
    sessionId,
    stage: "roles",
  };
  pendingSettingsMenu[key].createdAt = Date.now();
  pendingSettingsMenu[key].sessionId = sessionId;
  pendingSettingsMenu[key].stage = "roles";

  const settings = readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn && sendInteractiveMessage) {
    try {
      return await sendInteractiveMessage(
        conn,
        from,
        {
          image: { url: SETTINGS_IMAGE },
          text: "⚙️ *Choose a setting role below*",
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
                      { title: "Toggle Mode", description: "Switch public/private", id: ".setting toggle mode" },
                    ],
                  },
                  {
                    title: "💬 WORK SCOPE (WHERE BOT WORKS)",
                    rows: [
                      { title: "🔒 Private Chat Only", description: "Bot works in private chats only, ignores groups", id: ".setting workscope private" },
                      { title: "👥 Group Chat Only", description: "Bot works in groups only, ignores private chats", id: ".setting workscope group" },
                      { title: "🌍 All Chats", description: "Bot works in both private and group chats", id: ".setting workscope all" },
                    ],
                  },
                  {
                    title: "🔘 MENU MODE (BUTTONS)",
                    rows: [
                      { title: "✅ Interactive Buttons ON", description: "Use WhatsApp buttons/lists in song, video, alive menus", id: ".setting on btns" },
                      { title: "❌ Interactive Buttons OFF", description: "Use plain number-reply text menus instead", id: ".setting off btns" },
                      { title: "🔄 Toggle Menu Mode", description: "Switch between buttons and number-reply", id: ".setting toggle btns" },
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
                    title: "🤖 AUTO REACT SETTINGS",
                    rows: [
                      { title: "✅ Auto React Msg ON", description: "Enable message auto react", id: ".setting on autoreactmsg" },
                      { title: "❌ Auto React Msg OFF", description: "Disable message auto react", id: ".setting off autoreactmsg" },
                      { title: "🔄 Toggle Auto React Msg", description: "Switch auto react on/off", id: ".setting toggle autoreactmsg" },
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
                      { title: "🔄 Toggle Seen All Msg", description: "Switch seen-all on/off", id: ".setting toggle seenallmsg" },
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
    } catch (e) {
      console.log("SETTINGS ROLES MENU ERROR:", e);
    }
  }

  const allOptions = [
    { label: "🌐 Public Mode", action: "public" },
    { label: "🔒 Private Mode", action: "private" },
    { label: "🔄 Toggle Mode", action: "toggle", value: "mode" },
    { label: "🔒 Work Scope: Private", action: "workscope", value: "private" },
    { label: "👥 Work Scope: Group", action: "workscope", value: "group" },
    { label: "🌍 Work Scope: All", action: "workscope", value: "all" },
    { label: "✅ Buttons ON", action: "on", value: "btns" },
    { label: "❌ Buttons OFF", action: "off", value: "btns" },
    { label: "🔄 Toggle Buttons", action: "toggle", value: "btns" },
    { label: "⌨️ Presence: Typing", action: "presence", value: "typing" },
    { label: "🎙️ Presence: Recording", action: "presence", value: "recording" },
    { label: "⛔ Presence: OFF", action: "presence", value: "off" },
    { label: "✅ Auto React Msg ON", action: "on", value: "autoreactmsg" },
    { label: "❌ Auto React Msg OFF", action: "off", value: "autoreactmsg" },
    { label: "🔄 Toggle Auto React Msg", action: "toggle", value: "autoreactmsg" },
    { label: "🔒 React Mode: Private", action: "reactmode", value: "private" },
    { label: "👥 React Mode: Group", action: "reactmode", value: "group" },
    { label: "🌍 React Mode: All", action: "reactmode", value: "all" },
    { label: "🤖 AI Chat ON", action: "on", value: "automsg" },
    { label: "🤖 AI Chat OFF", action: "off", value: "automsg" },
    { label: "🔄 Toggle AI Chat", action: "toggle", value: "automsg" },
    { label: "✅ Seen All Msg ON", action: "on", value: "seenallmsg" },
    { label: "❌ Seen All Msg OFF", action: "off", value: "seenallmsg" },
    { label: "🔄 Toggle Seen All Msg", action: "toggle", value: "seenallmsg" },
    { label: "🛡️ Anti Delete ON", action: "on", value: "antidelete" },
    { label: "🛡️ Anti Delete OFF", action: "off", value: "antidelete" },
    { label: "🔄 Toggle Anti Delete", action: "toggle", value: "antidelete" },
    { label: "📞 Reject Calls ON", action: "on", value: "rejectcalls" },
    { label: "📞 Reject Calls OFF", action: "off", value: "rejectcalls" },
    { label: "🔄 Toggle Reject Calls", action: "toggle", value: "rejectcalls" },
    { label: "👁️ Auto Status View ON", action: "on", value: "autoseen" },
    { label: "👁️ Auto Status View OFF", action: "off", value: "autoseen" },
    { label: "🔄 Toggle Auto Status View", action: "toggle", value: "autoseen" },
    { label: "❤️ Auto Status React ON", action: "on", value: "autoreact" },
    { label: "❤️ Auto Status React OFF", action: "off", value: "autoreact" },
    { label: "🔄 Toggle Auto Status React", action: "toggle", value: "autoreact" },
    { label: "📥 Auto Download Status ON", action: "on", value: "autodownloadstatus" },
    { label: "📥 Auto Download Status OFF", action: "off", value: "autodownloadstatus" },
    { label: "🔄 Toggle Auto Download Status", action: "toggle", value: "autodownloadstatus" },
    { label: "📊 Show Full Status", action: "status" },
  ];

  pendingSettingsMenu[key].options = allOptions;
  const header = "⚙️ *Choose a setting to change:*";
  return sendNumberedMenu(conn, from, mek, header, allOptions, "© MALIYA-MD", SETTINGS_IMAGE);
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
      return reply("❌ This command is owner only.");
    }

    const action = String(args[0] || "menu").toLowerCase().trim();
    const value = String(args.slice(1).join(" ") || "").toLowerCase().trim();

    try {
      if (action === "menu") {
        return sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      }
      if (action === "menuopen") {
        return sendSettingsRolesMenu(conn, from, mek, reply, sender, sessionId);
      }
      if (action === "status") {
        return reply(getStatusCard(sessionId));
      }
      if (action === "private") {
        setSetting(sessionId, "mode", "private");
        return reply("✅ Bot mode set to PRIVATE");
      }
      if (action === "public") {
        setSetting(sessionId, "mode", "public");
        return reply("✅ Bot mode set to PUBLIC");
      }
      if (action === "reactmode") {
        if (!["private", "group", "all"].includes(value)) {
          return reply(
            "❌ Use:\n.setting reactmode private\n.setting reactmode group\n.setting reactmode all"
          );
        }
        setSetting(sessionId, "auto_react_mode", value);
        return reply(`✅ React Mode set to ${reactModeText(value)}`);
      }
      if (action === "workscope") {
        if (!["private", "group", "all"].includes(value)) {
          return reply(
            "❌ Use:\n.setting workscope private\n.setting workscope group\n.setting workscope all"
          );
        }
        setSetting(sessionId, "work_scope", value);
        return reply(`✅ Work Scope set to ${workScopeText(value)}`);
      }
      if (action === "presence") {
        if (!["off", "typing", "recording"].includes(value)) {
          return reply(
            "❌ Use:\n.setting presence off\n.setting presence typing\n.setting presence recording"
          );
        }
        setSetting(sessionId, "always_presence", value);
        return reply(`✅ Always presence set to ${presenceText(value)}`);
      }
      if (action === "toggle") {
        const key = mapKey(value);
        if (!key) return reply("❌ Invalid setting name.");

        if (key === "mode") {
          const now = readSettings(sessionId);
          const next = now.mode === "private" ? "public" : "private";
          setSetting(sessionId, "mode", next);
          return reply(`✅ Bot mode changed to ${next.toUpperCase()}`);
        }

        const updated = toggleSetting(sessionId, key);

        const responses = {
          auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
          auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
          auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
          auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
          seen_all_msg: `✅ Seen All Msg: ${onOff(updated.seen_all_msg)}`,
          anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)} _(private chats only)_`,
          auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
          auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
          btns_enabled: `✅ Menu Mode: ${btnsModeText(!!updated.btns_enabled)}`,
        };

        return reply(responses[key] || `✅ Toggled ${key}`);
      }

      if (action === "on" || action === "off") {
        const key = mapKey(value);
        if (!key || key === "mode") {
          return reply("❌ Invalid setting name.");
        }
        const boolVal = action === "on";
        const updated = setSetting(sessionId, key, boolVal);

        const responses = {
          auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
          auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
          auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
          auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
          seen_all_msg: `✅ Seen All Msg: ${onOff(updated.seen_all_msg)}`,
          anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)} _(private chats only)_`,
          auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
          auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
          btns_enabled: `✅ Menu Mode: ${btnsModeText(!!updated.btns_enabled)}`,
        };

        return reply(responses[key] || `✅ Set ${key} to ${action.toUpperCase()}`);
      }

      return reply(getStatusCard(sessionId));
    } catch (e) {
      console.log("SETTING COMMAND ERROR:", e);
      return reply("❌ Error while changing settings.");
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
      const resolved = resolveSettingsActionFromText(text);
      if (resolved) {
        const sig = `${resolved.action}:${resolved.value || ""}`;
        if (isDuplicateAction(state, sig)) return;

        try {
          if (resolved.action === "menuopen") {
            state.createdAt = Date.now();
            state.stage = "roles";
            return sendSettingsRolesMenu(conn, from, mek, reply, sender, sid);
          }
          const result = applySettingAction(sid, resolved.action, resolved.value);
          state.createdAt = Date.now();
          return reply(result);
        } catch (e) {
          console.log("SETTINGS REPLY HANDLER ERROR:", e);
          return reply("❌ Error while processing settings action.");
        }
      }

      const num = parseInt(text, 10);
      if (!isNaN(num) && state.options && state.options.length >= num && num > 0) {
        const opt = state.options[num-1];
        const sig = `${opt.action}:${opt.value || ""}`;
        if (isDuplicateAction(state, sig)) return;

        try {
          if (opt.action === "menuopen") {
            state.createdAt = Date.now();
            state.stage = "roles";
            return sendSettingsRolesMenu(conn, from, mek, reply, sender, sid);
          }
          const result = applySettingAction(sid, opt.action, opt.value);
          state.createdAt = Date.now();
          return reply(result);
        } catch (e) {
          console.log("SETTINGS NUMERIC ERROR:", e);
          return reply("❌ Error while applying setting.");
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
