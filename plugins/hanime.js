const { cmd, replyHandlers } = require("../command");
const axios = require("axios");

const API_BASE = "https://chama-movie-api.koyeb.app";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";
const DEFAULT_IMAGE = "https://chama-movie-api.koyeb.app/logo.png";
const DEFAULT_FOOTER = `\n\n> 🔞 ᴍᴀʟɪʏᴀ-ᴍᴅ ʟᴇɢᴀᴄʏ ʙʏ\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

// Temporary store for active sessions: messageId -> session data
const activeHanimeSessions = new Map();

cmd(
  {
    pattern: "hanime",
    alias: ["hhentai"],
    desc: "Search and download movies or TV shows from Hanime",
    category: "download",
    react: "🎥",
  },
  async (sock, mek, m, { from, args, reply }) => {
    try {
      if (!args.length) {
        return await reply(
          `*╭───[ ⚠️ ɪɴᴠᴀʟɪᴅ ᴜsᴀɢᴇ ]───*\n│\n├─ 🔞 *Ex:* .hanime overflow\n├─ 🔞 *Ex:* .hhentai paihame\n│\n├─ 📝 _Please provide the Hanime title!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const hQuery = args.join(" ");
      await reply(`*╭───[ 🔍 sᴇᴀʀᴄʜɪɴɢ ]───*\n│\n├─ 🔞 *Searching Hanime.tv...*\n├─ ⚡ _Please wait a moment..._\n╰────────────────`);

      const searchResponse = await axios.get(
        `${API_BASE}/api/v1/movie/hanime/search?q=${encodeURIComponent(hQuery)}&api_key=${API_KEY}`
      );
      const searchData = searchResponse.data;

      if (!searchData.status || !searchData.data || searchData.data.length === 0) {
        return await reply(
          `*╭───[ 😞 ɴᴏ ʀᴇsᴜʟᴛs ғᴏᴜɴᴅ ]───*\n│\n├─ 🎬 *Query:* _${hQuery}_\n├─ 💡 _Please check spelling and try again!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const hResults = searchData.data.slice(0, 25);
      let listText = `*╭───[ 🔞 ʜᴀɴɪᴍᴇ sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛs ]───*\n│\n├─ 🎯 *Query:* _${hQuery}_\n├─ 📊 *Results:* _${hResults.length} Items_\n│\n├─ *👇 Reply with a Number:* 👇\n│\n`;

      hResults.forEach((item, index) => {
        const num = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
        listText += `├─ 📱 *${num}* ➜ 🔞 _${item.title.substring(0, 32)}_\n`;
      });

      listText += `╰────────────────${DEFAULT_FOOTER}`;

      const sentMsg = await sock.sendMessage(from, { text: listText }, { quoted: mek });
      const messageID = sentMsg.key.id;

      // Save search state for reply handling
      activeHanimeSessions.set(messageID, {
        step: "SELECT_SEARCH",
        hResults,
        sender: from,
        timestamp: Date.now(),
      });

      // Clear after 5 minutes of inactivity
      setTimeout(() => activeHanimeSessions.delete(messageID), 300000);
    } catch (error) {
      console.error("Hanime command error:", error);
      await reply(
        `*╭───[ ❌ sᴏᴍᴇᴛʜɪɴɢ ᴡʀᴏɴɢ ]───*\n│\n├─ 🚫 _${error.message || "Unknown error"}_\n├─ 🔄 _Please try again later..._\n╰────────────────${DEFAULT_FOOTER}`
      );
    }
  }
);

// ─── REPLY HANDLER FOR SELECTION & DOWNLOAD ───
const hanimeReplyHandler = {
  filter: (body, { sender, from }) => {
    if (!body) return false;
    const num = parseInt(body.trim());
    if (isNaN(num)) return false;
    
    // Check if any active session exists for this chat
    for (const [key, session] of activeHanimeSessions) {
      if (session.sender === from && session.step) {
        return true;
      }
    }
    return false;
  },
  function: async (sock, mek, m, { from, body, reply }) => {
    const num = parseInt(body.trim());
    
    // Find the active session for this chat
    let activeKey = null;
    let sessionData = null;
    for (const [key, session] of activeHanimeSessions) {
      if (session.sender === from && session.step) {
        activeKey = key;
        sessionData = session;
        break;
      }
    }
    
    if (!sessionData) return;

    const choiceNum = num - 1;

    // STEP 1: Process Search Selection -> Show Quality List
    if (sessionData.step === "SELECT_SEARCH") {
      const { hResults } = sessionData;

      if (choiceNum < 0 || choiceNum >= hResults.length) {
        return await reply(
          `*╭───[ ⚠️ ɪɴᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ ]───*\n│\n├─ 🎯 *Range:* _01 - ${hResults.length}_\n├─ 📝 _Please reply with a valid number!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const selectedItem = hResults[choiceNum];

      await reply(
        `*╭───[ ⏳ ғᴇᴛᴄʜɪɴɢ ᴅᴇᴛᴀɪʟs ]───*\n│\n├─ 🔞 *Fetching Hanime details & streams...*\n├─ ⚡ _Please wait a moment..._\n╰────────────────`
      );

      try {
        const detailsResponse = await axios.get(
          `${API_BASE}/api/v1/movie/hanime/infodl?q=${encodeURIComponent(selectedItem.link)}&api_key=${API_KEY}`
        );
        const detailsData = detailsResponse.data;

        if (!detailsData.status || !detailsData.data) {
          throw new Error("Failed to fetch details");
        }

        const videoInfo = detailsData.data;
        const validDownloads = videoInfo.downloads || [];

        if (validDownloads.length === 0) {
          return await reply(
            `*╭───[ ⚠️ ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅs ]───*\n│\n├─ 😞 _No downloads available for this video!_\n╰────────────────${DEFAULT_FOOTER}`
          );
        }

        let downloadsListText = `*╭───[ 🔞 ʜᴀɴɪᴍᴇ ᴠɪᴅᴇᴏ ǫᴜᴀʟɪᴛʏ ]───*\n│\n`;
        downloadsListText += `├─ 🎬 *ᴛɪᴛʟᴇ:* ${videoInfo.title}\n`;
        downloadsListText += `├─ ⭐ *ʀᴀᴛɪɴɢ:* ★ ${videoInfo.rating || "N/A"}\n`;
        downloadsListText += `├─ 📅 *ʏᴇᴀʀ:* ${videoInfo.year || "N/A"}\n`;
        downloadsListText += `├─ 🌍 *ᴄᴏᴜɴᴛʀʏ:* ${videoInfo.country || "N/A"}\n`;
        downloadsListText += `├─ 🎭 *ɢᴇɴʀᴇs:* ${videoInfo.genres ? videoInfo.genres.join(", ") : "N/A"}\n`;
        if (videoInfo.story) {
          downloadsListText += `├─ 📝 *sᴛᴏʀʏ:* ${videoInfo.story.length > 200 ? videoInfo.story.substring(0, 200) + "..." : videoInfo.story}\n`;
        }
        downloadsListText += `│\n`;
        downloadsListText += `├─ *👇 Select Download Quality:* 👇\n│\n`;

        validDownloads.forEach((dl, index) => {
          const numStr = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
          downloadsListText += `├─ 📱 *${numStr}* ➜ 🎬 ${dl.title || dl.name}\n`;
        });

        downloadsListText += `╰────────────────${DEFAULT_FOOTER}`;

        const posterUrl = videoInfo.image || selectedItem.image || DEFAULT_IMAGE;
        const sentDetailsMsg = await sock.sendMessage(
          from,
          {
            image: { url: posterUrl },
            caption: downloadsListText,
          },
          { quoted: mek }
        );

        const detailsMessageID = sentDetailsMsg.key.id;

        // Save download step session
        activeHanimeSessions.set(detailsMessageID, {
          step: "SELECT_DOWNLOAD",
          videoInfo,
          validDownloads,
          posterUrl,
          sender: from,
          timestamp: Date.now(),
        });

        // Clean up previous query state
        activeHanimeSessions.delete(activeKey);

        setTimeout(() => activeHanimeSessions.delete(detailsMessageID), 300000);
      } catch (detailsError) {
        console.error("Hanime details error:", detailsError);
        await reply(
          `*╭───[ ❌ ᴅᴇᴛᴀɪʟs ᴇʀʀᴏʀ ]───*\n│\n├─ 🚫 _${detailsError.message}_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }
    }

    // STEP 2: Process Download Selection -> Send Video Document
    else if (sessionData.step === "SELECT_DOWNLOAD") {
      const { videoInfo, validDownloads, posterUrl } = sessionData;

      if (choiceNum < 0 || choiceNum >= validDownloads.length) {
        return await reply(
          `*╭───[ ⚠️ ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ ]───*\n│\n├─ 🎯 *Range:* _01 - ${validDownloads.length}_\n├─ 📝 _Please reply with a valid download option!_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }

      const selectedDownload = validDownloads[choiceNum];
      const finalDirectLink = selectedDownload.link;

      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });
      await reply(
        `*╭───[ ⬇️ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ]───*\n│\n├─ 🎬 *Downloading MP4 Video...*\n├─ ⚡ _Please wait while video is processing..._\n╰────────────────${DEFAULT_FOOTER}`
      );

      try {
        let jpegThumbnail = undefined;
        try {
          const thumbRes = await axios.get(posterUrl, { responseType: "arraybuffer" });
          jpegThumbnail = Buffer.from(thumbRes.data).toString("base64");
        } catch (err) {}

        const captionText = `*╭───[ 🔞 ʜᴀɴɪᴍᴇ ᴠɪᴅᴇᴏ ]───*\n│\n├─ 🎭 *ᴛɪᴛʟᴇ:* ${videoInfo.title}\n├─ 📊 *ǫᴜᴀʟɪᴛʏ:* ${selectedDownload.title || selectedDownload.name || "720p HD Direct MP4"}\n│\n╰────────────────${DEFAULT_FOOTER}`;

        await sock.sendMessage(
          from,
          {
            document: { url: finalDirectLink },
            mimetype: "video/mp4",
            fileName: `${videoInfo.title} [MALIYA-MD].mp4`,
            caption: captionText,
            jpegThumbnail,
          },
          { quoted: mek }
        );

        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });

        // Cleanup session state
        activeHanimeSessions.delete(activeKey);
      } catch (dlErr) {
        console.error("Hanime download error:", dlErr);
        await reply(
          `*╭───[ ❌ ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ ]───*\n│\n├─ 🚫 _${dlErr.message}_\n╰────────────────${DEFAULT_FOOTER}`
        );
      }
    }
  },
};

// Register the reply handler
if (Array.isArray(replyHandlers)) {
  replyHandlers.push(hanimeReplyHandler);
}

module.exports = { activeHanimeSessions };
