const axios = require("axios");
const pkg = require("ruhend-scraper");
const { cmd, replyHandlers } = require("../command");
const { readSettings } = require("../lib/botSettings");

const { fbdown } = pkg;

const HEADERS_DESKTOP = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
};

const pendingFbRequests = Object.create(null);

function keyFor(sender, from) {
  if (from) {
    return from;
  }
  return "";
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
  return null;
}

async function resolveShortUrl(url) {
  let isRedirectUrl = false;
  if (url.includes("fb.watch")) isRedirectUrl = true;
  else if (url.includes("fb.com")) isRedirectUrl = true;
  else if (url.includes("facebook.com/share/")) isRedirectUrl = true;

  if (!isRedirectUrl) return url;

  try {
    const res = await axios.get(url, {
      headers: HEADERS_DESKTOP,
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    if (res.request) {
      if (res.request.res) {
        if (res.request.res.responseUrl) {
          return res.request.res.responseUrl;
        }
      }
    }
    return url;
  } catch {
    return url;
  }
}

function extractVideoUrls(html) {
  const results = { hd: null, sd: null, title: "" };
  const unescape = (s) =>
    s
      .replace(/\\u0025/g, "%")
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, "&");

  let hdMatch = html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/);
  if (!hdMatch) {
    hdMatch = html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/);
  }

  let sdMatch = html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/);
  if (!sdMatch) {
    sdMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
  }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);

  if (hdMatch) results.hd = unescape(hdMatch[1]);
  if (sdMatch) results.sd = unescape(sdMatch[1]);
  if (titleMatch) {
    results.title = titleMatch[1].replace(/&#039;/g, "'").replace(/&amp;/g, "&");
  }

  return results;
}

async function downloadFacebook(targetUrl) {
  const fullUrl = await resolveShortUrl(targetUrl);

  try {
    const data = await fbdown(fullUrl);
    if (data) {
      let hasData = false;
      if (data.hd) hasData = true;
      else if (data.sd) hasData = true;
      else if (data.normal) hasData = true;

      if (hasData) {
        let t = "Facebook Video";
        if (data.title) t = data.title;
        let hdUrl = null;
        if (data.hd) hdUrl = data.hd;
        let sdUrl = null;
        if (data.sd) sdUrl = data.sd;
        else if (data.normal) sdUrl = data.normal;

        return {
          status: true,
          title: t,
          hd: hdUrl,
          sd: sdUrl,
        };
      }
    }
  } catch (e) {}

  try {
    const res = await axios.get(fullUrl, {
      headers: HEADERS_DESKTOP,
      timeout: 12000,
    });
    const parsed = extractVideoUrls(res.data);

    let hasParsed = false;
    if (parsed.hd) hasParsed = true;
    else if (parsed.sd) hasParsed = true;

    if (hasParsed) {
      return {
        status: true,
        title: parsed.title,
        hd: parsed.hd,
        sd: parsed.sd,
      };
    }
  } catch (err) {}

  throw new Error("Video not found or link is private.");
}

/* ================= COMMAND: .fb ================= */

cmd(
  {
    pattern: "fb",
    alias: ["facebook", "fbdl"],
    react: "🎬",
    desc: "Download Facebook HD/SD video",
    category: "download",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, args, q, reply, sessionId }) => {
    try {
      if (!q) {
        return reply(
          "╭━〔 ⚠️ *FACEBOOK DL* 〕━╮\n" +
          "┃ ❌ Please provide a Facebook link.\n" +
          "┃ 💡 *Usage:* `.fb <url>`\n" +
          "╰━━━━━━━━━━━━╯"
        );
      }

      await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const videoData = await downloadFacebook(q);
      const k = keyFor(sender, from);

      const state = {
        createdAt: Date.now(),
        menuMsgId: null,
        data: videoData,
      };

      const cleanTitle = (videoData.title || "Facebook Video").slice(0, 45);

      const caption =
        "╔═══ ≪ • ❈ • ≫ ═══╗\n" +
        "  🍁 *MALIYA FB DL* 🍁\n" +
        "╚═══ ≪ • ❈ • ≫ ═══╝\n\n" +
        `📹 *Title:* ${cleanTitle}...\n\n` +
        "┌❖ 『 Quality Options 』 ❖┐\n" +
        "  [ 01 ] 🎬 *HD Quality (720p)*\n" +
        "  [ 02 ] 📹 *SD Quality (360p)*\n" +
        "└───────────────────┘\n\n" +
        "> 💬 *Swipe & reply with number (1-2) or tap a button below:*";

      let btnsOn = true;
      try {
        const s = await readSettings(sessionId);
        if (s) {
          if (typeof s.btns_enabled !== "undefined") {
            btnsOn = Boolean(s.btns_enabled);
          }
        }
      } catch (e) {}

      // ── 🔘 Native Flow Row Buttons Mode ──
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const btn = new ButtonV2(conn)
            .setBody(caption)
            .setFooter("© 2026 MALIYA-MD BOT SYSTEM");

          btn.addButton("🎬 HD Video", `.fbdown hd_${k}`);
          btn.addButton("📹 SD Video", `.fbdown sd_${k}`);

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg) {
            if (sentMsg.key) {
              if (sentMsg.key.id) {
                state.menuMsgId = sentMsg.key.id;
              }
            }
          }
          pendingFbRequests[k] = state;
          await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
          return;
        } catch (btnErr) {
          console.log("FB BUTTON ERROR:", btnErr?.message || btnErr);
        }
      }

      // ── 🔢 Mobile-Friendly Number Reply Fallback ──
      const sentMsg = await conn.sendMessage(
        from,
        { text: caption },
        { quoted: mek }
      );

      if (sentMsg) {
        if (sentMsg.key) {
          if (sentMsg.key.id) {
            state.menuMsgId = sentMsg.key.id;
          }
        }
      }
      pendingFbRequests[k] = state;
      await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
      console.error("FB COMMAND ERROR:", e);
      return reply("❌ Could not download video. Please check if link is public.");
    }
  }
);

/* ================= INTERNAL BUTTON COMMAND ================= */

cmd(
  {
    pattern: "fbdown",
    filename: __filename,
  },
  async (conn, mek, m, { from, sender, args, reply }) => {
    try {
      const typeWithKey = args[0] || "";
      const type = typeWithKey.split("_")[0];
      const k = keyFor(sender, from);
      const req = pendingFbRequests[k];

      if (!req) return;

      const videoData = req.data;
      await conn.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

      if (type === "hd") {
        const downloadUrl = videoData.hd || videoData.sd;
        if (!downloadUrl) return reply("❌ HD video link not found.");
        return await conn.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            caption: `*🎬 ${(videoData.title || "Facebook Video").slice(0, 50)} (HD)*\n\n> 🍁 Powered by MALIYA-MD`,
          },
          { quoted: mek }
        );
      } else if (type === "sd") {
        const downloadUrl = videoData.sd || videoData.hd;
        if (!downloadUrl) return reply("❌ SD video link not found.");
        return await conn.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            caption: `*📹 ${(videoData.title || "Facebook Video").slice(0, 50)} (SD)*\n\n> 🍁 Powered by MALIYA-MD`,
          },
          { quoted: mek }
        );
      }
    } catch (e) {
      console.error("FBDOWN ERROR:", e);
      return reply("❌ Failed to stream video to chat.");
    }
  }
);

/* ================= NUMBER REPLY HANDLER ================= */

replyHandlers.push({
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const req = pendingFbRequests[k];
    if (!req) return false;

    const num = parseInt(String(text || "").trim(), 10);
    let isNum = false;
    if (!isNaN(num)) {
      if (num >= 1) {
        if (num <= 2) {
          isNum = true;
        }
      }
    }

    const quotedId = getQuotedId(m, mek);
    let isQuoted = false;
    if (quotedId) {
      if (quotedId === req.menuMsgId) {
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
  function: async (conn, mek, m, { from, sender, body, reply }) => {
    const k = keyFor(sender, from);
    const req = pendingFbRequests[k];
    if (!req) return;

    const num = parseInt(String(body || "").trim(), 10);
    const videoData = req.data;

    try {
      await conn.sendMessage(from, { react: { text: "⬇️", key: mek.key } });

      if (num === 1) {
        const downloadUrl = videoData.hd || videoData.sd;
        if (!downloadUrl) return reply("❌ HD video link not found.");
        await conn.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            caption: `*🎬 ${(videoData.title || "Facebook Video").slice(0, 50)} (HD)*\n\n> 🍁 Powered by MALIYA-MD`,
          },
          { quoted: mek }
        );
      } else if (num === 2) {
        const downloadUrl = videoData.sd || videoData.hd;
        if (!downloadUrl) return reply("❌ SD video link not found.");
        await conn.sendMessage(
          from,
          {
            video: { url: downloadUrl },
            caption: `*📹 ${(videoData.title || "Facebook Video").slice(0, 50)} (SD)*\n\n> 🍁 Powered by MALIYA-MD`,
          },
          { quoted: mek }
        );
      }

      delete pendingFbRequests[k];
    } catch (err) {
      console.error("FB REPLY ERROR:", err);
      return reply("❌ Download failed.");
    }
  },
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(pendingFbRequests)) {
    if (now - pendingFbRequests[key].createdAt > 5 * 60 * 1000) {
      delete pendingFbRequests[key];
    }
  }
}, 60000);

module.exports = {};
