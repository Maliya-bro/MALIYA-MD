const { cmd } = require('../command');
const axios = require('axios');

cmd({
    pattern: "txt2img",
    alias: ["text2image", "aiimage", "genimage"],
    desc: "Generate AI images using Pollinations AI",
    category: "ai",
    react: "🎨",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    try {
        // Prompt එකක් දීලා නැත්නම්
        if (!q) {
            return reply(`╭─[ ⚠️ *𝗣𝗥𝗢𝗠𝗣𝗧 𝗥𝗘𝗤𝗨𝗜𝗥𝗘𝗗* ]\n│\n├ 📌 *Usage:* .image <text>\n├ 💡 *Example:* .image a futuristic city at sunset\n╰───────────────⮞`);
        }

        // Loading React
        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // Pollinations AI API URL එක සෑදීම
        const encodedPrompt = encodeURIComponent(q.trim());
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

        // Image එක Buffer එකක් ලෙස ලබා ගැනීම
        const imgRes = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const imageBuffer = Buffer.from(imgRes.data, 'binary');

        // MALIYA-MD විලාසයට Caption එක සෑදීම
        let captionText = `╭─[ 🎨 *𝗔𝗜 𝗜𝗠𝗔𝗚𝗘 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗢𝗥* ]\n│\n`;
        captionText += `├ 🎯 *Prompt:* ${q}\n`;
        captionText += `├ 📐 *Size:* 1024x1024\n`;
        captionText += `├ ⚡ *Engine:* MALIYA-MD AI\n│\n`;
        captionText += `╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        // Photo එක Group/Inbox එකට යැවීම
        await conn.sendMessage(from, {
            image: imageBuffer,
            caption: captionText
        }, { quoted: mek });

        // Success React
        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (error) {
        console.error("AI Image Generation Error:", error);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        reply(`╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Error! genarating image_\n╰───────────────⮞`);
    }
});
