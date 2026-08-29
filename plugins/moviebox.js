const { cmd, replyHandlers } = require("../command");
const axios = require("axios");

const API_BASE = "https://chama-movie-api.koyeb.app";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";
const DEFAULT_IMAGE = "https://chama-movie-api.koyeb.app/logo.png";
const DEFAULT_FOOTER = `\n\n> 🎭 ᴍᴀʟɪʏᴀ-ᴍᴅ 🎭\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

// Store active sessions: messageId -> session data
const activeMovieboxSessions = new Map();

cmd(
  {
    pattern: "moviebox",
    alias: ["movieboxdl", "mb", "mbdl"],
    desc: "Search and download movies or TV series from MovieBox",
    category: "download",
    react: "🎭",
    filename: __filename,
  },
  async (sock, mek, m, { from, args, reply }) => {
    try {
      if (!args.length) {
        return await reply(
          `*╭───[ ⚠️ ɪɴᴠᴀʟɪᴅ ᴜsᴀɢᴇ ]───*\n│\n├─ 🎭 *Ex:* .moviebox avatar\n├─ 🎭 *Ex:* .mb avengers\n│\n├─ 📝 _Please provide the Movie or TV Series name!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const query = args.join(" ");
      await reply(
        `*╭───[ 🔍 sᴇᴀʀᴄʜɪɴɢ ]───*\n│\n├─ 🎭 *Searching MovieBox...*\n├─ ⚡ _Please wait a moment._\n╰────────────────`
      );

      const searchResponse = await axios.get(
        `${API_BASE}/api/v1/movie/moviebox/search?q=${encodeURIComponent(query)}&api_key=${API_KEY}`
      );
      const searchData = searchResponse.data;

      if (!searchData.status || !searchData.data || searchData.data.length === 0) {
        return await reply(
          `*╭───[ 😞 ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ ]───*\n│\n├─ 🎬 *Query:* _${query}_\n├─ 💡 _Please check spelling and try again!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const results = searchData.data.slice(0, 25);
      let listText = `*╭───[ 🎭 ᴍᴏᴠɪᴇʙᴏx sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛs ]───*\n│\n├─ 🎯 *Query:* _${query}_\n├─ 📊 *Results:* _${results.length} Items_\n│\n├─ *👇 Reply with a Number:* 👇\n│\n`;

      results.forEach((item, index) => {
        const num = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
        const typeIcon = item.type === "tvshows" ? "📺" : "🎥";
        listText += `├─ 📱 *${num}* ➜ ${typeIcon} _${item.title.substring(0, 30)}_\n`;
      });

      listText += `╰────────────────${DEFAULT_FOOTER}`;

      const sentMsg = await sock.sendMessage(from, { text: listText }, { quoted: mek });
      const messageID = sentMsg.key.id;

      // Save search state
      activeMovieboxSessions.set(messageID, {
        step: "SELECT_SEARCH",
        results,
        sender: from,
        timestamp: Date.now(),
      });

      setTimeout(() => activeMovieboxSessions.delete(messageID), 300000);
    } catch (error) {
      console.error("Moviebox command error:", error);
      await reply(
        `*╭───[ ❌ sᴏᴍᴇᴛʜɪɴɢ ᴡʀᴏɴɢ ]───*\n│\n├─ 🚫 _${error.message || "Unknown error"}_\n├─ 🔄 _Please try again later..._\n╰────────────────${DEFAULT_FOOTER}`
      );
    }
  }
);

// ─── MOVIEBOX REPLY HANDLER ───
const movieboxReplyHandler = {
  filter: (body, { sender, from }) => {
    if (!body) return false;
    const num = parseInt(body.trim());
    if (isNaN(num)) return false;

    for (const [key, session] of activeMovieboxSessions) {
      if (session.sender === from && session.step) {
        return true;
      }
    }
    return false;
  },
  function: async (sock, mek, m, { from, body, reply }) => {
    const num = parseInt(body.trim());

    let activeKey = null;
    let sessionData = null;
    for (const [key, session] of activeMovieboxSessions) {
      if (session.sender === from && session.step) {
        activeKey = key;
        sessionData = session;
        break;
      }
    }

    if (!sessionData) return;

    const choiceNum = num - 1;

    // STEP 1: Search Selection
    if (sessionData.step === "SELECT_SEARCH") {
      const { results } = sessionData;

      if (choiceNum < 0 || choiceNum >= results.length) {
        return await reply(
          `*╭───[ ⚠️ ɪɴᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ ]───*\n│\n├─ 🎯 *Range:* _01 - ${results.length}_\n├─ 📝 _Please reply with a valid number!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const selected = results[choiceNum];
      const isTvShow = selected.type === "tvshows";

      // Clean up search session
      activeMovieboxSessions.delete(activeKey);

      if (isTvShow) {
        // ─── TV SERIES FLOW ───
        await reply(
          `*╭───[ ⏳ ғᴇᴛᴄʜɪɴɢ ᴛᴠ sᴇʀɪᴇs ]───*\n│\n├─ 📺 *Fetching TV Series details...*\n├─ ⚡ _Please wait a moment..._\n╰────────────────`
        );

        try {
          const tvResponse = await axios.get(
            `${API_BASE}/api/v1/movie/moviebox/tv/info?q=${encodeURIComponent(selected.link)}&api_key=${API_KEY}`
          );
          const tvData = tvResponse.data;

          if (!tvData.status || !tvData.data) {
            throw new Error("Failed to fetch TV show details");
          }

          const tvInfo = tvData.data;
          const posterUrl = tvInfo.image || selected.image || DEFAULT_IMAGE;

          let detailsText =
            `*╭───[ 📺 ᴛᴠ sᴇʀɪᴇs ᴅᴇᴛᴀɪʟs ]───*\n│\n` +
            `├─ 🖼️ *Title:* ${tvInfo.title}\n` +
            `├─ ⭐ *IMDB:* ${tvInfo.rating || "N/A"}\n` +
            `├─ 📅 *Year:* ${tvInfo.year || "N/A"}\n` +
            `├─ 🕒 *Runtime:* ${tvInfo.duration || "N/A"}\n` +
            `├─ 🌍 *Country:* ${tvInfo.country || "N/A"}\n` +
            `├─ 🎬 *Director:* ${tvInfo.directors || "N/A"}\n` +
            `├─ ⭐ *Stars:* ${tvInfo.stars || "N/A"}\n` +
            `│\n` +
            `├─ 💡 *Sinhala AI Sub Available!*\n` +
            `╰────────────────${DEFAULT_FOOTER}`;

          await sock.sendMessage(
            from,
            {
              image: { url: posterUrl },
              caption: detailsText,
            },
            { quoted: mek }
          );

          const seasons = tvInfo.seasons || [];
          if (seasons.length === 0) {
            throw new Error("No seasons found for this TV Series");
          }

          const activeSeason = seasons[0];
          await reply(
            `*╭───[ 📥 ᴀᴜᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ sᴛᴀʀᴛ ]───*\n│\n├─ 📺 *Season ${activeSeason.season} (${activeSeason.episodes.length} episodes)*\n├─ ⚡ *Downloading consecutively...*\n├─ ⏳ _This may take some time_\n╰────────────────${DEFAULT_FOOTER}`
          );

          let successCount = 0;
          let failCount = 0;

          for (let i = 0; i < activeSeason.episodes.length; i++) {
            const epNum = activeSeason.episodes[i];
            try {
              const epDlRes = await axios.get(
                `${API_BASE}/api/v1/movie/moviebox/tv/dl?q=${encodeURIComponent(selected.link)}&se=${activeSeason.season}&ep=${epNum}&api_key=${API_KEY}`
              );
              const epDlData = epDlRes.data;

              if (epDlData.status && epDlData.data && epDlData.data.length > 0) {
                const videoLinks = epDlData.data.filter((dl) => dl.quality !== "SUB");
                const subLinks = epDlData.data.filter((dl) => dl.quality === "SUB");
                const finalLinkObj = videoLinks[0] || epDlData.data[0];

                await sock.sendMessage(
                  from,
                  {
                    document: { url: finalLinkObj.link || finalLinkObj.url },
                    mimetype: "video/mp4",
                    fileName: `${tvInfo.title} - S${activeSeason.season}E${epNum}.mp4`,
                    caption: `🎬 *${tvInfo.title}*\n\n📺 *Episode:* S${activeSeason.season}E${epNum}\n\n${DEFAULT_FOOTER}`,
                  },
                  { quoted: mek }
                );

                // Send subtitles
                const englishSub = subLinks.find(
                  (s) =>
                    s.title.toLowerCase().includes("english") ||
                    s.title.toLowerCase().includes("en")
                );
                const sinhalaSub = subLinks.find(
                  (s) =>
                    s.title.toLowerCase().includes("sinhala") ||
                    s.title.toLowerCase().includes("si")
                );
                const subsToSend = [];
                if (sinhalaSub) subsToSend.push(sinhalaSub);
                if (englishSub) subsToSend.push(englishSub);
                if (subsToSend.length === 0 && subLinks.length > 0) {
                  subsToSend.push(subLinks[0]);
                }

                for (const sub of subsToSend) {
                  try {
                    const subLang = sub.title
                      .replace("Subtitle - ", "")
                      .replace(` (S${activeSeason.season}E${epNum})`, "")
                      .trim();
                    await sock.sendMessage(
                      from,
                      {
                        document: { url: sub.link || sub.url },
                        mimetype: "text/plain",
                        fileName: `${tvInfo.title} - S${activeSeason.season}E${epNum} - ${subLang}.srt`,
                        caption: `📌 *Subtitle*\n\n🎬 ${tvInfo.title}\n📺 S${activeSeason.season}E${epNum}\n🌐 ${subLang}\n\n${DEFAULT_FOOTER}`,
                      },
                      { quoted: mek }
                    );
                  } catch (subErr) {
                    console.error("Subtitle error:", subErr);
                  }
                }

                successCount++;
              } else {
                failCount++;
              }

              await new Promise((resolve) => setTimeout(resolve, 2500));
            } catch (epError) {
              console.error(`Episode ${epNum} error:`, epError);
              failCount++;
            }
          }

          await reply(
            `*╭───[ ✅ ᴅᴏᴡɴʟᴏᴀᴅ ᴄᴏᴍᴘʟᴇᴛᴇ ]───*\n│\n├─ ✅ *Success:* ${successCount} episodes\n├─ ❌ *Failed:* ${failCount} episodes\n├─ 📺 *Series:* ${tvInfo.title}\n╰────────────────${DEFAULT_FOOTER}`
          );
        } catch (tvError) {
          console.error("TV Series error:", tvError);
          await reply(
            `*╭───[ ❌ ᴇʀʀᴏʀ ]───*\n│\n├─ 🚫 _${tvError.message || "Failed to fetch TV series"}_\n╰────────────────${DEFAULT_FOOTER}`
          );
        }
      } else {
        // ─── MOVIE FLOW ───
        await reply(
          `*╭───[ ⏳ ғᴇᴛᴄʜɪɴɢ ᴍᴏᴠɪᴇ ]───*\n│\n├─ 🎥 *Fetching Movie details...*\n├─ ⚡ _Please wait a moment..._\n╰────────────────`
        );

        try {
          const detailsResponse = await axios.get(
            `${API_BASE}/api/v1/movie/moviebox/info?q=${encodeURIComponent(selected.link)}&api_key=${API_KEY}`
          );
          const detailsData = detailsResponse.data;

          if (!detailsData.status || !detailsData.data) {
            throw new Error("Failed to fetch details");
          }

          const movieInfo = detailsData.data;
          const validDownloads = movieInfo.downloads || [];

          if (validDownloads.length === 0) {
            return await reply(
              `*╭───[ ⚠️ ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅs ]───*\n│\n├─ 😞 _No downloads available for this movie!_\n╰────────────────${DEFAULT_FOOTER}`
            );
          }

          const posterUrl = movieInfo.image || selected.image || DEFAULT_IMAGE;

          let detailsText =
            `*╭─[ 🎥 ᴍᴏᴠɪᴇ ᴅᴇᴛᴀɪʟs ]─*\n│\n` +
            `├─ 🖼️ *Title:* ${movieInfo.title}\n` +
            `├─ ⭐ *IMDB:* ${movieInfo.rating || "N/A"}/10\n` +
            `├─ 🕒 *Runtime:* ${movieInfo.duration || "N/A"}\n` +
            `├─ 📅 *Year:* ${movieInfo.year || "N/A"}\n` +
            `├─ 🌍 *Country:* ${movieInfo.country || "N/A"}\n` +
            `├─ 🎬 *Director:* ${movieInfo.directors || "N/A"}\n` +
            `├─ ⭐ *Stars:* ${movieInfo.stars || "N/A"}\n` +
            `│\n` +
            `├─ 💡 *Sinhala AI Sub Available!*\n` +
            `╰────────────────${DEFAULT_FOOTER}`;

          await sock.sendMessage(
            from,
            {
              image: { url: posterUrl },
              caption: detailsText,
            },
            { quoted: mek }
          );

          let downloadListText = `*╭─[ 📥 ᴅᴏᴡɴʟᴏᴀᴅ ᴏᴘᴛɪᴏɴs ]─*\n│\n`;
          validDownloads.forEach((dl, index) => {
            const numStr = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
            downloadListText += `├─ 📱 *${numStr}* ➜ ${dl.quality} (${dl.size || "N/A"})\n`;
          });
          downloadListText += `│\n├─ *👇 Reply with number to download:* 👇\n╰────────────────${DEFAULT_FOOTER}`;

          const optionsMsg = await sock.sendMessage(
            from,
            { text: downloadListText },
            { quoted: mek }
          );
          const optionsMsgID = optionsMsg.key.id;

          // Save download selection state
          activeMovieboxSessions.set(optionsMsgID, {
            step: "SELECT_DOWNLOAD",
            movieInfo,
            validDownloads,
            sender: from,
            timestamp: Date.now(),
          });

          setTimeout(() => activeMovieboxSessions.delete(optionsMsgID), 300000);
        } catch (detailsError) {
          console.error("Movie details error:", detailsError);
          await reply(
            `*╭──[ ❌ ᴇʀʀᴏʀ ]──*\n│\n├─ 🚫 _${detailsError.message || "Failed to fetch movie details"}_\n╰────────────────${DEFAULT_FOOTER}`
          );
        }
      }
    }

    // STEP 2: Download Selection
    else if (sessionData.step === "SELECT_DOWNLOAD") {
      const { movieInfo, validDownloads } = sessionData;

      if (choiceNum < 0 || choiceNum >= validDownloads.length) {
        return await reply(
          `*╭─[ ⚠️ ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ ]─*\n│\n├─ 🎯 *Range:* _01 - ${validDownloads.length}_\n├─ 📝 _Please reply with a valid number!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const selectedDownload = validDownloads[choiceNum];
      const isSub =
        selectedDownload.quality === "SUB" ||
        selectedDownload.title?.toLowerCase().includes("subtitle") ||
        selectedDownload.quality?.toLowerCase().includes("sub");

      const mimeType = isSub ? "text/plain" : "video/mp4";
      const fileName = isSub
        ? `${movieInfo.title} - Subtitle.srt`
        : `${movieInfo.title} - ${selectedDownload.quality}.mp4`;

      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      try {
        const finalDirectLink = selectedDownload.link || selectedDownload.url;

        if (isSub) {
          await sock.sendMessage(
            from,
            {
              document: { url: finalDirectLink },
              mimetype: mimeType,
              fileName: fileName,
              caption: `📌 *${movieInfo.title} - Subtitle*\n\n*Quality:* ${selectedDownload.quality}\n*Size:* ${selectedDownload.size || "N/A"}\n\n${DEFAULT_FOOTER}`,
            },
            { quoted: mek }
          );
        } else {
          await sock.sendMessage(
            from,
            {
              document: { url: finalDirectLink },
              mimetype: mimeType,
              fileName: fileName,
              caption: `🎬 *${movieInfo.title}*\n\n*Quality:* ${selectedDownload.quality}\n*Size:* ${selectedDownload.size || "N/A"}\n\n${DEFAULT_FOOTER}`,
            },
            { quoted: mek }
          );
        }

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } catch (downloadError) {
        console.error("Download error:", downloadError);
        const fallbackLink = selectedDownload.link || selectedDownload.url;
        await reply(
          `🎬 *${movieInfo.title}*\n\n*Quality:* ${selectedDownload.quality}\n*Size:* ${selectedDownload.size || "N/A"}\n\n📥 *DIRECT DOWNLOAD LINK:*\n${fallbackLink}\n\n${DEFAULT_FOOTER}`
        );
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
      } finally {
        activeMovieboxSessions.delete(activeKey);
      }
    }
  },
};

// Register reply handler
if (Array.isArray(replyHandlers)) {
  replyHandlers.push(movieboxReplyHandler);
}

module.exports = { activeMovieboxSessions };
