const { cmd } = require("../command");
const config = require("../config");
const fs = require("fs");

function saveMode(mode) {
 
  try {
    let env = "";
    if (fs.existsSync("config.env")) env = fs.readFileSync("config.env", "utf8");

   
    env = env.replace(/^MODE=.*$/gm, "").trim();

  
    env = (env ? env + "\n" : "") + `MODE=${mode}\n`;

    fs.writeFileSync("config.env", env);
  } catch (e) {
    console.log("MODE save error:", e);
  }
}

cmd({
  pattern: "private",
  alias: ["pvt", "onlyme", "owneronly", "lock", "botlock"],
  desc: "Set bot private",
  category: "owner",
  react: "🔒",
  filename: __filename
}, async (conn, mek, m, { reply, sender }) => {

  // owner check (simple)
  const owner = (config.BOT_OWNER || "").replace(/\D/g, "");
  const who = (sender || "").replace(/\D/g, "");
  if (who !== owner) return reply("❌ Owner only");

  config.MODE = "private";
  saveMode("private");

  return reply("🔒 * MALIYA-MD Bot is now PRIVATE*\n.");
});

cmd({
  pattern: "public",
  alias: ["pub", "everyone", "all", "unlock", "botopen"],
  desc: "Set bot public",
  category: "owner",
  react: "🌍",
  filename: __filename
}, async (conn, mek, m, { reply, sender }) => {

  const owner = (config.BOT_OWNER || "").replace(/\D/g, "");
  const who = (sender || "").replace(/\D/g, "");
  if (who !== owner) return reply("❌ Owner only");

  config.MODE = "public";
  saveMode("public");

  return reply("🌍 * MALIYA-MD Bot is now PUBLIC*\n.");
});
