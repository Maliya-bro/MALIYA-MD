const { readSettings } = require("../lib/botSettings");

// 70+ random emojis for reactions
const REACT_EMOJIS = [
  "😂", "🤣", "😍", "🥰", "😎", "🤔", "😭", "😱", "🔥", "💀",
  "🥺", "😊", "😈", "👻", "🤖", "😤", "🥳", "🤯", "😨", "🥶",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💕", "💞", "💓",
  "👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "🤙", "💪", "🖕",
  "🙏", "💅", "✨", "⭐", "🌟", "💫", "⚡", "🎉", "🎊", "🥳",
  "🎈", "🎯", "🏆", "💯", "🔞", "❓", "❗", "💢", "🐱", "🐶",
  "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐸", "🍿", "🍕",
  "🍔", "🌮", "🍩", "🍪", "☕", "🍺", "👀", "👁️", "💩", "👽"
];

// Track recently reacted messages to avoid spam
const reactedMessages = new Set();

// Clear reacted messages every 2 seconds
setInterval(() => {
  reactedMessages.clear();
}, 2000);

function getRandomEmoji() {
  return REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
}

module.exports = {
  onMessage: async (sock, mek, m, context) => {
    try {
      // Get settings
      const settings = readSettings();
      
      // Check if auto react is enabled
      if (!settings.auto_react_msg) {
        return;
      }
      
      // Don't react to bot's own messages
      if (mek.key.fromMe) {
        return;
      }
      
      // Don't react to status messages
      if (mek.message?.protocolMessage) {
        return;
      }
      
      // Don't react to reactions
      if (mek.message?.reactionMessage) {
        return;
      }
      
      // Prevent duplicate reactions
      if (reactedMessages.has(mek.key.id)) {
        return;
      }
      
      // Mark as processed
      reactedMessages.add(mek.key.id);
      
      // Determine chat type
      const isGroup = context?.isGroup || mek.key.remoteJid?.endsWith("@g.us");
      const chatType = isGroup ? "group" : "private";
      
      // Check react mode
      const reactMode = settings.auto_react_mode || "all";
      
      let shouldReact = false;
      if (reactMode === "all") {
        shouldReact = true;
      } else if (reactMode === "private" && chatType === "private") {
        shouldReact = true;
      } else if (reactMode === "group" && chatType === "group") {
        shouldReact = true;
      }
      
      if (!shouldReact) {
        return;
      }
      
      // Get random emoji
      const emoji = getRandomEmoji();
      
      // Send reaction
      await sock.sendMessage(mek.key.remoteJid, {
        react: {
          text: emoji,
          key: mek.key
        }
      });
      
      console.log(`✅ [Auto-React] ${emoji} → ${chatType} chat`);
      
    } catch (error) {
      console.error("❌ Auto-react error:", error.message);
    }
  }
};
