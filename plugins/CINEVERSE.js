const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const DL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  Referer: "https://cineverselk.space/",
  Accept: "*/*",
  Cookie: "cv_auth=true;",
};

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_POSTER = "https://i.ibb.co/3m1bXvt/cineverse.jpg";
const DEFAULT_SEARCH_IMAGE =
  "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingCineVerse = {};
const lastProcessedMsg = {};

function keyFor(sender, from) {
  if (from) {
    return String(from);
  }
  return "";
}

function clearUserSession(k) {
  delete pendingCineVerse[k];
}

function toSmallCaps(str) {
  let input = "";
  if (str) {
    input = String(str);
  }
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const small = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  return input
    .split("")
    .map((char) => {
      const idx = normal.indexOf(char);
      if (idx !== -1) {
        return small[idx];
      }
      return char;
    })
    .join("");
}

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
  if (m && m.quoted && m.quoted.id) {
    return m.quoted.id;
  } else if (
    mek &&
    mek.message &&
    mek.message.extendedTextMessage &&
    mek.message.extendedTextMessage.contextInfo &&
    mek.message.extendedTextMessage.contextInfo.stanzaId
  ) {
    return mek.message.extendedTextMessage.contextInfo.stanzaId;
  } else if (
    m &&
    m.message &&
    m.message.extendedTextMessage &&
    m.message.extendedTextMessage.contextInfo &&
    m.message.extendedTextMessage.contextInfo.stanzaId
  ) {
    return m.message.extendedTextMessage.contextInfo.stanzaId;
  } else if (
    m &&
    m.message &&
    m.message.imageMessage &&
    m.message.imageMessage.contextInfo &&
    m.message.imageMessage.contextInfo.stanzaId
  ) {
    return m.message.imageMessage.contextInfo.stanzaId;
  } else if (
    mek &&
    mek.message &&
    mek.message.imageMessage &&
    mek.message.imageMessage.contextInfo &&
    mek.message.imageMessage.contextInfo.stanzaId
  ) {
    return mek.message.imageMessage.contextInfo.stanzaId;
  } else if (
    m &&
    m.message &&
    m.message.interactiveResponseMessage &&
    m.message.interactiveResponseMessage.contextInfo &&
    m.message.interactiveResponseMessage.contextInfo.stanzaId
  ) {
    return m.message.interactiveResponseMessage.contextInfo.stanzaId;
  } else if (
    mek &&
    mek.message &&
    mek.message.interactiveResponseMessage &&
    mek.message.interactiveResponseMessage.contextInfo &&
    mek.message.interactiveResponseMessage.contextInfo.stanzaId
  ) {
    return mek.message.interactiveResponseMessage.contextInfo.stanzaId;
  }
  return null;
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [];

  if (body) direct.push(body);
  if (m && m.body) direct.push(m.body);
  if (m && m.text) direct.push(m.text);
  if (m && m.message && m.message.conversation) direct.push(m.message.conversation);
  if (m && m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.text)
    direct.push(m.message.extendedTextMessage.text);
  if (m && m.message && m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedButtonId)
    direct.push(m.message.buttonsResponseMessage.selectedButtonId);
  if (m && m.message && m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedDisplayText)
    direct.push(m.message.buttonsResponseMessage.selectedDisplayText);
  if (m && m.message && m.message.listResponseMessage && m.message.listResponseMessage.title)
    direct.push(m.message.listResponseMessage.title);
  if (
    m &&
    m.message &&
    m.message.listResponseMessage &&
    m.message.listResponseMessage.singleSelectReply &&
    m.message.listResponseMessage.singleSelectReply.selectedRowId
  )
    direct.push(m.message.listResponseMessage.singleSelectReply.selectedRowId);
  if (m && m.message && m.message.interactiveResponseMessage && m.message.interactiveResponseMessage.body && m.message.interactiveResponseMessage.body.text)
    direct.push(m.message.interactiveResponseMessage.body.text);
  if (mek && mek.message && mek.message.conversation) direct.push(mek.message.conversation);
  if (mek && mek.message && mek.message.extendedTextMessage && mek.message.extendedTextMessage.text)
    direct.push(mek.message.extendedTextMessage.text);
  if (mek && mek.message && mek.message.buttonsResponseMessage && mek.message.buttonsResponseMessage.selectedButtonId)
    direct.push(mek.message.buttonsResponseMessage.selectedButtonId);
  if (
    mek &&
    mek.message &&
    mek.message.listResponseMessage &&
    mek.message.listResponseMessage.singleSelectReply &&
    mek.message.listResponseMessage.singleSelectReply.selectedRowId
  )
    direct.push(mek.message.listResponseMessage.singleSelectReply.selectedRowId);

  for (const item of direct) {
    if (item) {
      texts.push(String(item).trim());
    }
  }

  let p1 = null;
  if (
    m &&
    m.message &&
    m.message.interactiveResponseMessage &&
    m.message.interactiveResponseMessage.nativeFlowResponseMessage &&
    m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
  ) {
    p1 = m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }

  let p2 = null;
  if (
    mek &&
    mek.message &&
    mek.message.interactiveResponseMessage &&
    mek.message.interactiveResponseMessage.nativeFlowResponseMessage &&
    mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
  ) {
    p2 = mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
  }

  const rawList = [];
  if (p1) rawList.push(p1);
  if (p2) rawList.push(p2);

  for (const raw of rawList) {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id) texts.push(String(parsed.id).trim());
        if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
        if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
        if (parsed.title) texts.push(String(parsed.title).trim());
      } catch (e) {}
    }
  }

  return [...new Set(texts.filter(Boolean))];
}

async function getThumbnailBuffer(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(
    from,
    {
      text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
      contextInfo: channelContextInfo(),
    },
    { quoted: mek },
  );
}

/* ================= COMMAND: .cineverse ================= */
cmd(
  {
    pattern: "cineverse",
    alias: ["cv", "cvlk", "sinhala"],
    react: "🎬",
    desc: "Search and download Sinhala Subbed Movies & Series from Cineverse",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, sessionId }) => {
    try {
      if (!q) {
        return await sock.sendMessage(
          from,
          {
            text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐋*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.cv <name>\`\n💡 *Example:* \`.cv sonic\``,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );
      }

      await sock.sendMessage(from, { react: { text: "🔍", key: mek.key } });

      const cb = Date.now();
      const [mRes, sRes] = await Promise.all([
        axios
          .get(`https://cineverselk.space/movies.json?v=${cb}`, {
            headers: DL_HEADERS,
            timeout: 15000,
          })
          .catch(() => null),
        axios
          .get(`https://cineverselk.space/series.json?v=${cb}`, {
            headers: DL_HEADERS,
            timeout: 15000,
          })
          .catch(() => null),
      ]);

      let movies = [];
      if (mRes && mRes.data) {
        if (mRes.data.data) {
          movies = mRes.data.data;
        } else if (Array.isArray(mRes.data)) {
          movies = mRes.data;
        }
      }

      let series = [];
      if (sRes && sRes.data) {
        if (sRes.data.data) {
          series = sRes.data.data;
        } else if (Array.isArray(sRes.data)) {
          series = sRes.data;
        }
      }

      const allData = [...movies, ...series];

      const queryWords = q
        .toLowerCase()
        .replace(/[^a-z0-9]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      const results = allData
        .filter((item) => {
          if (!item.title) return false;
          const titleClean = item.title
            .toLowerCase()
            .replace(/[^a-z0-9]/g, " ");
          return queryWords.every((word) => titleClean.includes(word));
        })
        .slice(0, 10);

      if (results.length === 0) {
        await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `No results found for "${q}".`,
        );
      }

      const k = keyFor(sender, from);
      clearUserSession(k);

      const settings = await readSettings(sessionId);
      let btnsOn = false;
      if (settings) {
        if (settings.btns_enabled) {
          btnsOn = true;
        }
      }

      let searchImg = DEFAULT_SEARCH_IMAGE;
      if (sessionId) {
        try {
          const custom = await getCustomImage(sessionId, "cineverse_header");
          if (custom) {
            if (custom.data) {
              searchImg = custom.data;
            }
          }
        } catch (e) {}
      }

      const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${results.length}\n\n© 2026 MALIYA-MD BOT SYSTEM`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");

          const cvRows = results.map((item, index) => {
            let type = "🎥 Movie";
            if (item.isSeries) {
              type = "📺 Series";
            }
            let yr = "";
            if (item.year) {
              yr = ` (${item.year})`;
            }
            let rating = "N/A";
            if (item.imdbRating) {
              rating = item.imdbRating;
            }
            let qlt = "1080p";
            if (item.quality) {
              qlt = item.quality;
            }

            return {
              title: `${String(index + 1).padStart(2, "0")}. ${item.title.substring(0, 42)}${yr}`,
              description: `${type} | ⭐ ${rating} | 💽 ${qlt}`,
              id: `.cv_select ${index + 1}`,
            };
          });

          const btn = new ButtonV2(sock)
            .setBody(bodyText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(searchImg);

          btn.addRawButton({
            buttonId: "cineverse_search_list",
            buttonText: { displayText: "🎬 Select Movie / Series" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "CineVerse Search Results ↯",
                sections: [{ title: "🎥 Available Titles", rows: cvRows }],
              }),
            },
          });

          btn.addButton("📜 Bot Menu", ".menu");

          const sentMsg = await btn.send(from, { quoted: mek });

          if (sentMsg && sentMsg.key && sentMsg.key.id) {
            pendingCineVerse[k] = {
              expectedMsgId: sentMsg.key.id,
              results: results,
              timestamp: Date.now(),
              isProcessing: false,
            };
            await sock.sendMessage(from, {
              react: { text: "✅", key: mek.key },
            });
            return;
          }
        } catch (err) {
          let errLog = err;
          if (err && err.message) {
            errLog = err.message;
          }
          console.log("CINEVERSE BUTTONV2 ERROR:", errLog);
        }
      }

      // Numbered Fallback
      let text = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐒𝐄𝐀𝐑𝐂𝐇*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎀 *Search :* ${q}\n🍿 *Results :* ${results.length}\n\n`;
      results.forEach((item, index) => {
        const numStr = String(index + 1).padStart(2, "0");
        let type = "🎥 Movie";
        if (item.isSeries) {
          type = "📺 Series";
        }
        let year = "";
        if (item.year) {
          year = ` (${item.year})`;
        }
        let rating = "N/A";
        if (item.imdbRating) {
          rating = item.imdbRating;
        }
        let qlt = "1080p FHD";
        if (item.quality) {
          qlt = item.quality;
        }
        text += `*[ ${numStr} ]* ➔ *${item.title}*${year}\n   ├ 🏷️ ${type} | ⭐ ${rating}\n   ╰ 💽 ${qlt}\n\n`;
      });
      text += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number to Download...*`;

      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: searchImg },
          caption: text,
          contextInfo: channelContextInfo(),
        },
        { quoted: mek },
      );

      pendingCineVerse[k] = {
        expectedMsgId: sentMsg.key.id,
        results: results,
        timestamp: Date.now(),
        isProcessing: false,
      };

      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    } catch (e) {
      console.error("CineVerse Search Error:", e);
      await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
      await sendErrorMsg(sock, from, mek, "Failed to connect to CineVerse API.");
    }
  },
);

/* ================= REPLY HANDLER ================= */
const cvReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineVerse[k];
    if (!pending) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (t.startsWith(".cv_select ")) return true;
      if (t.startsWith(".cv_ep ")) return true;
    }

    let rawVal = "";
    if (text) {
      rawVal = text;
    }
    const cleanInput = String(rawVal).trim();
    let isNum = false;
    if (/^\d+$/.test(cleanInput)) {       isNum = true;     } else if (/^\d+\s+\d+$/.test(cleanInput)) {
      isNum = true;
    }

    const quotedId = getQuotedId(m, mek);
    let isQuoted = false;
    if (quotedId) {
      if (quotedId === pending.expectedMsgId) {
        isQuoted = true;
      }
    }

    if (isQuoted) {
      return true;
    } else if (isNum) {
      return true;
    }
    return false;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingCineVerse[k];
    if (!pending) return;
    if (pending.isProcessing) return;

    const texts = extractTexts(body, mek, m);
    let payload = "";
    for (const t of texts) {
      if (t.startsWith(".cv_select ")) {
        payload = t;
        break;
      } else if (t.startsWith(".cv_ep ")) {
        payload = t;
        break;
      }
    }
    if (!payload) {
      if (body) {
        payload = String(body).trim();
      } else {
        payload = "";
      }
    }

    const now = Date.now();
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg) {
      if (lastMsg.text === payload) {
        if (now - lastMsg.time < LOOP_COOLDOWN) {
          return;
        }
      }
    }
    lastProcessedMsg[k] = { text: payload, time: now };

    // STEP 1: Title Selection
    if (pending.results) {
      let choice = null;
      if (payload.startsWith(".cv_select ")) {
        choice = parseInt(payload.replace(".cv_select ", "").trim(), 10);
      } else if (/^\d+$/.test(payload)) {
        choice = parseInt(payload, 10);
      }

      if (choice === null) return;
      if (isNaN(choice)) return;
      if (choice < 1) return;
      if (choice > pending.results.length) return;

      pending.isProcessing = true;
      const selected = pending.results[choice - 1];

      // MOVIE DOWNLOAD
      if (!selected.isSeries) {
        clearUserSession(k);
        await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        let dlUrl = "";
        if (selected.directLink) {
          dlUrl = selected.directLink;
        } else if (selected.downloadLink) {
          dlUrl = selected.downloadLink;
        } else if (selected.link) {
          dlUrl = selected.link;
        }

        if (!dlUrl) {
          return await sendErrorMsg(
            sock,
            from,
            mek,
            "Direct download link is not available for this movie.",
          );
        }
        if (dlUrl === "#") {
          return await sendErrorMsg(
            sock,
            from,
            mek,
            "Direct download link is not available for this movie.",
          );
        }

        let qualityStr = "1080p FHD";
        if (selected.quality) {
          qualityStr = selected.quality;
        }

        let detailsMsg = `⊱━━━━━ • ✿ • ━━━━━⊰\n🎬 *𝐂𝐈𝐍𝐄𝐕𝐄𝐑𝐒𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(selected.title)}\n`;
        if (selected.imdbRating) detailsMsg += `⭐ *IMDb :* ${selected.imdbRating}\n`;
        if (selected.duration) detailsMsg += `⏳ *Duration :* ${selected.duration}\n`;
        if (selected.year) detailsMsg += `📅 *Year :* ${selected.year}\n`;
        detailsMsg += `💽 *Quality :* ${qualityStr}\n\n> ⬇️ *Downloading & Uploading Movie File...*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

        let posterUrl = DEFAULT_POSTER;
        if (selected.posterImage) {
          posterUrl = selected.posterImage;
        } else if (selected.image) {
          posterUrl = selected.image;
        } else if (selected.poster) {
          posterUrl = selected.poster;
        }

        await sock.sendMessage(
          from,
          {
            image: { url: posterUrl },
            caption: detailsMsg,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );

        await fastSendVideo(
          sock,
          mek,
          from,
          dlUrl,
          selected.title,
          qualityStr,
          posterUrl,
        );
      }
      // SERIES SELECTION
      else {
        pending.isProcessing = false;
        pending.series = selected;
        delete pending.results;

        let episodesData = {};
        if (selected.episodesData) {
          episodesData = selected.episodesData;
        }
        const seasons = Object.keys(episodesData);

        let poster = DEFAULT_POSTER;
        if (selected.posterImage) {
          poster = selected.posterImage;
        } else if (selected.image) {
          poster = selected.image;
        } else if (selected.poster) {
          poster = selected.poster;
        }

        const settings = await readSettings(sessionId);
        let btnsOn = false;
        if (settings) {
          if (settings.btns_enabled) {
            btnsOn = true;
          }
        }

        if (btnsOn) {
          try {
            const { ButtonV2 } = await import("@vanzxy/baileys");

            const epRows = [];
            for (const sNum of seasons) {
              let epList = {};
              if (episodesData[sNum]) {
                epList = episodesData[sNum];
              }
              for (const eNum of Object.keys(epList)) {
                if (epRows.length >= 25) break;
                let fS = sNum;
                if (parseInt(sNum, 10) < 10) {
                  fS = "0" + sNum;
                }
                let fE = eNum;
                if (parseInt(eNum, 10) < 10) {
                  fE = "0" + eNum;
                }
                epRows.push({
                  title: `Season ${fS} - Episode ${fE}`,
                  description: `Download S${fS}E${fE}`,
                  id: `.cv_ep ${sNum} ${eNum}`,
                });
              }
            }

            let seasonsTxt = "N/A";
            if (seasons.length > 0) {
              seasonsTxt = seasons.join(", ");
            }

            const bodyText = `⊱━━━━━ • ✿ • ━━━━━⊰\n📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Series :* ${toSmallCaps(selected.title)}\n🗂️ *Seasons :* ${seasonsTxt}\n\nChoose an episode from below to start download.\n\n© 2026 MALIYA-MD BOT SYSTEM`;

            const btn = new ButtonV2(sock)
              .setBody(bodyText)
              .setFooter("WaBot by MALIYA-MD Team ツ")
              .setThumbnail(poster);

            btn.addRawButton({
              buttonId: "cineverse_ep_list",
              buttonText: { displayText: "📺 Select Episode" },
              type: 1,
              nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                  title: "Available Episodes ↯",
                  sections: [{ title: "Series Episodes", rows: epRows }],
                }),
              },
            });

            btn.addButton("📜 Bot Menu", ".menu");

            const sentEpMsg = await btn.send(from, { quoted: mek });

            if (sentEpMsg && sentEpMsg.key && sentEpMsg.key.id) {
              pending.expectedMsgId = sentEpMsg.key.id;
              await sock.sendMessage(from, {
                react: { text: "✅", key: mek.key },
              });
              return;
            }
          } catch (err) {
            let errLog = err;
            if (err && err.message) {
              errLog = err.message;
            }
            console.log("CINEVERSE EP BUTTONV2 ERROR:", errLog);
          }
        }

        // Fallback Series Menu
        let seasonsTxt = "N/A";
        if (seasons.length > 0) {
          seasonsTxt = seasons.join(", ");
        }

        let sText = `⊱━━━━━ • ✿ • ━━━━━⊰\n📺 *𝐒𝐄𝐑𝐈𝐄𝐒 𝐒𝐄𝐋𝐄𝐂𝐓𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Series :* ${toSmallCaps(selected.title)}\n🗂️ *Seasons :* ${seasonsTxt}\n\n> 👇 *Swipe & Reply with Season & Episode*\n> 💡 *Example:* \`1 2\` (Season 1, Episode 2)`;

        const sentMsg = await sock.sendMessage(
          from,
          {
            image: { url: poster },
            caption: sText,
            contextInfo: channelContextInfo(),
          },
          { quoted: mek },
        );

        pending.expectedMsgId = sentMsg.key.id;
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      }
    }
    // STEP 2: Episode Download
    else if (pending.series) {
      let s = null;
      let e = null;

      if (payload.startsWith(".cv_ep ")) {
        const parts = payload.replace(".cv_ep ", "").trim().split(/\s+/);
        s = parseInt(parts[0], 10);
        e = parseInt(parts[1], 10);
      } else if (/^\d+\s+\d+$/.test(payload)) {
        const parts = payload.split(/\s+/);
        s = parseInt(parts[0], 10);
        e = parseInt(parts[1], 10);
      }

      if (s === null) return;
      if (e === null) return;
      if (isNaN(s)) return;
      if (isNaN(e)) return;

      const series = pending.series;
      let epData = null;
      if (series.episodesData && series.episodesData[s]) {
        epData = series.episodesData[s][e];
      }

      if (!epData) {
        clearUserSession(k);
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `Download link not found for Season ${s}, Episode ${e}.`,
        );
      }
      if (!epData.d) {
        clearUserSession(k);
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `Download link not found for Season ${s}, Episode ${e}.`,
        );
      }
      if (epData.d === "#") {
        clearUserSession(k);
        return await sendErrorMsg(
          sock,
          from,
          mek,
          `Download link not found for Season ${s}, Episode ${e}.`,
        );
      }

      clearUserSession(k);
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      let fS = String(s);
      if (s < 10) {
        fS = "0" + s;
      }
      let fE = String(e);
      if (e < 10) {
        fE = "0" + e;
      }

      const epTitle = `${series.title} S${fS}E${fE}`;

      let posterUrl = DEFAULT_POSTER;
      if (series.posterImage) {
        posterUrl = series.posterImage;
      } else if (series.image) {
        posterUrl = series.image;
      } else if (series.poster) {
        posterUrl = series.poster;
      }

      let seriesQuality = "1080p FHD";
      if (series.quality) {
        seriesQuality = series.quality;
      }

      await fastSendVideo(
        sock,
        mek,
        from,
        epData.d,
        epTitle,
        seriesQuality,
        posterUrl,
      );
    }
  },
};

/* ================= NATIVE STREAMING PIPELINE ================= */
async function fastSendVideo(sock, mek, from, url, rawTitle, quality, posterUrl) {
  try {
    await sock.sendMessage(from, { react: { text: "⬆", key: mek.key } });

    let titleText = "Movie";
    if (rawTitle) {
      titleText = rawTitle;
    }
    const cleanTitle = titleText
      .replace(/[^\w\s.-]/gi, "")
      .substring(0, 50)
      .trim();

    const captionText = `⊱━━━━━ • ✿ • ━━━━━⊰\n✅ *𝐌𝐎𝐕𝐈𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🎬 *Movie :* ${toSmallCaps(titleText)}\n📊 *Quality :* ${quality}\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    const thumbBuffer = await getThumbnailBuffer(posterUrl);

    const docPayload = {
      document: { url: url },
      mimetype: "video/mp4",
      fileName: `MALIYA-MD ${cleanTitle} (Sinhala Sub).mp4`,
      caption: captionText,
      contextInfo: channelContextInfo(),
    };

    if (thumbBuffer) {
      docPayload.jpegThumbnail = thumbBuffer;
    }

    await sock.sendMessage(from, docPayload, { quoted: mek });
    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (err) {
    let errMsg = "Unknown error";
    if (err && err.message) {
      errMsg = err.message;
    }
    console.error("Cineverse Fast Upload Error:", errMsg);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, `Failed to upload video directly.`);
  }
}

if (Array.isArray(replyHandlers)) replyHandlers.push(cvReplyHandler);

setInterval(() => {
  const now = Date.now();
  for (const k in pendingCineVerse) {
    if (now - pendingCineVerse[k].timestamp > SESSION_TIMEOUT) {
      delete pendingCineVerse[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = {};
