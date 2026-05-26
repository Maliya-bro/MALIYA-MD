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

function getStatusCard() {
  const s = readSettings();

  return `
🎀 Ξ *BOT SETTINGS PANEL* Ξ

🍀 | *WORK TYPE:* ${String(s.mode || "public").toUpperCase()}
🍀 | *PRESENCE:* ${presenceText(String(s.always_presence || "off"))}
🍀 | *AI CHAT:* ${onOff(!!s.auto_msg)}
🍀 | *AUTO MSG REACT:* ${onOff(!!s.auto_react_msg)}
🍀 | *REACT MODE:* ${reactModeText(String(s.auto_react_mode || "all"))}
🍀 | *ANTI DELETE:* ${onOff(!!s.anti_delete)}
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

  return null;
}

function getIncomingText(body, mek, m) {
  return String(
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
  )
    .trim()
    .toLowerCase();
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

function applySettingAction(action, value) {
  if (action === "status") {
    return getStatusCard();
  }

  if (action === "private") {
    setSetting("mode", "private");
    return "✅ Bot mode set to PRIVATE";
  }

  if (action === "public") {
    setSetting("mode", "public");
    return "✅ Bot mode set to PUBLIC";
  }

  if (action === "reactmode") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ Invalid react mode. Use: private, group, or all";
    }
    setSetting("auto_react_mode", value);
    return `✅ React Mode set to ${reactModeText(value)}`;
  }

  if (action === "presence") {
    if (!["off", "typing", "recording"].includes(value)) {
      return "❌ Invalid presence mode.";
    }
    setSetting("always_presence", value);
    return `✅ Always presence set to ${presenceText(value)}`;
  }

  if (action === "toggle") {
    const key = mapKey(value);
    if (!key) return "❌ Invalid setting name.";

    if (key === "mode") {
      const now = readSettings();
      const next = now.mode === "private" ? "public" : "private";
      setSetting("mode", next);
      return `✅ Bot mode changed to ${next.toUpperCase()}`;
    }

    const updated = toggleSetting(key);

    const responses = {
      auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
      auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
      auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
      auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
      anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)}`,
      auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
      auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
    };

    return responses[key] || `✅ Toggled ${key}`;
  }

  if (action === "on" || action === "off") {
    const key = mapKey(value);

    if (!key || key === "mode") {
      return "❌ Invalid setting name.";
    }

    const boolVal = action === "on";
    const updated = setSetting(key, boolVal);

    const responses = {
      auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
      auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
      auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
      auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
      anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)}`,
      auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
      auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
    };

    return responses[key] || `✅ Set ${key} to ${action.toUpperCase()}`;
  }

  return getStatusCard();
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

  // AUTO REACT MSG
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

  if (t === ".setting on automsg" || t === "enable ai chat") {
    return { action: "on", value: "automsg" };
  }

  if (t === ".setting off automsg" || t === "disable ai chat") {
    return { action: "off", value: "automsg" };
  }

  if (t === ".setting toggle automsg" || t === "toggle ai chat") {
    return { action: "toggle", value: "automsg" };
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

async function sendSettingsHome(conn, from, mek, reply, sender) {
  const text = getStatusCard();

  const key = makePendingKey(sender, from);
  pendingSettingsMenu[key] = {
    createdAt: Date.now(),
    lastSig: "",
    lastAt: 0,
  };

  if (!sendInteractiveMessage) {
    return conn.sendMessage(
      from,
      {
        image: { url: SETTINGS_IMAGE },
        caption:
          text +
          "\n\nUse:\n.setting status\n.setting public\n.setting private\n.setting toggle mode",
      },
      { quoted: mek }
    );
  }

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
    return conn.sendMessage(
      from,
      {
        image: { url: SETTINGS_IMAGE },
        caption: text,
      },
      { quoted: mek }
    );
  }
}

async function sendSettingsRolesMenu(conn, from, mek, reply, sender) {
  const key = makePendingKey(sender, from);
  pendingSettingsMenu[key] = pendingSettingsMenu[key] || {
    createdAt: Date.now(),
    lastSig: "",
    lastAt: 0,
  };
  pendingSettingsMenu[key].createdAt = Date.now();

  if (!sendInteractiveMessage) {
    return conn.sendMessage(
      from,
      {
        image: { url: SETTINGS_IMAGE },
        caption: getStatusCard(),
      },
      { quoted: mek }
    );
  }

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
                    {
                      title: "Public Mode",
                      description: "Set bot mode to public",
                      id: ".setting public",
                    },
                    {
                      title: "Private Mode",
                      description: "Set bot mode to private",
                      id: ".setting private",
                    },
                    {
                      title: "Toggle Mode",
                      description: "Switch public/private",
                      id: ".setting toggle mode",
                    },
                  ],
                },
                {
                  title: "✨ BOT PRESENCE",
                  rows: [
                    {
                      title: "Auto Typing",
                      description: "Set typing presence mode",
                      id: ".setting presence typing",
                    },
                    {
                      title: "Auto Recording",
                      description: "Set recording presence mode",
                      id: ".setting presence recording",
                    },
                    {
                      title: "Presence OFF",
                      description: "Turn presence off",
                      id: ".setting presence off",
                    },
                  ],
                },
                {
                  title: "🤖 AUTO REACT SETTINGS",
                  rows: [
                    {
                      title: "✅ Auto React Msg ON",
                      description: "Enable message auto react",
                      id: ".setting on autoreactmsg",
                    },
                    {
                      title: "❌ Auto React Msg OFF",
                      description: "Disable message auto react",
                      id: ".setting off autoreactmsg",
                    },
                    {
                      title: "🔄 Toggle Auto React Msg",
                      description: "Switch auto react on/off",
                      id: ".setting toggle autoreactmsg",
                    },
                    {
                      title: "🔒 React Mode: Private Only",
                      description: "React only in private chats",
                      id: ".setting reactmode private",
                    },
                    {
                      title: "👥 React Mode: Group Only",
                      description: "React only in groups",
                      id: ".setting reactmode group",
                    },
                    {
                      title: "🌍 React Mode: All Chats",
                      description: "React in all chats",
                      id: ".setting reactmode all",
                    },
                  ],
                },
                {
                  title: "🤖 AI & TOOLS",
                  rows: [
                    {
                      title: "Enable AI Chat",
                      description: "Turn ON auto msg",
                      id: ".setting on automsg",
                    },
                    {
                      title: "Disable AI Chat",
                      description: "Turn OFF auto msg",
                      id: ".setting off automsg",
                    },
                    {
                      title: "Enable Anti Delete",
                      description: "Turn ON anti delete",
                      id: ".setting on antidelete",
                    },
                    {
                      title: "Disable Anti Delete",
                      description: "Turn OFF anti delete",
                      id: ".setting off antidelete",
                    },
                    {
                      title: "Reject Calls ON",
                      description: "Turn ON reject calls",
                      id: ".setting on rejectcalls",
                    },
                    {
                      title: "Reject Calls OFF",
                      description: "Turn OFF reject calls",
                      id: ".setting off rejectcalls",
                    },
                  ],
                },
                {
                  title: "👁 AUTO FUNCTIONS",
                  rows: [
                    {
                      title: "Auto Status View ON",
                      description: "Enable auto status seen",
                      id: ".setting on autoseen",
                    },
                    {
                      title: "Auto Status View OFF",
                      description: "Disable auto status seen",
                      id: ".setting off autoseen",
                    },
                    {
                      title: "Auto Status React ON",
                      description: "Enable auto react",
                      id: ".setting on autoreact",
                    },
                    {
                      title: "Auto Status React OFF",
                      description: "Disable auto react",
                      id: ".setting off autoreact",
                    },
                    {
                      title: "Auto Download Status ON",
                      description: "Enable auto status download",
                      id: ".setting on autodownloadstatus",
                    },
                    {
                      title: "Auto Download Status OFF",
                      description: "Disable auto status download",
                      id: ".setting off autodownloadstatus",
                    },
                    {
                      title: "Show Full Status",
                      description: "View current settings",
                      id: ".setting status",
                    },
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
    return conn.sendMessage(
      from,
      {
        image: { url: SETTINGS_IMAGE },
        caption: getStatusCard(),
      },
      { quoted: mek }
    );
  }
}

cmd(
  {
    pattern: "setting",
    alias: ["settings", "setbot", "botset"],
    react: "⚙️",
    category: "owner",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, args, reply, isOwner }) => {
    if (!(isOwner || isRealOwner(sender))) {
      return reply("❌ This command is owner only.");
    }

    const action = String(args[0] || "menu").toLowerCase().trim();
    const value = String(args.slice(1).join(" ") || "")
      .toLowerCase()
      .trim();

    try {
      if (action === "menu") {
        return sendSettingsHome(conn, from, mek, reply, sender);
      }

      if (action === "menuopen") {
        return sendSettingsRolesMenu(conn, from, mek, reply, sender);
      }

      if (action === "status") {
        return reply(getStatusCard());
      }

      if (action === "private") {
        setSetting("mode", "private");
        return reply("✅ Bot mode set to PRIVATE");
      }

      if (action === "public") {
        setSetting("mode", "public");
        return reply("✅ Bot mode set to PUBLIC");
      }

      if (action === "reactmode") {
        if (!["private", "group", "all"].includes(value)) {
          return reply(
            "❌ Use:\n.setting reactmode private\n.setting reactmode group\n.setting reactmode all"
          );
        }
        setSetting("auto_react_mode", value);
        return reply(`✅ React Mode set to ${reactModeText(value)}`);
      }

      if (action === "presence") {
        if (!["off", "typing", "recording"].includes(value)) {
          return reply(
            "❌ Use:\n.setting presence off\n.setting presence typing\n.setting presence recording"
          );
        }
        setSetting("always_presence", value);
        return reply(`✅ Always presence set to ${presenceText(value)}`);
      }

      if (action === "toggle") {
        const key = mapKey(value);
        if (!key) return reply("❌ Invalid setting name.");

        if (key === "mode") {
          const now = readSettings();
          const next = now.mode === "private" ? "public" : "private";
          setSetting("mode", next);
          return reply(`✅ Bot mode changed to ${next.toUpperCase()}`);
        }

        const updated = toggleSetting(key);
        
        const responses = {
          auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
          auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
          auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
          auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
          anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)}`,
          auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
          auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
        };
        
        return reply(responses[key] || `✅ Toggled ${key}`);
      }

      if (action === "on" || action === "off") {
        const key = mapKey(value);

        if (!key || key === "mode") {
          return reply("❌ Invalid setting name.");
        }

        const boolVal = action === "on";
        const updated = setSetting(key, boolVal);

        const responses = {
          auto_status_seen: `✅ Auto Status Seen: ${onOff(updated.auto_status_seen)}`,
          auto_status_react: `✅ Auto Status React: ${onOff(updated.auto_status_react)}`,
          auto_download_status: `✅ Auto Download Status: ${onOff(updated.auto_download_status)}`,
          auto_msg: `✅ AI Chat: ${onOff(updated.auto_msg)}`,
          anti_delete: `✅ Anti Delete: ${onOff(updated.anti_delete)}`,
          auto_reject_calls: `✅ Reject Calls: ${onOff(updated.auto_reject_calls)}`,
          auto_react_msg: `✅ Auto Message React: ${onOff(updated.auto_react_msg)}`,
        };

        return reply(responses[key] || `✅ Set ${key} to ${action.toUpperCase()}`);
      }

      return reply(getStatusCard());
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

    function: async (conn, mek, m, { from, body, sender, reply, isOwner }) => {
      if (!(isOwner || isRealOwner(sender))) return;

      const key = makePendingKey(sender, from);
      const state = pendingSettingsMenu[key];
      if (!state) return;

      const text = getIncomingText(body, mek, m);
      const resolved = resolveSettingsActionFromText(text);
      if (!resolved) return;

      const sig = `${resolved.action}:${resolved.value || ""}`;
      if (isDuplicateAction(state, sig)) return;

      try {
        if (resolved.action === "menuopen") {
          state.createdAt = Date.now();
          return sendSettingsRolesMenu(conn, from, mek, reply, sender);
        }

        const result = applySettingAction(resolved.action, resolved.value);
        state.createdAt = Date.now();
        return reply(result);
      } catch (e) {
        console.log("SETTINGS REPLY HANDLER ERROR:", e);
        return reply("❌ Error while processing settings action.");
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
