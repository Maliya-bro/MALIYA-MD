const { cmd, replyHandlers } = require("../command");
const scraper = require("liyanaarachchi-animeheavenme");
const { readSettings, getCustomImage } = require("../lib/botSettings");

// State Management per Session & User
const pendingAnimeSearch = {};
const pendingAnimeSelection = {};
const lastProcessedMsg = {};

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes
const LOOP_COOLDOWN = 3000;

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";
const DEFAULT_ANIME_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

function getChannelContext() {
  return {
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: CHANNEL_JID,
        newsletterName: CHANNEL_NAME,
        serverMessageId: -1,
      },
    },
  };
}

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingAnimeSearch[k];
  delete pendingAnimeSelection[k];
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

function extractPoster(obj) {
  if (!obj) return "";
  return obj.poster || obj.image || obj.thumbnail || obj.cover || obj.img || "";
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getQuotedStanzaId(mek) {
  return (
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.videoMessage?.contextInfo?.stanzaId ||
    mek?.message?.documentMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

function extractIncomingPayload(body, mek, m) {
  const paramsJson =
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    
  if (paramsJson) {
    const parsed = safeJsonParse(paramsJson);
    if (parsed) {
      const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
      if (btnId) return String(btnId).trim();
    }
  }

  const directId =
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId ||
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    mek?.message?.buttonsResponseMessage?.selectedButtonId;
    
  if (directId) return String(directId).trim();

  const text =
    m?.message?.interactiveResponseMessage?.body?.text ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    mek?.message?.interactiveResponseMessage?.body?.text ||
    mek?.message?.conversation ||
    mek?.message?.extendedTextMessage?.text ||
    body ||
    "";
    
  return String(text).trim();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// 1. ANIME SEARCH COMMAND (.animedl)
// ============================================================
cmd(
  {
    pattern: "animedl",
    alias: ["anime", "animesearch"],
    desc: "Search up to 10 anime and download episodes as document files",
    category: "download",
    react: "🎌",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
    if (!q) {
      return reply(
        "📱 *ᴜsᴀɢᴇ:* `.animedl [anime name]`\n💡 *ᴇxᴀᴍᴘʟᴇ:* `.animedl naruto`"
      );
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

    try {
      let searchResults = await scraper.searchAnime(q.trim());

      if (!searchResults || searchResults.length === 0) {
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        return reply(`❌ *ɴᴏ ᴀɴɪᴍᴇ ғᴏᴜɴᴅ ғᴏʀ:* _${q}_`);
      }

      const k = keyFor(sender, from);
      clearUserSession(k);

      const topResults = searchResults.slice(0, 10);
      const settings = await readSettings(sessionId);
      const btnsOn = !!settings.btns_enabled;

      let headerImg = DEFAULT_ANIME_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "anime_header");
          if (custom && custom.data) headerImg = custom.data;
        } catch (e) {}
      }

      // 🔥 ButtonV2 Search Results Popup List
      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const animeRows = topResults.map((item, index) => ({
            title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 45)}`,
            description: "Click to view anime episodes",
            id: `.ani_select ${index + 1}`
          }));

          const bodyText = `╭━━━〔 🎌 *ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ* 〕━━━\n┃\n┃ 🔍 *Search :* ${q}\n┃ 📊 *Found :* ${topResults.length} Anime(s)\n┃\n╰━━━───────━━━━► ❥\n\n© 2026 MALIYA-MD BOT SYSTEM`;

          const btn = new ButtonV2(bot)
            .setBody(bodyText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(headerImg);

          btn.addRawButton({
            buttonId: "anime_search_list",
            buttonText: { displayText: "🎌 Select Anime" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Available Anime ↯",
                sections: [
                  {
                    title: "🎥 Anime Search Results",
                    rows: animeRows
                  }
                ]
              }),
            },
          });

          btn.addButton("📜 Bot Menu", ".menu");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg?.key?.id) {
            pendingAnimeSearch[k] = {
              results: topResults,
              timestamp: Date.now(),
              expectedMsgId: sentMsg.key.id
            };
            await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
            return;
          }
        } catch (err) {
          console.log("ANIME BUTTON ERROR:", err?.message || err);
        }
      }

      // 🔢 Fallback: Numbered Menu
      let text = `╭━━━〔 🎌 *ᴀɴɪᴍᴇ sᴇᴀʀᴄʜ (ᴍᴀx 10 ʀᴇsᴜʟᴛs)* 〕━━━\n┃\n`;
      text += `┃ 📊 *ғᴏᴜɴᴅ:* ${topResults.length} Anime(s)\n┃\n`;
      text += `╰━━━───────━━━━► ❥\n\n`;

      topResults.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        text += `*[ ${numStr} ]* 🎬 *${toSmallCaps(item.title)}*\n`;
      });

      text += `\n───────────────────\n`;
      text += `📌 *Reply with a number to select one Anime*`;

      const channelMeta = getChannelContext();
      const sentMsg = await bot.sendMessage(from, {
        image: { url: headerImg },
        caption: text,
        ...channelMeta,
      }, { quoted: mek });

      pendingAnimeSearch[k] = {
        results: topResults,
        timestamp: Date.now(),
        expectedMsgId: sentMsg.key.id
      };

      await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
      searchResults = null;
    } catch (e) {
      console.error("ANIME SEARCH ERROR:", e);
      await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      reply("❌ *ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ sᴇᴀʀᴄʜɪɴɢ ᴀɴɪᴍᴇ!*");
    }
  }
);

// ============================================================
// 2. REPLY HANDLER — Anime pick, then Episode pick
// ============================================================
const animeReplyHandler = {
  filter: (text, { sender, from }) => {
    const k = keyFor(sender, from);
    return Boolean(pendingAnimeSearch[k] || pendingAnimeSelection[k]);
  },
  function: async (bot, mek, m, { body, sender, reply, from, sessionId }) => {
    const payload = extractIncomingPayload(body, mek, m);
    if (!payload) return;

    const k = keyFor(sender, from);

    // Loop & Spam Guard
    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === payload && now - lastMsg.time < LOOP_COOLDOWN) {
      return;
    }
    lastProcessedMsg[k] = { text: payload, time: now };

    const quotedId = getQuotedStanzaId(mek);

    // --- STEP 1: ANIME SELECTION FROM SEARCH ---
    if (pendingAnimeSearch[k]) {
      const session = pendingAnimeSearch[k];
      if (quotedId && session.expectedMsgId && quotedId !== session.expectedMsgId) return;

      let num = null;
      if (payload.startsWith(".ani_select ")) {
        num = parseInt(payload.replace(".ani_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        num = parseInt(payload, 10);
      }

      if (num === null || isNaN(num) || num <= 0 || num > session.results.length) return;

      const selectedAnime = session.results[num - 1];
      delete pendingAnimeSearch[k];

      await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

      try {
        let episodes = await scraper.getEpisodes(selectedAnime.link);

        if (!episodes || episodes.length === 0) {
          return reply(`⚠️ *No episodes found for ${selectedAnime.title}.*`);
        }

        const poster = extractPoster(selectedAnime) || DEFAULT_ANIME_IMAGE;
        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        let captionText = `╭━━━〔 🎌 *${toSmallCaps(selectedAnime.title)}* 〕━━━\n┃\n`;
        captionText += `┃ 📥 *Available Episodes:* ${episodes.length}\n┃\n`;
        captionText += `╰━━━───────━━━━► ❥\n\n© 2026 MALIYA-MD BOT SYSTEM`;

        // 🔥 ButtonV2 Episode Selection Popup List
        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const episodeRows = [
              {
                title: "📦 Download ALL Episodes",
                description: `Download all ${episodes.length} episodes sequentially`,
                id: ".ani_ep all"
              },
              ...episodes.map((ep, idx) => ({
                title: `${String(idx + 1).padStart(2, "0")}. ${(ep.name || `Episode ${idx + 1}`).substring(0, 45)}`,
                description: "Download this episode",
                id: `.ani_ep ${idx + 1}`
              }))
            ];

            const btn = new ButtonV2(bot)
              .setBody(captionText)
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(poster);

            btn.addRawButton({
              buttonId: "anime_ep_list",
              buttonText: { displayText: "📥 Select Episodes" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Choose Episode ↯",
                  sections: [
                    {
                      title: "Available Episodes",
                      rows: episodeRows
                    }
                  ]
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentDetailsMsg = await btn.send(from, { quoted: mek });

            if (sentDetailsMsg?.key?.id) {
              pendingAnimeSelection[k] = {
                anime: selectedAnime,
                episodes,
                timestamp: Date.now(),
                expectedMsgId: sentDetailsMsg.key.id
              };
              await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
              return;
            }
          } catch (e) {
            console.log("ANIME DETAILS BUTTON ERROR:", e?.message || e);
          }
        }

        // 🔢 Fallback: Numbered Menu for Episodes
        let fallbackMsg = `╭━━━〔 🎌 *${toSmallCaps(selectedAnime.title)}* 〕━━━\n┃\n`;
        fallbackMsg += `┃ 📥 *Available Episodes:* ${episodes.length}\n┃\n`;
        fallbackMsg += `╰━━━───────━━━► ❥\n\n`;
        fallbackMsg += `*[ 00 ]* 📦 Download ALL Episodes\n`;

        episodes.forEach((ep, idx) => {
          const numStr = String(idx + 1).padStart(2, "0");
          const epName = ep.name || `Episode ${idx + 1}`;
          fallbackMsg += `*[ ${numStr} ]* 📌 ${epName}\n`;
        });

        fallbackMsg += `\n───────────────────\n`;
        fallbackMsg += `💡 *Reply "00" or "all" for ALL episodes.*\n`;
        fallbackMsg += `💡 *Or reply with numbers (e.g., "1,3,5") for specific episodes.*`;

        const channelMeta = getChannelContext();
        const sentDetailsMsg = await bot.sendMessage(from, {
          image: { url: poster },
          caption: fallbackMsg,
          ...channelMeta,
        }, { quoted: mek });

        pendingAnimeSelection[k] = {
          anime: selectedAnime,
          episodes,
          timestamp: Date.now(),
          expectedMsgId: sentDetailsMsg.key.id
        };

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
        episodes = null;
      } catch (e) {
        console.error("ANIME EPISODES ERROR:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`❌ *Failed to fetch episodes for ${selectedAnime.title}.*`);
      }
      return;
    }

    // --- STEP 2: EPISODE SELECTION & DOWNLOAD ---
    if (pendingAnimeSelection[k]) {
      const session = pendingAnimeSelection[k];
      if (quotedId && session.expectedMsgId && quotedId !== session.expectedMsgId) return;

      const { anime, episodes } = session;
      let selectedIndices = [];

      let cmdInput = payload;
      if (cmdInput.startsWith(".ani_ep ")) {
        cmdInput = cmdInput.replace(".ani_ep ", "").trim();
      }

      const lowerInput = cmdInput.toLowerCase();

      if (lowerInput === "0" || lowerInput === "00" || lowerInput === "all") {
        selectedIndices = episodes.map((_, idx) => idx);
      } else {
        const numbers = cmdInput.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));

        numbers.forEach((num) => {
          if (num === 0) {
            episodes.forEach((_, idx) => selectedIndices.push(idx));
          } else if (num >= 1 && num <= episodes.length) {
            selectedIndices.push(num - 1);
          }
        });
      }

      selectedIndices = [...new Set(selectedIndices)].sort((a, b) => a - b);

      if (selectedIndices.length === 0) {
        return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ sᴇʟᴇᴄᴛɪᴏɴ.* Valid Range: 01 - ${String(episodes.length).padStart(2, "0")} (or 00 / all)`);
      }

      delete pendingAnimeSelection[k];

      await reply(`🚀 *sᴛᴀʀᴛɪɴɢ ʙᴀᴛᴄʜ ᴅᴏᴡɴʟᴏᴀᴅ:* ${selectedIndices.length} episode(s) selected...`);

      const channelMeta = getChannelContext();

      for (let i = 0; i < selectedIndices.length; i++) {
        const epIndex = selectedIndices[i];
        const ep = episodes[epIndex];
        const epName = ep.name || `Episode ${epIndex + 1}`;

        try {
          await reply(`⚙️ *[${i + 1}/${selectedIndices.length}] Downloading ${epName}...*`);

          let videoUrl = await scraper.getVideoLink(ep.id, anime.link);

          if (!videoUrl) {
            await reply(`⚠️ *Skipping ${epName}: Extraction failed.*`);
            continue;
          }

          await bot.sendMessage(from, { react: { text: "📥", key: m.key } });

          const cleanTitle = anime.title.replace(/[^\w\s.-]/gi, "").substring(0, 50);
          const cleanEpName = epName.replace(/[^\w\s.-]/gi, "");
          const fileName = `MALIYA-MD ${cleanTitle} - ${cleanEpName}.mp4`;

          const caption =
            `🎌 *${toSmallCaps(anime.title)}*\n` +
            `🎬 *${toSmallCaps(epName)}*\n\n` +
            `👑 *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ*`;

          await bot.sendMessage(
            from,
            {
              document: { url: videoUrl },
              mimetype: "video/mp4",
              fileName: fileName,
              caption: caption,
              ...channelMeta,
            },
            { quoted: mek }
          );

          await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

          videoUrl = null;
          await delay(4000);
        } catch (epErr) {
          console.error(`Error sending ${epName}:`, epErr.message);
          await reply(`❌ *Failed to send ${epName}: ${epErr.message || "Unknown Error"}*`);
        }
      }

      await reply(`🎉 *All Selected Episode Downloads Completed Successfully!*`);
    }
  },
};

if (Array.isArray(replyHandlers)) replyHandlers.push(animeReplyHandler);

// Automatic Session Garbage Collector
setInterval(() => {
  const now = Date.now();
  for (const key in pendingAnimeSearch) {
    if (now - pendingAnimeSearch[key].timestamp > SESSION_TIMEOUT) {
      delete pendingAnimeSearch[key];
    }
  }
  for (const key in pendingAnimeSelection) {
    if (now - pendingAnimeSelection[key].timestamp > SESSION_TIMEOUT) {
      delete pendingAnimeSelection[key];
    }
  }
  for (const key in lastProcessedMsg) {
    if (now - lastProcessedMsg[key].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[key];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = { pendingAnimeSearch, pendingAnimeSelection };
