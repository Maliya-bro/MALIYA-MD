const { cmd, commands } = require("../command");
const axios = require("axios");

cmd(
  {
    pattern: "word",
    alias: ["meaning", "def", "dic"],
    react: "📖",
    desc: "Get word definition",
    category: "tools",
    filename: __filename,
  },
  async (
    danuwa,
    mek,
    m,
    {
      from,
      q,
      reply,
    }
  ) => {
    try {
      if (!q) return reply("*Please provide a word to define.* ❓");

      const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`);
      const data = res.data[0];

      let definitionText = `📚 *Definition of "${data.word}"*\n\n`;

      data.meanings.forEach((meaning, i) => {
        definitionText += `🔹 *Part of Speech:* ${meaning.partOfSpeech}\n`;
        meaning.definitions.slice(0, 2).forEach((def, j) => {
          definitionText += `   ${j + 1}. ${def.definition}\n`;
          if (def.example) {
            definitionText += `      _e.g., ${def.example}_\n`;
          }
        });
        definitionText += `\n`;
      });

      reply(definitionText.trim());
    } catch (e) {
      console.error(e);
      reply("*Could not find a definition for that word.* 😓");
    }
  }
);
