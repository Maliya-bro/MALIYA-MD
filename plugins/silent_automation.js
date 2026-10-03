const { sms } = require("../lib/msg");

console.log("✅ [SILENT AUTO] Multi-Device Global Hook Loaded!");

const editCache = new Map();

const silentAutomationHook = {
    onMessage: async (sock, mek) => {
        try {
            if (!mek?.message || mek.key.fromMe) return;

            // 🎯 අනිවාර්යයෙන්ම: ඔබගේ msg.js wrapper එක හරහාම message එක සකසා ගැනීම
            const m = sms(sock, mek);
            
            // Channels සහ Status Broadcast මඟ හැරීම
            if (m.chat === "status@broadcast" || m.chat.endsWith("@newsletter")) return;

            // 🎯 Multi-Device නිසා Bot Run වෙන අංකය (Owner Inbox) හරියටම ගැනීම
            const ownerNum = sock.user?.id?.split(":")[0];
            if (!ownerNum) return;
            const ownerJid = `${ownerNum}@s.whatsapp.net`;

            const chatType = m.isGroup ? "👥 Group" : "👤 Private Chat";
            const senderTag = `@${m.sender.split("@")[0]}`;

            // ── 1. EDITED MESSAGE TRACKER ──
            if (m.type === "protocolMessage" && m.msg && m.msg.type === 14) {
                const targetId = m.msg.key?.id;
                const cached = editCache.get(targetId);
                
                let newText = "";
                if (m.msg.editedMessage) {
                    const editObj = m.msg.editedMessage;
                    newText = editObj.conversation || editObj.extendedTextMessage?.text || "";
                }

                const oldText = cached ? cached.text : "*(Not cached)*";
                if (cached && cached.text === newText) return;

                await sock.sendMessage(ownerJid, {
                    text: `📝 *[ SILENT EDITS ]*\n\n📍 *Chat:* ${chatType}\n👤 *From:* ${senderTag}\n\n❌ *Old:*\n${oldText}\n\n✏️ *New:*\n${newText || "*(Cleared)*"}`,
                    mentions: [m.sender]
                });
                return;
            }

            // සාමාන්‍ය මැසේජ් Text එක Cache එකට දැමීම (Edits අල්ලන්න)
            if (m.id && m.body) {
                editCache.set(m.id, { text: m.body, time: Date.now() });
                if (editCache.size > 1000) editCache.delete(editCache.keys().next().value);
            }

            // ── 2. VIEW ONCE INTERCEPTOR ──
            const msgStr = JSON.stringify(m.message);
            const isViewOnce = msgStr.includes('viewOnceMessage') || msgStr.includes('"viewOnce":true');

            if (isViewOnce) {
                // 🎯 msg.js හි ඇති downloadMediaMessage හරහා සෘජුවම බෆර් එක ඩවුන්ලෝඩ් කිරීම (100% Guaranteed)
                const buffer = await m.download();
                if (!buffer) return;

                let type = m.type;
                if (type === 'viewOnceMessageV2' || type === 'viewOnceMessage' || type.includes('viewOnce')) {
                    type = m.msg?.type || Object.keys(m.msg || {})[0] || 'unknown';
                }

                const captionText = m.msg?.caption || m.body || "None";
                const captionMsg = `🤫 *[ VIEW ONCE CAPTURED ]*\n\n📍 *Chat:* ${chatType}\n👤 *From:* ${senderTag}\n💬 *Caption:* ${captionText}`;

                if (type.includes('image')) {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: captionMsg, mentions: [m.sender] });
                } else if (type.includes('video')) {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: captionMsg, mentions: [m.sender] });
                } else if (type.includes('audio')) {
                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true });
                    await sock.sendMessage(ownerJid, { text: captionMsg, mentions: [m.sender] });
                }
            }
        } catch (e) {
            console.log("❌ Silent Auto Error:", e.message);
        }
    }
};

// Global Hook එකට Connect කිරීම මගින් index.js bypass කර කෙළින්ම Run කරවීම
global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(silentAutomationHook);

module.exports = { silentAutomationHook };
