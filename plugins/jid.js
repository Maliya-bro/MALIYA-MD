const { cmd } = require("../command");

cmd({
    pattern: "newsletter",
    alias: ["channelid", "newsid"],
    react: "📢",
    desc: "Get WhatsApp Newsletter Info",
    category: "tools",
    filename: __filename
},
async (conn, mek, m, { from, reply, args }) => {

    try {

        let url = args[0] || "https://whatsapp.com/channel/0029VbCyHsvAO7RKAbYw7p1o";

        let inviteCode = url.split("/").pop();

        let data = await conn.newsletterMetadata(
            "invite",
            inviteCode
        );

        let text = `
╭━━━〔 📢 NEWSLETTER INFO 〕━━━╮

📝 Name:
${data.name || data.newsletterName || "N/A"}

🆔 JID:
${data.id || "N/A"}

🔗 Invite:
${data.invite || inviteCode}

👥 Subscribers:
${data.subscribers || data.subscriberCount || "N/A"}

📌 State:
${JSON.stringify(data.state || "N/A")}

╰━━━━━━━━━━━━━━━━━━╯
`;

        await conn.sendMessage(
            from,
            {
                text
            },
            {
                quoted: mek
            }
        );

    } catch(e) {
        console.log(e);
        reply("❌ Error: " + e.message);
    }

});
