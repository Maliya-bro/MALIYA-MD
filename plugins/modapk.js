const { cmd, replyHandlers } = require("../command");
const axios = require("axios");

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/Gemini_Generated_Image_xmzfzfxmzfzfxmzf.jpg?raw=true";

const SESSION_TIMEOUT = 5 * 60 * 1000;
const pendingAn1 = {};

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
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

// ── 1. Search Command ──────────────────────────────────────────
cmd({
  pattern: "an1",
  alias: ["modgame", "modapk"],
  desc: "Unlimited money MOD Android games and tools",
  category: "download",
  react: "🎮",
  filename: __filename,
}, async (sock, mek, m, { from, q, sender }) => {
  try {
    if (!q) {
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n🎮 *𝐌𝐎𝐃 𝐆𝐀𝐌𝐄𝐒 (𝐀𝐍𝟏)*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n📌 *Usage:* \`.an1 <game name>\`\n💡 *Example:*\n• \`.an1 shadow fight 2\`\n• \`.an1 subway surfers\`\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "🔍", key: m.key } });

    const API_BASE = "https://api.chamindu.site";
    const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2"; // API Key is kept functional

    const res = await axios.get(`${API_BASE}/api/v1/games/an1/search?q=${encodeURIComponent(q.trim())}&api_key=${API_KEY}`);
    const results = res.data.data || [];

    if (!results.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sock.sendMessage(from, {
        text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *𝐍𝐎 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n😞 _No MOD Games Found for:_ *${q}*\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }

    const k = makePendingKey(sender, from);
    pendingAn1[k] = {
      results: results.slice(0, 15),
      timestamp: Date.now(),
      isProcessing: false
    };

    let listText = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
    listText += `🎮 *𝐀𝐍𝟏 𝐌𝐎𝐃 𝐆𝐀𝐌𝐄𝐒*\n`;
    listText += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
    listText += `🎯 *Search :* _${q}_\n`;
    listText += `📊 *Total :* _${pendingAn1[k].results.length} Games_\n\n`;

    pendingAn1[k].results.forEach((item, index) => {
      const numStr = String(index + 1).padStart(2, "0");
      listText += `*[ ${numStr} ]* ➔ 🎮 *${(item.title || 'Game').substring(0, 40)}*\n`;
    });

    listText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 👇 *Reply with a number to get MOD download link...*`;

    await sock.sendMessage(from, { 
      image: { url: DEFAULT_IMAGE }, 
      caption: listText,
      contextInfo: channelContextInfo()
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (err) {
    console.error("AN1 Search Error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sock.sendMessage(from, { 
        text: `❌ *Error:* Failed to search games. API might be offline.`,
        contextInfo: channelContextInfo()
    }, { quoted: mek });
  }
});

// ── 2. Reply Handler ───────────────────────────────────────────
const an1ReplyHandler = {
  filter: (text, { sender, from }) => {
    if (!text) return false;
    const k = makePendingKey(sender, from);
    return !!pendingAn1[k];
  },
  function: async (sock, mek, m, { body, sender, from }) => {
    const input = String(body || "").trim();
    if (!input || !/^\d+$/.test(input)) return;

    const k = makePendingKey(sender, from);
    const pending = pendingAn1[k];
    if (!pending || pending.isProcessing) return;

    const choice = parseInt(input, 10);
    if (choice < 1 || choice > pending.results.length) return;

    pending.isProcessing = true;
    await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const selectedGame = pending.results[choice - 1];
    delete pendingAn1[k]; // Clear session

    const API_BASE = "https://api.chamindu.site";
    const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";

    try {
      const infoRes = await axios.get(`${API_BASE}/api/v1/games/an1/info?url=${encodeURIComponent(selectedGame.link)}&api_key=${API_KEY}`);
      const gameData = infoRes.data.data || {};
      const dlLink = gameData.download_link || gameData.link || selectedGame.link;

      let an1Text = `⊱━━━━━ • ✿ • ━━━━━⊰\n`;
      an1Text += `✅ *𝐌𝐎𝐃 𝐆𝐀𝐌𝐄 𝐃𝐄𝐓𝐀𝐈𝐋𝐒*\n`;
      an1Text += `⊱━━━━━ • ✿ • ━━━━━⊰\n\n`;
      an1Text += `🎮 *Game :* ${gameData.title || selectedGame.title}\n`;
      an1Text += `⚡ *Status :* MOD Unlocked (Unlimited Money)\n\n`;
      an1Text += `📥 *DOWNLOAD LINK:*\n🔗 ${dlLink}\n\n`;
      an1Text += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

      const imgUrl = gameData.image || selectedGame.image || DEFAULT_IMAGE;

      await sock.sendMessage(from, {
        image: { url: imgUrl },
        caption: an1Text,
        contextInfo: channelContextInfo()
      }, { quoted: mek });

      await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (infoErr) {
      console.error("AN1 Info Error:", infoErr);
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      await sock.sendMessage(from, { 
        text: `❌ *Error:* Failed to fetch download link.`,
        contextInfo: channelContextInfo()
      }, { quoted: mek });
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(an1ReplyHandler);
}

// Memory Cleanup
setInterval(() => {
  const now = Date.now();
  for (const k in pendingAn1) {
    if (now - pendingAn1[k].timestamp > SESSION_TIMEOUT) {
      delete pendingAn1[k];
    }
  }
}, 2.5 * 60 * 1000);
