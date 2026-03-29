const { fetchJson } = require("../lib/functions");
const { cmd } = require('../command');

// NOTE: Define or import your Instagram scraping method here
// Example placeholder for dy_scrap
const dy_scrap = {
    instagram: async (url) => {
        // Implement your Instagram scraping or use any Instagram API package
        // Return array of media { url, type, thumbnail, title }
        // This is a dummy return for demonstration
        return {
            result: [
                {
                    url: "https://example.com/sample.jpg",
                    type: "image",
                    thumbnail: "https://example.com/sample_thumb.jpg",
                    title: "Sample Instagram Post"
                }
            ]
        };
    }
};

cmd({
    pattern: "ig3",
    alias: ["instagram", "igdl", "insta"],
    react: "📸",
    desc: "Download Instagram media with reply options",
    category: "download",
    use: ".ig3 <Instagram URL>",
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    if (!q || !q.includes("instagram.com")) {
        return reply("❌ Please provide a valid Instagram post URL!");
    }

    try {
        const data = await dy_scrap.instagram(q);
        const results = data?.result;

        if (!results || !results.length) {
            return reply("❌ No media found at this URL!");
        }

        // Store user state for reply selection
        let userSession = {
            messageID: null,
            mediaList: results,
            currentIndex: 0
        };

        // Send initial message with media preview and options
        const post = results[0];
        const { url, type, thumbnail, title } = post;

        let info = `📸 *INSTAGRAM DOWNLOADER* 📸\n\n` +
            `📝 *Caption:* ${title || "N/A"}\n` +
            `🎞 *Type:* ${type.toUpperCase()}\n` +
            `🔗 *URL:* ${q}\n\n` +
            `Reply with your choice:\n` +
            `1.1 - Send media as image/video\n` +
            `1.2 - Send media as document\n\n` +
            `Reply with:\n` +
            `2 - Next media (if multiple)\n` +
            `0 - Cancel\n\n` +
            `${require('../config').FOOTER || "𓆩JawadTechX𓆪"}`;

        const sentMsg = await conn.sendMessage(from, {
            image: { url: thumbnail },
            caption: info
        }, { quoted: mek });

        userSession.messageID = sentMsg.key.id;

        // React with inbox emoji to show readiness
        await conn.sendMessage(from, { react: { text: '📥', key: sentMsg.key } });

        // Set up a one-time event listener for replies to this message
        const handler = async (msgUpdate) => {
            try {
                const userMsg = msgUpdate?.messages?.[0];
                if (!userMsg?.message) return;

                // Check if reply to our sent message
                const isReplyToSent = userMsg.message.extendedTextMessage?.contextInfo?.stanzaId === userSession.messageID;
                if (!isReplyToSent) return;

                const userText = userMsg.message.conversation || userMsg.message.extendedTextMessage?.text;
                if (!userText) return;

                const replyText = userText.trim();

                if (replyText === "0") {
                    await conn.sendMessage(from, { text: "❌ Download cancelled." }, { quoted: mek });
                    conn.ev.off('messages.upsert', handler);
                    return;
                }

                if (replyText === "2") {
                    // next media
                    userSession.currentIndex++;
                    if (userSession.currentIndex >= userSession.mediaList.length) {
                        await conn.sendMessage(from, { text: "ℹ️ No more media available." }, { quoted: mek });
                        userSession.currentIndex = userSession.mediaList.length - 1;
                        return;
                    }

                    const nextMedia = userSession.mediaList[userSession.currentIndex];
                    const captionNext = `📸 Media ${userSession.currentIndex + 1} of ${userSession.mediaList.length}\n` +
                        `Type: ${nextMedia.type.toUpperCase()}\n` +
                        `Caption: ${nextMedia.title || "N/A"}`;

                    await conn.sendMessage(from, {
                        image: { url: nextMedia.thumbnail },
                        caption: captionNext
                    }, { quoted: mek });

                    return;
                }

                let payload;
                const currentMedia = userSession.mediaList[userSession.currentIndex];
                const fileType = currentMedia.type === "image" ? "image/jpeg" : "video/mp4";
                const fileExt = currentMedia.type === "image" ? "jpg" : "mp4";
                const fileName = `Instagram_${currentMedia.type}_${Date.now()}.${fileExt}`;

                if (replyText === "1.1") {
                    payload = currentMedia.type === "image"
                        ? { image: { url: currentMedia.url }, caption: currentMedia.title || "Instagram Image" }
                        : { video: { url: currentMedia.url }, caption: currentMedia.title || "Instagram Video" };
                    await conn.sendMessage(from, { text: "⏳ Downloading media..." }, { quoted: mek });
                } else if (replyText === "1.2") {
                    payload = {
                        document: { url: currentMedia.url },
                        mimetype: fileType,
                        fileName,
                        caption: currentMedia.title || "Instagram File"
                    };
                    await conn.sendMessage(from, { text: "⏳ Downloading as document..." }, { quoted: mek });
                } else {
                    await reply("❌ Invalid option! Reply with 1.1, 1.2, 2 (next), or 0 (cancel).");
                    return;
                }

                await conn.sendMessage(from, payload, { quoted: mek });
                await conn.sendMessage(from, { text: "✅ Media sent successfully!" }, { quoted: mek });

            } catch (err) {
                console.error("Reply handler error:", err);
                await reply("❌ Error occurred while processing your reply.");
            }
        };

        conn.ev.on('messages.upsert', handler);

        // Optional: Timeout to remove listener after some time to avoid memory leak
        setTimeout(() => conn.ev.off('messages.upsert', handler), 5 * 60 * 1000); // 5 minutes

    } catch (error) {
        console.error(error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
        await reply(`❌ An error occurred: ${error.message || "Unknown error"}`);
    }
});
