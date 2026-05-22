const { cmd } = require("../command");
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

function getRandomEmoji() {
  return REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
}

function shouldReact(chatType, reactMode) {
  if (reactMode === "all") return true;
  if (reactMode === "private" && chatType === "private") return true;
  if (reactMode === "group" && chatType === "group") return true;
  return false;
}

async function reactToMessage(conn, message, emoji) {
  try {
    const reactionMessage = {
      react: {
        text: emoji,
        key: message.key
      }
    };
    await conn.sendMessage(message.key.remoteJid, reactionMessage);
    return true;
  } catch (error) {
    console.error("Auto-react error:", error);
    return false;
  }
}

// Auto-react handler using the main message listener pattern
cmd({ on: "message", fromMe: false }, async (conn, mek, m, { from, isGroup, isOwner, sender }) => {
  try {
    const settings = readSettings();
    
    // Check if auto react is enabled
    if (!settings.auto_react_msg) return;
    
    // Don't react to bot's own messages
    if (mek.key.fromMe) return;
    
    // Determine chat type
    const chatType = isGroup ? "group" : "private";
    
    // Check if we should react based on mode
    const reactMode = settings.auto_react_mode || "all";
    if (!shouldReact(chatType, reactMode)) return;
    
    // React with random emoji
    const emoji = getRandomEmoji();
    await reactToMessage(conn, mek, emoji);
    
  } catch (error) {
    console.error("Auto-react plugin error:", error);
  }
});

console.log("✅ Auto-react plugin loaded with 70+ emojis");
