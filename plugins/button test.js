const { cmd } = require("../command");

cmd({
    pattern: "polltest",
    desc: "Poll buttons වැඩද කියා බැලීමට",
    category: "test",
    react: "📊",
    filename: __filename
},
async (sock, mek, m, { from, reply }) => {
    try {
        const pollMessage = {
            poll: {
                name: "මෙන්න MALIYA-MD Poll Buttons! වැඩ කරනවද?",
                values: [
                    "Ow 😍",
                    "Na ❌",
                    "Clear Memory 🗑️"
                ],
                selectableCount: 1 // එක පාරක් තෝරන්න පුළුවන් ගණන
            }
        };

        await sock.sendMessage(from, pollMessage, { quoted: mek });

    } catch (e) {
        console.log("Poll Error: ", e.message);
        reply("❌ Poll එක යැවීමට නොහැකි වුණා.");
    }
});
