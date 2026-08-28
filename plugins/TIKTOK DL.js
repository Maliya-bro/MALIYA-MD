const { cmd } = require("../command");
const axios = require("axios");

// State Management for Interactive Reply Logic
const pendingTtSearch = {};
const pendingTtUserSearch = {};
const pendingTtUserVideos = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

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

// ===== TIKWM API HELPERS =====

// TikWM Video Search
async function searchTikTokVideos(query, count = 30) {
  const res = await axios.get('https://tikwm.com/api/feed/search', {
    params: { keywords: query, count: count, cursor: 0, HD: 1 },
    headers: HEADERS,
    timeout: 20000,
  });
  
  const data = res.data;
  if (data?.code === 0 && Array.isArray(data?.data?.videos)) {
    return data.data.videos.map((d) => ({
      id: d.id || '',
      title: d.title || 'TikTok Video',
      author: d.author?.nickname || d.author?.unique_id || 'Unknown',
      duration: d.duration || 0,
      url: d.play || d.wmplay || d.hdplay || null,
      images: Array.isArray(d.images) && d.images.length > 0 ? d.images : null
    })).filter(v => v.url || v.images);
  }
  return [];
}

// Search Users via TikWM User Feed / Search
async function searchTikTokUsers(username) {
  const res = await axios.get('https://tikwm.com/api/feed/search', {
    params: { keywords: username, count: 20, cursor: 0 },
    headers: HEADERS,
    timeout: 20000,
  });

  const data = res.data;
  if (data?.code === 0 && Array.isArray(data?.data?.videos)) {
    const userMap = new Map();
    data.data.videos.forEach((v) => {
      if (v.author && v.author.unique_id) {
        if (!userMap.has(v.author.unique_id)) {
          userMap.set(v.author.unique_id, {
            username: v.author.unique_id,
            nickname: v.author.nickname || v.author.unique_id,
            avatar: v.author.avatar || ''
          });
        }
      }
    });
    return Array.from(userMap.values());
  }
  return [];
}

// Get User's Latest Videos
async function getUserVideos(username) {
  const res = await axios.get('https://tikwm.com/api/user/posts', {
    params: { unique_id: username, count: 30, cursor: 0 },
    headers: HEADERS,
    timeout: 20000,
  });

  const data = res.data;
  if (data?.code === 0 && Array.isArray(data?.data?.videos)) {
    return data.data.videos.map((d) => ({
      id: d.id || '',
      title: d.title || 'TikTok Video',
      author: username,
      duration: d.duration || 0,
      url: d.play || d.wmplay || d.hdplay || null,
      images: Array.isArray(d.images) && d.images.length > 0 ? d.images : null
    })).filter(v => v.url || v.images);
  }
  
  // Fallback if user posts endpoint fails: search user unique_id
  return searchTikTokVideos(username, 30);
}

// Generate Search Results Text (10 items per page)
function generateVideoListText(results, startIndex = 0, titleHeader = "ᴛɪᴋᴛᴏᴋ sᴇᴀʀᴄʜ") {
  const endIndex = Math.min(startIndex + 10, results.length);
  let text = `╭〔 🎵 *${titleHeader}* 〕━\n┃\n`;
  text += `┃ 📊 *ʀᴇsᴜʟᴛs:* ${startIndex + 1} - ${endIndex} of ${results.length}\n┃\n`;
  text += `╰━━━───━━━━► ❥\n\n`;

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

// Download & Send Video/Images
async function downloadAndSendVideo(bot, mek, m, reply, from, selectedVideo) {
  await reply("⚙️ *ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ...*\n⏳ *ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...*");
  
  try {
    const caption = 
      `🎵 *${toSmallCaps(selectedVideo.title)}*\n\n` +
      `👤 *ᴀᴜᴛʜᴏʀ:* @${selectedVideo.author}\n` +
      `⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${selectedVideo.duration}s\n\n` +
      `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

    await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

    // Handle Image Slide TikToks
    if (selectedVideo.images && selectedVideo.images.length > 0) {
      for (const imgUrl of selectedVideo.images) {
        await bot.sendMessage(from, { image: { url: imgUrl }, caption }, { quoted: mek });
      }
    } else {
      await bot.sendMessage(
        from,
        {
          video: { url: selectedVideo.url },
          mimetype: "video/mp4",
          caption
        },
        { quoted: mek }
      );
    }

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
    desc: "Search & download TikTok videos by name using TikWM API",
    category: "download",
    react: "🎵",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("📱 *ᴜsᴀɢᴇ:* `.tiktok [video name / query]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.tiktok janiya`");
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });
    await reply("🔍 *sᴇᴀʀᴄʜɪɴɢ ᴛɪᴋᴛᴏᴋ ғᴏʀ ᴠɪᴅᴇᴏs...*");

    try {
      const results = await searchTikTokVideos(q.trim(), 30);

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
    desc: "Search TikTok users and view their videos using TikWM API",
    category: "download",
    react: "👤",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply }) => {
    if (!q) {
      return reply("👤 *ᴜsᴀɢᴇ:* `.ttuser [username / name]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.ttuser janiya`");
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
      text += `╰──────━━━━► ❥\n\n`;

      users.slice(0, 10).forEach((u, i) => {
        const numStr = String(i + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 👤 *${toSmallCaps(u.nickname)}*\n🆔 @${u.username}\n\n`;
      });

      text += `───────────────\n`;
      text += `📌 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴜsᴇʀ ɴᴜᴍʙᴇʀ ᴛᴏ ᴠɪᴇᴡ ᴠɪᴅᴇᴏs*`;

      await reply(text);
    } catch (e) {
      console.log("TTUSER SEARCH ERROR:", e);
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴜsᴇʀs!*");
    }
  }
);

// ===== 3. NUMBER REPLY LISTENER =====
cmd(
  {
    filter: (text, { sender, key }) => {
      if (!sender || (key && key.fromMe)) return false;

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

      if ([11, 21, 31, 41, 51].includes(num)) {
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

      if ([11, 21, 31, 41, 51].includes(num)) {
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
