const { cmd } = require("../command");
const axios = require("axios");

cmd({
    pattern: "genimg",
    alias: ["gimg", "gen", "timg", "img"],
    desc: "Generate image using AI",
    category: "ai",
    react: "🖼️",
    filename: __filename
},
async (bot, mek, m, {
    from,
    q,
    reply
}) => {
    try {
        if (!q) {
            return reply(
`*🖼️ TEXT TO IMAGE*

*Usage:* .genimg <text>

*Example:*
.genimg A cat sitting on a chair`
            );
        }

        await reply(`🎨 Generating image for:\n*${q}*`);

        const imageUrl = `https://api-abztech.zone.id/ai/genimg?text=${encodeURIComponent(q)}`;

        const response = await axios({
            method: "get",
            url: imageUrl,
            responseType: "arraybuffer",
            timeout: 30000
        });

        const buffer = Buffer.from(response.data);

        await bot.sendMessage(
            from,
            {
                image: buffer,
                caption: "✨ Here you go!"
            },
            {
                quoted: mek
            }
        );

    } catch (e) {
        console.error("genimg error:", e);
        reply(`❌ Failed to generate image.\n\n${e.message}`);
    }
});
