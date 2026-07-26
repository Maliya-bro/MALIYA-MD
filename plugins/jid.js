const { cmd } = require("../command");

cmd({
    pattern: "newsletter",
    alias: ["channelid", "newsid"],
    react: "📢",
    desc: "Get WhatsApp Newsletter JID",
    category: "tools",
    filename: __filename
},
async (conn, mek, m, { from, reply, args }) => {

    try {

        let url = args[0];

        if (!url) {
            url = "https://whatsapp.com/channel/0029VbCyHsvAO7RKAbYw7p1o";
        }

        // Get invite code
        let inviteCode = url.split("/").pop();

        let data = await conn.newsletterMetadata(
            "invite",
            inviteCode
        );

        let text = `
╭━━━〔 📢 NEWSLETTER INFO 〕━━━╮

📝 Name:
${data.name}

🆔 Newsletter JID:
${data.id}

🔗 Invite:
${data.invite}

👥 Subscribers:
${data.subscribers}

✅ State:
${data.state}

╰━━━━━━━━━━━━━━━━━━╯
`;

        await conn.sendMessage(
            from,
            {
                text: text
            },
            {
                quoted: mek
            }
        );

    } catch (e) {

        console.log(e);

        reply(
            "❌ Error getting newsletter ID\n\n" +
            e.message
        );

    }
});
