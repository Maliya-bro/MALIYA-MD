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
const lastProcessedMsg = {};
const LOOP_COOLDOWN = 2500;

function keyFor(sender, from) {
  return `${from || ""}`;
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
  return val ? "🟢 ON" : "🔴 OFF";
}

function presenceText(val) {
  if (val === "typing") return "⌨️ Typing";
  if (val === "recording") return "🎙️ Recording";
  return "🔴 OFF";
}

function reactModeText(val) {
  if (val === "private") return "🔒 Private";
  if (val === "group") return "👥 Group";
  return "🌍 All Chats";
}

function workScopeText(val) {
  if (val === "private") return "🔒 Private Only";
  if (val === "group") return "👥 Group Only";
  return "🌍 All Chats";
}

function btnsModeText(val) {
  return val ? "🔘 Buttons" : "🔢 Number Reply";
}

// 📱 WhatsApp Mobile Screen එකට හරියටම Fit වන Compact Layout එක
async function getStatusCard(sessionId) {
  const s = await readSettings(sessionId);
  return `╭───「 *BOT SETTINGS* 」───◆
│ ⚙️ *Mode:* ${String(s.mode || "public").toUpperCase()}
│ 🎯 *Scope:* ${workScopeText(String(s.work_scope || "private"))}
│ 🕹️ *Menu:* ${btnsModeText(!!s.btns_enabled)}
│ 🎭 *Presence:* ${presenceText(String(s.always_presence || "off"))}
│ 🤖 *AI Chat:* ${onOff(!!s.auto_msg)}
│ 👁️ *Seen Msg:* ${onOff(!!s.seen_all_msg)}
│ 💖 *Auto React:* ${onOff(!!s.auto_react_msg)}
│ 🔮 *React Mode:* ${reactModeText(String(s.auto_react_mode || "all"))}
│ 🛡️ *Anti Delete:* ${onOff(!!s.anti_delete)}
│ 🛡️ *Anti Spam:* ${onOff(!!s.anti_spam)}
│ 🚫 *Anti Call:* ${onOff(!!s.auto_reject_calls)}
│ 👁️ *Status Seen:* ${onOff(!!s.auto_status_seen)}
│ ❤️ *Status React:* ${onOff(!!s.auto_status_react)}
│ 📥 *Status Save:* ${onOff(!!s.auto_download_status)}
╰───────────────────────◆`.trim();
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

function getQuotedId(m, mek) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    m?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
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
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id) texts.push(String(parsed.id).trim());
      if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
      if (parsed.title) texts.push(String(parsed.title).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
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
    return "✅ *Bot Mode set to Private*";
  }
  if (action === "public") {
    await setSetting(sessionId, "mode", "public");
    return "✅ *Bot Mode set to Public*";
  }
  if (action === "reactmode") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ *Invalid React Mode*";
    }
    await setSetting(sessionId, "auto_react_mode", value);
    return `✅ *React Mode:* ${reactModeText(value)}`;
  }
  if (action === "workscope") {
    if (!["private", "group", "all"].includes(value)) {
      return "❌ *Invalid Work Scope*";
    }
    await setSetting(sessionId, "work_scope", value);
    return `✅ *Work Scope:* ${workScopeText(value)}`;
  }
  if (action === "presence") {
    if (!["off", "typing", "recording"].includes(value)) {
      return "❌ *Invalid Presence Mode*";
    }
    await setSetting(sessionId, "always_presence", value);
    return `✅ *Presence:* ${presenceText(value)}`;
  }

  if (action === "on" || action === "off" || action === "toggle") {
    const key = mapKey(value);
    if (!key) return "❌ *Invalid Setting Name*";

    let updated;
    if (action === "toggle") {
      updated = await toggleSetting(sessionId, key);
    } else {
      const boolVal = action === "on";
      updated = await setSetting(sessionId, key, boolVal);
    }

    const responses = {
      auto_status_seen: `✅ *Auto Status Seen:* ${onOff(updated.auto_status_seen)}`,
      auto_status_react: `✅ *Auto Status React:* ${onOff(updated.auto_status_react)}`,
      auto_download_status: `✅ *Status Download:* ${onOff(updated.auto_download_status)}`,
      auto_msg: `✅ *AI Chat:* ${onOff(updated.auto_msg)}`,
      seen_all_msg: `✅ *Seen All Msg:* ${onOff(updated.seen_all_msg)}`,
      anti_delete: `✅ *Anti Delete:* ${onOff(updated.anti_delete)}`,
      anti_spam: `✅ *Anti Spam:* ${onOff(updated.anti_spam)}`,
      auto_reject_calls: `✅ *Reject Calls:* ${onOff(updated.auto_reject_calls)}`,
      auto_react_msg: `✅ *Msg Auto React:* ${onOff(updated.auto_react_msg)}`,
      btns_enabled: `✅ *Menu Mode:* ${btnsModeText(!!updated.btns_enabled)}`,
    };

    return responses[key] || `✅ *Set ${key.toUpperCase()} to ${action.toUpperCase()}*`;
  }

  return await getStatusCard(sessionId);
}

function getSections() {
  return [
    {
      title: "🛠️ Main & Scope",
      rows: [
        { title: "Public Mode", description: "Set bot to public", id: ".setting public" },
        { title: "Private Mode", description: "Set bot to private", id: ".setting private" },
        { title: "Scope: Private Only", description: "Work in PM only", id: ".setting workscope private" },
        { title: "Scope: Group Only", description: "Work in groups only", id: ".setting workscope group" },
        { title: "Scope: All Chats", description: "Work in PM + Groups", id: ".setting workscope all" },
      ]
    },
    {
      title: "🔘 Menu & Presence",
      rows: [
        { title: "Buttons Mode ON", description: "Enable Interactive Buttons", id: ".setting on btns" },
        { title: "Buttons Mode OFF", description: "Enable Plain Text Menus", id: ".setting off btns" },
        { title: "Auto Typing ON", description: "Show typing status", id: ".setting presence typing" },
        { title: "Auto Recording ON", description: "Show recording status", id: ".setting presence recording" },
        { title: "Presence OFF", description: "Disable bot presence", id: ".setting presence off" },
      ]
    },
    {
      title: "🛡️ Protections",
      rows: [
        { title: "Anti Spam ON", description: "Block spam messages", id: ".setting on antispam" },
        { title: "Anti Spam OFF", description: "Disable spam blocker", id: ".setting off antispam" },
        { title: "Anti Delete ON", description: "Save deleted PM messages", id: ".setting on antidelete" },
        { title: "Anti Delete OFF", description: "Disable anti delete", id: ".setting off antidelete" },
        { title: "Reject Calls ON", description: "Auto-reject calls", id: ".setting on rejectcalls" },
        { title: "Reject Calls OFF", description: "Allow calls", id: ".setting off rejectcalls" },
      ]
    },
    {
      title: "🤖 Auto Functions",
      rows: [
        { title: "AI Chat ON", description: "Enable chatbot replies", id: ".setting on automsg" },
        { title: "AI Chat OFF", description: "Disable chatbot replies", id: ".setting off automsg" },
        { title: "Seen All Msg ON", description: "Auto-read all chats", id: ".setting on seenallmsg" },
        { title: "Seen All Msg OFF", description: "Disable auto read", id: ".setting off seenallmsg" },
        { title: "Status View ON", description: "Auto-read statuses", id: ".setting on autoseen" },
        { title: "Status React ON", description: "Auto-react to status", id: ".setting on autoreact" },
        { title: "Status Save ON", description: "Save contacts' status", id: ".setting on autodownloadstatus" },
      ]
    }
  ];
}

function getFlatOptions() {
  const sections = getSections();
  const list = [];
  sections.forEach(sec => {
    sec.rows.forEach(r => {
      list.push({ label: r.title, cmd: r.id });
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
    sessionId,
    menuMsgId: null,
    options: flatOpts,
  };

  const settings = await readSettings(sessionId);
  const btnsOn = !!settings.btns_enabled;

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const sections = getSections();

      const btn = new ButtonV2(conn)
        .setBody(`${cardText}\n\n👇 *Select an option below to update settings:*`)
        .setFooter("© 2026 MALIYA-MD BOT SYSTEM")
        .setThumbnail(SETTINGS_IMAGE);

      btn.addRawButton({
        buttonId: ".setting menuopen",
        buttonText: { displayText: "⚙️ Change Settings" },
        type: 1,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "Settings Categories ↯",
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
      console.log("SETTINGS BUTTONV2 ERROR:", e?.message || e);
    }
  }

  // 📱 WhatsApp Mobile එකේ කැඩෙන්නේ නැති එක පෙළට සැකසූ Numbered Menu
  let numberedCaption = `${cardText}\n\n╭─「 *CHANGE BY NUMBER* 」─◆\n`;
  flatOpts.forEach((opt, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    numberedCaption += `│ *[ ${num} ]* ${opt.label}\n`;
  });
  numberedCaption += `╰───────────────────────◆\n> 💬 *Swipe & Reply this message with a number...*`;

  const sentMsg = await conn.sendMessage(
    from,
    {
      image: { url: SETTINGS_IMAGE },
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
      if (action === "private") { await setSetting(sessionId, "mode", "private"); return reply("✅ *Bot Mode set to Private*"); }
      if (action === "public") { await setSetting(sessionId, "mode", "public"); return reply("✅ *Bot Mode set to Public*"); }
      
      if (action === "on" || action === "off" || action === "toggle" || action === "workscope" || action === "presence" || action === "reactmode") {
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

/* ================= EXACT MENU.JS STYLE REPLY HANDLER ================= */
const settingsReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingSettingsMenu[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (resolveSettingsActionFromText(t)) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0 && num <= state.options.length;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.menuMsgId;

    return isQuoted || isNum;
  },
  function: async (conn, mek, m, { from, body, sender, reply, isOwner, sessionId }) => {
    if (!(isOwner || isRealOwner(sender))) return;

    const k = keyFor(sender, from);
    const state = pendingSettingsMenu[k];
    if (!state) return;

    const sid = sessionId || state.sessionId;
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
    const sig = `${actionCmd.action}_${actionCmd.value}`;
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === sig && (now - lastMsg.time) < LOOP_COOLDOWN) return;
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

module.exports = { sendSettingsHome };
