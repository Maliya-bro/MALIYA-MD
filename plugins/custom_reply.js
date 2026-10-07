const { replyHandlers } = require("../command");
const { readSettings } = require("../lib/botSettings");

const customReplyHandler = {
  filter: () => true,
  function: async (sock, mek, m, { body, from, sender, isOwner, sessionId }) => {
    try {
      if (!body) return;

      // 🚨 1. තමන්ගේම ගිණුමෙන් (From Me) යවන මැසේජ් සම්පූර්ණයෙන්ම නවත්වයි
      if (mek?.key?.fromMe || m?.fromMe) return;

      // 🚨 2. බොට් විසින් යවපු මැසේජ් වල ID එකක් නම් නවත්වයි (Loop Guard)
      if (mek?.key?.id && global.__botSentMessageIds?.has(mek.key.id)) return;

      // 🚨 3. බොට්ගේ Owner (එනම් ඔයාම) දාන මැසේජ් එකක් නම් රිප්ලයි නොකරයි
      const botNumber = sock?.user?.id?.split(":")[0]?.split("@")[0]?.replace(/\D/g, "");
      const senderNumber = (sender || mek?.key?.participant || from || "")
        ?.split(":")[0]
        ?.split("@")[0]
        ?.replace(/\D/g, "");

      if (botNumber && senderNumber && botNumber === senderNumber) return;
      if (isOwner) return;

      const settings = await readSettings(sessionId);
      
      // Custom Auto Reply ON ද සහ Rules තියෙනවද බලයි
      if (!settings || !settings.custom_auto_reply || !settings.custom_reply_rules) return;

      const rules = settings.custom_reply_rules;
      if (!Array.isArray(rules) || rules.length === 0) return;

      const text = String(body).toLowerCase().trim();

      for (const rule of rules) {
        if (!rule.triggers || !rule.reply) continue;

        // Comma වලින් වෙන් කරලා Triggers array එකක් හදයි
        const triggers = rule.triggers
          .split(",")
          .map(t => t.trim().toLowerCase())
          .filter(Boolean);
        
        // හරියටම වචනය සමාන නම් පමණක් රිප්ලයි කරයි
        if (triggers.includes(text)) {
          await sock.sendMessage(from, { text: rule.reply }, { quoted: mek });
          return;
        }
      }
    } catch (e) {
      console.log("Custom Reply Error:", e?.message || e);
    }
  }
};

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(customReplyHandler);
}

module.exports = {};
