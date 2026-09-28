const { cmd } = require("../command");
const axios = require("axios");

// ── Context Info (Channel Details) ─────────────
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";

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

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n❌ *𝐄𝐑𝐑𝐎𝐑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

cmd({
  pattern: "tts",
  alias: ["aitts", "say", "speak", "voice"],
  react: "🎵",
  desc: "Convert text to AI speech (MP3 Audio)",
  category: "ai",
  filename: __filename,
}, async (sock, mek, m, { from, q }) => {
  try {
    // User දීපු text එක හෝ Reply කරපු message එකේ text එක ගැනීම
    const quotedText = 
      m?.quoted?.text || 
      m?.quoted?.body || 
      mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 
      mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || 
      "";

    const textToSpeech = q ? q.trim() : quotedText.trim();

    if (!textToSpeech) {
      return await sock.sendMessage(from, {
        text: `⊱━━• ✿ •━━━━━• ✿ •━━⊰\n🎵 *𝐀𝐈 𝐓𝐄𝐗𝐓 𝐓𝐎 𝐌𝐏𝟑*\n⊱━━• ✿ •━━━━━• ✿ •━━⊰\n\n📌 *Usage:* \`.tts <text>\`\n💡 *Example:* \`.tts Hello how are you\`\n\nℹ️ _ඔබට ඕනෑම Text Message එකකට Reply කර \`.tts\` ලෙස ලබා දීමටද හැක._`,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });
    }

    await sock.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // API Request
    const apiUrl = `https://api.omegatech.app/api/ai/text2speech-v3`;
    const { data } = await axios.get(apiUrl, {
      params: {
        text: textToSpeech,
        voice: "woman3",
        language: "English",
      },
      timeout: 30000,
    });

    if (!data || !data.success || !data.audio) {
      await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
      return await sendErrorMsg(sock, from, mek, "Failed to generate AI MP3 from the server.");
    }

    await sock.sendMessage(from, { react: { text: "⬆️", key: m.key } });

    // ✅ Standard MP3 Audio එකක් ලෙස යැවීම
    await sock.sendMessage(from, {
      audio: { url: data.audio },
      mimetype: "audio/mpeg",
      ptt: false, // MP3 Audio player එකක් විදිහට යැවීමට false කර ඇත
      fileName: `MALIYA-MD_TTS.mp3`,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("TTS Error:", error.message);
    await sock.sendMessage(from, { react: { text: "❌", key: m.key } });
    await sendErrorMsg(sock, from, mek, "Failed to connect to the Text-to-Speech API.");
  }
});
