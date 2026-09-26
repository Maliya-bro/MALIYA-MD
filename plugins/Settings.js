const { cmd, replyHandlers } = require("../command");
const config = require("../config");
const {
  readSettings,
  setSetting,
  toggleSetting,
} = require("../lib/botSettings");

const SETTINGS_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/ChatGPT%20Image%20Mar%2022,%202026,%2008_42_52%20AM.png";

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

function resolveSettingsActionFromText(text = "") {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;

  if (t.startsWith(".setting ")) {
    const parts = t.replace(".setting ", "").trim().split(" ");
    const action = parts[0];
    const value = parts.slice(1).join(" ");
    return { action, value };
  }
  return null;
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

// සියලුම සැකසුම් විකල්ප (Popup List එකට සහ Numbered Menu එකට දෙකටම එකම ලැයිස්තුව)
function getAllSettingsOptions() {
  return [
    { cat: "🛠️ MAIN SETTINGS", label: "Public Mode", desc: "Set bot to public", cmd: ".setting public" },
    { cat: "🛠️ MAIN SETTINGS", label: "Private Mode", desc: "Set bot to private", cmd: ".setting private" },
    
    { cat: "💬 WORK SCOPE", label: "🔒 Private Only", desc: "Work in private chats only", cmd: ".setting workscope private" },
    { cat: "💬 WORK SCOPE", label: "👥 Group Only", desc: "Work in group chats only", cmd: ".setting workscope group" },
    { cat: "💬 WORK SCOPE", label: "🌍 All Chats", desc: "Work in both private & group", cmd: ".setting workscope all" },
    
    { cat: "🔘 MENU MODE", label: "✅ Buttons ON", desc: "Use WhatsApp interactive buttons", cmd: ".setting on btns" },
    { cat: "🔘 MENU MODE", label: "❌ Buttons OFF", desc: "Use plain text number menus", cmd: ".setting off btns" },
    
    { cat: "✨ PRESENCE", label: "⌨️ Auto Typing", desc: "Show typing status", cmd: ".setting presence typing" },
    { cat: "✨ PRESENCE", label: "🎙️ Auto Recording", desc: "Show recording status", cmd: ".setting presence recording" },
    { cat: "✨ PRESENCE", label: "⛔ Presence OFF", desc: "Turn off presence", cmd: ".setting presence off" },
    
    { cat: "🛡️ PROTECTION", label: "🛡️ Anti Spam ON", desc: "Protect from spam messages", cmd: ".setting on antispam" },
    { cat: "🛡️ PROTECTION", label: "🛡️ Anti Spam OFF", desc: "Disable spam protection", cmd: ".setting off antispam" },
    { cat: "🛡️ PROTECTION", label: "🛡️ Anti Delete ON", desc: "Save deleted messages (PM)", cmd: ".setting on antidelete" },
    { cat: "🛡️ PROTECTION", label: "🛡️ Anti Delete OFF", desc: "Disable anti delete", cmd: ".setting off antidelete" },
    { cat: "🛡️ PROTECTION", label: "📞 Reject Calls ON", desc: "Auto-reject incoming calls", cmd: ".setting on rejectcalls" },
    { cat: "🛡️ PROTECTION", label: "📞 Reject Calls OFF", desc: "Allow incoming calls", cmd: ".setting off rejectcalls" },

    { cat: "🤖 AUTO REACT", label: "✅ Auto React Msg ON", desc: "React to incoming messages", cmd: ".setting on autoreactmsg" },
    { cat: "🤖 AUTO REACT", label: "❌ Auto React Msg OFF", desc: "Disable message reactions", cmd: ".setting off autoreactmsg" },
    { cat: "🤖 AUTO REACT", label: "🔒 React: Private Only", desc: "React in private chats only", cmd: ".setting reactmode private" },
    { cat: "🤖 AUTO REACT", label: "👥 React: Group Only", desc: "React in groups only", cmd: ".setting reactmode group" },
    { cat: "🤖 AUTO REACT", label: "🌍 React: All Chats", desc: "React in all chats", cmd: ".setting reactmode all" },

    { cat: "👁️ STATUS & AI", label: "🤖 AI Chat ON", desc: "Turn ON auto chatbot", cmd: ".setting on automsg" },
    { cat: "👁️ STATUS & AI", label: "🤖 AI Chat OFF", desc: "Turn OFF auto chatbot", cmd: ".setting off automsg" },
    { cat: "👁️ STATUS & AI", label: "👁️ Auto Status Seen ON", desc: "View status automatically", cmd: ".setting on autoseen" },
    { cat: "👁️ STATUS & AI", label: "👁️ Auto Status Seen OFF", desc: "Turn off status view", cmd: ".setting off autoseen" },
    { cat: "👁️ STATUS & AI", label: "❤️ Auto Status React ON", desc: "React to status updates", cmd: ".setting on autoreact" },
    { cat: "👁️ STATUS & AI", label: "❤️ Auto Status React OFF", desc: "Turn off status react", cmd: ".setting off autoreact" },
    { cat: "👁️ STATUS & AI", label: "📥 Status Download ON", desc: "Auto-save status to owner", cmd: ".setting on autodownloadstatus" },
    { cat: "👁️ STATUS & AI", label: "📥 Status Download OFF", desc: "Turn off status saving", cmd: ".setting off autodownloadstatus" },
  ];
}

// සැකසුම් වෙනස් කිරීම සඳහා ButtonV2 භාවිතයෙන් හෝ අංක මෙනුවකින් සෘජුවම යැවීම
async function sendSettingsHome(conn, from, mek, reply, sender, sessionId) {
  const cardText = await getStatusCard(sessionId);
  const key = makePendingKey(sender, from);
  const allOpts = getAllSettingsOptions();
  
  pendingSettingsMenu[key] = {
    createdAt: Date.now(),
    sessionId,
    menuMsgId: null,
    options: allOpts,
    processedMsgIds: []
  };

  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");

      // Categorized Sections සැකසීම
      const sectionMap = {};
      allOpts.forEach((opt) => {
        if (!sectionMap[opt.cat]) sectionMap[opt.cat] = [];
        sectionMap[opt.cat].push({
          title: opt.label,
          description: opt.desc,
          id: opt.cmd
        });
      });

      const sections = Object.keys(sectionMap).map((catName) => ({
        title: catName,
        rows: sectionMap[catName]
      }));

      const btn = new ButtonV2(conn)
        .setBody(cardText + "\n\n👇 *Tap the buttons below to change settings:*")
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
        .setThumbnail(SETTINGS_IMAGE);

      // 1. Popup List Menu Button (කෙළින්ම Settings වෙනස් කරන List එක)
      btn.addRawButton({
        buttonId: ".setting menuopen",
        buttonText: { displayText: "⚙️ Change Settings" },
        type: 1,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "Change Settings ↯",
            sections: sections
          }),
        },
      });

      // 2. Full Status Refresh Button
      btn.addButton("📊 Refresh Status", ".setting status");

      const sentMsg = await btn.send(from, { quoted: mek });

      if (sentMsg?.key?.id) {
        pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
        return sentMsg;
      }
    } catch (e) {
      console.log("SETTINGS BUTTONV2 ERROR:", e?.message || e);
    }
  }

  // Fallback: Buttons OFF නම් කෙළින්ම අංක සහිත සියලුම Settings මෙනුව එකවර යැවීම
  let numberedCaption = cardText + "\n\n┌❮ ⚙️ *ᴄʜᴀɴɢᴇ sᴇᴛᴛɪɴɢs ʙʏ ɴᴜᴍʙᴇʀ* ❯─\n│\n";
  allOpts.forEach((opt, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    numberedCaption += `├► *[ ${num} ]* ➔ \`${opt.label}\`\n`;
  });
  numberedCaption += "│\n└❮ 💬 *Swipe & Reply this message with a number to apply* ❯─";

  const sentMsg = await conn.sendMessage(
    from,
    {
      image: { url: SETTINGS_IMAGE },
      caption: numberedCaption
    },
    { quoted: mek }
  );

  if (sentMsg?.key?.id) {
    pendingSettingsMenu[key].menuMsgId = sentMsg.key.id;
  }
  return sentMsg;
}

/* ================= COMMAND: .setting ================= */
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
      if (action === "menu" || action === "menuopen") {
        return await sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      }
      
      if (action === "status") return reply(await getStatusCard(sessionId));
      if (action === "private") { await setSetting(sessionId, "mode", "private"); return reply("✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘʀɪᴠᴀᴛᴇ ]`*"); }
      if (action === "public") { await setSetting(sessionId, "mode", "public"); return reply("✨ *`[ ✅ ʙᴏᴛ ᴍᴏᴅᴇ sᴇᴛ ᴛᴏ ᴘᴜʙʟɪᴄ ]`*"); }
      
      if (action === "on" || action === "off" || action === "toggle" || action === "workscope" || action === "presence" || action === "reactmode") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      }

      return reply(await getStatusCard(sessionId));
    } catch (e) {
      console.log("SETTING COMMAND ERROR:", e);
      return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴄʜᴀɴɢɪɴɢ sᴇᴛᴛɪɴɢs. ]`*");
    }
  }
);

/* ================= REPLY HANDLER ================= */
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
      const incomingMsgId = mek?.key?.id || m?.key?.id;

      // 1. Popup List එකෙන් තෝරාගත් විට ලැබෙන කමාන්ඩ් හැසිරවීම
      const resolved = resolveSettingsActionFromText(text);
      if (resolved) {
        if (incomingMsgId) {
          state.processedMsgIds = state.processedMsgIds || [];
          if (state.processedMsgIds.includes(incomingMsgId)) return;
          state.processedMsgIds.push(incomingMsgId);
        }

        try {
          const result = await applySettingAction(sid, resolved.action, resolved.value);
          state.createdAt = Date.now();
          await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return reply(result);
        } catch (e) {
          console.log("SETTINGS ACTION ERROR:", e);
          return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴘʀᴏᴄᴇssɪɴɢ sᴇᴛᴛɪɴɢ. ]`*");
        }
      }

      // 2. අංකයක් මඟින් Reply කර ඇති විට සෘජුවම සැකසුම වෙනස් කිරීම
      const num = parseInt(text, 10);
      if (!isNaN(num) && state.options && num > 0 && num <= state.options.length) {
        const msgObj = mek?.message || m?.message || {};
        const contextInfo =
          msgObj?.extendedTextMessage?.contextInfo ||
          msgObj?.imageMessage?.contextInfo ||
          msgObj?.buttonsResponseMessage?.contextInfo ||
          {};
        const quotedId = contextInfo?.stanzaId;

        // Quoted message එකක් නොවේ නම් හෝ Menu එකට අදාළ නැති නම් නතර කිරීම
        if (!quotedId) return;
        if (state.menuMsgId && quotedId !== state.menuMsgId) return;

        if (incomingMsgId) {
          state.processedMsgIds = state.processedMsgIds || [];
          if (state.processedMsgIds.includes(incomingMsgId)) return;
          state.processedMsgIds.push(incomingMsgId);
        }

        const opt = state.options[num - 1];
        const res = resolveSettingsActionFromText(opt.cmd);

        if (res) {
          try {
            const result = await applySettingAction(sid, res.action, res.value);
            state.createdAt = Date.now();
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return reply(result);
          } catch (e) {
            console.log("SETTINGS NUMERIC ERROR:", e);
            return reply("❌ *`[ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴀᴘᴘʟʏɪɴɢ sᴇᴛᴛɪɴɢ. ]`*");
          }
        }
      }
    },
  });
}

/* ================= CLEANUP ================= */
setInterval(() => {
  const now = Date.now();
  const timeout = 3 * 60 * 1000;
  for (const key of Object.keys(pendingSettingsMenu)) {
    if (now - pendingSettingsMenu[key].createdAt > timeout) {
      delete pendingSettingsMenu[key];
    }
  }
}, 30000);

module.exports = { sendSettingsHome };
