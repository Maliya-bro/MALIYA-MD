const { cmd } = require("../command");

// 1. Poll එක යවන Command එක
cmd({
    pattern: "polltest",
    desc: "Poll buttons වැඩද කියා බැලීමට",
    category: "test",
    react: "📊",
    filename: __filename
},
async (sock, mek, m, { from, reply }) => {
    try {
        await sock.sendMessage(from, {
            poll: {
                name: "MALIYA-MD Poll Test: පහත Button එක Click කරන්න 👇",
                values: [
                    "Click Me 🔘",
                    "Test Button ✨"
                ],
                selectableCount: 1
            }
        }, { quoted: mek });
    } catch (e) {
        reply("Error: " + e.message);
    }
});

// 2. Poll එක Click කළාම "Hi" කියන කොටස (Reply Handler එකක් ලෙස)
// මේ කොටස වැඩ කිරීමට index.js එකේ pollUpdate handler එක තිබිය යුතුය.
cmd({
    on: "body" 
},
async (sock, mek, m, { from, body, reply }) => {
    // යූසර් Poll එකේ option එකක් click කළාම index.js එකෙන් body එකට ඒ නම එවනවා
    if (body === "Click Me 🔘" || body === "Test Button ✨") {
        await reply("Hi");
    }
});
