const { cmd } = require("../command");
const { sendInteractiveMessage } = require("gifted-btns");

cmd(
  {
    pattern: "testbtn",
    alias: ["btn", "tb"],
    desc: "Test Native Flow Quick Reply Buttons",
    category: "main",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply }) => {
    try {
      // Reaction එකක් දාන්න
      await sock.sendMessage(from, { react: { text: "🔘", key: mek.key } });

      // Native Flow Quick Reply Buttons යැවීම
      await sendInteractiveMessage(
        sock,
        from,
        {
          text: "👋 *Native Flow Button Test*\n\nපහත Buttons හරියට Render වෙනවාද කියලා Check කරන්න.",
          footer: "MALIYA-MD | Button Test",
          interactiveButtons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "⚡ Click Me!",
                id: "test_btn_1",
              }),
            },
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "📌 Ping Bot",
                id: ".ping",
              }),
            },
          ],
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("BUTTON TEST ERROR:", e);
      reply("❌ Button Message එක යවන්න බැරි වුණා: " + e.message);
    }
  }
);
