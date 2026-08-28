const { cmd } = require("../command");
const axios = require("axios");

// State Management for Interactive Reply Logic
const pendingTtSearch = {};
const pendingTtUserSearch = {};
const pendingTtUserVideos = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

function clearUserSession(sender) {
  delete pendingTtSearch[sender];
  delete pendingTtUserSearch[sender];
  delete pendingTtUserVideos[sender];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

// ===== API HELPERS =====

async function searchTikTokVideos(query) {
  const url = `https://api.tiklydown.eu.org/api/search?q=${encodeURIComponent(query)}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  if (data && Array.isArray(data.data)) {
    return data.data.map((item) => ({
      title: item.title || "TikTok Video",
      author: item.author?.unique_id || item.author?.nickname || "Unknown",
      duration: item.duration || 0,
      url: item.play || item.wmplay || item.hdplay || item.url
    })).filter(v => v.url);
  }
  return [];
}

async function searchTikTokUsers(username) {
  const url = `https://api.tiklydown.eu.org/api/search/user?q=${encodeURIComponent(username)}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  if (data && Array.isArray(data.data)) {
    return data.data.map((u) => ({
      username: u.unique_id || u.uid,
      nickname: u.nickname || u.unique_id,
      avatar: u.avatar_thumb || u.avatar_medium
    })).filter(u => u.username);
  }
  return [];
}

async function getUserVideos(username) {
  const url = `https://api.tiklydown.eu.org/api/user/posts?unique_id=${encodeURIComponent(username)}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  if (data && Array.isArray(data.data)) {
    return data.data.map((item) => ({
      title: item.title || "TikTok Video",
      author: username,
      duration: item.duration || 0,
      url: item.play || item.wmplay || item.hdplay
    })).filter(v => v.url);
  }
  return [];
}

// Generate Search Results Text (10 items per page)
function generateVideoListText(results, startIndex = 0, titleHeader = "ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ") {
  const endIndex = Math.min(startIndex + 10, results.length);
  let text = `╭〔 🎵 *${titleHeader}* 〕━\n┃\n`;
  text += `┃ 📊 *ʀᴇsᴜʟᴛs:* ${startIndex + 1} - ${endIndex} of ${results.length}\n┃\n`;
  text += `╰━━━───────━━► ❥\n\n`;

  for (let i = startIndex; i < endIndex; i++) {
    const v = results[i];
    const numStr = String(i + 1).padStart(2, "0");
    text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(v.title.slice(0, 45))}*\n👤 @${v.author}\n\n`;
  }

  text += `──────────────\n`;
  text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴠɪᴅᴇᴏ ɴᴜᴍʙᴇʀ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ*\n`;
  if (endIndex < results.length) {
    text += `➡️ *ʀᴇᴘʟʏ ᴡɪᴛʜ "${endIndex + 1}" ᴛᴏ sᴇᴇ ɴᴇxᴛ 10 ʀᴇsᴜʟᴛs*`;
  }
  return text;
}

// Download & Send Video
async function downloadAndSendVideo(bot, mek, m, reply, from, selectedVideo) {
  await reply("⚙️ *ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ...*\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*");
  
  try {
    const caption = 
      `🎵 *${toSmallCaps(selectedVideo.title)}*\n\n` +
      `👤 *ᴀᴜᴛʜᴏʀ:* @${selectedVideo.author}\n` +
      `⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${selectedVideo.duration}s\n\n` +
      `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

    await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

    await bot.sendMessage(
      from,
      {
        video: { url: selectedVideo.url },
        mimetype: "video/mp4",
        caption
      },
      { quoted: mek }
    );

    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
  } catch (err) {
    console.error("TikTok Video Send Error:", err);
    reply("❌ *ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ᴛʜᴇ ᴠɪᴅᴇᴏ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ!*");
  }
}

// ===== 1. TIKTOK VIDEO SEARCH COMMAND (.tiktok / .tt) =====
cmd(
  {
    pattern: "tiktok",
    alias: ["tt", "ttdl", "tdl", "tiktokdl"],
    desc: "Search & download TikTok videos by name",
    category: "download",
    react: "🎵",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("📱 *ᴜsᴀɢᴇ:* `.tiktok [video name / query]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.tiktok sinhala song`");
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ ғᴏʀ ᴠɪᴅᴇᴏs...*");

    try {
      const results = await searchTikTokVideos(q.trim());

      if (!results || results.length === 0) {
        return reply(`❌ *ɴᴏ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      clearUserSession(sender);

      pendingTtSearch[sender] = {
        results,
        timestamp: Date.now()
      };

      await reply(generateVideoListText(results, 0, "ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ"));
    } catch (e) {
      console.log("TIKTOK SEARCH ERROR:", e);
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ!*");
    }
  }
);

// ===== 2. TIKTOK USER SEARCH COMMAND (.ttuser) =====
cmd(
  {
    pattern: "ttuser",
    alias: ["tiktokuser", "ttu"],
    desc: "Search TikTok users and view their videos",
    category: "download",
    react: "👤",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("👤 *ᴜsᴀɢᴇ:* `.ttuser [username / name]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.ttuser maliya`");
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ ᴜsᴇʀs...*");

    try {
      const users = await searchTikTokUsers(q.trim());

      if (!users || users.length === 0) {
        return reply(`❌ *ɴᴏ ᴜsᴇʀs ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      clearUserSession(sender);

      pendingTtUserSearch[sender] = {
        users,
        timestamp: Date.now()
      };

      let text = `╭〔 👤 *ᴛɪᴋᴛᴏᴋ ᴜsᴇʀ sᴇᴀʀᴄʜ* 〕━\n┃\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${users.length} Users\n┃\n`;
      text += `╰━━━───────━► ❥\n\n`;

      users.slice(0, 10).forEach((u, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 👤 *${toSmallCaps(u.nickname)}*\n🆔 @${u.username}\n\n`;
      });

      text += `──────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴜsᴇʀ ɴᴜᴍʙᴇʀ ᴛᴏ ᴠɪᴇᴡ ᴠɪᴅᴇᴏs*`;

      await reply(text);
    } catch (e) {
      console.log("TTUSER SEARCH ERROR:", e);
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴜsᴇʀs!*");
    }
  }
);

// ===== 3. NUMBER REPLY LISTENER (STRICT VALIDATION) =====
cmd(
  {
    filter: (text, { sender, key }) => {
      if (!sender || (key && key.fromMe)) return false;

      // Reply එක strictly Number එකක්ද කියලා බලයි
      const isNumber = /^\d+$/.test(text ? text.trim() : "");
      if (!isNumber) return false;

      return Boolean(
        pendingTtSearch[sender] || 
        pendingTtUserSearch[sender] || 
        pendingTtUserVideos[sender]
      );
    }
  },
  async (bot, mek, m, { body, sender, reply, from }) => {
    const input = body ? body.trim() : "";
    const num = parseInt(input);
    if (isNaN(num)) return;

    // Loop Protection
    const now = Date.now();
    const lastMsg = lastProcessedMsg[sender];
    if (lastMsg && lastMsg.text === input && (now - lastMsg.time) < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[sender] = { text: input, time: now };

    // 1. Handle User Videos Selection/Pagination
    if (pendingTtUserVideos[sender]) {
      const session = pendingTtUserVideos[sender];
      if (num <= 0 || num > session.results.length) return;

      // Pagination Triggers (11, 21, 31, etc.)
      if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
        session.timestamp = Date.now();
        return reply(generateVideoListText(session.results, num - 1, `@${session.username}'s ᴠɪᴅᴇᴏs`));
      }

      const selected = session.results[num - 1];
      clearUserSession(sender);
      return downloadAndSendVideo(bot, mek, m, reply, from, selected);
    }

    // 2. Handle User Selection -> Load Profile Videos
    if (pendingTtUserSearch[sender]) {
      const session = pendingTtUserSearch[sender];
      if (num <= 0 || num > session.users.length) return;

      const selectedUser = session.users[num - 1];
      delete pendingTtUserSearch[sender];

      await reply(`⏳ *ғᴇᴛᴄʜɪɴɢ ᴠɪᴅᴇᴏs ғᴏʀ @${selectedUser.username}...*`);

      try {
        const videos = await getUserVideos(selectedUser.username);

        if (!videos || videos.length === 0) {
          return reply(`❌ *ɴᴏ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ ᴏɴ @${selectedUser.username}'s ᴘʀᴏғɪʟᴇ!*`);
        }

        pendingTtUserVideos[sender] = {
          username: selectedUser.username,
          results: videos,
          timestamp: Date.now()
        };

        return reply(generateVideoListText(videos, 0, `@${selectedUser.username}'s ᴠɪᴅᴇᴏs`));
      } catch (e) {
        console.error("Fetch User Videos Error:", e);
        return reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴠɪᴅᴇᴏs ғᴏʀ @${selectedUser.username}!*`);
      }
    }

    // 3. Handle TikTok General Video Search Pagination/Download
    if (pendingTtSearch[sender]) {
      const session = pendingTtSearch[sender];
      if (num <= 0 || num > session.results.length) return;

      // Pagination Triggers (11, 21, 31, etc.)
      if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
        session.timestamp = Date.now();
        return reply(generateVideoListText(session.results, num - 1, "ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ"));
      }

      const selected = session.results[num - 1];
      clearUserSession(sender);
      return downloadAndSendVideo(bot, mek, m, reply, from, selected);
    }
  }
);

// Session Cleanup Interval
setInterval(() => {
  const now = Date.now();
  for (const s in pendingTtSearch) {
    if (now - pendingTtSearch[s].timestamp > SESSION_TIMEOUT) delete pendingTtSearch[s];
  }
  for (const s in pendingTtUserSearch) {
    if (now - pendingTtUserSearch[s].timestamp > SESSION_TIMEOUT) delete pendingTtUserSearch[s];
  }
  for (const s in pendingTtUserVideos) {
    if (now - pendingTtUserVideos[s].timestamp > SESSION_TIMEOUT) delete pendingTtUserVideos[s];
  }
  for (const s in lastProcessedMsg) {
    if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
  }
}, 2.5 * 60 * 1000);
