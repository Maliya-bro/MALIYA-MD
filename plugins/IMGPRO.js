const { cmd } = require('../command');
const axios = require('axios');
const sharp = require('sharp'); // 🛠️ Sharp අනිවාර්යයෙන්ම Host එකේ Install කර තිබිය යුතුය

cmd({
    pattern: "txt2img",
    alias: ["text2image", "genpro", "omegatech", "imagine", "imgpro", "imagepro"],
    desc: "Generate AI images using OmegaTech Pro API",
    category: "ai",
    react: "🎨",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    try {
        // Prompt එකක් දීලා නැත්නම්
        if (!q) {
            return reply(`╭─[ ⚠️ *𝗣𝗥𝗢𝗠𝗣𝗧 𝗥𝗘𝗤𝗨𝗜𝗥𝗘𝗗* ]\n│\n├ 📌 *Usage:* .t2i <text>\n├ 💡 *Example:* .imgpro a futuristic cyberpunk city\n╰───────────────⮞`);
        }

        // Loading React
        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // API URL සෑදීම
        const encodedPrompt = encodeURIComponent(q.trim());
        const apiUrl = `https://omegatech-api.dixonomega.tech/api/ai/Text2image-pro?action=generate&prompt=${encodedPrompt}`;

        // 1. API එකෙන් Image URL එක ලබා ගැනීම
        const apiRes = await axios.get(apiUrl, { timeout: 60000 });

        if (apiRes.data && apiRes.data.success && apiRes.data.data && apiRes.data.data.resultImageUrl) {
            const imageUrl = apiRes.data.data.resultImageUrl;

            // 2. WebP Image එක Buffer එකක් ලෙස Download කිරීම
            const imgRes = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const webpBuffer = Buffer.from(imgRes.data);

            // 3. Sharp මගින් WebP -> JPEG බවට Convert කිරීම (WhatsApp සහය සඳහා)
            const jpegBuffer = await sharp(webpBuffer)
                .jpeg({ quality: 90 }) 
                .toBuffer();

            // Caption එක සෑදීම
            let captionText = `╭─[ 🎨 *𝗔𝗜 𝗜𝗠𝗔𝗚𝗘 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗢𝗥* ]\n│\n`;
            captionText += `├ 🎯 *Prompt:* ${q}\n`;
            captionText += `├ ⏱️ *Runtime:* ${apiRes.data.data.runtime || 'N/A'}\n`;
            captionText += `├ ⚡ *Engine:* OmegaTech Pro\n│\n`;
            captionText += `╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 AI`;

            // Photo එක Group/Inbox එකට යැවීම
            await conn.sendMessage(from, {
                image: jpegBuffer,
                caption: captionText
            }, { quoted: mek });

            // Success React
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

        } else {
            throw new Error("Invalid API Response or Image generation failed.");
        }

    } catch (error) {
        console.error("Text2Image Error:", error);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        reply(`╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Error white genarating Image!_\n╰───────────────⮞`);
    }
});
