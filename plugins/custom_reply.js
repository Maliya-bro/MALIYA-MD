const { replyHandlers } = require("../command");
const { readSettings } = require("../lib/botSettings");

const customReplyHandler = {
  filter: () => true, // හැම මැසේජ් එකක්ම අරන් ඇතුලෙන් ෆිල්ටර් කරනවා
  function: async (sock, mek, m, { body, from, isGroup, sessionId }) => {
    try {
      if (!body) return; // මැසේජ් එකේ අකුරු නැත්තම් අතහරිනවා
      
      const settings = await readSettings(sessionId);
      
      // Custom Auto Reply On කරලා තියෙනවද සහ Rules තියෙනවද බලනවා
      if (!settings || !settings.custom_auto_reply || !settings.custom_reply_rules) return;

      const rules = settings.custom_reply_rules;
      if (rules.length === 0) return;

      const text = body.toLowerCase().trim();

      for (const rule of rules) {
        // "hi, hello, hey" වගේ තියෙන එක කොමා වලින් කඩලා Array එකක් කරනවා
        const triggers = rule.triggers.split(",").map(t => t.trim().toLowerCase());
        
        // යවපු මැසේජ් එක අර Triggers වල තියෙන වචනෙකට හරියටම සමානද බලනවා
        if (triggers.includes(text)) {
          await sock.sendMessage(from, { text: rule.reply }, { quoted: mek });
          return; // එකක් මැච් වුණාම නවත්තනවා, නැත්තම් මැසේජ් ගොඩක් යයි
        }
      }
    } catch (e) {
      console.log("Custom Reply Error:", e);
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(customReplyHandler);
}

module.exports = {};
