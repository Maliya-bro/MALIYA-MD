const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const config = require("../config");
const P = require("pino");

console.log("✅ [SILENT AUTO] Ultimate Plugin Hook Loaded!");

const editCache = new Map();

// සියලුම Ephemeral / ViewOnce Layers ගැලවීමේ Foolproof ක්‍රමය
function getCleanMsg(msg) {
    if (!msg) return msg;
    let m = msg;
    while (m.message || m.ephemeralMessage || m.viewOnceMessageV2 || m.viewOnceMessage || m.viewOnceMessageV2Extension || m.documentWithCaptionMessage) {
        if (m.message) m = m.message;
        else if (m.ephemeralMessage) m = m.ephemeralMessage;
        else if (m.viewOnceMessageV2) m = m.viewOnceMessageV2;
        else if (m.viewOnceMessage) m = m.viewOnceMessage;
        else if (m.viewOnceMessageV2Extension) m = m.viewOnceMessageV2Extension;
        else if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage;
    }
    return m;
}

const silentAutomationHook = {
    onMessage: async (sock, mek) => {
        try {
            if (!mek?.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;
            if (!from || from.endsWith("@newsletter") || from === "status@broadcast") return;

            // 1. Bot Owner ගේ JID එක 100% ක් නිවැරදිව ගැනීම
            let ownerNum = String(config.BOT_OWNER || config.OWNER_NUMBER || "").replace(/\D/g, "");
            if (!ownerNum && sock.user?.id) {
                ownerNum = sock.user.id.split("@")[0].split(":")[0];
            }
            const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : null;
            if (!ownerJid) return;

            const sender = mek.key.participant || from;
            const senderTag = `@${sender.split("@")[0].split(":")[0]}`;
            const chatType = from.endsWith("@g.us") ? "👥 Group" : "👤 Private Chat";

            // 2. EDITED MESSAGE TRACKER 
            const proto = mek.message.protocolMessage;
            if (proto && proto.type === 14) {
                const targetId = proto.key?.id;
                const cached = editCache.get(targetId);
                
                let newText = "";
                if (proto.editedMessage) {
                    newText = proto.editedMessage.conversation || proto.editedMessage.extendedTextMessage?.text || "";
                }

                const oldText = cached ? cached.text : "*(Not cached)*";
                if (cached && cached.text === newText) return;

                await sock.sendMessage(ownerJid, {
                    text: `📝 *[ SILENT EDITS ]*\n\n📍 *Chat:* ${chatType}\n👤 *From:* ${senderTag}\n\n❌ *Old:*\n${oldText}\n\n✏️ *New:*\n${newText}`,
                    mentions: [sender]
                });
                return;
            }

            // සාමාන්‍‍ය මැසේජ් Text එක Cache එකට දැමීම (Edits අල්ලන්න)
            let rawText = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            if (mek.key.id && rawText) {
                editCache.set(mek.key.id, { text: rawText, time: Date.now() });
                if (editCache.size > 1000) editCache.delete(editCache.keys().next().value);
            }

            // 3. VIEW ONCE INTERCEPTOR (JSON Stringify මගින් කවදාවත් Miss නොවන ලෙස සෙවීම)
            const msgStr = JSON.stringify(mek.message);
            const isViewOnce = msgStr.includes('viewOnceMessage') || msgStr.includes('"viewOnce":true');

            if (isViewOnce) {
                let clean = getCleanMsg(mek.message);
                if (!clean) return;

                let mediaNode = clean.imageMessage || clean.videoMessage || clean.audioMessage;
                let type = clean.imageMessage ? "image" : clean.videoMessage ? "video" : clean.audioMessage ? "audio" : null;

                if (!mediaNode || !type) return;

                // ඔයාගේ .vv එකේ වැඩ කරපු Exact Download එක
                const buffer = await downloadMediaMessage(
                    { key: mek.key, message: mek.message },
                    "buffer",
                    {},
                    { logger: P({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
                );

                if (!buffer) return;

                const caption = `🤫 *[ VIEW ONCE CAPTURED ]*\n\n📍 *Chat:* ${chatType}\n👤 *From:* ${senderTag}\n💬 *Caption:* ${mediaNode.caption || "None"}`;

                if (type === "image") {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: caption, mentions: [sender] });
                } else if (type === "video") {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: caption, mentions: [sender] });
                } else if (type === "audio") {
                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true });
                    await sock.sendMessage(ownerJid, { text: caption, mentions: [sender] });
                }
            }

        } catch (e) {
            console.log("❌ Silent Auto Hook Error:", e.message);
        }
    }
};

// ── අතිශය වැදගත්: මේකෙන් index.js එකේ block වීම් bypass කරලා කෙලින්ම global hook එකට Auto Plug වෙනවා ──
global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(silentAutomationHook);

// index.js එකෙන් තවමත් call කරන්න හැදුවොත් crash නොවෙන්න Dummy Export එකක් දෙනවා
module.exports = {
    handleSilentAutomation: async () => {},
    handleSilentEditedMessage: async () => {}
};
