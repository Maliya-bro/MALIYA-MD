const { cmd } = require('../command'); // ඔබගේ bot command handler
const fetch = require('node-fetch');

const API_KEY = "VXARX6IO"; // ඔබගේ SubNP free API key

cmd({
    pattern: "img",
    alias: ["image", "generate"],
    desc: "Generate an image from prompt using SubNP API",
    category: "ai",
    react: "🎨",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return reply("❌ Please provide a prompt to generate the image.\nExample: `.img a sunset over mountains`");

        // Bot reacts while processing
        await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

        // API request
        const response = await fetch("https://subnp.com/api/free/generate", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: q,
                model: "turbo" // free model
            })
        });

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();

        if (!data || !data.imageUrl) return reply("❌ Failed to generate image. Try again.");

        // Send image to WhatsApp
        await conn.sendMessage(from, {
            image: { url: data.imageUrl },
            caption: `🖼 Prompt: ${q}\n✅ Image generated successfully!`
        }, { quoted: m });

    } catch (error) {
        console.error("Image generation error:", error);
        await reply(`❌ Error: ${error.message}`);
    }
});
