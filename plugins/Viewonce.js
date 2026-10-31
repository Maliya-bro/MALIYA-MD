const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// Resolve mongodb helper (flexible path)
let getSessionOwnerPhone = null;
for (const p of ["../lib/mongodb", "./mongodb", "../database/mongodb", "../lib/database"]) {
  try {
    const mod = require(p);
    if (mod?.getSessionOwnerPhone) { getSessionOwnerPhone = mod.getSessionOwnerPhone; break; }
  } catch {}
}

const tempFolder = path.join(__dirname, "../temp");
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

/* ---------- Helpers ---------- */

function unwrapMessage(m) {
  if (!m) return null;
  if (m.ephemeralMessage) return unwrapMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessageV2) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.viewOnceMessage) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2Extension) return unwrapMessage(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage) return unwrapMessage(m.documentWithCaptionMessage.message);
  return m;
}

function detectMedia(m) {
  if (!m) return null;
  if (m.imageMessage) {
    const mime = m.imageMessage.mimetype || "";
    return { type: "image", node: m.imageMessage, ext: mime.includes("png") ? ".png" : ".jpg" };
  }
  if (m.videoMessage) return { type: "video", node: m.videoMessage, ext: ".mp4" };
  if (m.audioMessage) {
    const ptt = m.audioMessage.ptt === true;
    return { type: "audio", node: m.audioMessage, ext: ptt ? ".ogg" : ".mp3", ptt };
  }
  return null;
}

/**
 * True only if the message is purely emoji(s).
 */
function isEmojiOnly(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (!t || t.length > 40) return false;

  const allEmoji =
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|[#*0-9]\ufe0f?\u20e3|\s)+$/u;
  if (!allEmoji.test(t)) return false;

  const hasEmoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\ufe0f?\u20e3/u.test(t);
  if (!hasEmoji) return false;

  return true;
}

/* ---------- Owner resolution ---------- */

function normalizeJid(jid) {
  if (!jid) return "";
  return String(jid).split(":")[0].split("@")[0].replace(/\D/g, "");
}

async function resolveOwnerJid(conn) {
  const raw = (conn?.user?.id || "").split(":")[0].split("@")[0];
  let phone = null;
  try {
    if (getSessionOwnerPhone) phone = await getSessionOwnerPhone(raw || "default");
  } catch {}
  if (!phone && raw) phone = raw;
  const cleaned = String(phone || "").replace(/\D/g, "");
  return cleaned ? `${cleaned}@s.whatsapp.net` : null;
}

async function isOwner(conn, sender) {
  try {
    const ownerJid = await resolveOwnerJid(conn);
    if (!ownerJid) return false;
    return normalizeJid(ownerJid) === normalizeJid(sender);
  } catch {
    return false;
  }
}

/* ---------- Download / forward ---------- */

async function fetchViewOnce(conn, mek, m, from, isGroup) {
  const ctx =
    mek?.message?.extendedTextMessage?.contextInfo ||
    mek?.message?.imageMessage?.contextInfo ||
    mek?.message?.videoMessage?.contextInfo ||
    mek?.message?.documentMessage?.contextInfo ||
    mek?.message?.audioMessage?.contextInfo ||
    m?.quoted ||
    null;

  const quotedMessage = ctx?.quotedMessage || ctx?.message || m?.quoted?.msg;
  const stanzaId = ctx?.stanzaId || ctx?.id;
  const participant = ctx?.participant || ctx?.sender;
  if (!quotedMessage || !stanzaId) return null;

  const clean = unwrapMessage(quotedMessage);
  if (!clean) return null;

  const media = detectMedia(clean);
  if (!media?.node?.mediaKey) return null;

  const key = { remoteJid: from, fromMe: false, id: stanzaId };
  if (isGroup && participant) key.participant = participant;

  let buffer = null;
  try {
    buffer = await downloadMediaMessage(
      { key, message: clean },
      "buffer",
      {},
      { logger: P({ level: "silent" }), reuploadRequest: conn.updateMediaMessage }
    );
  } catch {}
  if ((!buffer || !buffer.length) && m?.quoted?.download) {
    try { buffer = await m.quoted.download(); } catch {}
  }
  if (!buffer || !buffer.length) return null;

  return { buffer, media, stanzaId };
}

async function sendToOwner(conn, sender, isGroup, { buffer, media, stanzaId }) {
  const ownerJid = await resolveOwnerJid(conn);
  if (!ownerJid) return false;

  const filePath = path.join(tempFolder, `vo_${stanzaId}_${Date.now()}${media.ext}`);
  await fs.promises.writeFile(filePath, buffer);

  const caption = [
    `📩 *View Once ${media.type.toUpperCase()}*`,
    `👤 From: @${String(sender || "").split("@")[0]}`,
    `📍 Chat: ${isGroup ? "Group" : "DM"}`,
    media.node?.caption ? `💬 Caption: ${media.node.caption}` : null,
  ].filter(Boolean).join("\n");

  const payload = { caption, mentions: sender ? [sender] : [] };
  if (media.type === "image") payload.image = { url: filePath };
  else if (media.type === "video") payload.video = { url: filePath };
  else if (media.type === "audio") {
    payload.audio = { url: filePath };
    payload.mimetype = media.ptt ? "audio/ogg; codecs=opus" : media.node.mimetype || "audio/mpeg";
    payload.ptt = media.ptt === true;
  }

  try { await conn.sendMessage(ownerJid, payload); } catch { return false; }
  setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 60_000);
  return true;
}

/* ---------- Passive Emoji → Owner Listener (silent, no replies) ---------- */

function setupEmojiListener(conn) {
  if (!conn?.ev || conn.__voEmojiHooked) return;
  conn.__voEmojiHooked = true;

  conn.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const mek = messages?.[0];
    if (!mek?.message) return;

    const from = mek.key?.remoteJid;
    if (!from || from === "status@broadcast") return;

    const t = Object.keys(mek.message)[0];
    let text = null;
    if (t === "conversation") text = mek.message.conversation;
    else if (t === "extendedTextMessage") text = mek.message.extendedTextMessage?.text;
    if (!isEmojiOnly(text)) return;

    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? mek.key.participant : mek.key.remoteJid;

    try {
      const data = await fetchViewOnce(conn, mek, null, from, isGroup);
      if (data) await sendToOwner(conn, sender, isGroup, data);
      // 👆 No reply back on failure OR success — always silent
    } catch {}
  });
}

// Try hooking if a global conn is available
(function tryGlobalHook() {
  const g = globalThis;
  for (const c of [g.conn, g.client, g.sock, g.bot]) {
    if (c?.ev) { setupEmojiListener(c); break; }
  }
})();

/* ---------- .vv Command (OWNER ONLY) ---------- */

cmd(
  {
    pattern: "vv",
    alias: ["viewonce", "vo", "view"],
    desc: "Convert view once media & forward to owner",
    category: "tools",
    react: "🔍",
    filename: __filename,
  },
  async (conn, mek, m, { from, isGroup, reply, sender }) => {
    try {
      setupEmojiListener(conn);

      // 🔒 Owner-only gate
      if (!(await isOwner(conn, sender))) {
        return reply("❌ *Only the bot owner can use this command.*");
      }

      const data = await fetchViewOnce(conn, mek, m, from, isGroup);
      if (!data) return reply("❌ Reply to a view-once message that contains media.");

      const ownerSent = await sendToOwner(conn, sender, isGroup, data);

      const filePath = path.join(tempFolder, `vv_${data.stanzaId}_${Date.now()}${data.media.ext}`);
      await fs.promises.writeFile(filePath, data.buffer);

      const caption = ownerSent
        ? "✅ *View once forwarded to bot owner.*"
        : "⚠️ *Could not determine bot owner number.*";

      if (data.media.type === "image") {
        await conn.sendMessage(from, { image: { url: filePath }, caption }, { quoted: mek });
      } else if (data.media.type === "video") {
        await conn.sendMessage(from, { video: { url: filePath }, caption }, { quoted: mek });
      } else if (data.media.type === "audio") {
        await conn.sendMessage(from, {
          audio: { url: filePath },
          mimetype: data.media.ptt ? "audio/ogg; codecs=opus" : data.media.node.mimetype || "audio/mpeg",
          ptt: data.media.ptt === true,
        }, { quoted: mek });
        await reply(caption);
      }

      setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 60_000);
    } catch (e) {
      reply(`❌ Error: ${e?.message || e}`);
    }
  }
);
