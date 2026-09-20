const { cmd } = require('../command');
const axios = require('axios');

cmd({
    pattern: "videogen",
    alias: ["text2video", "genvideo", "videogen", "videopro"],
    desc: "Generate AI videos using MALIYA-MD AI Txt2Video API",
    category: "ai",
    react: "🎬",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) {
            return reply(`╭─[ ⚠️ *𝗣𝗥𝗢𝗠𝗣𝗧 𝗥𝗘𝗤𝗨𝗜𝗥𝗘𝗗* ]\n│\n├ 📌 *Usage:* .t2v <text>\n├ 💡 *Example:* .t2v a dancing cat\n╰───────────────⮞`);
        }

        // Loading React 
        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });
        await reply(`_⏳ Genarating Your Video Please Wait!..._`);

        const encodedPrompt = encodeURIComponent(q.trim());
        const apiUrl = `https://omegatech-api.dixonomega.tech/api/ai/Txt2video?action=generate&prompt=${encodedPrompt}&ratio=auto&sound=true`;

        // API Request (Timeout එක විනාඩි 3ක්)
        const apiRes = await axios.get(apiUrl, { timeout: 180000 });

        // 🛠️ FIX: JSON Response එකෙන් 'videoUrl' හරියටම අල්ලා ගැනීම
        let videoUrl = apiRes.data?.data?.videoUrl || 
                       apiRes.data?.data?.resultVideoUrl || 
                       apiRes.data?.data?.url || 
                       apiRes.data?.url;

        if (videoUrl) {
            
            // Video Buffer Download කිරීම
            const vidRes = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 180000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const videoBuffer = Buffer.from(vidRes.data);

            let captionText = `╭─[ 🎬 *𝗔𝗜 𝗩𝗜𝗗𝗘𝗢 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗢𝗥* ]\n│\n`;
            captionText += `├ 🎯 *Prompt:* ${q}\n`;
            captionText += `├ 🔊 *Sound:* Enabled\n`;
            captionText += `├ ⚡ *Engine:* OmegaTech Txt2Video\n│\n`;
            captionText += `╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

            await conn.sendMessage(from, {
                video: videoBuffer,
                caption: captionText,
                mimetype: 'video/mp4'
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

        } else {
            console.log("❌ Txt2Video API Error / Full Response:", apiRes.data);
            throw new Error("Invalid API Response or Video generation failed.");
        }

    } catch (error) {
        console.error("❌ Text2Video Catch Error:", error.message);
        if (error.response) console.error("❌ API Error Data:", error.response.data);

        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        reply(`╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Video එක ජෙනරේට් කිරීමේදී දෝෂයක් ඇතිවිය! (හෝ Timeout විය)_\n╰───────────────⮞`);
    }
});
