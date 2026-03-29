const { cmd } = require('../command');

cmd({
    pattern: "add4",
    desc: "Adds a member to the group (admin only)",
    category: "admin",
    react: "➕",
    filename: __filename
},
async (conn, mek, m, {
    from, q, isGroup, isAdmins, reply, quoted
}) => {
    if (!isGroup) return reply("❌ This command can only be used in groups.");
    if (!isAdmins) return reply("❌ Only group admins can use this command.");

    let number;
    if (m.quoted) {
        number = m.quoted.sender.split("@")[0];
    } else if (q && q.includes("@")) {
        number = q.replace(/[@\s]/g, '');
    } else if (q && /^\d+$/.test(q)) {
        number = q;
    } else {
        return reply("❌ Please reply to a message, mention a user, or provide a number to add.");
    }

    const jid = number + "@s.whatsapp.net";

    try {
        await conn.groupParticipantsUpdate(from, [jid], "add");
        reply(`✅ Successfully added @${number}`, { mentions: [jid] });
    } catch (error) {
        reply("❌ Couldn't add the user. They might have privacy settings enabled.");
    }
});
