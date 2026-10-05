"use strict";

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { readSettings } = require("../lib/botSettings");

// WhatsApp වලින් එන හැකි සෑම Wrapper එකක්ම ගලවා ඇතුළත Core Message එක ගන්නා Function එක
function unwrapDeep(msg) {
    if (!msg) return msg;
    if (msg.message) return unwrapDeep(msg.message);
    if (msg.ephemeralMessage) return unwrapDeep(msg.ephemeralMessage.message);
    if (msg.documentWithCaptionMessage) return unwrapDeep(msg.documentWithCaptionMessage.message);
    if (msg.deviceSentMessage) return unwrapDeep(msg.deviceSentMessage.message);
    if (msg.botInvokeMessage) return unwrapDeep(msg.botInvokeMessage.message);
    return msg;
}

async function handleSilentAutomation(sock, mek, sessionCtx) {
    if (!mek || !mek.message) return;
    if (mek.key.fromMe) return; // තමන්ගෙම මැසේජ් අල්ලන්නේ නෑ

    const settings = await readSettings(sessionCtx.sessionId);
    if (!settings.silent_automation) return;

    const ownerNumber = sessionCtx.ownerNumber?.[0];
    if (!ownerNumber) return;
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;

    const from = mek.key.remoteJid;
    const participant = mek.key.participant || mek.key.remoteJid;
    const sender = participant.split("@")[0];
    const isGroup = from.endsWith("@g.us");

    // සියලුම Covers ගලවා Core Message එක ලබා ගැනීම
    const coreMsg = unwrapDeep(mek.message);
    if (!coreMsg) return;

    // ─── 1. VIEW ONCE MEDIA අල්ලගැනීම ─────────────────────────────────
    let isViewOnce = false;
    let mediaNode = null;
    let msgType = '';

    // View Once කවරයක් ඇතුලේ තිබේදැයි බැලීම (V1, V2, V2Extension ඔක්කොම බලනවා)
    const voNode = coreMsg.viewOnceMessage?.message || 
                   coreMsg.viewOnceMessageV2?.message || 
                   coreMsg.viewOnceMessageV2Extension?.message;

    if (voNode) {
        isViewOnce = true;
        if (voNode.imageMessage) { mediaNode = voNode.imageMessage; msgType = 'imageMessage'; }
        else if (voNode.videoMessage) { mediaNode = voNode.videoMessage; msgType = 'videoMessage'; }
        else if (voNode.audioMessage) { mediaNode = voNode.audioMessage; msgType = 'audioMessage'; }
    } else {
        // සමහර WhatsApp Versions කෙලින්ම Media Node එකේ View Once Flag එක එවනවා
        if (coreMsg.imageMessage?.viewOnce) { isViewOnce = true; mediaNode = coreMsg.imageMessage; msgType = 'imageMessage'; }
        else if (coreMsg.videoMessage?.viewOnce) { isViewOnce = true; mediaNode = coreMsg.videoMessage; msgType = 'videoMessage'; }
        else if (coreMsg.audioMessage?.viewOnce) { isViewOnce = true; mediaNode = coreMsg.audioMessage; msgType = 'audioMessage'; }
    }

    if (isViewOnce && mediaNode) {
        try {
            const stream = await downloadContentFromMessage(
                mediaNode,
                msgType === 'imageMessage' ? 'image' : msgType === 'videoMessage' ? 'video' : 'audio'
            );
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const captionInfo = `🤫 *SILENT AUTOMATION [View Once]*\n\n👤 *From:* @${sender}\n📍 *Chat:* ${isGroup ? 'Group' : 'Private Chat'}\n💬 *Caption:* ${mediaNode.caption || 'No Caption'}`;

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

    // ─── 2. EDITED MESSAGES අල්ලගැනීම ─────────────────────────────────
    if (coreMsg.protocolMessage) {
        const pm = coreMsg.protocolMessage;
        // Type 14 = MESSAGE_EDIT
        if (pm.type === 14 || pm.type === 'MESSAGE_EDIT') {
            const editedNode = pm.editedMessage;
            if (editedNode) {
                // Edit කරපු අලුත් මැසේජ් එකත් සමහරවිට Disappearing Wrapper එකක එන්න පුළුවන් නිසා ඒකත් අනිවාර්යයෙන් Unwrap කරනවා
                const cleanEdit = unwrapDeep(editedNode);
                let editedText = cleanEdit.conversation || cleanEdit.extendedTextMessage?.text || '';

                if (editedText) {
                    const captionInfo = `✏️ *SILENT AUTOMATION [Edited Message]*\n\n👤 *From:* @${sender}\n📍 *Chat:* ${isGroup ? 'Group' : 'Private Chat'}\n\n📝 *New Message:*\n${editedText}`;
                    await sock.sendMessage(ownerJid, { text: captionInfo, mentions: [participant] });
                }
            }
        }
    }
}

module.exports = { handleSilentAutomation };
