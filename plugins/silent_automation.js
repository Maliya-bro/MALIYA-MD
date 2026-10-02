const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const config = require("../config");

console.log("✅ [SILENT AUTO] Force-Enabled Version Loaded!");

const editCache = new Map();

// සියලුම layers ගැලවීමේ Foolproof ක්‍රමය
function unwrapMessage(msg) {
    if (!msg) return msg;
    let m = msg;
    if (m.message) m = m.message;
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    return m;
}

// JSON Stringify මඟින් සැඟවුණු View Once දත්ත අල්ලන ක්‍රමය
function isViewOnceMessage(rawMsg) {
    if (!rawMsg) return false;
    let str = JSON.stringify(rawMsg);
    if (str.includes('viewOnceMessage') || str.includes('"viewOnce":true')) return true;
    return false;
}

function detectMediaType(m) {
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    return null;
}

// Botගේ අංකය (Owner Inbox) හරියටම ගැනීම
function getOwnerJid(sock, sessionCtx) {
    let num = sock?.user?.id?.split(":")[0]?.split("@")[0];
    if (!num && sessionCtx?.ownerNumber?.[0]) {
        num = sessionCtx.ownerNumber[0].replace(/\D/g, "");
    }
    if (!num && config.BOT_OWNER) {
        num = String(config.BOT_OWNER).replace(/\D/g, "");
    }
    return num ? `${num}@s.whatsapp.net` : null;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
    try {
        if (!mek?.message || mek.key.fromMe) return;

        const from = mek.key.remoteJid || "";
        // Channels සහ Status මඟ හැරීම
        if (from.endsWith("@newsletter") || from === "status@broadcast") return;

        // ⚠️ Settings Check එක අයින් කර ඇත. දැන් ඕනෑම Session එකකට 100% වැඩ කරයි.
        const targetInbox = getOwnerJid(sock, sessionCtx);
        if (!targetInbox) return;

        const isGroup = from.endsWith("@g.us");
        const rawSender = mek.key.participant || from;
        const sender = rawSender.split("@")[0].split(":")[0];

        // ── 1. EDITED MESSAGE TRACKER ──
        const proto = mek.message.protocolMessage;
        if (proto && proto.type === 14) {
            console.log("🎯 [SILENT AUTO] Edited message detected!");
            const targetId = proto.key?.id;
            const cached = editCache.get(targetId);
            
            let newText = "";
            if (proto.editedMessage) {
                const cleanEdited = unwrapMessage(proto.editedMessage);
                newText = cleanEdited?.conversation || cleanEdited?.extendedTextMessage?.text || "";
            }

            const oldText = cached ? cached.text : "*(Not cached)*";
            if (cached && cached.text === newText) return;

            await sock.sendMessage(targetInbox, {
                text: `📝 *[ MESSAGE EDITED ]*\n\n📍 *Chat:* ${isGroup ? "Group" : "Private"}\n👤 *Sender:* @${sender}\n\n❌ *Old:*\n${oldText}\n\n✏️ *New:*\n${newText || "*(Empty/Cleared)*"}`,
                mentions: [rawSender]
            });
            return;
        }

        // සාමාන්‍ය මැසේජ් Cache එකට දැමීම
        const cleanMsg = unwrapMessage(mek.message);
        let rawText = cleanMsg?.conversation || cleanMsg?.extendedTextMessage?.text || cleanMsg?.imageMessage?.caption || cleanMsg?.videoMessage?.caption || "";
        if (mek.key.id && rawText) {
            editCache.set(mek.key.id, { text: rawText, time: Date.now() });
            if (editCache.size > 1500) editCache.delete(editCache.keys().next().value);
        }

        // ── 2. VIEW ONCE INTERCEPTOR ──
        if (isViewOnceMessage(mek.message)) {
            console.log("👁️ [SILENT AUTO] View Once detected! Extracting...");
            
            if (!cleanMsg) return;
            
            const mediaType = detectMediaType(cleanMsg);
            if (!mediaType) return;

            const mediaNode = cleanMsg[mediaType + "Message"];
            if (!mediaNode || !mediaNode.mediaKey) return;

            // ඔයාගේ .vv එකේ වැඩ කරපු Exact Download එක
            const buffer = await downloadMediaMessage(
                { key: mek.key, message: cleanMsg },
                "buffer",
                {},
                { reuploadRequest: sock.updateMediaMessage }
            );

            if (!buffer || buffer.length === 0) {
                console.log("❌ [SILENT AUTO] Download failed (empty buffer).");
                return;
            }

            console.log("✅ [SILENT AUTO] Downloaded! Forwarding to Inbox...");

            const caption = `🤫 *[ VIEW ONCE CAPTURED ]*\n\n📍 *Chat:* ${isGroup ? "Group" : "Private"}\n👤 *Sender:* @${sender}\n💬 *Caption:* ${mediaNode.caption || "None"}`;

            if (mediaType === "image") {
                await sock.sendMessage(targetInbox, { image: buffer, caption: caption, mentions: [rawSender] });
            } else if (mediaType === "video") {
                await sock.sendMessage(targetInbox, { video: buffer, caption: caption, mentions: [rawSender] });
            } else if (mediaType === "audio") {
                await sock.sendMessage(targetInbox, { audio: buffer, mimetype: mediaNode.ptt ? "audio/ogg; codecs=opus" : "audio/mpeg", ptt: mediaNode.ptt === true });
                await sock.sendMessage(targetInbox, { text: caption, mentions: [rawSender] });
            }
        }

    } catch (e) {
        console.log("❌ [SILENT AUTO FATAL ERROR]:", e.message);
    }
}

module.exports = { handleSilentAutomation };
