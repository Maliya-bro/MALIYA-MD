const { cmd } = require('../command');

cmd({
    pattern: "add2",
    alias: ["a", "invite"],
    desc: "Adds a member to the group or sends invite link if failed",
    category: "admin",
    react: "➕",
    filename: __filename
},
async (conn, mek, m, {
    from, q, isGroup, isBotAdmins, reply, quoted, senderNumber
}) => {
    if (!isGroup) return reply("❌ මේ command එක group වලට විතරයි.");

    const botOwner = conn.user.id.split(":")[0];
    if (senderNumber !== botOwner) {
        return reply("❌ මේ command එක භාවිතා කළ හැක්කේ bot owner ට විතරයි.");
    }

    if (!isBotAdmins) return reply("❌ මම admin එකක් වෙන්න ඕන.");

    let number;
    if (m.quoted) {
        number = m.quoted.sender.split("@")[0];
    } else if (q && q.includes("@")) {
        number = q.replace(/[@\s+]/g, '');
    } else if (q && /^\d+$/.test(q)) {
        number = q;
    } else {
        return reply("❌ කරුණාකර message එකකට reply කරන්න හෝ number එකක් mention කරන්න.");
    }

    const jid = number + "@s.whatsapp.net";

    // Check left or removed status
    const lastStatus = global.leftOrRemovedUsers?.[from]?.[number];
    if (lastStatus === "removed") {
        await reply("⚠️ මේ user එක කලින් admin කෙනෙක් remove කරලා.");
    } else if (lastStatus === "left") {
        await reply("⚠️ මේ user එක කලින් group එකෙන් left උනා.");
    }

    try {
        await conn.groupParticipantsUpdate(from, [jid], "add");
        await reply(`✅ @${number} group එකට add කලා`, { mentions: [jid] });
    } catch (error) {
        console.log("Add failed. Sending invite link...");

        try {
            const code = await conn.groupInviteCode(from);
            const groupName = (await conn.groupMetadata(from)).subject;

            await conn.sendMessage(jid, {
                text: `📩 ඔයාව *${groupName}* group එකට add කරන්න බැරි වුනා.\n\nමෙන්න invite link එක:\nhttps://chat.whatsapp.com/${code}`
            });

            await reply(`⚠️ Add කරන්න බැරි උනා. Invite link එක @${number} ට යවලා.`, { mentions: [jid] });

        } catch (e2) {
            console.error("Invite link send fail:", e2);
            reply("❌ Add කරන්නත් invite link යවන්නත් බැරි උනා.");
        }
    }
});
