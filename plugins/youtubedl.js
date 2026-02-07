const { cmd } = require("../command");
const { ytmp4 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.includes("v=")
      ? (query.split("v=")[1] || "").split("&")[0]
      : query.split("/").pop().split("?")[0];
    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

// download url -> file (stream)
async function downloadToFile(url, outPath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 120000 });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(outPath);
    res.data.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
}

// ffmpeg convert to H.264 + AAC + faststart (seek ok)
async function toMobileMp4(input, output) {
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", input,
      // video: H.264 (baseline-ish) for max compatibility
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      // audio: AAC
      "-c:a", "aac",
      "-b:a", "128k",
      // make MP4 stream/seek friendly
      "-movflags", "+faststart",
      // avoid super high resolution if source weird
      "-vf", "scale='min(854,iw)':-2",
      output
    ];

    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error("ffmpeg failed: " + err.slice(-4000)));
    });
  });
}

cmd(
  {
    pattern: "video",
    alias: ["ytv", "ytmp4"],
    desc: "Download YouTube MP4 (mobile friendly + seek ok)",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    let rawPath, fixedPath;

    try {
      if (!q) return reply("🎬 Send video name or YouTube link");

      reply("🔎 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found");

      const caption =
        `🎬 *${video.title}*\n\n` +
        `👤 Channel: ${video.author?.name || "Unknown"}\n` +
        `⏱ Duration: ${video.timestamp}\n` +
        `👀 Views: ${Number(video.views || 0).toLocaleString()}\n` +
        `📅 Uploaded: ${video.ago}\n` +
        `🔗 ${video.url}`;

      await bot.sendMessage(
        from,
        { image: { url: video.thumbnail }, caption },
        { quoted: mek }
      );

      reply("⬇️ Getting download link...");
      const data = await ytmp4(video.url, { format: "mp4", videoQuality: "360" });
      if (!data?.url) return reply("❌ Failed to get video link");

      rawPath = path.join("./", `${Date.now()}_raw.mp4`);
      fixedPath = path.join("./", `${Date.now()}_mobile.mp4`);

      reply("⬇️ Downloading file...");
      await downloadToFile(data.url, rawPath);

      reply("🛠️ Converting for mobile + seek...");
      await toMobileMp4(rawPath, fixedPath);

      await bot.sendMessage(
        from,
        {
          video: fs.createReadStream(fixedPath),
          mimetype: "video/mp4",
          fileName: (data.filename || "youtube_video").replace(/[\\/:*?"<>|]/g, "") + ".mp4",
          caption: "🎬 YouTube video (mobile friendly)",
        },
        { quoted: mek }
      );

    } catch (e) {
      console.log("YTMP4 FIX ERROR:", e);
      reply("❌ Video convert/send error. (ffmpeg නැතිවූවත් මෙහෙම වෙන්න පුළුවන්)");
    } finally {
      try { if (rawPath && fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch {}
      try { if (fixedPath && fs.existsSync(fixedPath)) fs.unlinkSync(fixedPath); } catch {}
    }
  }
);
