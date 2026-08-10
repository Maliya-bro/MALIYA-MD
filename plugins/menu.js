const { cmd, commands } = require("../command");
const config = require("../config");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys");

/* ============ CONFIG ============ */
const BOT_NAME = config.BOT_NAME || "MALIYA-MD";
const PREFIX = ".";
const TZ = "Asia/Colombo";
const OWNER_NUMBER = config.BOT_OWNER || "+94702135392";
const headerImage = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png";

const formatUptime = (seconds) => {
    const pad = (s) => (s < 10 ? "0" + s : s);
    const days = Math.floor(seconds / (24 * 3600));
    const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days > 0 ? `${days}d ` : ""}${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

/* ================= 1. ALIVE COMMAND ================= */
cmd(
    {
        pattern: "alive",
        react: "🔥",
        desc: "Check if bot is online",
        category: "main",
        filename: __filename
    },
    async (sock, mek, m, { from, reply }) => {
        try {
            const uptime = formatUptime(process.uptime());
            const platform = os.platform();
            const userName = m.pushName || "User";

            const aliveCaption = `╭━〔 🧿 SYSTEM ONLINE 🧿 〕━╮
┃
┃ 👋 Hey ${userName}
┃
┃ 🍁 *PREFIX:* ${PREFIX}
┃ ⚡ *BOT NAME:* ${BOT_NAME}
┃ 🧭 *UPTIME:* ${uptime}
┃ 🔋 *PLATFORM:* ${platform}
┃ 🧩 *VERSION:* ${config.VERSION || "2.3.1"}
┃
╰━━━━━━━━━━━━━━━╯

⚙️ Made with ❤️ by
╭───────────────⬣
🔥 𝙈𝘼𝙇𝙄𝙉𝘿𝙐 𝙉𝘼𝘿𝙄𝙏𝙃 🔥
╰───────────────⬣`;

            // Gifted Interactive Image + Quick Reply Buttons Protocol
            const msg = generateWAMessageFromContent(
                from,
                {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create({ text: aliveCaption }),
                                footer: proto.Message.InteractiveMessage.Footer.create({ text: `${BOT_NAME} | System Status` }),
                                header: proto.Message.InteractiveMessage.Header.create({
                                    title: "┌─── ⌈ ALIVE STATUS ⌋",
                                    hasMediaAttachment: true,
                                    imageMessage: (
                                        await sock.sendMessage(from, {
                                            image: { url: headerImage },
                                        }, { upload: sock.waUploadToServer })
                                    ).message.imageMessage,
                                }),
                                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            name: "quick_reply",
                                            buttonParamsJson: JSON.stringify({
                                                display_text: "📜 Command Menu",
                                                id: ".menu",
                                            }),
                                        },
                                        {
                                            name: "quick_reply",
                                            buttonParamsJson: JSON.stringify({
                                                display_text: "👤 Owner Info",
                                                id: ".owner",
                                            }),
                                        },
                                    ],
                                }),
                                contextInfo: {
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: "120363427174988449@newsletter",
                                        newsletterName: "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁",
                                        serverMessageId: 100,
                                    },
                                },
                            }),
                        },
                    },
                },
                { quoted: mek }
            );

            await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
        } catch (err) {
            console.log("ALIVE ERROR:", err);
            reply(`❌ Alive Error : ${err.message}`);
        }
    }
);

/* ================= 2. MENU COMMAND ================= */
cmd(
    {
        pattern: "menu",
        react: "📜",
        desc: "Show command categories",
        category: "main",
        filename: __filename,
    },
    async (sock, mek, m, { from, pushname, reply }) => {
        try {
            const userName = pushname || m.pushName || "User";

            // Categories list build
            const map = Object.create(null);
            for (const c of commands) {
                if (c.dontAddCommandList) continue;
                const cat = (c.category || "MISC").toUpperCase();
                (map[cat] ||= []).push(c);
            }
            const categories = Object.keys(map).sort();

            const categoryRows = categories.map((cat) => ({
                title: `📁 ${cat} MENU`,
                description: `Show ${map[cat].length} commands`,
                id: `.category_select ${cat}`
            }));

            const menuText = `👋 HI ${userName}\n\n🤖 *BOT:* ${BOT_NAME}\n👑 *OWNER:* ${OWNER_NUMBER}\n✨ *PREFIX:* ${PREFIX}\n\nSelect a Command Category Below:`;

            const msg = generateWAMessageFromContent(
                from,
                {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create({ text: menuText }),
                                footer: proto.Message.InteractiveMessage.Footer.create({ text: `${BOT_NAME} | Interactive Menu` }),
                                header: proto.Message.InteractiveMessage.Header.create({
                                    title: "┌─── ⌈ MALIYA-MD ⌋",
                                    hasMediaAttachment: true,
                                    imageMessage: (
                                        await sock.sendMessage(from, {
                                            image: { url: headerImage },
                                        }, { upload: sock.waUploadToServer })
                                    ).message.imageMessage,
                                }),
                                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            name: "single_select",
                                            buttonParamsJson: JSON.stringify({
                                                title: "✨ Select Category ✨",
                                                sections: [
                                                    {
                                                        title: "AVAILABLE CATEGORIES",
                                                        rows: categoryRows,
                                                    },
                                                ],
                                            }),
                                        },
                                        {
                                            name: "cta_url",
                                            buttonParamsJson: JSON.stringify({
                                                display_text: "🌐 Official Website",
                                                url: "https://maliya-md.replit.app",
                                            }),
                                        },
                                        {
                                            name: "cta_copy",
                                            buttonParamsJson: JSON.stringify({
                                                display_text: "📋 Copy Owner Number",
                                                copy_code: OWNER_NUMBER,
                                            }),
                                        },
                                    ],
                                }),
                                contextInfo: {
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: "120363427174988449@newsletter",
                                        newsletterName: "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁",
                                        serverMessageId: 100,
                                    },
                                },
                            }),
                        },
                    },
                },
                { quoted: mek }
            );

            await sock.relayMessage(from, msg.message, { messageId: msg.key.id });

        } catch (e) {
            console.log("MENU ERROR:", e);
            reply("❌ Menu Error.");
        }
    }
);

/* ================= 3. CATEGORY LIST HANDLER ================= */
cmd(
    {
        pattern: "category_select",
        dontAddCommandList: true,
        filename: __filename,
    },
    async (sock, mek, m, { from, args, pushname, reply }) => {
        try {
            const cat = args.join(" ").trim().toUpperCase();
            const userName = pushname || m.pushName || "User";

            const list = commands.filter(c => (c.category || "MISC").toUpperCase() === cat && !c.dontAddCommandList);
            if (!list.length) return reply("❌ No commands found.");

            let txt = `👋 HI ${userName}\n\n┏━〔 📁 ${cat} COMMANDS 〕━⬣\n┃ 📦 Total : ${list.length}\n┃ ✨ Prefix: ${PREFIX}\n┗━━━━━━━━━━━━⬣\n\n`;

            list.forEach((c) => {
                txt += `• *${PREFIX}${c.pattern || "no-pattern"}*\n  ⭕ ${c.desc || "No description"}\n\n`;
            });

            await sock.sendMessage(from, { image: { url: headerImage }, caption: txt }, { quoted: mek });
        } catch (e) {
            console.log("CATEGORY ERROR:", e);
        }
    }
);
