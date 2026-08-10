const { cmd } = require("../command");
const { generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys");

cmd(
  {
    pattern: "testbtn3",
    alias: ["btn3"],
    desc: "Test Pure Native Flow Buttons using Whiskeysockets",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from }) => {
    try {
      const msg = generateWAMessageFromContent(
        from,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({
                  text: "👋 *Whiskeysockets Native Flow Test*\n\nමෙන්න pure Baileys interactive buttons.",
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: "MALIYA-MD | Whiskeysockets Baileys",
                }),
                header: proto.Message.InteractiveMessage.Header.create({
                  title: "🔥 Modern Native Buttons",
                  hasMediaAttachment: false,
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [
                      // 1. Quick Reply Button
                      {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                          display_text: "⚡ Quick Action",
                          id: ".ping",
                        }),
                      },
                      // 2. Copy Code Button
                      {
                        name: "cta_copy",
                        buttonParamsJson: JSON.stringify({
                          display_text: "📋 Copy Code",
                          id: "copy_btn",
                          copy_code: "MALIYA-MD",
                        }),
                      },
                      // 3. URL Link Button
                      {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                          display_text: "🌐 Open Link",
                          url: "https://github.com",
                          merchant_url: "https://github.com",
                        }),
                      },
                    ],
                  }),
              }),
            },
          },
        },
        { quoted: mek }
      );

      await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
    } catch (e) {
      console.log("BUTTON ERROR:", e);
    }
  }
);
