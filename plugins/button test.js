const { cmd } = require("../command");

cmd({
    pattern: "testbtn",
    desc: "බටන් වැඩද කියා බැලීමට",
    category: "test",
    react: "🔘",
    filename: __filename
},
async (sock, mek, m, { from, reply }) => {
    try {
        const sections = [
            {
                title: "MALIYA-MD TEST MENU",
                rows: [
                    { title: "Option 1", rowId: ".ping", description: "පළමු තේරීම" },
                    { title: "Option 2", rowId: ".menu", description: "දෙවන තේරීම" }
                ]
            }
        ];

        const listMessage = {
            text: "මෙන්න ඔයා ඉල්ලපු බටන් එක! මේක වැඩ කරනවා නම් පහත බටන් එක පෙනෙයි.",
            footer: "MALIYA-MD Testing System",
            title: "🔘 BUTTON TEST SUCCESS",
            buttonText: "CLICK HERE 🗂️",
            sections
        };

        // බටන් එක සහිත මැසේජ් එක යැවීම
        await sock.sendMessage(from, listMessage, { quoted: mek });

    } catch (e) {
        console.log("Button Error: ", e.message);
        reply("❌ බටන් එක යැවීමට නොහැකි වුණා. හේතුව: " + e.message);
    }
});
