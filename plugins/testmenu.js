const { cmd } = require("../command");
const { sendInteractiveMessage } = require("gifted-btns");
const axios = require("axios");

cmd(
  {
    pattern: "testmenu",
    desc: "Test gifted-btns with location thumbnail and side-by-side buttons",
    category: "test",
    react: "🧪",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply }) => {
    try {
      const headerUrl = "https://i.ibb.co/4pDNDk1/avatar.png";

      // Thumbnail buffer download maduvudu
      let thumbBuffer;
      try {
        const res = await axios.get(headerUrl, {
          responseType: "arraybuffer",
          timeout: 5000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        thumbBuffer = Buffer.from(res.data);
      } catch (err) {
        // Fallback transparent buffer
        thumbBuffer = Buffer.from(
          "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
          "base64"
        );
      }

      // Test Category List Rows
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

      // Side-by-Side 2 Buttons: 1 Single Select (List) + 1 Quick Reply (Ping)
      const interactiveButtons = [
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

      // Location thumbnail trick jothege message send maduvudu
      await sendInteractiveMessage(
        sock,
        from,
        {
          text: "👋 *HI TEST USER*\n\n╭─ 「 *BOT'S MENU* 」\n│ 👾 *Bot :* MALIYA-MD\n│ 🎯 *Prefix :* [ . ]\n╰───────────────┈➤\n\n🎀 *≡ Select a Command List: ≡*",
          footer: "© 2026 MALIYA-MD SYSTEM",
          interactiveButtons: interactiveButtons,
          location: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            jpegThumbnail: thumbBuffer,
          },
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("GIFTED BTNS LOCATION TEST ERROR:", e);
      reply("❌ Error: " + (e?.message || e));
    }
  }
);
