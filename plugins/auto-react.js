const { readSettings } = require("../lib/botSettings");

// Array of 70+ random emojis for reactions (mixed categories)
const REACT_EMOJIS = [
  // 😂 Faces & Emotions (20)
  "😂", "🤣", "😍", "🥰", "😎", "🤔", "😭", "😱", "🔥", "💀",
  "🥺", "😊", "😈", "👻", "🤖", "😤", "🥳", "🤯", "😨", "🥶",
  
  // ❤️ Hearts & Love (8)
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💕",
  
  // 👍 Hands & Gestures (12)
  "👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "🤙", "💪", "🖕",
  "🙏", "💅",
  
  // ✨ Stars & Magic (6)
  "✨", "⭐", "🌟", "💫", "⚡", "🔥",
  
  // 🎉 Party & Celebration (6)
  "🎉", "🎊", "🥳", "🎈", "🎯", "🏆",
  
  // 💯 Numbers & Symbols (5)
  "💯", "🔞", "❓", "❗", "💢",
  
  // 🐱 Animals & Nature (10)
  "🐱", "🐶", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐸",
  
  // 🍿 Food & Drinks (8)
  "🍿", "🍕", "🍔", "🌮", "🍩", "🍪", "☕", "🍺",
  
  // 👀 Eyes & Watching (5)
  "👀", "👁️", "💀", "👽", "💩"
];

// Track recently reacted messages to avoid spam
const recentlyReacted = new Map();

function getRandomEmoji() {
  return REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
}

function shouldReact(chatType, reactMode) {
  if (reactMode === "all") return true;
  if (reactMode === "private" && chatType === "private") return true;
  if (reactMode === "group" && chatType === "group") return true;
  return false;
}

// Cooldown to prevent spam (2 seconds)
function isRecentlyReacted(messageId) {
  if (recentlyReacted.has(messageId)) {
    const lastReact = recentlyReacted.get(messageId);
    if (Date.now() - lastReact < 2000) {
      return true;
    }
  }
  recentlyReacted.set(messageId, Date.now());
  
  // Clean up old entries
  setTimeout(() => {
    recentlyReacted.delete(messageId);
  }, 2000);
  
  return false;
}

async function reactToMessage(conn, message, emoji) {
  try {
    await conn.sendMessage(message.key.remoteJid, {
      react: {
        text: emoji,
        key: message.key
      }
    });
    return true;
  } catch (error) {
    console.error("Auto-react error:", error);
    return false;
  }
}

// Main plugin handler - matches your existing plugin structure
const autoReactPlugin = {
  onMessage: async (sock, mek, m, context) => {
    try {
      const { from, isGroup, isOwner, sender } = context;
      
      // Get settings
      const settings = readSettings();
      
      // Check if auto react is enabled
      if (!settings.auto_react_msg) return false;
      
      // Don't react to bot's own messages
      if (mek.key.fromMe) return false;
      
      // Don't react to status messages
      if (mek.message?.protocolMessage) return false;
      
      // Don't react to reactions
      if (mek.message?.reactionMessage) return false;
      
      // Cooldown check to avoid spam
      const messageId = mek.key.id;
      if (isRecentlyReacted(messageId)) return false;
      
      // Determine chat type
      const chatType = isGroup ? "group" : "private";
      
      // Check if we should react based on mode
      const reactMode = settings.auto_react_mode || "all";
      if (!shouldReact(chatType, reactMode)) return false;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // React with random emoji
      const emoji = getRandomEmoji();
      await reactToMessage(sock, mek, emoji);
      
      console.log(`✅ [Auto-React] ${emoji} → ${chatType} chat`);
      return true;
      
    } catch (error) {
      console.error("Auto-react plugin error:", error);
      return false;
    }
  }
};

// Export the plugin to be used in index.js
module.exports = autoReactPlugin;
