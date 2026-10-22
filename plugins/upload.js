const { cmd } = require("../command");
const axios = require("axios");
const FormData = require("form-data");
const { MongoClient } = require("mongodb");

// ============================================================================
// Database & Configuration (Permanent Phone-Based Storage)
// ============================================================================
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://maliya-md:279221@maliya-md.tzrnzrj.mongodb.net/?appName=MALIYA-MD";
const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";
const UPLOADS_COLLECTION = "session_uploads";

const MAX_SINGLE_FILE_SIZE = 70 * 1024 * 1024; // 70 MB
const MAX_DAILY_BYTES = 700 * 1024 * 1024;      // 700 MB
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  cachedDb = client.db(MONGODB_DB);
  return cachedDb;
}

// Phone Number එකෙන් Permanent Target ID එකක් හදා ගැනීම (Bot reconnect කලත් නැති නොවේ)
async function resolvePermanentTargetId(sessionId, sender) {
  const cleanSenderPhone = sender ? String(sender).split("@")[0].replace(/\D/g, "") : null;
  const id = String(sessionId || "default").trim() || "default";

  if (id.startsWith("PHONE::")) return id;

  try {
    const db = await getDb();
    if (id !== "default") {
      const doc = await db.collection("wa_sessions").findOne({ sessionId: id });
      if (doc) {
        if (doc.phone) return `PHONE::${String(doc.phone).replace(/\D/g, "")}`;
        if (doc.botJid) {
          const p = String(doc.botJid).split(":")[0].split("@")[0].replace(/\D/g, "");
          if (p) return `PHONE::${p}`;
        }
      }
    }
  } catch (e) {
    console.log("Session lookup error:", e?.message || e);
  }

  // Session ID එකක් සොයාගත නොහැකි නම් sender ගේ Phone එක භාවිත කරයි
  if (cleanSenderPhone) return `PHONE::${cleanSenderPhone}`;
  return id;
}

// සීමා පරීක්ෂා කිරීම (විනාඩි 5ට 3යි, දිනකට 700MB)
async function verifyUploadLimits(targetId, newSizeBytes) {
  const db = await getDb();
  const col = db.collection(UPLOADS_COLLECTION);

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. විනාඩි 5 තුළ ගොනු 3 සීමාව
  const recentCount = await col.countDocuments({
    sessionId: targetId,
    uploadedAt: { $gte: fiveMinAgo }
  });

  if (recentCount >= 3) {
    return {
      allowed: false,
      message: "විනාඩි 5ක් තුළ උපරිම upload කළ හැක්කේ ගොනු 3ක් පමණි. කරුණාකර සුළු වේලාවකින් නැවත උත්සාහ කරන්න."
    };
  }

  // 2. දිනකට 700 MB සීමාව
  const dailyUploads = await col.aggregate([
    { $match: { sessionId: targetId, uploadedAt: {$gte: startOfDay } } },
    { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" } } }
  ]).toArray();

  const totalUsedBytes = dailyUploads[0]?.totalBytes || 0;
  if (totalUsedBytes + newSizeBytes > MAX_DAILY_BYTES) {
    const remainingMB = Math.max(0, (MAX_DAILY_BYTES - totalUsedBytes) / (1024 * 1024)).toFixed(1);
    return {
      allowed: false,
      message: `දෛනික 700 MB සීමාව ඉක්මවා ඇත. අද දිනට ඉතිරිව ඇත්තේ ${remainingMB} MB පමණි.`
    };
  }

  return { allowed: true };
}

// Upload විස්තර සේව් කිරීම (Permanent target ID එක යටතේ)
async function saveUploadRecord(targetId, data) {
  const db = await getDb();
  await db.collection(UPLOADS_COLLECTION).insertOne({
    sessionId: targetId,
    ...data,
    uploadedAt: new Date()
  });
}

// Helpers
function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1,
    },
  };
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function extractFileId(query = "") {
  let q = String(query).trim();
  if (!q) return null;
  const match = q.match(/onlyfiles\.com\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) return match[1];
  return q.replace(/^https?:\/\//i, "").split("/")[0];
}

/* ============================================================================
   Command 1: .upload (Image/Video/Audio/Doc -> OnlyFiles)
   ============================================================================ */
cmd(
  {
    pattern: "upload",
    alias: ["tourl", "up", "onlyfiles"],
    react: "📤",
    desc: "Upload media/doc to OnlyFiles (Max 70MB)",
    category: "tools",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, sender, sessionId }) => {
    try {
      const quoted = m.quoted ? m.quoted : m;
      const mime = (quoted.msg || quoted).mimetype || "";

      if (!mime) {
        return await reply(
          `╭─[ ⚠️ *${toSmallCaps("NOTICE")}* ]\n│\n├ 🚫 කරුණාකර upload කිරීමට අවශ්‍ය Image, Video හෝ File එකකට *.upload* ලෙස reply කරන්න.\n╰────────────┈➤`
        );
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const buffer = await quoted.download();
      if (!buffer || buffer.length === 0) {
        return await reply("❌ Media ගොනුව බාගත කිරීමට නොහැකි විය. නැවත උත්සාහ කරන්න.");
      }

      const fileSizeBytes = buffer.length;

      if (fileSizeBytes > MAX_SINGLE_FILE_SIZE) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await reply(
          `╭─[ ❌ *${toSmallCaps("FILE TOO LARGE")}* ]\n│\n├ 📦 File Size: *${formatBytes(fileSizeBytes)}*\n├ ⚠️ Limit: *70.00 MB*\n├ 🚫 70 MB ට වඩා අඩු ගොනු පමණක් upload කළ හැක.\n╰──────────────⮞`
        );
      }

      const permanentTargetId = await resolvePermanentTargetId(sessionId, sender);
      const limitCheck = await verifyUploadLimits(permanentTargetId, fileSizeBytes);
      if (!limitCheck.allowed) {
        await sock.sendMessage(from, { react: { text: "🚫", key: mek.key } });
        return await reply(
          `╭─[ 🛑 *${toSmallCaps("LIMIT REACHED")}* ]\n│\n├ ⚠️ ${limitCheck.message}\n╰─────────────┈➤`
        );
      }

      const ext = mime.split("/")[1] ? mime.split("/")[1].split(";")[0] : "bin";
      const fileName = `maliya_${Date.now()}.${ext}`;

      const form = new FormData();
      form.append("file", buffer, { filename: fileName, contentType: mime });
      form.append("expire", "0");

      const response = await axios.post("https://api.onlyfiles.com/v1/upload", form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 180000,
      });

      if (response.data && response.data.status && response.data.data?.file) {
        const fileInfo = response.data.data.file;
        const fullUrl = fileInfo.url.full;
        const shortUrl = fileInfo.url.short;
        const fileId = fileInfo.metadata.id;
        const readableSize = fileInfo.metadata.size?.readable || formatBytes(fileSizeBytes);

        await saveUploadRecord(permanentTargetId, {
          url: fullUrl,
          shortUrl: shortUrl,
          fileId: fileId,
          fileName: fileInfo.metadata?.name || fileName,
          sizeBytes: fileSizeBytes,
          readableSize: readableSize,
          mimeType: mime,
        });

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

        const outputMsg = 
`╭[ 🚀 *${toSmallCaps("FILE UPLOADED")}* ]┈➤
│
├ 🎬 *${toSmallCaps("Name:")}* ${fileName}
├ 📦 *${toSmallCaps("Size:")}* ${readableSize}
├ 📂 *${toSmallCaps("Mime:")}* ${mime}
│
├ 🔗 *${toSmallCaps("Direct URL:")}*
│  ${fullUrl}
│
├ 🌐 *${toSmallCaps("Short URL:")}*
│  ${shortUrl}
│
├ 🆔 *${toSmallCaps("File ID:")}* \`${fileId}\`
│
╰[ 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ ]┈➤`;

        await sock.sendMessage(
          from,
          {
            text: outputMsg,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek }
        );
      } else {
        throw new Error(response.data?.error?.message || "Invalid API response");
      }
    } catch (e) {
      console.log("Upload Error:", e);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      const errMsg = e.response?.data?.error?.message || e.message || "Failed to upload file.";
      return await reply(`╭─[ ❌ *UPLOAD ERROR* ]\n│\n├ 🚫 ${errMsg}\n╰─────────────┈➤`);
    }
  }
);

/* ============================================================================
   Command 2: .listupload (Upload history per permanent account)
   ============================================================================ */
cmd(
  {
    pattern: "listupload",
    alias: ["myfiles", "uploadlist", "myfile"],
    react: "📁",
    desc: "View all permanently uploaded files for your account",
    category: "tools",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, sender, sessionId }) => {
    try {
      const permanentTargetId = await resolvePermanentTargetId(sessionId, sender);
      const db = await getDb();
      const files = await db
        .collection(UPLOADS_COLLECTION)
        .find({ sessionId: permanentTargetId })
        .sort({ uploadedAt: -1 })
        .toArray();

      if (!files || files.length === 0) {
        return await reply(
          `╭─[ 📂 *${toSmallCaps("UPLOAD HISTORY")}* ]\n│\n├ ℹ️ ඔබගේ ගිණුමෙන් තවමත් කිසිදු ගොනුවක් upload කර නොමැත.\n╰─────────────┈➤`
        );
      }

      let text = `╭[ 📂 *${toSmallCaps("ACCOUNT UPLOADS")}* (${files.length}) ]┈➤\n│\n`;

      files.slice(0, 15).forEach((item, index) => {
        const num = String(index + 1).padStart(2, "0");
        const dateStr = item.uploadedAt ? new Date(item.uploadedAt).toISOString().slice(0, 10) : "N/A";
        text += `├ 🏷️ *[${num}]* ${item.fileName || "File"}\n`;
        text += `│  📦 *${toSmallCaps("Size:")}* ${item.readableSize || "Unknown"} | 📅 ${dateStr}\n`;
        text += `│  🆔 \`${item.fileId || "N/A"}\`\n`;
        text += `│  🔗 ${item.shortUrl || item.url}\n│\n`;
      });

      if (files.length > 15) {
        text += `├ ℹ️ *${toSmallCaps(`+${files.length - 15} more files saved in database`)}*\n│\n`;
      }

      text += `╰───[ 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ ]───⮞`;

      await sock.sendMessage(
        from,
        {
          text: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("List Upload Error:", e);
      return await reply("❌ Upload ලැයිස්තුව ලබා ගැනීමේදී දෝෂයක් ඇති විය.");
    }
  }
);

/* ============================================================================
   Command 3: .dlfile <link/id> (Download uploaded file back to WhatsApp)
   ============================================================================ */
cmd(
  {
    pattern: "dlfile",
    alias: ["getfile", "onlydl"],
    react: "📥",
    desc: "Download file from OnlyFiles link or ID",
    category: "tools",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply }) => {
    try {
      if (!q) {
        return await reply(
          `╭─[ ⚠️ *${toSmallCaps("USAGE")}* ]\n│\n├ 💡 *.dlfile <OnlyFiles URL or File ID>*\n╰────────────┈➤`
        );
      }

      const fileId = extractFileId(q);
      if (!fileId) return await reply("❌ වලංගු Link එකක් හෝ File ID එකක් ලබා දෙන්න.");

      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      // 1. Info API එකෙන් Metadata ලබා ගැනීම
      const infoRes = await axios.get(`https://api.onlyfiles.com/v1/file/${fileId}/info`, { timeout: 20000 });
      if (!infoRes.data || !infoRes.data.status || !infoRes.data.data?.file) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await reply("❌ මෙම File එක OnlyFiles සර්වර් වල සොයාගත නොහැකි විය.");
      }

      const fileInfo = infoRes.data.data.file;
      const downloadUrl = fileInfo.url.full;
      const fileName = fileInfo.metadata.name || `file_${fileId}`;
      const fileSize = fileInfo.metadata.size.readable || "Unknown";

      // 2. ගොනුව බාගත කර WhatsApp එකට යැවීම
      const resStream = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 180000,
      });

      const buffer = Buffer.from(resStream.data);
      const mime = resStream.headers["content-type"] || "application/octet-stream";

      await sock.sendMessage(from, { react: { text: "⬆", key: mek.key } });

      const caption = 
`╭─[ 📥 *${toSmallCaps("FILE DOWNLOADED")}* ]┈➤
│
├ 🎬 *${toSmallCaps("Name:")}* ${fileName}
├ 📦 *${toSmallCaps("Size:")}* ${fileSize}
│
╰[ 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ ]┈➤`;

      await sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: mime,
          fileName: fileName,
          caption: caption,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek }
      );

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
      console.log("Dlfile Error:", e);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      const err = e.response?.data?.error?.message || e.message || "Failed to download file.";
      return await reply(`╭─[ ❌ *DOWNLOAD ERROR* ]\n│\n├ 🚫 ${err}\n╰────────────┈➤`);
    }
  }
);

/* ============================================================================
   Command 4: .deletefile <url/id> (Delete link from MongoDB)
   ============================================================================ */
cmd(
  {
    pattern: "deletefile",
    alias: ["delfile", "rmfile"],
    react: "🗑️",
    desc: "Delete saved upload link from database",
    category: "tools",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, reply, sender, sessionId }) => {
    try {
      if (!q) {
        return await reply(
          `╭─[ ⚠️ *${toSmallCaps("USAGE")}* ]\n│\n├ 💡 *.deletefile <URL or File ID>*\n╰──────────────┈➤`
        );
      }

      const input = String(q).trim();
      const fileId = extractFileId(input);
      const permanentTargetId = await resolvePermanentTargetId(sessionId, sender);

      const db = await getDb();
      const col = db.collection(UPLOADS_COLLECTION);

      // Search query: ID එකෙන්, full URL එකෙන් හෝ short URL එකෙන්
      const deleteQuery = {
        sessionId: permanentTargetId,
        $or: [
          { fileId: fileId },
          { url: input },
          { shortUrl: input },
          { url: { $regex: fileId,$options: "i" } },
          { shortUrl: { $regex: fileId,$options: "i" } }
        ]
      };

      const result = await col.deleteOne(deleteQuery);

      if (result.deletedCount > 0) {
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
        return await reply(
          `╭─[ 🗑️ *${toSmallCaps("FILE DELETED")}* ]\n│\n├ ✅ අදාළ ගොනුව database එකෙන් සාර්ථකව ඉවත් කරන ලදී.\n├ 🆔 Target: \`${fileId || input}\`\n╰──────────────⮞`
        );
      } else {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await reply(
          `╭─[ ⚠️ *${toSmallCaps("NOT FOUND")}* ]\n│\n├ 🚫 එම URL එක හෝ File ID එක ඔබගේ ගිණුම යටතේ database එකේ සොයාගත නොහැකි විය.\n╰──────────────⮞`
        );
      }
    } catch (e) {
      console.log("Delete File Error:", e);
      return await reply("❌ File එක database එකෙන් ඉවත් කිරීමේදී දෝෂයක් ඇති විය.");
    }
  }
);
