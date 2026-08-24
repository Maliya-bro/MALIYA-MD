// plugins/status_download.js
// Download status updates by replying with: .status, .save, .danna, etc.

const { cmd, replyHandlers } = require("../command");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

// Store pending download requests
const pendingDownloads = new Map();

function makePendingKey(sender, from) {
  return `${from || ""}::${(sender || "").split(":")[0]}`;
}

// ── Helper: Download and send status ──────────────────────
async function downloadAndSendStatus(sock, mek, from, quotedMsg, reply, sender) {
  try {
    if (!quotedMsg || (!quotedMsg.imageMessage && !quotedMsg.videoMessage)) {
      return reply("❌ *Please reply to a status message (image or video) with a command.*");
    }

    // React with downloading emoji
    try {
      await sock.sendMessage(from, { 
        react: { text: "⏳", key: mek.key }
      });
    } catch (_) {}

    const msgType = quotedMsg.imageMessage ? "imageMessage" : "videoMessage";
    const mediaMsg = quotedMsg[msgType];
    
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
    
    // Get sender info from quoted message
    const statusSender = quotedMsg.key?.participant || 
                         quotedMsg.key?.remoteJid || 
                         sender || 
                         "Unknown";
    
    const senderName = statusSender.split("@")[0] || "Unknown";
    
    // Send the downloaded status back
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

    return true;
  } catch (e) {
    console.log("Status download error:", e?.message || e);
    reply("❌ *Failed to download status. Please try again.*");
    return false;
  }
}

// ── Main Command ──────────────────────────────────────────
cmd(
  {
    pattern: "status",
    alias: [
      "save", 
      "danna", 
      "ewanna", 
      "denna", 
      "dahanko", 
      "ewapanko", 
      "dipan", 
      "stdl", 
      "satatus", 
      "satsave"
    ],
    react: "📥",
    desc: "Download status by replying to it",
    category: "tools",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply, sender }) => {
    try {
      // Check if there's a quoted message
      const quotedMsg = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (!quotedMsg) {
        return reply(
          "❌ *Please reply to a status message with this command.*\n\n" +
          "📌 *How to use:*\n" +
          "1. Open a status\n" +
          "2. Reply to it with: `.status`, `.save`, `.danna`, etc.\n" +
          "3. Bot will download and send it to you!"
        );
      }

      // Check if quoted message is a status media
      if (!quotedMsg.imageMessage && !quotedMsg.videoMessage) {
        return reply(
          "❌ *Please reply to a status message (image or video).*\n\n" +
          "📌 You replied to a text message. Please reply to a status."
        );
      }

      // Download and send
      await downloadAndSendStatus(sock, mek, from, quotedMsg, reply, sender);
      
    } catch (e) {
      console.log("STATUS COMMAND ERROR:", e?.message || e);
      reply("❌ *Error while downloading status. Please try again.*");
    }
  }
);

// ── Reply Handler (for button/quick reply support) ──────
replyHandlers.push({
  filter: (_body, { sender, from }) => {
    // Check if the message is one of our trigger words
    const triggers = [
      '.status', '.save', '.danna', '.ewanna', '.denna', 
      '.dahanko', '.ewapanko', '.dipan', '.stdl', 
      '.satatus', '.satsave'
    ];
    const body = String(_body || "").trim().toLowerCase();
    return triggers.includes(body);
  },
  
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    try {
      // Check if there's a quoted message
      const quotedMsg = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (!quotedMsg) {
        return reply(
          "❌ *Please reply to a status message with this command.*\n\n" +
          "📌 Reply to a status with `.status`, `.save`, `.danna`, etc."
        );
      }

      if (!quotedMsg.imageMessage && !quotedMsg.videoMessage) {
        return reply("❌ *Please reply to a status message (image or video).*");
      }

      // Download and send
      await downloadAndSendStatus(sock, mek, from, quotedMsg, reply, sender);
      
    } catch (e) {
      console.log("STATUS REPLY HANDLER ERROR:", e?.message || e);
      reply("❌ *Error while downloading status. Please try again.*");
    }
  }
});

console.log("✅ Status Download Plugin loaded! (Commands: .status, .save, .danna, .ewanna, .denna, .dahanko, .ewapanko, .dipan, .stdl, .satatus, .satsave)");
