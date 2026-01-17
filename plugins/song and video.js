const { cmd } = require("../command");
const { ytmp3, ytmp4, tiktok } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");

/* ================= HELPERS ================= */

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.split("v=")[1] || query.split("/").pop();
    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

async function downloadToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}

/* ================= YOUTUBE MP3 (UNCHANGED) ================= */

cmd(
  {
    pattern: "song",
    alias: ["yta", "ytmp3", "yts"],
    desc: "Download YouTube MP3 by name or link using MALIYA-MD",
    category: "download",
    react: "🎶",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎵 Send song name or YouTube link");

      reply("🔎 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found");

      const caption =
        `🎵 *${video.title}*\n\n` +
        `👤 Channel: ${video.author.name}\n` +
        `⏱ Duration: ${video.timestamp}\n` +
        `👀 Views: ${video.views.toLocaleString()}\n` +
        `🔗 ${video.url}`;

      await bot.sendMessage(
        from,
        { image: { url: video.thumbnail }, caption },
        { quoted: mek }
      );

      reply("⬇️ Downloading MP3 using MALIYA-MD...");

      const data = await ytmp3(video.url);
      if (!data?.url) return reply("❌ Failed to download MP3");

      await bot.sendMessage(
        from,
        { audio: { url: data.url }, mimetype: "audio/mpeg" },
        { quoted: mek }
      );
    } catch (e) {
      console.log("YTMP3 ERROR:", e);
      reply("❌ Error while downloading MP3");
    }
  }
);

/* ================= YOUTUBE VIDEO (FINAL FIX 🔥 DOCUMENT METHOD) ================= */

cmd(
  {
    pattern: "video",
    alias: ["ytv", "ytmp4", "vid"],
    desc: "Download YouTube MP4 (safe for Android)",
    category: "download",
    react: "📺",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎬 Send video name or YouTube link");

      reply("🔎 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found");

      const caption =
        `🎬 *${video.title}*\n\n` +
        `👤 Channel: ${video.author.name}\n` +
        `⏱ Duration: ${video.timestamp}\n` +
        `👀 Views: ${video.views.toLocaleString()}\n` +
        `📅 Uploaded: ${video.ago}\n` +
        `🔗 ${video.url}`;

      await bot.sendMessage(
        from,
        { image: { url: video.thumbnail }, caption },
        { quoted: mek }
      );

      reply("⬇️ Downloading video using MALIYA-MD...");

      const data = await ytmp4(video.url, {
        format: "mp4",
        videoQuality: "360",
      });

      if (!data?.url) return reply("❌ Failed to download video");

      reply("⚙️ Processing video (Android safe)...");

      const videoBuffer = await downloadToBuffer(data.url);

      await bot.sendMessage(
        from,
        {
          document: videoBuffer,
          mimetype: "video/mp4",
          fileName: `${video.title}.mp4`,
          caption:
            "🎬 YouTube video download successfully!\n(Android safe mode)\nThanks for using *MALIYA-MD* ❤️",
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("YTMP4 ERROR:", e);
      reply("❌ Error while downloading video");
    }
  }
);

/* ================= TIKTOK (UNCHANGED & WORKING) ================= */

cmd(
  {
    pattern: "tiktok",
    alias: ["tt", "ttdl", "td"],
    desc: "Download TikTok video",
    category: "download",
    react: "🎥",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("📱 Send TikTok link");

      reply("⬇️ Downloading TikTok video using MALIYA-MD...");

      const data = await tiktok(q);
      if (!data?.no_watermark)
        return reply("❌ Failed to download TikTok video");

      const caption =
        `🎵 *${data.title || "TikTok Video"}*\n\n` +
        `👤 Author: ${data.author || "Unknown"}\n` +
        `⏱ Duration: ${data.runtime}s`;

      await bot.sendMessage(
        from,
        { video: { url: data.no_watermark }, caption },
        { quoted: mek }
      );
    } catch (e) {
      console.log("TIKTOK ERROR:", e);
      reply("❌ Error while downloading TikTok video");
    }
  }
);
