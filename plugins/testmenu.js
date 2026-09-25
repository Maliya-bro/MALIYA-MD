const { cmd } = require("../command");
const axios = require("axios");

cmd(
  {
    pattern: "testmenu",
    desc: "Test native location thumbnail with side-by-side buttons",
    category: "test",
    react: "🧪",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply }) => {
    try {
      const headerUrl = "https://i.ibb.co/4pDNDk1/avatar.png";

      // 1. Thumbnail Buffer එක ලබාගැනීම
      let thumbBuffer;
      try {
        const res = await axios.get(headerUrl, {
          responseType: "arraybuffer",
          timeout: 6000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        thumbBuffer = Buffer.from(res.data);
      } catch (err) {
        thumbBuffer = Buffer.from(
          "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
          "base64"
        );
      }

      // 2. Categories List එකේ Rows
      const listRows = [
        {
          title: "📥 Download Menu",
          description: "Show downloader commands list",
          id: ".ping",
        },
        {
          title: "⚙️ System Menu",
          description: "Show bot system commands",
          id: ".ping",
        },
      ];

      // 3. Side-by-Side Buttons: Single Select (List) + Quick Reply (Ping)
      const buttons = [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "≡ List Menu",
            sections: [
              {
                title: "📁 Test Categories",
                rows: listRows,
              },
            ],
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📊 Ping",
            id: ".ping",
          }),
        },
      ];

      // 4. Baileys core එක load කර ගැනීම
      const baileys = await import("@whiskeysockets/baileys").catch(() =>
        import("@vanzxy/baileys")
      );
      const { generateWAMessageFromContent, proto } = baileys;

      // 5. Location Message එක Header එකක් ලෙස සහිතව Message Payload එක හැදීම
      const msg = generateWAMessageFromContent(
        from,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create({
                  title: "",
                  hasMediaAttachment: true,
                  locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    jpegThumbnail: thumbBuffer,
                  },
                }),
                body: proto.Message.InteractiveMessage.Body.create({
                  text: "👋 *HI TEST USER*\n\n╭─ 「 *BOT'S MENU* 」\n│ 👾 *Bot :* MALIYA-MD\n│ 🎯 *Prefix :* [ . ]\n╰───────────────┈➤\n\n🎀 *≡ Select a Command List: ≡*",
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: "© 2026 MALIYA-MD SYSTEM",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: buttons,
                  }),
                contextInfo: {
                  stanzaId: mek.key.id,
                  participant: mek.key.participant || mek.key.remoteJid,
                  quotedMessage: mek.message,
                },
              }),
            },
          },
        },
        { quoted: mek }
      );

      // 6. Generated Message ID එක සමඟ Relay කිරීම
      await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
    } catch (e) {
      console.log("LOCATION TEST ERROR:", e);
      reply("❌ Error: " + (e?.message || e));
    }
  }
);
