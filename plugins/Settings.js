const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const {
  readSettings,
  setSetting,
  toggleSetting,
  getCustomImage // 🔥 Web Image එක ගන්න මේක අනිවාර්යයි
} = require("../lib/botSettings");

const SETTINGS_IMAGE =
  "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_wnnf8jwnnf8jwnnf.jpg?raw=true";

const pendingSettingsMenu = Object.create(null);
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2500;

// 🔥 Menu State එක User සහ Chat එක අනුව වෙන් කිරීම
function keyFor(sender, from) {
  return `${sender \vert{}\vert{} "unknown"}_${from || "unknown"}`;
}

// 🔥 Multi-Device Owner Check
function checkOwner(conn, sender, isOwner) {
  if (isOwner) return true; 
  
  let botNumber = conn?.user?.id?.split(':')[0]?.split('@')[0];
  let senderNumber = sender?.split('@')[0];
  
  if (botNumber && senderNumber && botNumber === senderNumber) {
    return true;
  }
  return false;
}

function onOff(val) {
  if (val) {
    return "🟢 ON";
  }
  return "🔴 OFF";
}

function presenceText(val) {
  if (val === "typing") {
    return "⌨️ Typing";
  } else if (val === "recording") {
    return "🎙️ Recording";
  }
  return "🔴 OFF";
}

function reactModeText(val) {
  if (val === "private") {
    return "🔒 Private Only";
  } else if (val === "group") {
    return "👥 Group Only";
  }
  return "🌍 All Chats";
}

function workScopeText(val) {
  if (val === "private") {
    return "🔒 Private Only";
  } else if (val === "group") {
    return "👥 Group Only";
  }
  return "All Chats";
}

function btnsModeText(val) {
  if (val) {
    return "🔘 Buttons";
  }
  return "🔢 Number Reply";
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return url;
  }
}

async function getStatusCard(sessionId) {
  const s = await readSettings(sessionId);
  let modeStr = "PUBLIC";
  if (s.mode) {
    modeStr = String(s.mode).toUpperCase();
  }

  let workScopeStr = "private";
  if (s.work_scope) {
    workScopeStr = String(s.work_scope);
  }

  let presStr = "off";
  if (s.always_presence) {
    presStr = String(s.always_presence);
  }

  let reactModeStr = "all";
  if (s.auto_react_mode) {
    reactModeStr = String(s.auto_react_mode);
  }

  return `╭「 *BOT SETTINGS* 」─◆
│ 👑 *Main Access:* ${modeStr}
│ 🎯 *Work Scope:* ${workScopeText(workScopeStr)}
│ 🕹 *Menu UI:* ${btnsModeText(Boolean(s.btns_enabled))}
│ 🎭 *Presence:* ${presenceText(presStr)}
│ ❤️ *Lovely Chat:* ${onOff(Boolean(s.lovely_chat))}
│ 👁️ *Seen Msg:* ${onOff(Boolean(s.seen_all_msg))}
│ 💖 *Auto React:* ${onOff(Boolean(s.auto_react_msg))}
│ 🔮 *React Scope:* ${reactModeText(reactModeStr)}
│ 🤫 *Silent Automation:* ${onOff(Boolean(s.silent_automation))}
│ 💬 *Custom Reply:* ${onOff(Boolean(s.custom_auto_reply))}
│ 🛡️ *Anti Delete:* ${onOff(Boolean(s.anti_delete))}
│ 🛡️ *Anti Spam:* ${onOff(Boolean(s.anti_spam))}
│ 🚫 *Reject Calls:* ${onOff(Boolean(s.auto_reject_calls))}
│ 👁 *Status Seen:* ${onOff(Boolean(s.auto_status_seen))}
│ ❤️ *Status React:* ${onOff(Boolean(s.auto_status_react))}
│ 📥 *Status Save:* ${onOff(Boolean(s.auto_download_status))}
╰───────◆──◆──◆──◆`.trim();
}

function mapKey(name) {
  let k = "";
  if (name) {
    k = String(name).toLowerCase().trim();
  }

  if (k === "autoseen" || k === "auto_seen" || k === "statusseen" || k === "auto_status_seen") return "auto_status_seen";
  else if (k === "autoreact" || k === "auto_react" || k === "statusreact" || k === "auto_status_react") return "auto_status_react";
  else if (k === "autodownloadstatus" || k === "auto_download_status" || k === "statusdownload" || k === "downloadstatus") return "auto_download_status";
  else if (k === "lovelychat" || k === "lovely_chat" || k === "lovely" || k === "aichat" || k === "automsg" || k === "auto_msg") return "lovely_chat";
  else if (k === "seenallmsg" || k === "seen_all_msg" || k === "seenall" || k === "allmsgseen") return "seen_all_msg";
  else if (k === "silentautomation" || k === "silent_automation" || k === "silent") return "silent_automation";
  else if (k === "customautoreply" || k === "custom_auto_reply" || k === "customreply") return "custom_auto_reply";
  else if (k === "antidelete" || k === "anti_delete") return "anti_delete";
  else if (k === "antispam" || k === "anti_spam") return "anti_spam";
  else if (k === "rejectcalls" || k === "auto_reject_calls" || k === "anticall") return "auto_reject_calls";
  else if (k === "mode" || k === "botmode") return "mode";
  else if (k === "autoreactmsg" || k === "auto_react_msg") return "auto_react_msg";
  else if (k === "reactmode" || k === "auto_react_mode") return "auto_react_mode";
  else if (k === "workscope" || k === "work_scope") return "work_scope";
  else if (k === "btns" || k === "buttons" || k === "btns_enabled") return "btns_enabled";
  return null;
}

function getQuotedId(m, mek) {
  if (m?.quoted?.id) return m.quoted.id;
  if (mek?.message?.extendedTextMessage?.contextInfo?.stanzaId) {
    return mek.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m?.message?.extendedTextMessage?.contextInfo?.stanzaId) {
    return m.message.extendedTextMessage.contextInfo.stanzaId;
  }
  if (m?.message?.imageMessage?.contextInfo?.stanzaId) {
    return m.message.imageMessage.contextInfo.stanzaId;
  }
  if (m?.message?.interactiveResponseMessage?.contextInfo?.stanzaId) {
    return m.message.interactiveResponseMessage.contextInfo.stanzaId;
  }
  if (mek?.message?.imageMessage?.contextInfo?.stanzaId) {
    return mek.message.imageMessage.contextInfo.stanzaId;
  }
  if (mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId) {
    return mek.message.interactiveResponseMessage.contextInfo.stanzaId;
  }
  return null;
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title, m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
  ];
  direct.forEach(item => {
    if (item) {
      texts.push(String(item).trim());
    }
  });

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  [p1, p2].forEach(raw => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id) texts.push(String(parsed.id).trim());
        if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
        if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
        if (parsed.title) texts.push(String(parsed.title).trim());
        if (parsed.name) texts.push(String(parsed.name).trim());
      } catch (e) {}
    }
  });

  return [...new Set(texts.filter(Boolean))];
}

function resolveSettingsActionFromText(text) {
  let t = "";
  if (text) {
    t = String(text).trim().toLowerCase();
  }
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
    return "✅ *Main Bot Mode has been set to Private (Owner Only)*";
  }
  if (action === "public") {
    await setSetting(sessionId, "mode", "public");
    return "✅ *Main Bot Mode has been set to Public (All Users)*";
  }
  if (action === "reactmode") {
    const validModes = ["private", "group", "all"];
    if (!validModes.includes(value)) {
      return "❌ *Invalid React Scope*";
    }
    await setSetting(sessionId, "auto_react_mode", value);
    return `✅ *Auto React Scope:* ${reactModeText(value)}`;
  }
  if (action === "workscope") {
    const validScopes = ["private", "group", "all"];
    if (!validScopes.includes(value)) {
      return "❌ *Invalid Work Scope*";
    }
    await setSetting(sessionId, "work_scope", value);
    return `✅ *Work Scope:* ${workScopeText(value)}`;
  }
  if (action === "presence") {
    const validPres = ["off", "typing", "recording"];
    if (!validPres.includes(value)) {
      return "❌ *Invalid Presence Mode*";
    }
    await setSetting(sessionId, "always_presence", value);
    return `✅ *Presence Mode:* ${presenceText(value)}`;
  }

  let isToggle = false;
  let isStateChange = false;
  if (action === "toggle") {
    isToggle = true;
  } else if (action === "on") {
    isStateChange = true;
  } else if (action === "off") {
    isStateChange = true;
  }

  if (isToggle) {
    const key = mapKey(value);
    if (!key) return "❌ *Invalid Setting Name*";
    const updated = await toggleSetting(sessionId, key);
    return formatSettingReply(key, updated, action);
  } else if (isStateChange) {
    const key = mapKey(value);
    if (!key) return "❌ *Invalid Setting Name*";
    let boolVal = false;
    if (action === "on") {
      boolVal = true;
    }
    const updated = await setSetting(sessionId, key, boolVal);
    return formatSettingReply(key, updated, action);
  }

  return await getStatusCard(sessionId);
}

function formatSettingReply(key, updated, action) {
  if (key === "auto_status_seen") {
    return `✅ *Status Auto Seen:* ${onOff(updated.auto_status_seen)}`;
  } else if (key === "auto_status_react") {
    return `✅ *Status Auto React:* ${onOff(updated.auto_status_react)}`;
  } else if (key === "auto_download_status") {
    return `✅ *Status Download & Save:* ${onOff(updated.auto_download_status)}`;
  } else if (key === "lovely_chat") {
    return `✅ *Lovely Romantic Chat:* ${onOff(updated.lovely_chat)}`;
  } else if (key === "seen_all_msg") {
    return `✅ *Blue Ticks (Seen All Messages):* ${onOff(updated.seen_all_msg)}`;
  } else if (key === "anti_delete") {
    return `✅ *Anti Delete Guard:* ${onOff(updated.anti_delete)}`;
  } else if (key === "silent_automation") {
    return `✅ *Silent Automation Suite:* ${onOff(updated.silent_automation)}`;
  } else if (key === "custom_auto_reply") {
    return `✅ *Custom Auto Reply:* ${onOff(updated.custom_auto_reply)}`;
  } else if (key === "anti_spam") {
    return `✅ *Anti Spam Guard:* ${onOff(updated.anti_spam)}`;
  } else if (key === "auto_reject_calls") {
    return `✅ *Auto Reject Calls:* ${onOff(updated.auto_reject_calls)}`;
  } else if (key === "auto_react_msg") {
    return `✅ *Incoming Message Auto React:* ${onOff(updated.auto_react_msg)}`;
  } else if (key === "btns_enabled") {
    return `✅ *Menu UI System:* ${btnsModeText(Boolean(updated.btns_enabled))}`;
  }
  return `✅ *Set ${key.toUpperCase()} to${action.toUpperCase()}*`;
}

function getSections() {
  return [
    {
      title: "👑 Main Bot Access Mode",
      rows: [
        { title: "🌐 Public Mode", description: "Allow commands for all users", id: ".setting public" },
        { title: "🔒 Private Mode", description: "Restrict commands to Bot Owner only", id: ".setting private" },
      ]
    },
    {
      title: "🎯 Work Scope Management",
      rows: [
        { title: "👤 Scope: Private Only", description: "Bot operates only in Private PM / DMs", id: ".setting workscope private" },
        { title: "👥 Scope: Group Only", description: "Bot operates only in WhatsApp Groups", id: ".setting workscope group" },
        { title: "🌍 Scope: All Chats", description: "Bot operates in both Groups and Private chats", id: ".setting workscope all" },
      ]
    },
    {
      title: "📱 WhatsApp Status Control",
      rows: [
        { title: "👁️ Auto Seen Status ON", description: "Automatically view all contact statuses", id: ".setting on autoseen" },
        { title: "🙈 Auto Seen Status OFF", description: "Disable automatic status viewing", id: ".setting off autoseen" },
        { title: "💖 Auto React Status ON", description: "Automatically react to status updates with emojis", id: ".setting on autoreact" },
        { title: "💔 Auto React Status OFF", description: "Disable status auto reactions", id: ".setting off autoreact" },
        { title: "📥 Auto Save Status ON", description: "Automatically download and save status media", id: ".setting on autodownloadstatus" },
        { title: "📤 Auto Save Status OFF", description: "Disable automatic status downloading", id: ".setting off autodownloadstatus" },
      ]
    },
    {
      title: "🤖 Smart Chat Automation",
      rows: [
        { title: "❤️ Lovely Chat ON", description: "Enable romantic AI self-chat in owner DM", id: ".setting on lovelychat" },
        { title: "💔 Lovely Chat OFF", description: "Disable romantic AI self-chat", id: ".setting off lovelychat" },
        { title: "🔵 Seen All Msg ON", description: "Mark all incoming messages as read instantly", id: ".setting on seenallmsg" },
        { title: "⚪ Seen All Msg OFF", description: "Disable instant blue tick read marks", id: ".setting off seenallmsg" },
        { title: "😍 Msg Auto React ON", description: "Automatically react to incoming chat messages", id: ".setting on autoreactmsg" },
        { title: "🤐 Msg Auto React OFF", description: "Disable message auto reactions", id: ".setting off autoreactmsg" },
        { title: "💬 Custom Reply ON", description: "Enable custom word replies", id: ".setting on customautoreply" },
        { title: "🔇 Custom Reply OFF", description: "Disable custom word replies", id: ".setting off customautoreply" },
        { title: "💬 React Scope: Private", description: "React only in private direct messages", id: ".setting reactmode private" },
        { title: "📢 React Scope: Group", description: "React only in WhatsApp groups", id: ".setting reactmode group" },
        { title: "✨ React Scope: All", description: "React across both private chats and groups", id: ".setting reactmode all" },
      ]
    },
    {
      title: "🎭 Bot Presence Automation",
      rows: [
        { title: "⌨️ Auto Typing ON", description: "Keep continuous typing status visible in chats", id: ".setting presence typing" },
        { title: "🎙️ Auto Recording ON", description: "Keep recording voice note status visible in chats", id: ".setting presence recording" },
        { title: "🛑 Presence OFF", description: "Turn off artificial presence statuses", id: ".setting presence off" },
      ]
    },
    {
      title: "🔘 Menu UI Configuration",
      rows: [
        { title: "🔘 Buttons Mode ON", description: "Enable interactive popup and button menus", id: ".setting on btns" },
        { title: "🔢 Buttons Mode OFF", description: "Switch to classic numbered text menus", id: ".setting off btns" },
      ]
    },
    {
      title: "🛡️ Security & Protections",
      rows: [
        { title: "⚡ Anti Spam ON", description: "Detect and block users spamming commands", id: ".setting on antispam" },
        { title: "🔓 Anti Spam OFF", description: "Disable command anti-spam protection", id: ".setting off antispam" },
        { title: "♻️ Anti Delete ON", description: "Intercept and forward deleted messages to chat/owner", id: ".setting on antidelete" },
        { title: "🗑️ Anti Delete OFF", description: "Disable anti-delete message protection", id: ".setting off antidelete" },
        { title: "📵 Reject Calls ON", description: "Automatically decline all incoming WhatsApp calls", id: ".setting on rejectcalls" },
        { title: "📞 Reject Calls OFF", description: "Allow incoming WhatsApp voice and video calls", id: ".setting off rejectcalls" },
        { title: "🤫 Silent Auto ON", description: "Silently intercept view-once & covert tasks to owner DM", id: ".setting on silent" },
        { title: "🔇 Silent Auto OFF", description: "Disable background silent automated actions", id: ".setting off silent" },
      ]
    }
  ];
}

function getFlatOptions() {
  const sections = getSections();
  const list = [];
  sections.forEach(sec => {
    sec.rows.forEach(r => {
      list.push({ label: r.title, cmd: r.id, category: sec.title });
    });
  });
  return list;
}

async function sendSettingsHome(conn, from, mek, reply, sender, sessionId) {
  const cardText = await getStatusCard(sessionId);
  const key = keyFor(sender, from);
  const flatOpts = getFlatOptions();
  
  const state = {
    createdAt: Date.now(),
    sessionId: sessionId,
    menuMsgId: null,
    options: flatOpts,
  };

  // 🔥 Web එකෙන් Settings Image එක ගන්නවා
  let finalSettingsImage = SETTINGS_IMAGE; 
  if (sessionId) {
    try {
      const customImg = await getCustomImage(sessionId, "settings_header");
      if (customImg && customImg.data) finalSettingsImage = customImg.data;
    } catch (e) {}
  }

  let btnsOn = true;
  try {
    const settings = await readSettings(sessionId);
    if (settings && typeof settings.btns_enabled !== "undefined") {
      btnsOn = Boolean(settings.btns_enabled);
    }
  } catch (e) {}

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const sections = getSections();
      const fittedThumb = await getFittedImageBuffer(finalSettingsImage);

      const btn = new ButtonV2(conn)
        .setBody(`${cardText}\n\n👇 *Select an option below to update settings:*`)
        .setFooter("© 2026 MALIYA-MD BOT")
        .setThumbnail(fittedThumb);

      btn.addRawButton({
        buttonId: ".setting menuopen",
        buttonText: { displayText: "⚙️ Change Settings" },
        type: 1,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "Settings Menu ↯",
            sections: sections
          }),
        },
      });

      btn.addButton("📊 Refresh Status", ".setting status");

      const sentMsg = await btn.send(from, { quoted: mek });

      if (sentMsg?.key?.id) {
        state.menuMsgId = sentMsg.key.id;
        pendingSettingsMenu[key] = state;
        return sentMsg;
      }
    } catch (e) {
      console.log("SETTINGS BUTTONV2 ERROR:", e);
    }
  }

  let numberedCaption = `${cardText}\n\n`;
  let overallIdx = 1;

  const sections = getSections();
  sections.forEach(sec => {
    numberedCaption += `*${sec.title}*\n`;
    sec.rows.forEach(r => {
      const num = String(overallIdx).padStart(2, '0');
      numberedCaption += `│ *[ ${num} ]*${r.title}\n`;
      overallIdx++;
    });
    numberedCaption += `\n`;
  });

  numberedCaption += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply to this message with an option number...*`;

  const sentMsg = await conn.sendMessage(
    from,
    {
      image: { url: finalSettingsImage },
      caption: numberedCaption
    },
    { quoted: mek }
  );

  if (sentMsg?.key?.id) {
    state.menuMsgId = sentMsg.key.id;
    pendingSettingsMenu[key] = state;
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
    if (!checkOwner(conn, sender, isOwner)) {
      return reply("❌ *`[ THIS COMMAND IS OWNER ONLY. ]`*");
    }

    let action = "menu";
    if (args && args[0]) {
      action = String(args[0]).toLowerCase().trim();
    }

    let value = "";
    if (args && args.length > 1) {
      value = String(args.slice(1).join(" ")).toLowerCase().trim();
    }

    try {
      if (action === "menu" || action === "menuopen") {
        return await sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      } else if (action === "status") {
        return reply(await getStatusCard(sessionId));
      } else if (action === "private") {
        await setSetting(sessionId, "mode", "private");
        return reply("✅ *Main Bot Mode set to Private (Owner Only)*");
      } else if (action === "public") {
        await setSetting(sessionId, "mode", "public");
        return reply("✅ *Main Bot Mode set to Public (All Users)*");
      } else if (["on", "off", "toggle", "workscope", "presence", "reactmode"].includes(action)) {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      }

      return reply(await getStatusCard(sessionId));
    } catch (e) {
      console.log("SETTING COMMAND ERROR:", e);
      return reply("❌ *Error occurred while updating settings.*");
    }
  }
);

/* ================= COMMAND: .silentauto ================= */
cmd(
  {
    pattern: "silentauto",
    alias: ["silent"],
    desc: "Turn on/off Silent Automation (Forward View Once & Edits to Owner)",
    type: "owner",
    react: "🤫",
    filename: __filename,
  },
  async (conn, mek, m, { args, sessionId, reply, isOwner, sender }) => {
    if (!checkOwner(conn, sender, isOwner)) {
      return reply("❌ *`[ THIS COMMAND IS OWNER ONLY. ]`*");
    }

    const sub = (args[0] || "").toLowerCase().trim();
    const id = sessionId || "default";

    if (sub === "on") {
      await setSetting(id, "silent_automation", true);
      return reply("🤫 *Silent Automation: ACTIVATED!* ✅\n\n> දැන් ගෲප් වල හෝ Private Chat වල එන View Once මැසේජ් සහ Edit කරන මැසේජ් කෙලින්ම ඔයාගේ Inbox එකට එනවා.");
    }

    if (sub === "off") {
      await setSetting(id, "silent_automation", false);
      return reply("🔕 *Silent Automation: DEACTIVATED!* ❌\n\n> View Once සහ Edited මැසේජ් Owner ට එවීම නතර කර ඇත.");
    }

    const settings = await readSettings(id);
    const status = settings.silent_automation ? "ON 🤫" : "OFF 🔕";
    return reply(`🤫 *Silent Automation Settings*\n\nStatus: ${status}\n\nUse:\n*.silent on* - සක්‍රීය කරන්න\n*.silent off* - අක්‍රීය කරන්න`);
  }
);

/* ================= EXACT MENU STYLE REPLY HANDLER ================= */
const settingsReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingSettingsMenu[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (resolveSettingsActionFromText(t)) {
        return true;
      }
    }

    const num = parseInt(String(text || "").trim(), 10);
    let isNum = !isNaN(num) && num > 0 && num <= state.options.length;

    const quotedId = getQuotedId(m, mek);
    let isQuoted = quotedId && quotedId === state.menuMsgId;

    return Boolean(isQuoted && isNum);
  },
  function: async (conn, mek, m, { from, body, sender, reply, isOwner, sessionId }) => {
    if (!checkOwner(conn, sender, isOwner)) return;

    const k = keyFor(sender, from);
    const state = pendingSettingsMenu[k];
    if (!state) return;

    let sid = sessionId || state.sessionId;
    const texts = extractTexts(body, mek, m);

    let actionCmd = null;
    for (const t of texts) {
      const res = resolveSettingsActionFromText(t);
      if (res) {
        actionCmd = res;
        break;
      }
    }

    if (!actionCmd) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num) && num > 0 && num <= state.options.length) {
        actionCmd = resolveSettingsActionFromText(state.options[num - 1].cmd);
      }
    }

    if (!actionCmd) return;

    const now = Date.now();
    const sig = `${actionCmd.action}_${
