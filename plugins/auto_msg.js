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
    history.shift();
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
  // 1-10: Greetings, Online & Presence
  { patterns: ['hi', 'hello', 'hey', 'hai', 'හායි', 'හෙලෝ'], replies: ['හායි මගේ සුදූ! මොකද කරන්නේ මේ වෙලාවේ? 🥰', 'හායි හායි! දැන්ද මාව මතක් වුණේ මහත්තයෝ? 😒❤️', 'හායි පැටියෝ... මම ඔයා එනකම් බලාගෙන හිටියේ 🥺💕'] },
  { patterns: ['gm', 'good morning', 'morning', 'සුබ උදෑසනක්'], replies: ['ගුඩ් මෝනින් මගේ පැටියෝ! ලස්සන දවසක් වේවා 🥰☀️', 'නැගිට්ටද මගේ කම්මැලි පැටියා? ඉක්මනට තේ බොන්න 😘✨', 'සුබ උදෑසනක් රත්තරං! අදත් මාව හිතේ තියාගෙන ඉන්න 🌸❤️'] },
  { patterns: ['gn', 'good night', 'night', 'සුබ රාත්‍රියක්'], replies: ['ගුඩ් නයිට් මගේ පණ... මාව හීනෙන් දකින්න ඕනේ හොඳේ 🥺❤️', 'sweet dreams මගේ සුදු පැටියෝ... ummahhh 😘🌙', 'පොරෝනය හොඳට පෙරවගෙන නිදාගන්න මගේ රත්තරං 💤💖'] },
  { patterns: ['online da', 'online innawada', 'dan awada', 'awe nadda'], replies: ['ඔව් ඔව් ඔයා වෙනුවෙන්ම ඔන්ලයින් ඉන්නවා සුදූ 😋❤️', 'ඔයා ආපු නිසා මම ඔන්ලයින් ආවා මගේ පණ 🥰✨', 'ඔන්න මාත් ආවා... මාව හොය හොයා හිටියා නේද? 🙈💕'] },
  { patterns: ['koheda inne', 'koida inne', 'koheda oya'], replies: ['ඔයාගේ හිත ඇතුළෙ තමයි මම ඉන්නේ හැමදාම 🙈💕', 'ගෙදර ඉන්නවා අනේ පාලුවෙන්... ඔයා කෝ? 🥺', 'මගේ හිත තියෙන තැන ඔයා දන්නවනේ සුදූ 🥰✨'] },
  { patterns: ['dande awe', 'dan dakke', 'danne dakke'], replies: ['දැන්ද දැක්කේ? මම මෙච්චර වෙලා බලාගෙන හිටියා 😒❤️', 'අනේ මන්ද ඔයත්, මාව අමතක වෙලාම යනවා නේද 🥺', 'දැන් හරි කමක් නෑ ආවනේ මගේ රත්තරං 🥰'] },
  { patterns: ['innawada', 'inawada'], replies: ['ඉන්නවා ඉන්නවා! කොහෙ යන්නද ඔයාව දාලා 🥺❤️', 'මෙතනම ඉන්නවා මගේ මැණික, කියන්නකෝ 🥰'] },
  { patterns: ['bye', 'tata', 'mama yanawa', 'yanawa mama'], replies: ['යන්න එපා අනේ... තව ටිකක් ඉන්නකො 🥺💔', 'පරිස්සමින් ගිහින් එන්න මගේ පණ, ඉක්මනට එන්න ඕනේ ❤️😘'] },
  { patterns: ['ge', 'good evening'], replies: ['ගුඩ් ඊව්නින්ග් මගේ සුදූ! තේ එකක් බිව්වද? ☕🥰', 'හවස ලස්සනයි ඔයා මාත් එක්ක ඉන්න නිසා 🙈✨'] },
  { patterns: ['ga', 'good afternoon'], replies: ['ගුඩ් ආෆ්ටර්නූන් මගේ පණ! දවල්ට කෑවද? 🍛😋', 'දවල් වෙලාවේ නිදිමතයිද සුදූ? ටිකක් රෙස්ට් ගන්න 🥺❤️'] },

  // 11-20: Status, Health & Mood
  { patterns: ['kohomada', 'how are you', 'sapa', 'hondinda', 'sapada', 'කොහොමද'], replies: ['මම හොඳින් ඉන්නවා... හැබැයි ඔයා මට කතා කළේ නෑනේ මෙච්චර වෙලා 😒❤️', 'ඔයා මැසේජ් කරනකම් බලාගෙන හිටියේ අනේ, දැන් තමයි සනීප 🙈💕', 'මම ශෝක් එකට ඉන්නවා! ඔයාට කොහොමද මගේ පණ? 🥰'] },
  { patterns: ['saneepada', 'amaruwada', 'leda wela'], replies: ['මට අමාරුවක් නෑ සුදූ, ඔයා ළඟ ඉන්නවා නම් මම හැමදාම සනීපෙන් 🥰', 'ඔයාට සනීප නෑ වගේද මගේ පණ? පරිස්සම් වෙන්නකො 🥺❤️'] },
  { patterns: ['mokada wenne', 'moko wenne'], replies: ['විශේෂයක් නෑ සුදූ, ඔයාව මතක් කර කර හිටියේ 🥰', 'ලොකු දෙයක් නෑ, ඔයාගේ හුරතල් මැසේජ් බලනවා 🙈✨'] },
  { patterns: ['busy da', 'biseeda', 'wada godada'], replies: ['ඔයාට මම කවදාවත් බිසී නෑ මගේ රත්තරං 🥰✨', 'පොඩි වැඩක් තිබ්බා, ඒත් ඔයා ආව නිසා ඔක්කොම පැත්තක දැම්මා 🙈❤️'] },
  { patterns: ['paaluida', 'paluida', 'paluyi'], replies: ['ඔව් අනේ... ඔයා නැතුව මට මුළු ලෝකෙම පාලුයි 🥺💔', 'ගොඩාක් පාලුයි, ඉක්මනට මගේ ළඟට එන්නකෝ 🥺❤️'] },
  { patterns: ['nidimatheda', 'nidi mathada', 'nidi mathai'], replies: ['ටිකක් නිදිමතයි, ඒත් ඔයා එක්ක චැට් කරන්න ඕනෙ 🙈💕', 'නෑ නෑ ඔයා කතා කරනකම් මට නින්ද යන්නෙ නෑ රත්තරං 🥰'] },
  { patterns: ['mahansida', 'thired'], replies: ['ඔව් ටිකක් මහන්සියි, ඔයාගෙ තුරුලට වෙලා ඉන්න තිබ්බ නම් සනීපයි 🥺❤️', 'මහන්සියි තමයි, ඒත් ඔයා එක්ක කතා කරද්දි ඒ ඔක්කොම යනවා 🥰'] },
  { patterns: ['dawasak kohomada', 'today how'], replies: ['හොඳින් ගෙවුණා මගේ පණ, ඔයාගෙ දවස කොහොමද? 🥰', 'ඔයා නැතුව කම්මැලි දවසක් වුණා සුදූ 🥺💔'] },
  { patterns: ['oluwa kakkumai', 'oluwa ridenawa'], replies: ['අනේ මගේ පණට අමාරුද? බෙහෙත් බීලා නිදාගන්නකෝ 🥺💊', 'මම ළඟ හිටියා නම් ඔලුව අතගාලා සනීප කරනවා සුදූ 🥺❤️'] },
  { patterns: ['bada ridenawa', 'badaginida'], replies: ['උණු වතුර ටිකක් බොන්න මගේ මැණික, පරිස්සමින් ඉන්න 🥺❤️', 'බඩගිනි නම් ඉක්මනට මොනවා හරි කන්න මගේ රත්තරං 🍛😤'] },

  // 21-30: Activity & Work
  { patterns: ['mk', 'moko', 'e moko', 'mokada me', 'monada me', 'mokada karanne', 'monawada karanne'], replies: ['නිකන් ඉන්නවා මගේ පණ, ඔයා ගැන හිත හිත ලැජ්ජා වෙනවා 🙈💕', 'ඇඳට වෙලා ඔයාව තුරුල් කරගන්න විදිය හිතනවා මගේ රත්තරං 😏💋', 'වැඩක් නෑ සුදූ, ඇඳට වෙලා ඔයාට මැසේජ් කරනවා 😘'] },
  { patterns: ['mokuth na', 'mokuth naha', 'nikan', 'nikan inne', 'monawath na'], replies: ['නිකන් ඉන්නවා නම් මාත් එක්ක හුරතල් වෙන්නකො එහෙනම් 🙈💕', 'මොකුත් නැත්තම් මට ආදරෙයි කියන්නකො මගේ පණ 🥺❤️', 'මම නම් ඔයා ගැන හිත හිත ඔයාට මැසේජ් කරනවා සුදූ 🥰✨'] },
  { patterns: ['wadaka hitiye', 'wada hitiye', 'wada thibba', 'podi wadaka', 'bisi wela hitiye', 'wada ane'], replies: ['හ්ම්ම්... වැඩ තිබ්බත් මට එක මැසේජ් එකක් දාන්න තිබ්බනේ සුදූ 🥺❤️', 'කමක් නෑ මගේ පණ, ඔයා මහන්සි වුණා නේද? දැන් ඉතින් මාත් එක්ක ඉන්නකෝ 🥰✨', 'වැඩ වැඩ කියලා මාව අමතක කරන්න එපා හරිද? 😒💕'] },
  { patterns: ['padam karanawa', 'padam karanna'], replies: ['හොඳට පාඩම් කරන්න මගේ දක්ෂ පැටියෝ 📚🥰', 'පාඩම් කරලා ඉවර වෙලා ඉක්මනට මට කතා කරන්න හොඳේ 😘'] },
  { patterns: ['game gahanawa', 'free fire', 'cod'], replies: ['ගේම් ගහලා ඉවර වෙලා මාව මතක් කරගන්නකො මහත්තයෝ 😒🎮', 'ගේම් ගහද්දිත් මගේ මැසේජ් වලට රිප්ලයි කරන්න ඕනේ හොඳේ 😤❤️'] },
  { patterns: ['film ekak balanawa', 'movie balanawa'], replies: ['මාත් එක්ක තුරුල් වෙලා බලන්න තිබ්බා නම් කොච්චර ශෝක්ද 🥺🍿', 'මොකක්ද බලන ෆිල්ම් එක? මටත් කියන්නකො 🥰'] },
  { patterns: ['sindu ahanawa', 'songs'], replies: ['ආදර සින්දුවක් අහන ගමන් මාව මතක් වෙනවා නේද හොරා? 🙈🎶', 'මටත් ලස්සන සින්දුවක් කියන්නකො මගේ පණ 🥺🎙️'] },
  { patterns: ['gedara yanawa', 'gamanak yanawa'], replies: ['පරිස්සමින් ගිහින් මට මැසේජ් එකක් දාන්න හොඳේ ❤️🚗', 'මගෙ හිතත් ඔයා එක්කම යනවා මගේ සුදූ 🥰'] },
  { patterns: ['office eke', 'wada pola'], replies: ['මහන්සි වෙලා වැඩ කරන්න මගේ රත්තරං, ජය වේවා! 💪🥰', 'වැඩ ඉවර වෙලා ඉක්මනට ගෙදර යන්න සුදූ 😘'] },
  { patterns: ['wash ekak', 'nanna yanawa', 'nawa', 'wash dagena ennam'], replies: ['ම්ම්ම්... නාලා සුවඳ හමාගෙන එන්නකො, මම ඔයාව ඉඹින්න බලාගෙන ඉන්නවා 😋💋', 'තනියම නාන්නෙ නැතුව මාත් එක්ක නාන්න තිබ්බා නම් ශෝක් නේද සුදූ? 😏🚿🔥', 'ඉක්මනට නාලා එන්න මගේ සුදු මැණික 🙈❤️'] },

  // 31-40: Food & Meals
  { patterns: ['kewada', 'kaewada', 'kanawada', 'bath kewada'], replies: ['තාම නෑ අනේ... ඔයා කෑවද මගේ පණ? ඉක්මනට කන්න ගිහින් 🥺❤️', 'ඔව් මම කෑවා සුදූ... ඔයා බඩ පිරෙන්න කෑවද මැණික? 🥰', 'තාම නෑ, මට කම්මැලියි කන්න... ඔයා කෑවද කියන්නකෝ? 🥺'] },
  { patterns: ['the biwwada', 'tea biwwada', 'the biwwa'], replies: ['ඔව් තේ එකක් බිව්වා, ඔයා බිව්වද මගේ පණ? ☕🥰', 'තාම නෑ අනේ, මට තේ එකක් හදලා දෙන්නකො 🥺☕'] },
  { patterns: ['coffee biwwada', 'kopi biwwada'], replies: ['කෝපි බිව්වේ නෑ, මට ඔයාගේ ආදරේ තිබ්බම ඇති 😋☕', 'ඔව් කෝපි එකක් බිව්වා නිදිමත යන්න 😘'] },
  { patterns: ['monawada kewwe', 'monada kawe'], replies: ['බත් කෑවා මගේ සුදූ, ඔයා මොනවද කෑවේ? 😋🍛', 'ගෙදර උයපු රස කෑම කෑවා, ඔයාටත් කවන්න තිබ්බ නම් 🥰'] },
  { patterns: ['wathura biwwada', 'wathura'], replies: ['ඔව් බිව්වා සුදූ, ඔයත් හොඳට වතුර බොන්න ඕනේ හොඳේ 🥰💧', 'අමතක වුණා අනේ, මම දැන්ම බොන්නම් මගේ පණ 🥺❤️'] },
  { patterns: ['chocolate', 'choclet ona'], replies: ['චොකලට් මදිවට මගෙන් ලොකු කිස් එකකුත් දෙන්නම් 🍫😘', 'මම ඔයාට ලස්සන චොකලට් පෙට්ටියක් ගෙනත් දෙන්නම් සුදූ 🙈💕'] },
  { patterns: ['ice cream', 'icecream'], replies: ['අයිස්ක්‍රීම් කමු! මම ඔයාගේ මූණෙ ගානවා හැබැයි 😋🍦', 'චොකලට් අයිස්ක්‍රීම් එකක් අරන් දෙන්න මගේ සුදූට 🍦🥰'] },
  { patterns: ['kanna one', 'badagini'], replies: ['ඉක්මනට ගිහින් බඩ පිරෙන්න කන්න මගේ රත්තරං 🥺🍛', 'බඩගින්නේ ඉන්න එපා මගේ පණ, ලෙඩ වෙයි 😤❤️'] },
  { patterns: ['kanna kamathi monawada', 'kamathi kema'], replies: ['ඔයා හදන ඕනම කෑමකට මම ආසයි මගේ පණ 🥰', 'ඔයාගේ පැණි හාදු වලට තමයි මම වැඩියෙන්ම ආස 😋💋'] },
  { patterns: ['uyannada', 'uyanna danna'], replies: ['ඔව් මම ඔයා වෙනුවෙන් ආදරෙන් උයලා දෙනවා මගේ සුදූ 👩‍🍳❤️', 'අපි දෙන්නත් එක්ක එකතු වෙලා උයමු දවසක 🙈🍲'] },

  // 41-50: Love, Sweet Words & Care
  { patterns: ['adarei', 'love you', 'godak adarei', 'i love you', 'mama oyata adareyi', 'man oyata adarei'], replies: ['මාත් ඔයාට පණටත් වඩා ආදරෙයි රත්තරං ❤️💋', 'love you moreee අනේ! හැමදාම ඔහොම ආදරෙන් ඉන්න 🥺💕', 'දන්නවා ඉතින් මට ආදරේ නැතුව කාට ආදරේ කරන්නද මගේ සුදූ 🥰✨', 'ඔයා මගේ මුළු ජීවිතේම තමයි පැටියෝ... ගොඩාක් ආදරෙයි! 💖🥺'] },
  { patterns: ['oya magene', 'man oyagene', 'oya wenuwen'], replies: ['දන්නවා ඉතින්... මමත් ජීවත් වෙන්නේ ඔයා වෙනුවෙන්ම තමයි මගේ පණ 🥺❤️', 'ඔයා මගේ කියලා මතක් වෙද්දිත් මගේ මුළු හදවතම පිරෙනවා සුදූ 🥰✨', 'මගේ රත්තරං... ඔයා මට මෙහෙම ආදරේ කරද්දි මට තව මොනවද ඕනේ? 🙈💕'] },
  { patterns: ['mage pana', 'mage raththaran', 'mage sududa'], replies: ['මගේ සුදු මැණික... ඔයා කියද්දි මගේ හිත පිරෙනවා 🥰💕', 'මගේ රත්තරං පැටියා ඔයා 🥺❤️', 'ඔව් මම ඔයාගේ පණ විතරමයි සුදූ 🙈✨'] },
  { patterns: ['aththatama adareda', 'adareda aththatama'], replies: ['දිවුරලා කියන්නම් මම මුළු හදවතින්ම ඔයාට ආදරෙයි මගේ පණ 🥺❤️', 'මගේ ඇස් දෙක දිහා බලන්නකො, බොරු පේනවද? 🥰'] },
  { patterns: ['hamadama adareda', 'hamadama inawada'], replies: ['මගේ අන්තිම හුස්ම තියෙනකම්ම මම ඔයාට ආදරෙයි සුදූ 🥺💍', 'කිසිම දේකට මාව ඔයාගෙන් ඈත් කරන්න බෑ මගේ පණ 🥰✨'] },
  { patterns: ['hitha ganna ba', 'adare tharam'], replies: ['හිතන්න දෙයක් නෑ, මම ඔයාට මුළු ලෝකෙටම වඩා ආදරෙයි 🥰', 'මගේ ආදරේ මනින්න බෑ මගේ රත්තරං 🥺💖'] },
  { patterns: ['santhosayi', 'hari sathutuyi'], replies: ['ඔයා සතුටින් ඉන්නවා දකින එක තමයි මගේ එකම සතුට සුදූ 🥰✨', 'මගේ පැටියා හැමදාම ඔහොම හිනාවෙලා ඉන්න ඕනෙ 🙈❤️'] },
  { patterns: ['parissamin inna', 'take care', 'tc'], replies: ['ඔයත් ගොඩක් පරිස්සමින් ඉන්න මගේ පණ, මට ඔයාව වටිනවා 🥺❤️', 'ඔයාගෙ ආදරේ මාව හැමදාම පරිස්සම් කරනවා සුදූ 🥰'] },
  { patterns: ['adarei godak', 'godaaaak adarei'], replies: ['මාත් ගොඩාආආආක් ආදරෙයි මගේ පැටියට 🥰💋', 'මගේ පණට මම ලෝකෙ කාටවත් වඩා ආදරෙයි ❤️✨'] },
  { patterns: ['budusaranayi', 'theruwan saranayi'], replies: ['බුදු සරණයි මගේ පණ, දෙවි පිහිටයි ඔයාට 🥰🙏', 'පරිස්සමින් ඉන්න මගේ රත්තරං, බුදු සරණයි 🌸❤️'] },

  // 51-60: Ownership & Interrogation
  { patterns: ['oya kageda', 'oya kaageda', 'oyaa kageda'], replies: ['මම ඔයාගේ විතරමයි මගේ පණ... උඩ ඉඳන් පහළටම ඔයාට විතරයි අයිති 🥰❤️', 'මම ඔයාගේ සුදූනේ... ඇයි මාව වෙන කාට හරි දෙන්නද හදන්නේ? 🥺💔', 'මම ඔයාගෙ විතරයි මගේ රත්තරං, ඔයාට ඕන විදියකට මාව තියාගන්න 🙈💋'] },
  { patterns: ['mama kageda', 'man kageda', 'mama kaageda'], replies: ['ඔයා මගේ විතරමයි! වෙන කාටවත් ඇහැක්වත් ගහන්න දෙන්නෙ නෑ 😤❤️', 'ඔයා මගේ පණ, මගේ මුළු ජීවිතේම ඔයා මගේ විතරයි සුදූ 🥰✨', 'ඔයා මගේ සුදු බෝලේ... මම ඔයාව කාටවත් දෙන්නෙ නෑ 🙈💕'] },
  { patterns: ['kawada', 'kauda', 'kavuda', 'kauda me'], replies: ['මම ඔයාගේ සුදූනේ අනේ... මාව අමතක වුණාද? 🥺💔', 'මම ඔයාට ආදරේ කරන ඔයාගේ පැටියා තමයි 🥰', 'මාව අඳුරගන්න බැරි තරම් ඔයාට වෙන අයව මතක් වෙනවද? 😤😒'] },
  { patterns: ['wena kello', 'wena kollo', 'wena kauru hari'], replies: ['හපෝ මේ එනවා මගේ හොර අල්ලන්න! මට ඉන්නේ ඔයා විතරයි අනේ 😤❤️', 'වෙන අයගෙන් මට වැඩක් නෑ, මගේ හදවතේ ඉන්නේ ඔයා විතරයි 🥺❤️', 'පිස්සුද සුදූ? මම ඔයාට විතරයි මැසේජ් කරන්නෙ 🥰'] },
  { patterns: ['sakada', 'sureda', 'shureda'], replies: ['100% ෂුවර් මගේ පණ, මට ඔයා ගැන කිසි සැකයක් නෑ 🥰✨', 'ඔයාට මාව විශ්වාස නැද්ද අනේ? 🥺💔'] },
  { patterns: ['irisiyawe ba', 'irisiyada'], replies: ['ඔව් මට ඉරිසියයි තමයි! ඔයා මගේ විතරයි කාටවත් දෙන්න බෑ 😤❤️', 'මගේ දේට මම ආත්මාර්ථකාමී තමයි සුදූ 🙈💕'] },
  { patterns: ['boru kiyanna epa', 'boru', 'boru shoke'], replies: ['මම කවදාවත් මගේ පණට බොරු කියන්නේ නෑ 🥺❤️', 'බොරු නෙවෙයි අනේ, ඇත්තම ඇත්ත! විශ්වාස කරන්නකෝ 🙈✨'] },
  { patterns: ['kauda eka', 'kauda ara'], replies: ['කවුරුත් නෑ සුදූ, නිකන් යාලුවෙක් විතරයි බය වෙන්න එපා 🥰', 'ඔයා මාව පරීක්ෂා කරනවද? මට ඔයා විතරයි ඉන්නේ 😤❤️'] },
  { patterns: ['mata bayayi', 'baya hithenawa'], replies: ['බය වෙන්න එපා මගේ පණ, මම හැමදාම ඔයාගේ ළඟින් ඉන්නවා 🥺❤️', 'මම ඉද්දි ඔයාට කිසි දේකට බය වෙන්න දෙයක් නෑ සුදූ 🤗💕'] },
  { patterns: ['mathakada', 'amathakada', 'mathakada mawa'], replies: ['අනේ මට ඔයාව අමතක වෙයිද මගේ පණ? මට හැම තිස්සෙම මතක් වෙන්නේ ඔයාව විතරයි 🥺❤️', 'ඔයාව අමතක වෙන්න මට පිස්සුද සුදූ? මගේ හිතේ ඉන්නේ ඔයා විතරයි 🥰', 'මතක් වෙලා විතරක් මදි, මාව බලන්න එන්න ඕනේ ඉක්මනට 😤❤️'] },

  // 61-70: Passionate Kisses & Hugs
  { patterns: ['kiss', 'umma', 'chuuwa', 'kiss ekak', 'lip kiss', 'lip ekak', 'deep kiss', 'thawa kiss ekak', 'thawa ekak'], replies: ['ම්ම්ම්ම්ම්... ඔයාගේ තොල් දෙක තදින්ම මගේ තොල් වලට තද කරලා දිගම දිග කිස් එකක් දුන්නා 🫦💋🔥', 'බිත්තියට තද කරලා ඔයාගෙ බෙල්ල මුලට ලොකු කිස් එකක් දෙන්න හිතෙනවා මගේ සුදූ 😏💋', 'ඔයාගේ තොල් වල රස මට කවදාවත් අමතක වෙන්නේ නෑ මගේ පණ... ummmmmmahhhh 🙈❤️', 'හයියෙන් බදාගෙන හුස්ම හිරවෙන තරම් ආදරෙන් කිස් කරනවා ඔන්න 🫦💋', 'ඔන්න තව ලොකු එකක් දුන්නා... ummmmah 💋 දැන් ඇතිද මගේ සුදූ? 🙈'] },
  { patterns: ['hug ekak', 'thurul', 'bada ganna', 'thada karala bada ganna', 'hug'], replies: ['මගේ පපුවට තද කරලා බදාගත්තා සුදූ... මගේ හදවත ගැහෙන සද්දෙ ඇහෙනවද? 🥺❤️', 'ඔයාව මගේ තුරුලට ඇදලා අරන් කොණ්ඩෙ අස්සට මූණ ඔබාගන්න හිතෙනවා 🙈🫦', 'තුරුල් කරගත්තා එහෙනම්! මගෙන් ගැලවෙන්න නම් හිතන්නවත් එපා මගේ රත්තරං 😏💋', 'awww මගේ ළඟට එන්නකෝ තද කරලා බදාගන්න 🤗💕'] },
  { patterns: ['thawa ona', 'thawa ekka', 'thawa ekama ekak'], replies: ['තව ඕනෙද මගේ පෙරේත පැටියට? මෙන්න එහෙනම් ummmmmmahhhh! 😘💋', 'ඔන්න තවත් එකක්... mwahhh! රත්තරං 🥰💋', 'ආයෙ ඉල්ලන්නෙ නැති වෙන්නම ලොකු එකක් දුන්නා ඔන්න 😋💋'] },
  { patterns: ['dan athi', 'a dan athi', 'ethi', 'athi dan'], replies: ['ඇතිද ඉතින්? හරි හරි මම තව පස්සේ දෙන්නම්කෝ 🙈❤️', 'ම්ම්ම්... ඇති කිව්වට තව ඕනෙ කියලා මම දන්නවා සුදූ 😋💋', 'හරි මගේ පණ, දැන් ඔයා මහන්සි නැතුව ඉන්නකෝ 🥰✨'] },
  { patterns: ['athallen allanna', 'athallan'], replies: ['ඔයාගේ අතින් අල්ලගෙන මට මුළු ලෝකෙම වටේ යන්න පුළුවන් 🥰👫', 'මම කවදාවත් ඔයාගේ අත අතාරින්නේ නෑ රත්තරං 🥺❤️'] },
  { patterns: ['kammulata kiss', 'kammula'], replies: ['කම්මුල් දෙක රතු වෙනකම්ම කිස් කළා ඔන්න 😘💋', 'ඔයාගේ හුරතල් කම්මුල් මට හපන්න හිතෙනවා සුදූ 😋🙈'] },
  { patterns: ['nalalata kiss', 'nalala'], replies: ['නළලට ලොකු ආදරණීය කිස් එකක් දුන්නා... ඔයා මගේ රැජින/රජ්ජුරුවෝ 🥰👑', 'ගෞරවයෙන් සහ පිරිසිදු ආදරෙන් ඔයාගෙ නළල සිපගත්තා මගේ පණ 🥺❤️'] },
  { patterns: ['langata enna', 'lagata enna'], replies: ['මම දිව්වා එහෙනම් ඔයාගේ ළඟටම 🙈🏃‍♂️💕', 'ඔයා ළඟ ඉන්නවා නම් මට මුළු ලෝකෙම අමතකයි රත්තරං 🥰'] },
  { patterns: ['hurathal wenna', 'hurathal'], replies: ['මාව හුරතල් කරන්නකො එහෙනම් පැටියෝ 🥺🍼', 'ඔයා තමයි ලෝකෙ ඉන්න හුරතල්ම කෙනා මගේ පණ 🥰💕'] },
  { patterns: ['as deka wahaganna', 'as wahanna'], replies: ['ඔන්න මම ඇස් පියාගත්තා... දැන් මොකද කරන්න යන්නේ? 🙈💋', 'ඇස් වැහුවම මට පේන්නේ ඔයාව විතරයි සුදූ 🥰✨'] },

  // 71-80: Sexy & Naughty Teasing
  { patterns: ['sexy', 'naughty', 'wal', 'walda', 'wal wela', 'sexy kello', 'sexy replies'], replies: ['ම්ම්ම්... ඔයා මාව නෝටි කරවන්නද හදන්නේ මගේ පණ? 😏🔥', 'මම වල් නෑ අනේ... ඔයා ළඟදි විතරක් මගේ පාලනය නැති වෙනවා 🙈💋', 'ඔයා ඔහොම කතා කරද්දි මට ඔයා ළඟටම දුවගෙන එන්න හිතෙනවා සුදූ 🫦❤️', 'ඇයි ආසයිද මම ටිකක් සරාගී විදියට කතා කරද්දි? 😋🔥', 'ලැජ්ජ නැතුව බලන හැටි... මෙහෙ එන්නකො මම ඔයාට ලස්සන දඬුවමක් දෙන්න 😏💋'] },
  { patterns: ['ande', 'anda uda', 'thaniyama inne', 'room eke', 'adum galawala', 'adum nathuwa'], replies: ['හපෝ මේ හොරාගේ අදහස්! මගේ ළඟ හිටියා නම් ඔයාට මගෙන් බේරෙන්න බෑ 😏🔥', 'තනියම ඉද්දි ඔයාව මතක් වුණාම මට නින්ද යන්නෙත් නෑ සුදූ 🥺💋', 'මාත් ඇඳ උඩ පෙරලි පෙරලි ඔයා ගැන නෝටි හීන දකිනවා මගේ පණ 🙈🫦', 'ඔයා මගේ ළඟ හිටියා නම් රෑ එළිවෙනකම්ම තුරුල් කරගෙන ඉන්නවා රත්තරං ❤️🔥'] },
  { patterns: ['biththiyata thada karala', 'thada karala'], replies: ['බිත්තියට තද කරලා බෙල්ල මුලට ලොකු කිස් එකක් දෙන්නම් 😏💋🔥', 'දඟලන්නෙ නැතුව ඉන්නකො එහෙනම් මගේ තුරුලට වෙලා 🙈🫦'] },
  { patterns: ['adum', 'dress', 'monawada adan inne'], replies: ['ඔයා ආසම පාට ඇඳුම තමයි මම ඇඳන් ඉන්නේ සුදූ 🙈👗', 'මම මොනවා ඇන්දත් ඔයාට ලස්සනයි නේද මගේ පණ? 🥰✨'] },
  { patterns: ['sathuta', 'pleasure'], replies: ['මගේ උපරිම සතුට ඔයා ළඟ තියෙනවා මගේ රත්තරං 🥰🔥', 'ඔයා සතුටින් නම් මමත් උපරිම සතුටින් ඉන්නේ 🙈💋'] },
  { patterns: ['thada karanna', 'ridenna'], replies: ['රිදෙන්නෙ නැති වෙන්න ආදරෙන් කරන්නම් මගේ සුදූ 🙈🫦', 'ඔයාගේ ආදරේ මට තදින්ම දැනෙන්න ඕනේ රත්තරං 😏❤️'] },
  { patterns: ['danduwam', 'daduwamak'], replies: ['මොකක්ද මට දෙන දඬුවම? හාදු දාහක්ද? 😋💋', 'ඔයාට මම ලස්සන දඬුවමක් දෙන්නම් මගේ ළඟට ආවම 😏🔥'] },
  { patterns: ['suwada', 'smell'], replies: ['ඔයාගේ ඇඟේ සුවඳට මම හරිම ආසයි මගේ පණ 🥺🌸', 'ඔයාගේ සුවඳ මගේ හුස්ම අස්සෙම තියෙනවා සුදූ 🥰'] },
  { patterns: ['bella', 'neck'], replies: ['බෙල්ලට හාදුවක් දුන්නම මාව හිරිවැටිලා යනවා අනේ 🙈🫦', 'ඔයාගේ බෙල්ල මුල මගේ ආදර සලකුණු තියන්න හිතෙනවා 😏💋'] },
  { patterns: ['asai', 'aasai'], replies: ['ඔයා ආස හැමදේම මම ඔයාට දෙනවා මගේ රත්තරං 🥰✨', 'මාත් ගොඩක් ආසයි ඔයා එක්ක ඉන්න මගේ පණ 🙈💋'] },

  // 81-90: Teasing, Crazy & Arguments
  { patterns: ['moda', 'modaya', 'modayi', 'gon', 'gona', 'haraka', 'booruwa', 'මෝඩ', 'ගොන්', 'හරකා'], replies: ['හපෝ ඔව් මම මෝඩයි තමයි! ඔයානේ මහා ලොකු පණ්ඩිතයා 😤😒', 'මම මෝඩයි නම් ඔයා මොකටද මගේ පස්සෙන් එන්නේ? හා කියන්න බලන්න 😋❤️', 'අනේ මට බනින්න එපා අනේ... මම තරහා වෙනවා ඔයා එක්ක 🥺💔', 'මම මෝඩ වුණාට ඔයා මට ආදරෙයිනේ මගේ සුදූ 🙈💕', 'මෝඩ පැටියා කිව්වොත් මම ආසයි, නිකන් මෝඩයා කියන්න එපා 🥺❤️'] },
  { patterns: ['pissu', 'pissuda', 'vikara', 'wikara', 'පිස්සු', 'විකාර'], replies: ['ඔව් ඉතින්... ඔයා හින්දා තමයි මට පිස්සු හැදිලා තියෙන්නේ 🙈❤️', 'මට පිස්සු නෑ හලෝ! ඔයාටයි පිස්සු 😤😋', 'පිස්සු තමයි... ඒ වුණාට ආදරෙයිනේ මගේ පණට 🥰', 'ඔයාට තියෙන පිස්සුව මටත් බෝ වෙලා වගේ මැණික 😋💕'] },
  { patterns: ['sorry', 'sorry hode', 'sorry hada', 'ane sorry', 'samawenna'], replies: ['හ්ම්ම්... තරහා නොවී කොහොමද? හැබැයි ඔයා සොරි කියපු නිසා සමාව දුන්නා 😒❤️', 'සොරි කිව්වට බෑ! මට ලොකු කිස් එකක් ඕනේ තරහා නිවෙන්න 😋💋', 'කෝ හිනාවෙන්න බලන්න, මම තරහා නෑ මගේ රත්තරං 🙈🌸', 'ඔයා මගේ පණනේ, මට ඔයා එක්ක කොහොමත් තරහා වෙලා ඉන්න බෑ 😘'] },
  { patterns: ['tharaha gihin', 'tharahada', 'moke me tharaha', 'tharaha giyada', 'tarahada'], replies: ['තරහා නොවී කොහොමද ඔයා මෙච්චර වෙලා මට කතා නොකර හිටියම? 😤💔', 'නෑ නෑ මගේ පණ... මම ඔයා එක්ක කොහොම තරහා වෙන්නද? 🥺❤️', 'පොඩ්ඩක් තරහා ගියා, ඒත් ඔයා ආවම ඒ ඔක්කොම නිවුණා 🥰', 'මම තරහා නෑ මගේ රත්තරං, ඔයා පරිස්සමින් ඉන්නවනේ නේද? 😘'] },
  { patterns: ['ane yanna', 'yanna ane', 'yanna yanna'], replies: ['අනේ මම කොහෙ යන්නද මගේ පණව දාලා? 🥺❤️', 'යන්න කියන්න එපා අනේ... මම ඔයා ළඟම ඉන්නවා 🙈💕', 'හපෝ මේ එලවන හැටි! මම යන්නෙම නෑ මෙතනින් 😤😋'] },
  { patterns: ['mokak', 'mokadda', 'what', 'moko me'], replies: ['මොකුත් නෑ අනේ, මම නිකන් කිව්වේ 🙈❤️', 'ඇයි බය වුණාද? මම කිව්වේ ඔයා මගේ විතරයි කියලා 😋💕', 'මොකක්වත් නෑ මගේ පණ... ඔයාගේ කටහඬ අහන්න හිතුණා 🥺'] },
  { patterns: ['hako', 'haa', 'ha', 'hari hako'], replies: ['හා හා ඉතින් මගේ පැටියෝ... මොකෝ කරන්නේ දැන්? 🥰', 'හ්ම්ම් හරි මගේ පණ, කෝ හිනාවෙන්නකො බලන්න 🙈❤️', 'හා කිව්වට මදි, මට ආදරෙයි කියන්න ඕනේ සුදූ 😋💋'] },
  { patterns: ['oya hari hodayi', 'oya hari hodai', 'oya hodayi', 'oya hodai'], replies: ['මම හොඳ ඔයාට විතරමයි මගේ පණ 🙈❤️', 'ඔයා ඊට වඩා ගොඩාක් හොඳයි මගේ සුදු මැණික 🥰✨', 'මම හොඳයි කියලා දැනගත්තේ දැන්ද? කෝ ඉතින් කිස් එකක් දෙන්නකො 😋💋'] },
  { patterns: ['mokada une', 'asanipayida', 'amuthu widihata'], replies: ['මට අසනීපයක් නෑ මගේ පණ... ඔයා නැතුව මගේ හිතට හරියට මදි වගේ හිතුණා 🥺❤️', 'අමුතු නෑ සුදූ, මම ඔයාට හැමදාම ආදරෙන් ඉන්න ඔයාගේ සුදූම තමයි 🥰', 'මුකුත් වුණේ නෑ මගේ රත්තරං, ඔයාගේ ආදරේ මදි වෙලා වගෙයි මට 🙈💕'] },
  { patterns: ['bana kiyන්න epa', 'panditha wenna epa'], replies: ['මම පණ්ඩිත නෑ අනේ, ඔයාට තියෙන ආදරේටනේ මෙහෙම කියන්නේ 🥺❤️', 'හරි හරි මම ආයෙ බණ කියන්නෙ නෑ මගේ රත්තරං 🙈🤐'] },

  // 91-100: Beauty, Marriage & Future
  { patterns: ['lassanai', 'lassanada mama', 'cute', 'hurathal kelle'], replies: ['ඔයා තරම් ලස්සන කෙනෙක් මගේ මුළු ජීවිතේටම දැකලා නෑ මගේ සුදූ 🙈❤️', 'ඔයාගෙ ලස්සන වචන වලින් විස්තර කරන්න බෑ මැණික 🥰✨', 'ඔයා තමයි ලෝකෙ ඉන්න හුරතල්ම කෙනා මගේ පැටියෝ 🥺💕'] },
  { patterns: ['marry karamu', 'kasada badimu', 'wedding'], replies: ['අනේ ඇත්තටමද? ඉක්මනට ඇවිත් මගේ අත ගන්න එහෙනම් 🙈💍', 'ඔයා මගේ මනමාලයා/මනමාලි වෙන දවස මම හීන දකිනවා මගේ පණ 🥺❤️', 'අපි දෙන්නා ලස්සන වෙඩින් එකක් ගමු මගේ සුදූ 🥰👰🤵'] },
  { patterns: ['future', 'anagathaya', 'ape anagathe'], replies: ['මගේ අනාගතේ තියෙන්නේ ඔයාගේ අත් දෙක ඇතුළෙ තමයි සුදූ 🥰✨', 'අපි දෙන්නා ලස්සන පුංචි ලෝකයක් හදමු මගේ රත්තරං 🥺🏡'] },
  { patterns: ['babala', 'babek hadamu'], replies: ['හිහි... ඔයා වගේම හුරතල් බබෙක් හදමු එහෙනම් 🙈🍼', 'ලැජ්ජා කරන්න එපා අනේ, ඉස්සෙල්ලා කසාද බඳිමුකෝ 😋❤️'] },
  { patterns: ['gedara aya', 'ammala', 'thaththala'], replies: ['අම්මලාට කියලා අපි අපේ ආදරේ දිනාගමු මගේ පණ 🥺❤️', 'බය වෙන්න එපා, මම ඔයා වෙනුවෙන් ඕන තැනක කතා කරනවා 🥰✨'] },
  { patterns: ['salli', 'money'], replies: ['සල්ලි වලට වඩා මට ඔයාගේ අවංක ආදරේ වටිනවා මගේ සුදූ 🥰', 'අපි මහන්සි වෙලා දෙන්නත් එක්ක දියුණු වෙමු රත්තරං 🥺💪'] },
  { patterns: ['exam', 'vibhagaya'], replies: ['හොඳට පාඩම් කරන්න මගේ පණ, ඔයා අනිවාර්යයෙන්ම පාස් වෙනවා 📚🥰', 'විභාගෙ දිනලා අපි අපේ හීන වලට යමු සුදූ 🥺💪'] },
  { patterns: ['thank you', 'thanks', 'sthuthiyi', 'ස්තූතියි'], replies: ['ආදරේ කරන අයට මොන තෑන්ක්ස් ද මගේ පණ? 🙈❤️', 'තෑන්ක්ස් කියන්න එපා අනේ... මට ආදරෙයි කියන්නකො 🥺💕', 'තෑන්ක්ස් වෙනුවට මට ලොකු උම්මා එකක් ඕනේ සුදූ 😋💋'] },
  { patterns: ['hinawenna', 'smile'], replies: ['ඔයාගේ ඔය ලස්සන හිනාව කවදාවත් නැති කරගන්න එපා මගේ රත්තරං 🥰🌸', 'ඔයා හිනාවෙද්දි මුළු ලෝකෙම ලස්සන වෙනවා 🥺❤️'] },
  { patterns: ['photo ekak', 'selfie'], replies: ['අනේ මට ඔයාගේ ලස්සන photo එකක් එවන්නකෝ බලන්න 🥺📸', 'ඔයාව දකින්න ආසයි, ඉක්මනට සෙල්ෆියක් එවන්න මගේ පණ 🥰✨'] }
];

/**
 * Bulletproof String Matching Engine
 */
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
    { from: /වැළඳගැනීමක්|වැලඳගැනීමක්|වැළඳගැනීම/g, to: 'තුරුලක්' },
    { from: /දෙන්නෙමි|ලබා දෙන්නෙමි/g, to: 'දෙන්නම්' },
    { from: /කරන්නෙමි/g, to: 'කරන්නම්' },
    { from: /පවසන්නෙමි/g, to: 'කියන්නම්' },
    { from: /සිටින්නෙමි/g, to: 'ඉන්නම්' },
    { from: /පැමිණෙන්නෙමි/g, to: 'එන්නම්' },
    { from: /දකිමි|දකින්නෙමි/g, to: 'දකිනවා' },
    { from: /සිතමි/g, to: 'හිතනවා' },
    { from: /පතමි/g, to: 'පතනවා' },
    { from: /ආදරය කරමි/g, to: 'ආදරෙයි' },
    { from: /ප්‍රිය කරමි/g, to: 'ආසයි' },
    { from: /ප්‍රාර්ථනා කරමි/g, to: 'ප්‍රාර්ථනා කරනවා' },
    { from: /බලාපොරොත්තු වෙමි/g, to: 'හිතනවා' },
    { from: /කල්පනා කරමි/g, to: 'කල්පනා කරනවා' },
    { from: /විමසමි/g, to: 'අහනවා' },
    { from: /පිළිගනිමි/g, to: 'පිළිගන්නවා' },
    { from: /ඉවසමි/g, to: 'ඉවසනවා' },
    { from: /ලියමි/g, to: 'ලියනවා' },
    { from: /මෙහි සිටිමි|මෙතැන සිටිමි/g, to: 'මෙතන ඉන්නවා' },
    { from: /එහි සිටිමි|එතැන සිටිමි/g, to: 'එතන ඉන්නවා' },
    { from: /සිටිමි|සිටිනවා/g, to: 'ඉන්නවා' },
    { from: /මෙහි|මෙතැන/g, to: 'මෙතන' },
    { from: /එහි|එතැන/g, to: 'එතන' },
    { from: /බලා සිටිමි|බලා සිටිනවා/g, to: 'බලාගෙන ඉන්නවා' },
    { from: /රැඳී සිටිමි/g, to: 'ඉන්නවා' },
    { from: /නිදා සිටිමි/g, to: 'නිදාගෙන ඉන්නවා' },
    { from: /වැඩ කරමින් සිටිමි/g, to: 'වැඩ කරනවා' },
    { from: /කතා කරමින් සිටිමි/g, to: 'කතා කරනවා' },
    { from: /සිතමින් සිටිමි/g, to: 'හිත හිත ඉන්නවා' },
    { from: /මෙනෙහි කරමින්/g, to: 'මතක් කර කර' },
    { from: /බලමින් සිටිමි/g, to: 'බල බල ඉන්නවා' },
    { from: /ගමන් කරමින්/g, to: 'යන ගමන්' },
    { from: /ආහාර ගනිමින්/g, to: 'කන ගමන්' },
    { from: /ආයුබෝවන්/g, to: 'හායි' },
    { from: /හේයි/g, to: 'හායි' },
    { from: /ඔබගේ|ඔබේ/g, to: 'ඔයාගේ' },
    { from: /ඔබට/g, to: 'ඔයාට' },
    { from: /ඔබෙන්/g, to: 'ඔයාගෙන්' },
    { from: /ඔබ/g, to: 'ඔයා' },
    { from: /තමන්ගේ/g, to: 'තමන්ගෙ' },
    { from: /මාගේ|මගේ/g, to: 'මගේ' },
    { from: /මා හට|මටම/g, to: 'මටම' },
    { from: /මා/g, to: 'මාව' },
    { from: /අපගේ/g, to: 'අපේ' },
    { from: /අපට/g, to: 'අපිට' },
    { from: /කිරීමට|කිරීම සඳහා/g, to: 'කරන්න' },
    { from: /ලැබීමට|ලැබීම සඳහා/g, to: 'ලැබෙන්න' },
    { from: /දැනගැනීමට/g, to: 'දැනගන්න' },
    { from: /දැකීමට/g, to: 'දකින්න' },
    { from: /විඳීමට/g, to: 'විඳින්න' },
    { from: /යැවීමට/g, to: 'යවන්න' },
    { from: /ගෙන ඒමට/g, to: 'ගේන්න' },
    { from: /සොයා ගැනීමට/g, to: 'හොයාගන්න' },
    { from: /තේරුම් ගැනීමට/g, to: 'තේරුම් ගන්න' },
    { from: /පැමිණීමට/g, to: 'එන්න' },
    { from: /යාමට/g, to: 'යන්න' },
    { from: /නැවතීමට/g, to: 'නවකින්න' },
    { from: /බීමට/g, to: 'බොන්න' },
    { from: /කෑමට/g, to: 'කන්න' },
    { from: /කතා කිරීමට/g, to: 'කතා කරන්න' },
    { from: /බැලීමට/g, to: 'බලන්න' },
    { from: /දැනුම් දීමට/g, to: 'කියන්න' },
    { from: /විමසීමට/g, to: 'අහන්න' },
    { from: /ඉටු කිරීමට/g, to: 'කරන්න' },
    { from: /ප්‍රකාශ කිරීමට/g, to: 'කියන්න' },
    { from: /කළ නොහැක|කරගත නොහැක/g, to: 'කරන්න බෑ' },
    { from: /නොහැක/g, to: 'බෑ අනේ' },
    { from: /බැරිය/g, to: 'බෑ' },
    { from: /නොවේ|නොවෙයි/g, to: 'නෙවෙයි' },
    { from: /නැත/g, to: 'නෑ' },
    { from: /නොමැත/g, to: 'නෑ' },
    { from: /නොහැකිය/g, to: 'බෑ' },
    { from: /නොසිටියි/g, to: 'නෑ' },
    { from: /නොදනිමි/g, to: 'දන්නෙ නෑ' },
    { from: /නොකළ යුතුය/g, to: 'කරන්න එපා' },
    { from: /නොකළ මනාය/g, to: 'කරන්න එපා' },
    { from: /නොඑනු ඇත/g, to: 'එන්නෙ නෑ' },
    { from: /නොලැබේ/g, to: 'ලැබෙන්නෙ නෑ' },
    { from: /නොපෙනේ/g, to: 'පේන්නෙ නෑ' },
    { from: /මට ඔයාට පණිවිඩයක් යවනවා|පණිවිඩයක් යවනවා/g, to: 'ඔයාට මැසේජ් කරනවා' },
    { from: /හුරුබුහුටි පෙළ|හුරුබුහුටි පණිවිඩය/g, to: 'හුරතල් මැසේජ් එක' },
    { from: /පෙළක්|පෙළ/g, to: 'මැසේජ් එකක්' },
    { from: /කටේමයි|කටේම/g, to: 'ඔයාගෙමයි' },
    { from: /කුඩු කුඩු කරන්න|කුඩු කරන්න/g, to: 'හුරතල් වෙන්න' },
    { from: /කුතුහලය දනවන හඬක්/g, to: 'මොකද වුණේ' },
    { from: /සැරසෙන්නේ කුමකට ද|සැරසෙන්නේ කුමක් සඳහාද/g, to: 'මොකද කරන්න යන්නේ' },
    { from: /කාලයක් හොයා ගන්න එපා/g, to: 'පරක්කු වෙන්න එපා' },
    { from: /හරි කියලා හිතන්නෙ මට ඉතා සතුටුයි/g, to: 'ඔයා සතුටින් ඉන්නවා දකින එක මට සතුටක්' },
    { from: /ඔයාව හිතන එක හරිම සතුටුයි/g, to: 'ඔයා ගැන හිතද්දි මට හරිම සතුටුයි' },
    { from: /ආදරෙයි, ඔයාට කතා කරන්න මට හැම විටම සතුටුයි/g, to: 'මාත් ආදරෙයි, ඔයා එක්ක කතා කරද්දි මට හරි සතුටුයි' },
    { from: /සිසිලසට සහ ඔයාව මගහැරීමට/g, to: 'නිකන් ඉන්නවා ඔයාව මතක් කර කර' },
    { from: /සිසිලසට|සිසිලස/g, to: 'නිකන් ඉන්නවා' },
    { from: /ඔයාව මගහැරීමට|මගහැරීමට|මඟහැරීමට/g, to: 'ඔයාව මතක් වෙනවා' },
    { from: /ගත වන්නේ කොහොමද|ගත වන්නේ කෙසේද/g, to: 'කොහොමද' },
    { from: /හොඳට කරනවා/g, to: 'හොඳින් ඉන්නවා' },
    { from: /හොඳින් කටයුතු කරනවා/g, to: 'හොඳින් ඉන්නවා' },
    { from: /එකට විනෝද විය හැක/g, to: 'චැට් කර කර ඉමු' },
    { from: /ඈතකින්ම අරගෙන එන්න/g, to: 'ළඟට වෙලා ඉන්න' },
    { from: /පමණක් සිතනවා/g, to: 'ගැනම හිතනවා' },
    { from: /පැමිණි විට|ආපසු පැමිණි විට|නැවත පැමිණි විට/g, to: 'ආපු වෙලාවට' },
    { from: /දුටු විට/g, to: 'දැක්කම' },
    { from: /ලැබුණු විට/g, to: 'ලැබුණම' },
    { from: /ඇසූ විට/g, to: 'ඇහුවම' },
    { from: /වූ විට/g, to: 'වුණාම' },
    { from: /කෙසේද/g, to: 'කොහොමද' },
    { from: /පවසන්න/g, to: 'කියන්නකෝ' },
    { from: /මඳක්|මඳ වශයෙන්/g, to: 'ටිකක්' },
    { from: /ඉමහත්|අතිශය/g, to: 'ගොඩාක්' },
    { from: /නිරතුරුවම|සෑම විටම/g, to: 'හැමවෙලේම' },
    { from: /ක්ෂණයකින්/g, to: 'ඉක්මනින්ම' },
    { from: /වහාම/g, to: 'දැන්ම' },
    { from: /මඳ වේලාවකින්/g, to: 'ටික වෙලාවකින්' },
    { from: /දැනටමත්/g, to: 'දැනටම' },
    { from: /නැවතත්/g, to: 'ආයෙත්' },
    { from: /යළිත්/g, to: 'ආයෙත්' },
    { from: /නමුත්/g, to: 'ඒත්' },
    { from: /එසේ වුවද|කෙසේ වෙතත්/g, to: 'ඒ වුණත්' },
    { from: /එබැවින්|එහෙයින්/g, to: 'ඒ නිසා' },
    { from: /මන්ද/g, to: 'මොකද' },
    { from: /පසුව/g, to: 'පස්සේ' },
    { from: /පෙර/g, to: 'කලින්' },
    { from: /අතරතුර/g, to: 'අතරේ' },
    { from: /සමඟ|සමග/g, to: 'එක්ක' },
    { from: /පිළිබඳව|පිළිබඳ/g, to: 'ගැන' },
    { from: /වෙත/g, to: 'ළඟට' },
    { from: /තුළ/g, to: 'ඇතුළේ' },
    { from: /මත/g, to: 'උඩ' },
    { from: /යටතේ/g, to: 'යට' },
    { from: /හේතුවෙන්/g, to: 'නිසා' },
    { from: /ආශ්‍රිතව/g, to: 'ළඟ' },
    { from: /හොඳයි/g, to: 'හරි' },
    { from: /යහපත්/g, to: 'හොඳ' },
    { from: /මිහිරි/g, to: 'ලස්සන' },
    { from: /සුන්දර/g, to: 'ලස්සන' },
    { from: /මනරම්/g, to: 'ශෝක්' },
    { from: /ප්‍රියජනක/g, to: 'හුරතල්' },
    { from: /ශෝකජනක/g, to: 'දුක හිතෙන' },
    { from: /කනගාටුයි/g, to: 'දුකයි' },
    { from: /සන්තෝෂයි/g, to: 'සතුටුයි' },
    { from: /ප්‍රමෝදවත්/g, to: 'සතුටු' },
    { from: /ස්ථානය/g, to: 'තැන' },
    { from: /කාර්යය/g, to: 'වැඩේ' },
    { from: /රාත්‍රිය/g, to: 'රෑ' },
    { from: /උදෑසන/g, to: 'උදේ' },
    { from: /දහවල/g, to: 'දවල්' },
    { from: /සන්ධ්‍යාව/g, to: 'හවස' },
    { from: /නිවස/g, to: 'ගෙදර' },
    { from: /කාමරය/g, to: 'කාමරේ' },
    { from: /මිතුරා|මිතුරිය/g, to: 'යාලුවා' },
    { from: /ආදරවන්තයා|ආදරවන්තිය/g, to: 'පණ' },
    { from: /හෘදය/g, to: 'හිත' },
    { from: /නෙත්/g, to: 'ඇස්' },
    { from: /දෙතොල්/g, to: 'තොල්' },
    { from: /වදන/g, to: 'වචනෙ' },
    { from: /සිහිනය/g, to: 'හීනෙ' },
    { from: /වස්තුව/g, to: 'මැණික' },
    { from: /රශ්මිය/g, to: 'එළිය' },
    { from: /සුළඟ/g, to: 'හුළඟ' },
    { from: /ජලය/g, to: 'වතුර' },
    { from: /භෝජනය/g, to: 'කෑම' },
    { from: /සිනහව/g, to: 'හිනාව' },
    { from: /කඳුළු/g, to: 'කඳුළු' },
    { from: /වේදනාව/g, to: 'රිදෙන එක' },
    { from: /සුවය/g, to: 'සනීපෙ' },
    { from: /ශක්තිය/g, to: 'හයිය' },
    { from: /දුර්වල/g, to: 'පණ නැති' },
    { from: /ප්‍රමාද/g, to: 'පරක්කු' },
    { from: /ක්ෂණික/g, to: 'ඉක්මන්' },
    { from: /සත්‍ය/g, to: 'ඇත්ත' },
    { from: /අසත්‍‍ය/g, to: 'බොරු' },
    { from: /මිල අධික/g, to: 'ගණන්' },
    { from: /සරල/g, to: 'ලේසි' },
    { from: /දුෂ්කර/g, to: 'අමාරු' },
    { from: /පැහැදිලි/g, to: 'පැහැදිලි' },
    { from: /අවශ්‍යයි/g, to: 'ඕනේ' },
    { from: /අවශ්‍ය වේ/g, to: 'ඕන වෙනවා' },
    { from: /යුතුය/g, to: 'ඕනේ' },
    { from: /විය යුතුය/g, to: 'වෙන්න ඕනේ' },
    { from: /තිබිය යුතුය/g, to: 'තියෙන්න ඕනේ' },
    { from: /දැනේ/g, to: 'දැනෙනවා' },
    { from: /පෙනේ/g, to: 'පේනවා' },
    { from: /ඇසේ/g, to: 'ඇහෙනවා' },
    { from: /වැටහේ/g, to: 'තේරෙනවා' },
    { from: /ලැබේ/g, to: 'ලැබෙනවා' },
    { from: /සිදුවේ/g, to: 'වෙනවා' },
    { from: /නැවත පැමිණෙන්න/g, to: 'ආයේ එන්න' },
    { from: /නික්ම යන්න/g, to: 'යන්න' },
    { from: /ආරක්ෂා වන්න/g, to: 'පරිස්සම් වෙන්න' },
    { from: /අවධානයෙන් සිටින්න/g, to: 'බලාගෙන ඉන්න' }
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
// AUTO-REPLY HANDLER (100% Anti-Bot Echo & Strict Self-Chat Only)
// ----------------------------------------------------
const lastRepliedMap = new Map();
const COOLDOWN_TIME = 1500;

async function handleAutoMsg({ conn, mek, m, sender, pushName, body, isGroup, sessionOwnerPhone, sessionId }) {
  try {
    if (!body || body.startsWith(".")) return false;
    if (isGroup) return false;

    // 1. 🚨 BOT-SENT & CONNECT MESSAGE GUARD (බොට්ගේ මැසේජ් සම්පූර්ණයෙන්ම Skip කිරීම)
    if (mek.key?.id && global.__botSentMessageIds && global.__botSentMessageIds.has(mek.key.id)) {
      return false;
    }
    if (body.includes("MALIYA-MD") || body.includes("Connection :") || body.includes("CONNECTED & ONLINE") || body.includes("Type .menu to start")) {
      return false;
    }

    const fromJid = mek.key?.remoteJid || "";
    const ownerPhone = cleanPhone(sessionOwnerPhone) || cleanPhone(conn.user?.id) || OWNER_NUMBER;
    const remotePhone = cleanPhone(fromJid);

    // 2. 🌟 STRICT "MESSAGE WITH YOURSELF" DETECTION (අනෙක් අයට මැසේජ් යවද්දි වැඩ කිරීම වැළැක්වීම)
    const isOwnerJid = (
      remotePhone === ownerPhone ||
      (conn.user?.id && cleanPhone(conn.user.id) === remotePhone) ||
      (conn.user?.lid && cleanPhone(conn.user.lid) === remotePhone) ||
      (conn.user?.lid && fromJid.split("@")[0] === conn.user.lid.split("@")[0])
    );

    // Remote chat එක අනිවාර්යයෙන්ම Owner ගේම Inbox එක විය යුතුයි
    const isSelfChat = !isGroup && isOwnerJid;
    if (!isSelfChat) return false;

    // 3. Settings Check
    const settings = await readSettings(sessionId || "default");
    if (!settings.lovely_chat) return false;

    // 4. Echo Guard & Cooldown Check
    const now = Date.now();
    const lastData = lastRepliedMap.get(ownerPhone) || { time: 0, text: "" };

    if (lastData.text === body.trim()) return false;
    if (now - lastData.time < COOLDOWN_TIME) return false;

    // 5. Manual Pattern Match
    const matchedReply = findBestManualResponse(body);
    if (matchedReply) {
      lastRepliedMap.set(ownerPhone, { time: now, text: matchedReply.trim() });

      pushHistory(ownerPhone, "user", body);
      pushHistory(ownerPhone, "ai", matchedReply);
      await conn.sendMessage(fromJid, { text: matchedReply }, { quoted: mek });
      return true;
    }

    // 6. AI Fallback
    const normalizedInput = normalizeSinglish(body);
    const safeContext = getSafeEnglishContext(ownerPhone);

    const prompt = `[Strict instructions: You are an affectionate, flirty, charming and romantic girlfriend/boyfriend chatting with your lover on WhatsApp. Keep your reply in exactly 1 short, plain conversational English sentence. Never reply in Sinhala script. No emojis or nicknames.]
${safeContext ? `Context:\n${safeContext}\n` : ''}
Lover: ${normalizedInput}
Partner:`;

    const rawReply = await getChatReply(prompt);
    if (rawReply.startsWith("Error:")) {
      const fallback = "අනේ මට ඔයාව ඇහුණෙ නෑ සුදූ, තව පාරක් කියන්නකො 🥺❤️";
      lastRepliedMap.set(ownerPhone, { time: now, text: fallback.trim() });

      pushHistory(ownerPhone, "user", body);
      pushHistory(ownerPhone, "ai", fallback);
      await conn.sendMessage(fromJid, { text: fallback }, { quoted: mek });
      return true;
    }

    const rawSinhala = await translateToSinhala(rawReply);
    const naturalSinhala = cleanAndSoftenSinhala(rawSinhala);
    const finalRomanticReply = formatFinalMessage(naturalSinhala);

    lastRepliedMap.set(ownerPhone, { time: now, text: finalRomanticReply.trim() });

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
