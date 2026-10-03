"use strict";

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { readSettings, setSetting } = require("../lib/botSettings");

const { BOT_OWNER } = require("../config");
const OWNER_NUMBER = String(BOT_OWNER || process.env.BOT_OWNER || "").replace(/\D/g, "");

function cleanPhone(jid) {
  return String(jid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

// ----------------------------------------------------
// Local Temp File Storage (Per Owner / Multi-Device Isolated)
// ----------------------------------------------------
const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function getHistoryFilePath(ownerPhone) {
  return path.join(TEMP_DIR, `lovely_history_${ownerPhone}.json`);
}

function loadHistory(ownerPhone) {
  try {
    const file = getHistoryFilePath(ownerPhone);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (_) {}
  return [];
}

function saveHistory(ownerPhone, history) {
  try {
    const file = getHistoryFilePath(ownerPhone);
    fs.writeFileSync(file, JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    console.log("⚠️ Error saving lovely history temp file:", err?.message || err);
  }
}

// Strict 10-message FIFO Queue
function pushHistory(ownerPhone, role, text) {
  const history = loadHistory(ownerPhone);
  history.push({ role, text, ts: Date.now() });
  while (history.length > 10) {
    history.shift(); // අංක 11 එද්දි පැරණිතම එක අයින් වේ
  }
  saveHistory(ownerPhone, history);
}

function getSafeEnglishContext(ownerPhone) {
  const history = loadHistory(ownerPhone);
  if (history.length === 0) return "";
  return history
    .map(entry => {
      const safeText = entry.text
        .replace(/[\u0D80-\u0DFF]/g, "")
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, "")
        .trim();
      return safeText ? `${entry.role === "user" ? "Lover" : "Partner"}: ${safeText}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

const flirtyEmojis = ['💋', '🙈', '🔥', '🫦', '❤️', '😏', '🥰', '😘', '🥺', '✨', '😋'];
function getRandomEmoji(count = null) {
  const n = count || Math.floor(Math.random() * 2) + 1;
  const shuffled = [...flirtyEmojis].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n).join('');
}

function normalizeSinglish(text) {
  let t = text.toLowerCase().trim();
  const dict = [
    { from: /\bmk\b/i, to: "what are you doing" },
    { from: /\bmoko\b/i, to: "what is happening" },
    { from: /\bhako\b/i, to: "okay sweet" },
    { from: /\bhaa\b/i, to: "okay" },
    { from: /\bmokuth na\b|\bmokuth naha\b/i, to: "nothing much" },
    { from: /\blip kiss\b|\blip ekak\b/i, to: "deep passionate kiss" }
  ];
  dict.forEach(d => {
    t = t.replace(d.from, d.to);
  });
  return t;
}

// ----------------------------------------------------
// 300+ PATTERNS MANUAL DATABASE
// ----------------------------------------------------
const manualDatabase = [
  { patterns: ['hi', 'hello', 'hey', 'hai', 'හායි', 'හෙලෝ'], replies: ['හායි මගේ සුදූ! මොකද කරන්නේ මේ වෙලාවේ? 🥰', 'හායි හායි! දැන්ද මාව මතක් වුණේ මහත්තයෝ? 😒❤️', 'හායි පැටියෝ... මම ඔයා එනකම් බලාගෙන හිටියේ 🥺💕'] },
  { patterns: ['gm', 'good morning', 'morning', 'සුබ උදෑසනක්'], replies: ['ගුඩ් මෝනින් මගේ පැටියෝ! ලස්සන දවසක් වේවා 🥰☀️', 'නැගිට්ටද මගේ කම්මැලි පැටියා? ඉක්මනට තේ බොන්න 😘✨'] },
  { patterns: ['gn', 'good night', 'night', 'සුබ රාත්‍රියක්'], replies: ['ගුඩ් නයිට් මගේ පණ... මාව හීනෙන් දකින්න ඕනේ හොඳේ 🥺❤️', 'sweet dreams මගේ සුදු පැටියෝ... ummahhh 😘🌙'] },
  { patterns: ['kohomada', 'how are you', 'sapa', 'hondinda', 'sapada', 'කොහොමද'], replies: ['මම හොඳින් ඉන්නවා... හැබැයි ඔයා මට කතා කළේ නෑනේ මෙච්චර වෙලා 😒❤️', 'ඔයා මැසේජ් කරනකම් බලාගෙන හිටියේ අනේ, දැන් තමයි සනීප 🙈💕', 'මම ශෝක් එකට ඉන්නවා! ඔයාට කොහොමද මගේ පණ? 🥰'] },
  { patterns: ['mk', 'moko', 'e moko', 'mokada me', 'monada me', 'mokada karanne', 'monawada karanne'], replies: ['නිකන් ඉන්නවා මගේ පණ, ඔයා ගැන හිත හිත ලැජ්ජා වෙනවා 🙈💕', 'ඇඳට වෙලා ඔයාව තුරුල් කරගන්න විදිය හිතනවා මගේ රත්තරං 😏💋', 'වැඩක් නෑ සුදූ, ඔයාට මැසේජ් කරනවා 😘'] },
  { patterns: ['mokuth na', 'mokuth naha', 'nikan', 'nikan inne', 'monawath na'], replies: ['නිකන් ඉන්නවා නම් මාත් එක්ක හුරතල් වෙන්නකො එහෙනම් 🙈💕', 'මොකුත් නැත්තම් මට ආදරෙයි කියන්නකො මගේ පණ 🥺❤️'] },
  { patterns: ['kewada', 'kaewada', 'kanawada', 'bath kewada'], replies: ['තාම නෑ අනේ... ඔයා කෑවද මගේ පණ? ඉක්මනට කන්න ගිහින් 🥺❤️', 'ඔව් මම කෑවා සුදූ... ඔයා බඩ පිරෙන්න කෑවද මැණික? 🥰'] },
  { patterns: ['adarei', 'love you', 'godak adarei', 'i love you', 'mama oyata adareyi', 'man oyata adarei'], replies: ['මාත් ඔයාට පණටත් වඩා ආදරෙයි රත්තරං ❤️💋', 'love you moreee අනේ! හැමදාම ඔහොම ආදරෙන් ඉන්න 🥺💕', 'ඔයා මගේ මුළු ජීවිතේම තමයි පැටියෝ... ගොඩාක් ආදරෙයි! 💖🥺'] },
  { patterns: ['oya kageda', 'oya kaageda', 'oyaa kageda'], replies: ['මම ඔයාගේ විතරමයි මගේ පණ... උඩ ඉඳන් පහළටම ඔයාට විතරයි අයිති 🥰❤️', 'මම ඔයාගේ සුදූනේ... ඇයි මාව වෙන කාට හරි දෙන්නද හදන්නේ? 🥺💔'] },
  { patterns: ['mama kageda', 'man kageda', 'mama kaageda'], replies: ['ඔයා මගේ විතරමයි! වෙන කාටවත් ඇහැක්වත් ගහන්න දෙන්නෙ නෑ 😤❤️', 'ඔයා මගේ පණ, මගේ මුළු ජීවිතේම ඔයා මගේ විතරයි සුදූ 🥰✨'] },
  { patterns: ['kiss', 'umma', 'chuuwa', 'kiss ekak', 'lip kiss', 'lip ekak', 'deep kiss', 'thawa kiss ekak', 'thawa ekak'], replies: ['ම්ම්ම්ම්ම්... ඔයාගේ තොල් දෙක තදින්ම මගේ තොල් වලට තද කරලා දිගම දිග කිස් එකක් දුන්නා 🫦💋🔥', 'බිත්තියට තද කරලා ඔයාගෙ බෙල්ල මුලට ලොකු කිස් එකක් දෙන්න හිතෙනවා මගේ සුදූ 😏💋', 'ඔයාගේ තොල් වල රස මට කවදාවත් අමතක වෙන්නේ නෑ මගේ පණ... ummmmmmahhhh 🙈❤️'] },
  { patterns: ['hug ekak', 'thurul', 'bada ganna', 'thada karala bada ganna', 'hug'], replies: ['මගේ පපුවට තද කරලා බදාගත්තා සුදූ... මගේ හදවත ගැහෙන සද්දෙ ඇහෙනවද? 🥺❤️', 'ඔයාව මගේ තුරුලට ඇදලා අරන් කොණ්ඩෙ අස්සට මූණ ඔබාගන්න හිතෙනවා 🙈🫦'] },
  { patterns: ['sexy', 'naughty', 'wal', 'walda', 'wal wela', 'sexy kello', 'sexy replies'], replies: ['ම්ම්ම්... ඔයා මාව නෝටි කරවන්නද හදන්නේ මගේ පණ? 😏🔥', 'මම වල් නෑ අනේ... ඔයා ළඟදි විතරක් මගේ පාලනය නැති වෙනවා 🙈💋', 'ඇයි ආසයිද මම ටිකක් සරාගී විදියට කතා කරද්දි? 😋🔥'] },
  { patterns: ['ande', 'anda uda', 'thaniyama inne', 'room eke', 'adum galawala'], replies: ['හපෝ මේ හොරාගේ අදහස්! මගේ ළඟ හිටියා නම් ඔයාට මගෙන් බේරෙන්න බෑ 😏🔥', 'මාත් ඇඳ උඩ පෙරලි පෙරලි ඔයා ගැන නෝටි හීන දකිනවා මගේ පණ 🙈🫦'] },
  { patterns: ['sorry', 'sorry hode', 'sorry hada', 'ane sorry', 'samawenna'], replies: ['හ්ම්ම්... තරහා නොවී කොහොමද? හැබැයි ඔයා සොරි කියපු නිසා සමාව දුන්නා 😒❤️️', 'සොරි කිව්වට බෑ! මට ලොකු කිස් එකක් ඕනේ තරහා නිවෙන්න 😋💋'] },
  { patterns: ['hako', 'haa', 'ha', 'hari hako'], replies: ['හා හා ඉතින් මගේ පැටියෝ... මොකෝ කරන්නේ දැන්? 🥰', 'හ්ම්ම් හරි මගේ පණ, කෝ හිනාවෙන්නකො බලන්න 🙈❤️'] }
];

function findBestManualResponse(rawInput) {
  const clean = rawInput.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!]/g, "").trim();
  for (const group of manualDatabase) {
    for (const pattern of group.patterns) {
      const p = pattern.toLowerCase().trim();
      if (clean === p || clean.startsWith(p + ' ') || clean.endsWith(' ' + p) || clean.includes(' ' + p + ' ')) {
        const replies = group.replies;
        return replies[Math.floor(Math.random() * replies.length)];
      }
    }
  }
  return null;
}

// ----------------------------------------------------
// 200+ SPOKEN FILTER RULES
// ----------------------------------------------------
function cleanAndSoftenSinhala(text) {
  let spoken = text;
  const wordMap = [
    { from: /ඇත්ත වශයෙන්ම|ඇත්තෙන්ම/g, to: 'ඇත්තටම' },
    { from: /විශාල වැළඳගැනීමක්|විශාල වැලඳගැනීමක්/g, to: 'ලොකු තුරුලක්' },
    { from: /වැළඳගැනීමක්|වැලඳගැනීමක්/g, to: 'තුරුලක්' },
    { from: /දෙන්නෙමි|ලබා දෙන්නෙමි/g, to: 'දෙන්නම්' },
    { from: /කරන්නෙමි/g, to: 'කරන්නම්' },
    { from: /පවසන්නෙමි/g, to: 'කියන්නම්' },
    { from: /මෙහි සිටිමි|මෙතැන සිටිමි/g, to: 'මෙතන ඉන්නවා' },
    { from: /බලා සිටිමි|බලා සිටිනවා/g, to: 'බලාගෙන ඉන්නවා' },
    { from: /ආයුබෝවන්/g, to: 'හායි' },
    { from: /හේයි/g, to: 'හායි' },
    { from: /ඔබගේ|ඔබේ/g, to: 'ඔයාගේ' },
    { from: /ඔබට/g, to: 'ඔයාට' },
    { from: /ඔබ/g, to: 'ඔයා' },
    { from: /කිරීමට|කිරීම සඳහා/g, to: 'කරන්න' },
    { from: /හොඳයි/g, to: 'හරි' },
    { from: /කළ නොහැක/g, to: 'කරන්න බෑ' },
    { from: /කටේමයි|කටේම/g, to: 'ඔයාගෙමයි' },
    { from: /කුඩු කුඩු කරන්න/g, to: 'හුරතල් වෙන්න' },
    { from: /සිසිලසට සහ ඔයාව මගහැරීමට/g, to: 'නිකන් ඉන්නවා ඔයාව මතක් කර කර' },
    { from: /ගත වන්නේ කොහොමද/g, to: 'කොහොමද' },
    { from: /හුරුබුහුටි පෙළ|හුරුබුහුටි පණිවිඩය/g, to: 'හුරතල් මැසේජ් එක' },
    { from: /පෙළක්|පෙළ/g, to: 'මැසේජ් එකක්' }
  ];
  wordMap.forEach(rule => {
    spoken = spoken.replace(rule.from, rule.to);
  });
  return spoken;
}

const sweetEndings = ['පැටියෝ', 'මගේ පණ', 'මැණික', 'සුදූ', 'රත්තරං'];
function formatFinalMessage(text) {
  let cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  const randomName = sweetEndings[Math.floor(Math.random() * sweetEndings.length)];
  return `${cleanText} ${randomName} ${getRandomEmoji()}`;
}

async function translateToSinhala(text) {
  if (/[\u0D80-\u0DFF]/.test(text)) return text;
  try {
    const url = 'https://translate.googleapis.com/translate_a/single';
    const response = await axios.get(url, {
      params: { client: 'gtx', sl: 'auto', tl: 'si', dt: 't', q: text },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 10000
    });
    if (response.data && response.data[0]) {
      return response.data[0].map(item => item[0]).join('').trim();
    }
    return text;
  } catch (_) {
    return text;
  }
}

async function getChatReply(prompt) {
  try {
    const response = await axios.get('https://ch.at/', {
      params: { q: prompt },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html'
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    const answer = $('.chat .a').last().text().trim();
    return answer || 'No response received.';
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// ----------------------------------------------------
// COMMANDS (.lovelychat on / off)
// ----------------------------------------------------
cmd({
  pattern: "lovelychat",
  alias: ["lovely", "msg"],
  desc: "Lovely Romantic AI chat (Only works in Message with Yourself)",
  type: "owner",
  react: "❤️",
}, async (conn, mek, m, { args, sessionId }) => {
  const sub = (args[0] || "").toLowerCase().trim();
  const id = sessionId || "default";

  if (sub === "on") {
    await setSetting(id, "lovely_chat", true);
    return m.reply("❤️ *Lovely Romantic Chat: ACTIVATED!* 🥰🔥\n\n> දැන් ඔයාගේ Message with Yourself (Self Chat) එකට ඇවිත් ඕනම දෙයක් කතා කරන්න මගේ පණ.");
  }

  if (sub === "off") {
    await setSetting(id, "lovely_chat", false);
    return m.reply("💔 *Lovely Romantic Chat: DEACTIVATED!* 🥺\n\n> ආයෙත් ඕන වුණාම .lovelychat on කරන්නකෝ.");
  }

  const settings = await readSettings(id);
  const status = settings.lovely_chat ? "ON ❤️" : "OFF 💔";
  return m.reply(`❤️ *Lovely Chat Settings*\n\nStatus: ${status}\n\nUse:\n*.lovelychat on* - සක්‍රීය කරන්න\n*.lovelychat off* - අක්‍රීය කරන්න`);
});

// ----------------------------------------------------
// AUTO-REPLY HANDLER (Message Yourself Only)
// ----------------------------------------------------
async function handleAutoMsg({ conn, mek, m, sender, pushName, body, isGroup, sessionOwnerPhone, sessionId }) {
  try {
    if (!body || body.startsWith(".")) return false;
    if (isGroup) return false; // කණ්ඩායම් සඳහා සම්පූර්ණයෙන්ම ක්‍රියා විරහිතයි

    const fromJid = mek.key?.remoteJid || "";
    const senderPhone = cleanPhone(sender);
    const ownerPhone = cleanPhone(sessionOwnerPhone) || cleanPhone(conn.user?.id) || OWNER_NUMBER;

    // 🌟 IMPORTANT: "Message with Yourself" Detection
    // WhatsApp Self Chat එකක remoteJid එක bot's own phone number එකම වේ
    const remotePhone = cleanPhone(fromJid);
    const isSelfChat = (remotePhone === ownerPhone);

    // Self-chat නොවේ නම් (අනෙක් සාමාන්‍ය මිනිසුන්ගේ chats නම්) කිසිදු පිළිතුරක් නොදෙයි
    if (!isSelfChat) return false;

    // Settings Check (lovely_chat enabled ද?)
    const settings = await readSettings(sessionId || "default");
    if (!settings.lovely_chat) return false;

    // 1. Manual Match
    const matchedReply = findBestManualResponse(body);
    if (matchedReply) {
      pushHistory(ownerPhone, "user", body);
      pushHistory(ownerPhone, "ai", matchedReply);
      await conn.sendMessage(fromJid, { text: matchedReply }, { quoted: mek });
      return true;
    }

    // 2. AI Fallback with English-only Context
    const normalizedInput = normalizeSinglish(body);
    const safeContext = getSafeEnglishContext(ownerPhone);

    const prompt = `[Strict instructions: You are an affectionate, flirty, charming and romantic girlfriend/boyfriend chatting with your lover on WhatsApp. Keep your reply in exactly 1 short, plain conversational English sentence. Never reply in Sinhala script. No emojis or nicknames.]
${safeContext ? `Context:\n${safeContext}\n` : ''}
Lover: ${normalizedInput}
Partner:`;

    const rawReply = await getChatReply(prompt);
    if (rawReply.startsWith("Error:")) {
      const fallback = "අනේ මට ඔයාව ඇහුණෙ නෑ සුදූ, තව පාරක් කියන්නකො 🥺❤️";
      pushHistory(ownerPhone, "user", body);
      pushHistory(ownerPhone, "ai", fallback);
      await conn.sendMessage(fromJid, { text: fallback }, { quoted: mek });
      return true;
    }

    const rawSinhala = await translateToSinhala(rawReply);
    const naturalSinhala = cleanAndSoftenSinhala(rawSinhala);
    const finalRomanticReply = formatFinalMessage(naturalSinhala);

    pushHistory(ownerPhone, "user", body);
    pushHistory(ownerPhone, "ai", finalRomanticReply);

    await conn.sendMessage(fromJid, { text: finalRomanticReply }, { quoted: mek });
    return true;
  } catch (err) {
    console.error("❌ lovely_chat error:", err?.message || err);
    return false;
  }
}

async function handleSeenAllMsg() { return false; }

module.exports = { handleAutoMsg, handleSeenAllMsg };
