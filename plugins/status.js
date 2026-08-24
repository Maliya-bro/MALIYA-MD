// plugins/status_download.js
// Download status updates by replying with: .status, .save, .danna, .ewanna, .denna, .dahanko, .ewapanko, dipan, stdl, .satatus, .satsave

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = {
  onMessage: async (sock, mek) => {
    try {
      // Get the message body
      const body = mek.message?.conversation || 
                   mek.message?.extendedTextMessage?.text || 
                   "";
      
      const trimmed = body.toLowerCase().trim();

      // ✅ All supported aliases (with and without dot for safety)
      const TRIGGER_WORDS = new Set([
        '.status',
        '.save',
        '.danna',
        '.ewanna',
        '.denna',
        '.dahanko',
        '.ewapanko',
        '.dipan',
        '.stdl',
        '.satatus',
        '.satsave',
        'dipan',   // without dot (user requested)
        'stdl',
        'save'
        'danna',
      'ewanna',
      'denna',
      'ewannako',
      'status',
      'give'
      // without dot (user requested)
      ]);

      // Only process if the message matches any trigger word
      if (!TRIGGER_WORDS.has(trimmed)) {
        return; // Exit if not a trigger
      }

      // Get the quoted message (the status they replied to)
      const quotedMsg = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const from = mek.key.remoteJid;
      const sender = mek.key.participant || mek.key.remoteJid;

      // Check if the quoted message has media (image or video)
      if (quotedMsg && (quotedMsg.imageMessage || quotedMsg.videoMessage)) {
        const msgType = quotedMsg.imageMessage ? "imageMessage" : "videoMessage";
        const mediaMsg = quotedMsg[msgType];
        
        // React with downloading emoji
        try {
          await sock.sendMessage(from, { 
            react: { text: "⏳", key: mek.key }
          });
        } catch (_) {}
        
        // Download the media
        const stream = await downloadContentFromMessage(
          mediaMsg,
          msgType === "imageMessage" ? "image" : "video"
        );
        
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        
        const mimetype = mediaMsg.mimetype || (msgType === "imageMessage" ? "image/jpeg" : "video/mp4");
        const caption = mediaMsg.caption || "";
        
        // Get sender info from the quoted message
        const statusSender = quotedMsg.key?.participant || 
                            quotedMsg.key?.remoteJid || 
                            sender || 
                            "Unknown";
        
        const senderName = statusSender.split("@")[0] || "Unknown";
        
        // Send the downloaded status back to the user
        await sock.sendMessage(
          from,
          {
            [msgType === "imageMessage" ? "image" : "video"]: buffer,
            mimetype,
            caption: `📥 *Status Downloaded*\n👤 From: ${senderName}\n\n${caption}`
          },
          { quoted: mek }
        );
        
        // React with success
        try {
          await sock.sendMessage(from, { 
            react: { text: "✅", key: mek.key }
          });
        } catch (_) {}
        
      } else {
        // No status quoted
        const triggerList = Array.from(TRIGGER_WORDS).slice(0, 5).join(', ');
        await sock.sendMessage(from, { 
          text: `❌ *Please reply to a status message with any of these commands:*\n\n📌 \`${triggerList}\` ...\n\n💡 Example: Reply to a status with \`.status\``,
        }, { quoted: mek });
      }
    } catch (e) {
      console.log("Status download plugin error:", e?.message || e);
      try {
        await sock.sendMessage(mek.key.remoteJid, { 
          text: "❌ *Failed to download status. Please try again.*"
        }, { quoted: mek });
      } catch (_) {}
    }
  }
};
