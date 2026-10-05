
"use strict";

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { readSettings } = require("../lib/botSettings");

async function handleSilentAutomation(sock, mek, sessionCtx) {
    if (!mek || !mek.message) return;
    if (mek.key.fromMe) return; // තමන්ගෙම මැසේජ් වලට වැඩ කිරීම වැළැක්වීම

    // Settings වලින් silent_automation ON ද කියලා බලනවා
    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings.silent_automation) return;

    // Owner ගේ නොම්බරය ලබා ගැනීම
    const ownerNumber = sessionCtx.ownerNumber?.[0];
    if (!ownerNumber) return;
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;

    const from = mek.key.remoteJid;
    const participant = mek.key.participant || mek.key.remoteJid;
    const sender = participant.split("@")[0];
    const isGroup = from.endsWith("@g.us");

    const msg = mek.message;

    // ─── 1. VIEW ONCE MEDIA අල්ලගැනීම ─────────────────────────────────
    const isViewOnce = msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension;
    
    if (isViewOnce) {
        let mediaNode = null;
        let msgType = '';
        
        const viewOnceMsg = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg.viewOnceMessageV2Extension?.message;
        
        if (viewOnceMsg?.imageMessage) {
            mediaNode = viewOnceMsg.imageMessage;
            msgType = 'imageMessage';
        } else if (viewOnceMsg?.videoMessage) {
            mediaNode = viewOnceMsg.videoMessage;
            msgType = 'videoMessage';
        } else if (viewOnceMsg?.audioMessage) {
            mediaNode = viewOnceMsg.audioMessage;
            msgType = 'audioMessage';
        }

        if (mediaNode) {
            try {
                // Media එක Download කිරීම
                const stream = await downloadContentFromMessage(
                    mediaNode,
                    msgType === 'imageMessage' ? 'image' : msgType === 'videoMessage' ? 'video' : 'audio'
                );
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                const captionInfo = `🤫 *SILENT AUTOMATION [View Once]*\n\n👤 *From:* @${sender}\n📍 *Chat:* ${isGroup ? 'Group' : 'Private Chat'}\n💬 *Caption:* ${mediaNode.caption || 'No Caption'}`;

                // Owner ට Media එක Send කිරීම
                if (msgType === 'imageMessage') {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: captionInfo, mentions: [participant] });
                } else if (msgType === 'videoMessage') {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: captionInfo, mentions: [participant] });
                } else if (msgType === 'audioMessage') {
                    await sock.sendMessage(ownerJid, { text: captionInfo, mentions: [participant] });
                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: mediaNode.mimetype, ptt: mediaNode.ptt });
                }
            } catch (e) {
                console.error("❌ Silent Automation (View Once) Error:", e);
            }
        }
    }

    // ─── 2. EDITED MESSAGES අල්ලගැනීම (Type 14 Protocol Message) ───────
    if (msg.protocolMessage && (msg.protocolMessage.type === 14 || msg.protocolMessage.type === 'MESSAGE_EDIT')) {
        try {
            const editedMessageNode = msg.protocolMessage.editedMessage;
            if (editedMessageNode) {
                let editedText = editedMessageNode.conversation || 
                                 editedMessageNode.extendedTextMessage?.text || '';

                if (editedText) {
                    const captionInfo = `✏️ *SILENT AUTOMATION [Edited Message]*\n\n👤 *From:* @${sender}\n📍 *Chat:* ${isGroup ? 'Group' : 'Private Chat'}\n\n📝 *New Edited Message:*\n${editedText}`;
                    
                    // Owner ට Edited Message එක Send කිරීම
                    await sock.sendMessage(ownerJid, { text: captionInfo, mentions: [participant] });
                }
            }
        } catch (e) {
            console.error("❌ Silent Automation (Edit) Error:", e);
        }
    }
}

module.exports = { handleSilentAutomation };
