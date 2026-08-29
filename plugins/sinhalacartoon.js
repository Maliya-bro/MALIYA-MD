const { cmd, replyHandlers } = require("../command");
const axios = require("axios");

const API_BASE = "https://chama-movie-api.koyeb.app";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";
const DEFAULT_IMAGE = "https://chama-movie-api.koyeb.app/logo.png";
const DEFAULT_FOOTER = `\n\n> 🎭 ᴍᴀʟɪʏᴀ-ᴍᴅ ʟᴇɢᴀᴄʏ ʙʏ\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴀʟɪʏᴀ-ᴍᴅ`;

const cartoonSessions = new Map();

cmd({
  pattern: "cartoon",
  alias: ["sinhalacartoons", "cdl"],
  desc: "Search and download cartoons from Sinhalacartoons",
  category: "download",
  react: "📺",
}, async (sock, mek, m, { from, args, reply }) => {
  if (!args.length) {
    return reply(`*❪ ERROR ❫*\n\n⚠️ *Invalid Usage!*\n\n🎬 *Example:*\n• .cartoon ben 10\n• .sinhalacartoons frozen\n\n📝 _Please provide the Cartoon or Anime name!_${DEFAULT_FOOTER}`);
  }

  const query = args.join(' ');
  await reply(`*❪ SEARCHING ❫*\n\n🔍 *Searching Sinhalacartoons...*\n⚡ _Please wait a moment._`);

  try {
    const searchResponse = await axios.get(`${API_BASE}/api/v1/movie/sinhalacartoons/search?q=${encodeURIComponent(query)}&api_key=${API_KEY}`);
    const searchData = searchResponse.data;

    if (!searchData.status || !searchData.data || searchData.data.length === 0) {
      return reply(`*❪ NO RESULTS ❫*\n\n😞 *No Results Found!*\n\n🎬 *Query:* _${query}_\n💡 *Tip:* _Please check the spelling and try again!_${DEFAULT_FOOTER}`);
    }

    const results = searchData.data.slice(0, 25);
    let listText = `*❪ SEARCH RESULTS ❫*\n\n🎯 *Query:* _${query}_\n📊 *Results:* _${results.length} Items_\n\n*👇 SELECT A NUMBER 👇*\n\n`;
    results.forEach((item, index) => {
      const num = (index + 1) < 10 ? `0${index + 1}` : `${index + 1}`;
      listText += `*${num}* ➜ 📺 _${item.title.substring(0, 30)}_\n`;
    });
    listText += `\n${DEFAULT_FOOTER}`;

    const sentMsg = await sock.sendMessage(from, { text: listText }, { quoted: mek });
    const messageID = sentMsg.key.id;

    cartoonSessions.set(messageID, {
      step: "SELECT_SEARCH",
      results: results,
      sender: from,
      timestamp: Date.now(),
    });

    setTimeout(() => cartoonSessions.delete(messageID), 300000);

  } catch (error) {
    console.error('Sinhalacartoons search error:', error);
    reply(`*❪ SYSTEM ERROR ❫*\n\n❌ *System Error!*\n🚫 _${error.message || 'Unknown error'}_\n\n🔄 _Please try again later..._${DEFAULT_FOOTER}`);
  }
});

const cartoonReplyHandler = {
  filter: (body, { sender, from }) => {
    if (!body) return false;
    const num = parseInt(body.trim());
    if (isNaN(num)) return false;

    for (const [key, session] of cartoonSessions) {
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
    for (const [key, session] of cartoonSessions) {
      if (session.sender === from && session.step) {
        activeKey = key;
        sessionData = session;
        break;
      }
    }

    if (!sessionData) return;

    const choiceNum = num - 1;

    if (sessionData.step === "SELECT_SEARCH") {
      const { results } = sessionData;
      cartoonSessions.delete(activeKey);

      if (choiceNum < 0 || choiceNum >= results.length) {
        return reply(`*❪ INVALID ❫*\n\n⚠️ *Wrong Number!*\n🎯 *Range:* _01 - ${results.length}_\n📝 _Please reply with a valid number!_${DEFAULT_FOOTER}`);
      }

      const selectedItem = results[choiceNum];

      await reply(`*❪ FETCHING ❫*\n\n📺 *Fetching Cartoon Details...*\n⚡ _Please wait..._`);

      try {
        const detailsResponse = await axios.get(`${API_BASE}/api/v1/movie/sinhalacartoons/infodl?q=${encodeURIComponent(selectedItem.link)}&api_key=${API_KEY}`);
        const detailsData = detailsResponse.data;

        if (!detailsData.status || !detailsData.data) throw new Error('Failed to fetch details');

        const cartoonInfo = detailsData.data;
        const validDownloads = cartoonInfo.downloads || [];

        if (validDownloads.length === 0) {
          return reply(`*❪ NO DOWNLOADS ❫*\n\n⚠️ *No Downloads Found!*\n😞 _There are no downloads available for this cartoon!_${DEFAULT_FOOTER}`);
        }

        const detailsText = `*❪ CARTOON DETAILS ❫*\n\n🎬 *${cartoonInfo.title}*\n⭐ 𝗜𝗠𝗗𝗕 ➜ ★ ${cartoonInfo.imdb || cartoonInfo.rating || 'N/A'}\n📅 𝗬𝗲𝗮𝗿 ➜ ${cartoonInfo.year || 'N/A'}\n⏳ 𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻 ➜ ${cartoonInfo.duration || 'N/A'}\n🌍 𝗖ᴏᴜɴ𝘁𝗿ʏ ➜ ${cartoonInfo.country || 'N/A'}\n🎭 𝗚𝗲𝗻𝗿𝗲𝘀 ➜ ${cartoonInfo.genres ? cartoonInfo.genres.join(', ') : 'N/A'}\n🏷️ ➜ ${cartoonInfo.language || 'N/A'}\n🎬 ➜ ${cartoonInfo.director || 'N/A'}\n📝 𝗦𝘁𝗼𝗿𝘆 ➜ ${cartoonInfo.story ? (cartoonInfo.story.length > 250 ? cartoonInfo.story.substring(0, 250) + '...' : cartoonInfo.story) : 'N/A'}\n🗿 ➜ sinhalacartoons.com\n${DEFAULT_FOOTER}`;

        const posterUrl = cartoonInfo.image || selectedItem.image || DEFAULT_IMAGE;
        await sock.sendMessage(from, {
          image: { url: posterUrl },
          caption: detailsText
        }, { quoted: mek });

        // Create download selection session
        const downloadOptionsText = `*❪ DOWNLOADS ❫*\n\n📥 *Select Episode / Quality:*\n\n${validDownloads.map((dl, i) => {
          const numStr = (i + 1) < 10 ? `0${i + 1}` : `${i + 1}`;
          return `*${numStr}* ➜ 💾 _${dl.quality}_ 📁 _${dl.size || 'N/A'}_`;
        }).join('\n')}\n\n*💬 REPLY TO DOWNLOAD 💬*\n📌 _Reply with the number_${DEFAULT_FOOTER}`;

        const downloadOptionsMsg = await sock.sendMessage(from, { text: downloadOptionsText }, { quoted: mek });
        const optionsMsgID = downloadOptionsMsg.key.id;

        cartoonSessions.set(optionsMsgID, {
          step: "SELECT_DOWNLOAD",
          cartoonInfo,
          validDownloads,
          sender: from,
          timestamp: Date.now(),
        });

        setTimeout(() => cartoonSessions.delete(optionsMsgID), 300000);

      } catch (detailsError) {
        console.error('Cartoon details error:', detailsError);
        reply(`*❪ ERROR ❫*\n\n❌ *Cartoon Details Error!*\n🚫 _${detailsError.message}_${DEFAULT_FOOTER}`);
      }
    }

    else if (sessionData.step === "SELECT_DOWNLOAD") {
      const { cartoonInfo, validDownloads } = sessionData;
      cartoonSessions.delete(activeKey);

      if (choiceNum < 0 || choiceNum >= validDownloads.length) {
        return reply(`*❪ INVALID ❫*\n\n⚠️ *Wrong Number!*\n🎯 *Range:* _01 - ${validDownloads.length}_\n📝 _Please reply with a valid number!_${DEFAULT_FOOTER}`);
      }

      const selectedDownload = validDownloads[choiceNum];
      await sock.sendMessage(from, { react: { text: '📥', key: mek.key } });

      try {
        const finalDirectLink = selectedDownload.link;

        await sock.sendMessage(from, {
          document: { url: finalDirectLink },
          mimetype: 'video/mp4',
          fileName: `${cartoonInfo.title} - ${selectedDownload.quality}.mp4`,
          caption: `*❪ CARTOON ❫*\n\n🎭 *${cartoonInfo.title}*\n📌 *Episode:* ${selectedDownload.quality}${DEFAULT_FOOTER}`
        }, { quoted: mek });

        await sock.sendMessage(from, { react: { text: '✅', key: mek.key } });

      } catch (downloadError) {
        console.error('Download error:', downloadError);
        reply(`*❪ ERROR ❫*\n\n❌ *Download Failed!*\n🚫 _${downloadError.message}_${DEFAULT_FOOTER}`);
      }
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(cartoonReplyHandler);
}

module.exports = { cartoonSessions };
