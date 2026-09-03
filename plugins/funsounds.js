// =============================================
// SOUND COMMAND PLUGIN - Funny Meme MP3 Player
// =============================================

const path = require('path');
const fs = require('fs');

// ---------- CONFIGURATION ----------
// Define your sounds: each entry has a file name and an array of triggers.
// Triggers are what the user types after the command prefix (e.g., ".hello my dear")
// You can have multiple triggers for the same file.

const soundConfig = [
    {
        file: 'hello my dear bere.mp3',
        triggers: ['hello my dear', 'hi dear', 'hello', 'hey dear']
    },
    {
        file: 'good morning meme.mp3',
        triggers: ['good morning', 'gm', 'morning']
    },
    {
        file: 'laugh.mp3',
        triggers: ['laugh', 'haha', 'lol']
    },
    // Add more as needed
];

// Build a map: trigger -> file path
const soundMap = {};
const soundDir = path.join(__dirname, 'sounds'); // folder where MP3s are stored

soundConfig.forEach(item => {
    const fullPath = path.join(soundDir, item.file);
    // Check if file exists (optional)
    if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Sound file not found: ${fullPath}`);
    }
    item.triggers.forEach(trigger => {
        // Convert trigger to lowercase for case-insensitive matching
        const key = trigger.toLowerCase();
        soundMap[key] = fullPath;
    });
});

// Create a regex pattern that matches any trigger (case-insensitive)
const triggerKeys = Object.keys(soundMap);
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = `^(${triggerKeys.map(escapeRegex).join('|')})$`;
const triggerRegex = new RegExp(pattern, 'i'); // case-insensitive

// ---------- REGISTER COMMAND ----------
cmd({
    pattern: triggerRegex,      // dynamic pattern
    alias: [],                  // no additional aliases needed
    desc: "Play funny meme sounds",
    category: "fun",
    react: "🔊",
    filename: __filename,
    use: ".hello my dear"
}, async (bot, mek, m, { from, body, reply }) => {
    // body is the full message text (e.g., ".hello my dear")
    // Extract the trigger part (remove the command prefix)
    // Since we are using cmd, the 'body' is the entire message.
    // We need to extract the actual trigger string.
    // However, the pattern matches the whole message (including prefix?).
    // Usually cmd pattern matches the message after the prefix (if prefix is used).
    // In this bot, if we have prefix '.' then the pattern matches the text after the dot.
    // So the pattern we set is the trigger exactly.
    // So we can simply use body.trim() as the trigger.
    const trigger = body.trim().toLowerCase();
    const filePath = soundMap[trigger];
    if (!filePath) {
        return reply(`❌ Sound not found for "${trigger}"`);
    }
    if (!fs.existsSync(filePath)) {
        return reply(`❌ File missing: ${path.basename(filePath)}`);
    }

    // Send the MP3 as an audio message
    await bot.sendMessage(from, {
        audio: { url: filePath },  // or can use { file: fs.readFileSync(filePath) }
        mimetype: 'audio/mpeg',
        fileName: path.basename(filePath),
        // optional caption
        caption: `🔊 *${path.basename(filePath, '.mp3')}*`
    }, { quoted: mek });

    await bot.sendMessage(from, { react: { text: "🎵", key: m.key } });
});
