const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

// ============================================================
// ⚙️  CONFIG — CHANGE THIS URL WHEN TRYCLOUDFLARE URL CHANGES
// Priority: process.env.CINESUBZ_API_URL > default below
// ============================================================
const CINESUBZ_API =
  process.env.CINESUBZ_API_URL ||
  "https://tables-stem-exclusion-update.trycloudflare.com";

const BRAND_BASE = "MALIYA-MD";
const DEFAULT_BOT_NAME = "𝙼𝙰𝙻𝙸𝚈𝙰-𝙼𝙳 𝙼𝙸𝙽𝙸";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;
const MAX_RESULTS = 15;
const pendingCineSubz = {};
const lastProcessedMsg = {};

// ============================================================
// HELPERS
// ============================================================
function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingCineSubz[k];
}

function toSmallCaps(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return String(str)
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      return idx !== -1 ? small[idx] : char;
    })
    .join("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    body,
    m?.body,
    m?.text,
    m?.message?.conversation,
    m?.message?.extendedTextMessage?.text,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation,
    mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
  ];
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }
  const p1 =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 =
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
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

async function getThumbnailBuffer(url) {
  const tryUrl = url || DEFAULT_SEARCH_IMAGE;
  try {
    const res = await axios.get(tryUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return await sharp(Buffer.from(res.data))
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 50 })
      .toBuffer();
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(
    from,
    {
      text:
        "⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _" +
        text +
        "_",
      contextInfo: channelContextInfo(),
    },
    { quoted: mek },
  );
}

/* ============================================================
   API CLIENT — all requests go to CINESUBZ_API server
   ============================================================ */
async function apiSearch(query) {
  try {
    const res = await axios.get(`${CINESUBZ_API}/search`, {
      params: { q: query.trim() },
      timeout: 25000,
    });
    return res.data?.results || [];
  } catch (e) {
    console.log("CINESUBZ API SEARCH ERROR:", e?.message || e);
    return [];
  }
}

async function apiMovie(movieUrl) {
  try {
    const res = await axios.get(`${CINESUBZ_API}/movie`, {
      params: { url: movieUrl },
      timeout: 40000,
    });
    return res.data?.details || null;
  } catch (e) {
    console.log("CINESUBZ API MOVIE ERROR:", e?.message || e);
    return null;
  }
}

async function apiStartResolve(directUrl, pageUrl) {
  try {
    const res = await axios.post(
      `${CINESUBZ_API}/start-resolve`,
      { directUrl, pageUrl },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 },
    );
    return res.data?.jobId || null;
  } catch (e) {
    console.log("CINESUBZ API START-RESOLVE ERROR:", e?.message || e);
    return null;
  }
}

async function apiPollStatus(jobId, maxAttempts = 40, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const res = await axios.get(`${CINESUBZ_API}/check-status/${jobId}`, {
        timeout: 10000,
      });
      const data = res.data;
      if (data?.status === "done") {
        return { success: true, links: data.links || [] };
      }
      if (data?.status === "failed") {
        return { success: false, error: data.error || "Resolve failed" };
      }
    } catch (e) {
      if (e?.response?.status === 404) {
        return { success: false, error: "Job expired or not found" };
      }
      // network hiccup — keep polling
    }
  }
  return { success: false, error: "Timeout while resolving download link" };
}

/* ================= COMMAND: .cinesubz ================= */
cmd(
  {
    pattern: "cinesubz",
    alias: ["cinesub", "cs", "cssearch", "film", "movie"],
    react: "🎬",
    desc: "Search and send movies from Cinesubz.co",
    category: "movie",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    try {
      if (!q) {
        return await sock.sendMessage(
          from,
          {
            text: "⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* `.cinesubz <name>`\n💡 *Example:* `.cinesubz spider man`",
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );
      }

      await sock.sendMessage(from, { react: { text: "📺", key: mek.key } });

      const results = await apiSearch(q.trim());
      if (!results || results.length === 0) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `No movies found on CineSubz for "${q}".`,
        );
      }

      const topResults = results.slice(0, MAX_RESULTS).map((r) => ({
        title: r.title,
        url: r.url,
        image: r.image || DEFAULT_SEARCH_IMAGE,
        imdb: r.imdb,
        quality: r.quality,
      }));

      const k = keyFor(sender, from);
      clearUserSession(k);

      const settings = await readSettings(sessionId);
      const btnsOn = !!settings.btns_enabled;
      const botDisplayName = settings?.bot_name?.trim() || DEFAULT_BOT_NAME;

      let searchImg = DEFAULT_SEARCH_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "cinesubz_header");
          if (custom && custom.data) searchImg = custom.data;
        } catch (e) {}
      }

      const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${botDisplayName.toUpperCase()} MOVIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n© 2026 ${BRAND_BASE} SYSTEM`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const movieRows = topResults.map((item, index) => ({
            title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
            description: "Click to view movie qualities",
            id: `.cs_select ${index + 1}`,
          }));

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter(`WaBot by ${botDisplayName}`)
            .setThumbnail(searchImg);

          btn.addRawButton({
            buttonId: "cinesubz_movies_list",
            buttonText: { displayText: "🎬 Select Movie" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "CineSubz Search Results ↯",
                sections: [{ title: "🎥 Available Movies", rows: movieRows }],
              }),
            },
          });

          btn.addButton("📜 Bot Menu", ".menu");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pendingCineSubz[k] = {
              step: 1,
              results: topResults,
              timestamp: Date.now(),
              isProcessing: false,
              expectedMsgId: sentMsg.key.id,
              botDisplayName,
            };
            await sock.sendMessage(from, {
              react: { text: "✅", key: mek.key },
            });
            return;
          }
        } catch (e) {
          console.log("CINESUBZ BUTTONV2 ERROR:", e?.message || e);
        }
      }

      // Numbered Fallback
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *${botDisplayName.toUpperCase()} MOVIES*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${topResults.length}\n\n`;
      topResults.forEach((item, index) => {
        text += `*[ ${String(index + 1).padStart(2, "0")} ]* ➔ *${item.title}*\n`;
      });
      text +=
        "\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*";

      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: searchImg },
          caption: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek },
      );

      pendingCineSubz[k] = {
        step: 1,
        results: topResults,
        timestamp: Date.now(),
        isProcessing: false,
        expectedMsgId: sentMsg.key.id,
        botDisplayName,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (error) {
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(
        sock,
        from,
        mek,
        "Failed to connect to CineSubz API server.",
      );
    }
  },
);

/* ================= REPLY HANDLER ================= */
const csReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineSubz[k];
    if (!pending) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".cs_select ") || t.startsWith(".cs_dl ")) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const max =
      pending.step === 1
        ? pending.results?.length || 0
        : pending.movie?.downloadLinks?.length || 0;
    const isNum = !isNaN(num) && num > 0 && num <= max;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === pending.expectedMsgId;

    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineSubz[k];
    if (!pending || pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let choice = null;

    for (const t of texts) {
      if (t.startsWith(".cs_select ")) {
        choice = parseInt(t.replace(".cs_select ", "").trim(), 10);
        break;
      }
      if (t.startsWith(".cs_dl ")) {
        choice = parseInt(t.replace(".cs_dl ", "").trim(), 10);
        break;
      }
    }

    if (choice === null) {
      const num = parseInt(String(body || "").trim(), 10);
      if (!isNaN(num)) choice = num;
    }

    if (!choice || choice < 1) return;

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (
      lastMsg &&
      lastMsg.text === String(choice) &&
      now - lastMsg.time < LOOP_COOLDOWN
    )
      return;
    lastProcessedMsg[k] = { text: String(choice), time: now };

    const botDisplayName = pending.botDisplayName || DEFAULT_BOT_NAME;

    // ========================================================
    // STEP 1: Movie Pick → fetch qualities via API
    // ========================================================
    if (pending.step === 1) {
      if (choice > pending.results.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const selected = pending.results[choice - 1];
      try {
        const movieInfo = await apiMovie(selected.url);
        if (
          !movieInfo ||
          !movieInfo.downloadLinks ||
          movieInfo.downloadLinks.length === 0
        ) {
          clearUserSession(k);
          return await sendErrorMsg(
            sock,
            from,
            mek,
            "No download links available for this movie.",
          );
        }

        const downloadLinks = movieInfo.downloadLinks.filter((d) => {
          const match = d.quality.match(/([\d.]+)\s*(MB|GB)/i);
          if (match) {
            const size = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            if (unit === "GB") return size <= 2.0;
            if (unit === "MB") return true;
          }
          return true;
        });

        if (downloadLinks.length === 0) {
          clearUserSession(k);
          return await sendErrorMsg(
            sock,
            from,
            mek,
            "No download links found below 2GB.",
          );
        }

        const imgToSend =
          movieInfo.poster ||
          movieInfo.image ||
          selected.image ||
          DEFAULT_SEARCH_IMAGE;

        let qualityBody = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate || selected.imdb)
          qualityBody += `⭐ *IMDb :* ${movieInfo.imdb_rate || selected.imdb}\n`;
        if (movieInfo.duration)
          qualityBody += `⏳ *Duration :* ${movieInfo.duration}\n\n`;
        qualityBody += `Available formats below 2GB are listed. Choose one to start download.\n\n© 2026 ${BRAND_BASE} SYSTEM`;

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const qualityRows = downloadLinks.map((d, i) => ({
              title: `${String(i + 1).padStart(2, "0")}. ${d.quality}`,
              description: `Download ${d.quality}`,
              id: `.cs_dl ${i + 1}`,
            }));

            const btn = new ButtonV2(sock)
              .setBody(qualityBody)
              .setFooter(`WaBot by ${botDisplayName}`)
              .setThumbnail(imgToSend);

            btn.addRawButton({
              buttonId: "cinesubz_quality_list",
              buttonText: { displayText: "📥 Select Quality" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Choose Quality & Size ↯",
                  sections: [
                    { title: "📊 Available Qualities", rows: qualityRows },
                  ],
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentQualityMsg = await btn.send(from, { quoted: mek });

            if (sentQualityMsg?.key?.id) {
              pending.step = 2;
              pending.movie = { metadata: movieInfo, downloadLinks };
              pending.timestamp = Date.now();
              pending.isProcessing = false;
              pending.expectedMsgId = sentQualityMsg.key.id;
              await sock.sendMessage(from, {
                react: { text: "✅", key: mek.key },
              });
              return;
            }
          } catch (e) {
            console.log("CINESUBZ QUALITY BUTTONV2 ERROR:", e?.message || e);
          }
        }

        // Fallback Quality Numbered Menu
        let qualityMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n📥 *𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movieInfo.title)}\n`;
        if (movieInfo.imdb_rate || selected.imdb)
          qualityMsg += `⭐ *IMDb :* ${movieInfo.imdb_rate || selected.imdb}\n`;
        if (movieInfo.duration)
          qualityMsg += `⏳ *Duration :* ${movieInfo.duration}\n\n`;

        downloadLinks.forEach((d, i) => {
          qualityMsg += `*[ ${String(i + 1).padStart(2, "0")} ]* 📊 *${d.quality}*\n`;
        });
        qualityMsg +=
          "\n⊱━━━• ✿ •━━━━• ✿ •━━⊰\n> 💬 *Swipe & Reply this message with a quality number...*";

        const sentQualityMsg = await sock.sendMessage(
          from,
          {
            image: { url: imgToSend },
            caption: qualityMsg,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );

        pending.step = 2;
        pending.movie = { metadata: movieInfo, downloadLinks };
        pending.timestamp = Date.now();
        pending.isProcessing = false;
        pending.expectedMsgId = sentQualityMsg.key.id;

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (error) {
        clearUserSession(k);
        await sendErrorMsg(
          sock,
          from,
          mek,
          "Failed to fetch download links for this movie.",
        );
      }
    }
    // ========================================================
    // STEP 2: Quality Pick → resolve via API (start + poll)
    // ========================================================
    else if (pending.step === 2) {
      if (choice > pending.movie.downloadLinks.length) return;
      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⬆", key: mek.key } });

      const { movie } = pending;
      const selectedLink = movie.downloadLinks[choice - 1];

      clearUserSession(k);
      try {
        // 1️⃣ Start resolve job
        const directUrl = selectedLink.directUrl || selectedLink.pageUrl;
        const jobId = await apiStartResolve(directUrl, selectedLink.pageUrl);

        if (!jobId) {
          const thumbBuffer = await getThumbnailBuffer(
            movie.metadata.poster || movie.metadata.image || DEFAULT_SEARCH_IMAGE,
          );
          let fallbackText = `⊱━━━━━ • ✿ • ━━━━━⊰\n⚠️ *𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐅𝐀𝐈𝐋𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\nℹ️ _Resolve server එකට connect වීමට නොහැකි විය._\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

          if (thumbBuffer) {
            await sock.sendMessage(
              from,
              {
                image: thumbBuffer,
                caption: fallbackText,
                contextInfo: channelContextInfo(),
              },
              { quoted: mek },
            );
          } else {
            await sock.sendMessage(
              from,
              { text: fallbackText, contextInfo: channelContextInfo() },
              { quoted: mek },
            );
          }
          return await sock.sendMessage(from, {
            react: { text: "⚠️", key: mek.key },
          });
        }

        // 2️⃣ Poll until done/failed
        const finalResult = await apiPollStatus(jobId);
        const correctPosterUrl =
          movie.metadata.poster || movie.metadata.image || DEFAULT_SEARCH_IMAGE;
        const thumbBuffer = await getThumbnailBuffer(correctPosterUrl);

        if (
          !finalResult.success ||
          !finalResult.links ||
          finalResult.links.length === 0
        ) {
          let fallbackText = `⊱━━━━━ • ✿ • ━━━━━⊰\n⚠️ *𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐅𝐀𝐈𝐋𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\nℹ️ _${finalResult.error || "Server එකේ ආරක්ෂක හේතූන් මත Bot ට කෙලින්ම Video එක Download කිරීමට නොහැකි විය."}_\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

          if (thumbBuffer) {
            await sock.sendMessage(
              from,
              {
                image: thumbBuffer,
                caption: fallbackText,
                contextInfo: channelContextInfo(),
              },
              { quoted: mek },
            );
          } else {
            await sock.sendMessage(
              from,
              { text: fallbackText, contextInfo: channelContextInfo() },
              { quoted: mek },
            );
          }
          return await sock.sendMessage(from, {
            react: { text: "⚠️", key: mek.key },
          });
        }

        // 3️⃣ Choose best link
        const allLinks = finalResult.links;
        const terracloudLinks = allLinks.filter(
          (link) => link.includes("terracloud") || link.includes("skylines"),
        );
        const pixeldrainLinks = allLinks.filter((link) =>
          link.includes("pixeldrain"),
        );
        const supercloudLinks = allLinks.filter((link) =>
          link.includes("supercloud"),
        );
        const nonTelegramLinks = allLinks.filter(
          (link) => !link.includes("telegram.me") && !link.includes("t.me"),
        );

        const directDownloadUrl =
          terracloudLinks[0] ||
          pixeldrainLinks[0] ||
          supercloudLinks[0] ||
          nonTelegramLinks[0] ||
          null;

        const cleanTitle = movie.metadata.title
          .replace(/[^\w\s.-]/gi, "")
          .substring(0, 50)
          .trim();

        let captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(movie.metadata.title)}\n📊 *Quality :* ${selectedLink.quality}\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        if (directDownloadUrl) {
          const docPayload = {
            document: { url: directDownloadUrl },
            mimetype: "video/mp4",
            fileName: `MALIYA-MD ${cleanTitle}.mp4`,
            caption: captionText,
            contextInfo: channelContextInfo(),
          };
          if (thumbBuffer) docPayload.jpegThumbnail = thumbBuffer;

          await sock.sendMessage(from, docPayload, { quoted: mek });
        } else {
          await sock.sendMessage(
            from,
            { text: captionText, contextInfo: channelContextInfo() },
            { quoted: mek },
          );
        }
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (error) {
        await sendErrorMsg(
          sock,
          from,
          mek,
          `Failed to download movie: ${error.message}`,
        );
      }
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(csReplyHandler);

setInterval(
  () => {
    const now = Date.now();
    for (const k in pendingCineSubz) {
      if (now - pendingCineSubz[k].timestamp > SESSION_TIMEOUT)
        delete pendingCineSubz[k];
    }
    for (const k in lastProcessedMsg) {
      if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN)
        delete lastProcessedMsg[k];
    }
  },
  2.5 * 60 * 1000,
);

module.exports = {};
