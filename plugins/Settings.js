const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const config = require("../config");
const {
  readSettings,
  setSetting,
  toggleSetting,
} = require("../lib/botSettings");

const SETTINGS_IMAGE =
  "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_wnnf8jwnnf8jwnnf.jpg?raw=true";

const pendingSettingsMenu = Object.create(null);
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2500;

function keyFor(sender, from) {
  if (from) {
    return from;
  }
  return "";
}

function isRealOwner(sender) {
  let owner = "";
  if (config.BOT_OWNER) {
    owner = String(config.BOT_OWNER).replace(/\D/g, "");
  } else if (config.OWNER_NUMBER) {
    owner = String(config.OWNER_NUMBER).replace(/\D/g, "");
  } else if (config.SUDO) {
    owner = String(config.SUDO).replace(/\D/g, "");
  }

  let user = "";
  if (sender) {
    user = String(sender).split("@")[0].replace(/\D/g, "");
    if (user.startsWith("0")) {
      user = "94" + user.slice(1);
    }
  }

  if (owner) {
    if (user === owner) {
      return true;
    }
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
  return "🌍 All Chats";
}

function btnsModeText(val) {
  if (val) {
    return "🔘 Buttons Mode";
  }
  return "🔢 Number Reply Mode";
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

  return `╭───「 *BOT SETTINGS* 」───◆
│ 👑 *Main Access:* ${modeStr}
│ 🎯 *Work Scope:* ${workScopeText(workScopeStr)}
│ 🕹️️ *Menu UI:* ${btnsModeText(Boolean(s.btns_enabled))}
│ 🎭 *Presence:* ${presenceText(presStr)}
│ 🤖 *AI Chat:* ${onOff(Boolean(s.auto_msg))}
│ 👁️ *Seen Msg (Blue Ticks):* ${onOff(Boolean(s.seen_all_msg))}
│ 💖 *Auto React:* ${onOff(Boolean(s.auto_react_msg))}
│ 🔮 *React Scope:* ${reactModeText(reactModeStr)}
│ 🛡️ *Anti Delete:* ${onOff(Boolean(s.anti_delete))}
│ 🛡️️ *Anti Spam:* ${onOff(Boolean(s.anti_spam))}
│ 🚫 *Reject Calls:* ${onOff(Boolean(s.auto_reject_calls))}
│ 👁️ *Status Seen:* ${onOff(Boolean(s.auto_status_seen))}
│ ❤️ *Status React:* ${onOff(Boolean(s.auto_status_react))}
│ 📥 *Status Save:* ${onOff(Boolean(s.auto_download_status))}
╰───────────────────────◆`.trim();
}

function mapKey(name) {
  let k = "";
  if (name) {
    k = String(name).toLowerCase().trim();
  }

  if (k === "autoseen") return "auto_status_seen";
  else if (k === "auto_seen") return "auto_status_seen";
  else if (k === "statusseen") return "auto_status_seen";
  else if (k === "auto_status_seen") return "auto_status_seen";
  else if (k === "autoreact") return "auto_status_react";
  else if (k === "auto_react") return "auto_status_react";
  else if (k === "statusreact") return "auto_status_react";
  else if (k === "auto_status_react") return "auto_status_react";
  else if (k === "autodownloadstatus") return "auto_download_status";
  else if (k === "auto_download_status") return "auto_download_status";
  else if (k === "statusdownload") return "auto_download_status";
  else if (k === "downloadstatus") return "auto_download_status";
  else if (k === "automsg") return "auto_msg";
  else if (k === "auto_msg") return "auto_msg";
  else if (k === "aichat") return "auto_msg";
  else if (k === "seenallmsg") return "seen_all_msg";
  else if (k === "seen_all_msg") return "seen_all_msg";
  else if (k === "seenall") return "seen_all_msg";
  else if (k === "allmsgseen") return "seen_all_msg";
  else if (k === "antidelete") return "anti_delete";
  else if (k === "anti_delete") return "anti_delete";
  else if (k === "antispam") return "anti_spam";
  else if (k === "anti_spam") return "anti_spam";
  else if (k === "rejectcalls") return "auto_reject_calls";
  else if (k === "auto_reject_calls") return "auto_reject_calls";
  else if (k === "anticall") return "auto_reject_calls";
  else if (k === "mode") return "mode";
  else if (k === "botmode") return "mode";
  else if (k === "autoreactmsg") return "auto_react_msg";
  else if (k === "auto_react_msg") return "auto_react_msg";
  else if (k === "reactmode") return "auto_react_mode";
  else if (k === "auto_react_mode") return "auto_react_mode";
  else if (k === "workscope") return "work_scope";
  else if (k === "work_scope") return "work_scope";
  else if (k === "btns") return "btns_enabled";
  else if (k === "buttons") return "btns_enabled";
  else if (k === "btns_enabled") return "btns_enabled";
  return null;
}

function getQuotedId(m, mek) {
  if (m) {
    if (m.quoted) {
      if (m.quoted.id) {
        return m.quoted.id;
      }
    }
  }
  if (mek) {
    if (mek.message) {
      if (mek.message.extendedTextMessage) {
        if (mek.message.extendedTextMessage.contextInfo) {
          if (mek.message.extendedTextMessage.contextInfo.stanzaId) {
            return mek.message.extendedTextMessage.contextInfo.stanzaId;
          }
        }
      }
    }
  }
  if (m) {
    if (m.message) {
      if (m.message.extendedTextMessage) {
        if (m.message.extendedTextMessage.contextInfo) {
          if (m.message.extendedTextMessage.contextInfo.stanzaId) {
            return m.message.extendedTextMessage.contextInfo.stanzaId;
          }
        }
      }
      if (m.message.imageMessage) {
        if (m.message.imageMessage.contextInfo) {
          if (m.message.imageMessage.contextInfo.stanzaId) {
            return m.message.imageMessage.contextInfo.stanzaId;
          }
        }
      }
      if (m.message.interactiveResponseMessage) {
        if (m.message.interactiveResponseMessage.contextInfo) {
          if (m.message.interactiveResponseMessage.contextInfo.stanzaId) {
            return m.message.interactiveResponseMessage.contextInfo.stanzaId;
          }
        }
      }
    }
  }
  if (mek) {
    if (mek.message) {
      if (mek.message.imageMessage) {
        if (mek.message.imageMessage.contextInfo) {
          if (mek.message.imageMessage.contextInfo.stanzaId) {
            return mek.message.imageMessage.contextInfo.stanzaId;
          }
        }
      }
      if (mek.message.interactiveResponseMessage) {
        if (mek.message.interactiveResponseMessage.contextInfo) {
          if (mek.message.interactiveResponseMessage.contextInfo.stanzaId) {
            return mek.message.interactiveResponseMessage.contextInfo.stanzaId;
          }
        }
      }
    }
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
    return "✅ *Main Bot Mode Private kar diya gaya hai (Owner Only)*";
  }
  if (action === "public") {
    await setSetting(sessionId, "mode", "public");
    return "✅ *Main Bot Mode Public kar diya gaya hai (All Users)*";
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
  } else if (key === "auto_msg") {
    return `✅ *AI Auto Chat:* ${onOff(updated.auto_msg)}`;
  } else if (key === "seen_all_msg") {
    return `✅ *Blue Ticks (Seen All Msg):* ${onOff(updated.seen_all_msg)}`;
  } else if (key === "anti_delete") {
    return `✅ *Anti Delete Guard:* ${onOff(updated.anti_delete)}`;
  } else if (key === "anti_spam") {
    return `✅ *Anti Spam Guard:* ${onOff(updated.anti_spam)}`;
  } else if (key === "auto_reject_calls") {
    return `✅ *Auto Reject Calls:* ${onOff(updated.auto_reject_calls)}`;
  } else if (key === "auto_react_msg") {
    return `✅ *Incoming Msg Auto React:* ${onOff(updated.auto_react_msg)}`;
  } else if (key === "btns_enabled") {
    return `✅ *Menu UI System:* ${btnsModeText(Boolean(updated.btns_enabled))}`;
  }
  return `✅ *Set ${key.toUpperCase()} to ${action.toUpperCase()}*`;
}

function getSections() {
  return [
    {
      title: "👑 Main Bot Access Mode",
      rows: [
        { title: "Public Mode", description: "Sabhi users ke liye commands allow karein", id: ".setting public" },
        { title: "Private Mode", description: "Sirf Owner ke liye commands limit karein", id: ".setting private" },
      ]
    },
    {
      title: "🎯 Work Scope Management",
      rows: [
        { title: "Scope: Private Only", description: "Sirf Private PM / Inbox mein bot chalega", id: ".setting workscope private" },
        { title: "Scope: Group Only", description: "Sirf WhatsApp Groups mein bot chalega", id: ".setting workscope group" },
        { title: "Scope: All Chats", description: "Private PM aur Groups dono jagah chalega", id: ".setting workscope all" },
      ]
    },
    {
      title: "📱 WhatsApp Status Control",
      rows: [
        { title: "Auto Seen Status ON", description: "Sabhi contacts ke status view karein", id: ".setting on autoseen" },
        { title: "Auto Seen Status OFF", description: "Status auto-view band karein", id: ".setting off autoseen" },
        { title: "Auto React Status ON", description: "Statuses par emoji reaction bhejein", id: ".setting on autoreact" },
        { title: "Auto React Status OFF", description: "Status reaction band karein", id: ".setting off autoreact" },
        { title: "Auto Save Status ON", description: "Contacts ka status media download karein", id: ".setting on autodownloadstatus" },
        { title: "Auto Save Status OFF", description: "Status download band karein", id: ".setting off autodownloadstatus" },
      ]
    },
    {
      title: "🤖 Smart Chat Automation",
      rows: [
        { title: "AI Chatbot ON", description: "Automatic AI replies chalu karein", id: ".setting on automsg" },
        { title: "AI Chatbot OFF", description: "AI chatbot band karein", id: ".setting off automsg" },
        { title: "Seen All Msg ON (Blue Ticks)", description: "Sabhi aane wale messages par blue ticks lagayein", id: ".setting on seenallmsg" },
        { title: "Seen All Msg OFF", description: "Blue ticks auto mark karna band karein", id: ".setting off seenallmsg" },
        { title: "Msg Auto React ON", description: "Aane wale texts par emoji auto react karein", id: ".setting on autoreactmsg" },
        { title: "Msg Auto React OFF", description: "Text auto reaction band karein", id: ".setting off autoreactmsg" },
        { title: "React Scope: Private", description: "Sirf Private inbox mein react karein", id: ".setting reactmode private" },
        { title: "React Scope: Group", description: "Sirf Groups mein react karein", id: ".setting reactmode group" },
        { title: "React Scope: All", description: "Sabhi chats mein react karein", id: ".setting reactmode all" },
      ]
    },
    {
      title: "🎭 Bot Presence Automation",
      rows: [
        { title: "Auto Typing ON", description: "Chats mein hamesha Typing status dikhayein", id: ".setting presence typing" },
        { title: "Auto Recording ON", description: "Chats mein Recording status dikhayein", id: ".setting presence recording" },
        { title: "Presence OFF", description: "Presence indicators band karein", id: ".setting presence off" },
      ]
    },
    {
      title: "🔘 Menu UI Configuration",
      rows: [
        { title: "Buttons Mode ON", description: "Interactive popup/button menus chalu karein", id: ".setting on btns" },
        { title: "Buttons Mode OFF", description: "Numbered text menus use karein", id: ".setting off btns" },
      ]
    },
    {
      title: "🛡️ Security & Protections",
      rows: [
        { title: "Anti Spam ON", description: "Spam command bhejne walo ko block karein", id: ".setting on antispam" },
        { title: "Anti Spam OFF", description: "Spam protection band karein", id: ".setting off antispam" },
        { title: "Anti Delete ON", description: "Delete kiye gaye messages save karein", id: ".setting on antidelete" },
        { title: "Anti Delete OFF", description: "Anti-delete protection band karein", id: ".setting off antidelete" },
        { title: "Reject Calls ON", description: "Incoming WhatsApp calls auto decline karein", id: ".setting on rejectcalls" },
        { title: "Reject Calls OFF", description: "Calls aane ki ijaazat dein", id: ".setting off rejectcalls" },
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

  let btnsOn = true;
  try {
    const settings = await readSettings(sessionId);
    if (settings) {
      if (typeof settings.btns_enabled !== "undefined") {
        btnsOn = Boolean(settings.btns_enabled);
      }
    }
  } catch (e) {}

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const sections = getSections();
      const fittedThumb = await getFittedImageBuffer(SETTINGS_IMAGE);

      const btn = new ButtonV2(conn)
        .setBody(`${cardText}\n\n👇 *Select an option below to update settings:*`)
        .setFooter("© 2026 MALIYA-MD MINI BOT")
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

      if (sentMsg) {
        if (sentMsg.key) {
          if (sentMsg.key.id) {
            state.menuMsgId = sentMsg.key.id;
            pendingSettingsMenu[key] = state;
            return sentMsg;
          }
        }
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
      numberedCaption += `│ *[ ${num} ]* ${r.title}\n`;
      overallIdx++;
    });
    numberedCaption += `\n`;
  });

  numberedCaption += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with an option number...*`;

  const sentMsg = await conn.sendMessage(
    from,
    {
      image: { url: SETTINGS_IMAGE },
      caption: numberedCaption
    },
    { quoted: mek }
  );

  if (sentMsg) {
    if (sentMsg.key) {
      if (sentMsg.key.id) {
        state.menuMsgId = sentMsg.key.id;
        pendingSettingsMenu[key] = state;
      }
    }
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
    let hasOwnerPerms = false;
    if (isOwner) {
      hasOwnerPerms = true;
    } else if (isRealOwner(sender)) {
      hasOwnerPerms = true;
    }

    if (!hasOwnerPerms) {
      return reply("❌ *`[ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ᴏᴡɴᴇʀ ᴏɴʟʏ. ]`*");
    }

    let action = "menu";
    if (args) {
      if (args[0]) {
        action = String(args[0]).toLowerCase().trim();
      }
    }

    let value = "";
    if (args) {
      if (args.length > 1) {
        value = String(args.slice(1).join(" ")).toLowerCase().trim();
      }
    }

    try {
      if (action === "menu") {
        return await sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      } else if (action === "menuopen") {
        return await sendSettingsHome(conn, from, mek, reply, sender, sessionId);
      } else if (action === "status") {
        return reply(await getStatusCard(sessionId));
      } else if (action === "private") {
        await setSetting(sessionId, "mode", "private");
        return reply("✅ *Main Bot Mode set to Private*");
      } else if (action === "public") {
        await setSetting(sessionId, "mode", "public");
        return reply("✅ *Main Bot Mode set to Public*");
      } else if (action === "on") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      } else if (action === "off") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      } else if (action === "toggle") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      } else if (action === "workscope") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      } else if (action === "presence") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      } else if (action === "reactmode") {
        const result = await applySettingAction(sessionId, action, value);
        return reply(result);
      }

      return reply(await getStatusCard(sessionId));
    } catch (e) {
      console.log("SETTING COMMAND ERROR:", e);
      return reply("❌ *Error while changing settings.*");
    }
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
    let isNum = false;
    if (!isNaN(num)) {
      if (num > 0) {
        if (num <= state.options.length) {
          isNum = true;
        }
      }
    }

    const quotedId = getQuotedId(m, mek);
    let isQuoted = false;
    if (quotedId) {
      if (quotedId === state.menuMsgId) {
        isQuoted = true;
      }
    }

    if (isQuoted) {
      if (isNum) {
        return true;
      }
    }
    return false;
  },
  function: async (conn, mek, m, { from, body, sender, reply, isOwner, sessionId }) => {
    let hasOwnerPerms = false;
    if (isOwner) {
      hasOwnerPerms = true;
    } else if (isRealOwner(sender)) {
      hasOwnerPerms = true;
    }

    if (!hasOwnerPerms) return;

    const k = keyFor(sender, from);
    const state = pendingSettingsMenu[k];
    if (!state) return;

    let sid = state.sessionId;
    if (sessionId) {
      sid = sessionId;
    }

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
      if (!isNaN(num)) {
        if (num > 0) {
          if (num <= state.options.length) {
            actionCmd = resolveSettingsActionFromText(state.options[num - 1].cmd);
          }
        }
      }
    }

    if (!actionCmd) return;

    const now = Date.now();
    const sig = `${actionCmd.action}_${actionCmd.value}`;
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg) {
      if (lastMsg.text === sig) {
        if (now - lastMsg.time < LOOP_COOLDOWN) {
          return;
        }
      }
    }
    lastProcessedMsg[k] = { text: sig, time: now };

    try {
      const result = await applySettingAction(sid, actionCmd.action, actionCmd.value);
      state.createdAt = Date.now();
      await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
      return reply(result);
    } catch (e) {
      console.log("SETTINGS EXECUTE ERROR:", e);
      return reply("❌ *Error while applying setting.*");
    }
  },
};

// 🔵 Blue Ticks Middleware: Jab `seen_all_msg` ON ho tab incoming message ko mark as read karega
async function handleSeenAllMessages(conn, mek, sessionId) {
  try {
    if (!conn) return;
    if (!mek) return;
    if (!mek.key) return;
    if (mek.key.fromMe) return;

    const s = await readSettings(sessionId);
    if (s) {
      if (s.seen_all_msg) {
        await conn.readMessages([mek.key]);
      }
    }
  } catch (err) {}
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(settingsReplyHandler);
}

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingSettingsMenu)) {
    if (now - pendingSettingsMenu[key].createdAt > 3 * 60 * 1000) {
      delete pendingSettingsMenu[key];
    }
  }
  for (const key of Object.keys(lastProcessedMsg)) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 30000);

module.exports = {
  sendSettingsHome,
  handleSeenAllMessages
};
