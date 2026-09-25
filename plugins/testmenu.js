const { cmd } = require("../command");

cmd(
  {
    pattern: "testmenu",
    desc: "Test native interactive list menu without server drop",
    category: "test",
    react: "🧪",
    filename: __filename,
  },
  async (sock, mek, m, { from, reply }) => {
    try {
      const headerUrl = "https://i.ibb.co/4pDNDk1/avatar.png";

      // 1. List Rows සැකසුම
      const listRows = [
        {
          header: "",
          title: "📥 Download Menu",
          description: "Show downloader commands list",
          id: ".ping",
        },
        {
          header: "",
          title: "⚙️ System Menu",
          description: "Show bot system commands",
          id: ".ping",
        },
      ];

      // 2. Buttons දෙක (Single Select + Quick Reply Ping)
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

      // 3. Drop නොවී යවන නිවැරදි Image Header සහිත interactiveMessage ආකෘතිය
      await sock.sendMessage(
        from,
        {
          image: { url: headerUrl },
          caption: "👋 *HI TEST USER*\n\n╭─ 「 *BOT'S MENU* 」\n│ 👾 *Bot :* MALIYA-MD\n│ 🎯 *Prefix :* [ . ]\n╰───────────────┈➤\n\n🎀 *≡ Select a Command List: ≡*",
          footer: "© 2026 MALIYA-MD SYSTEM",
          buttons: buttons,
          headerType: 4,
          viewOnce: true,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("TEST MENU ERROR:", e);
      reply("❌ Error: " + (e?.message || e));
    }
  }
);
