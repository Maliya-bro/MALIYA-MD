const { cmd } = require('../command');

// Channel Forwarding Meta Data
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

function getChannelContext() {
    return {
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: CHANNEL_JID,
                newsletterName: CHANNEL_NAME,
                serverMessageId: -1,
            },
        }
    };
}

// Available Sounds & Triggers List
const memeSoundsList = [
    { title: "Mama Thama Pakgediya", triggers: ["mama thama", "pakgediya", "danaraja"] },
    { title: "Apita Uyagena Kanna", triggers: ["uyagena kanna", "kanna puluwan", "apita uyagena"] },
    { title: "Ayyo Hamanenawa", triggers: ["ayyo hamanenawa", "hamanenawa", "ayyo"] },
    { title: "Boru Marisi", triggers: ["boru marisi", "marisi danna epa"] },
    { title: "Call Ganna Epa", triggers: ["call ganna epa", "dont call", "call epa"] },
    { title: "Appudi / Clap", triggers: ["clap", "appudi", "claps"] },
    { title: "Cry / Adanawa", triggers: ["cry", "andanna", "adanawa"] },
    { title: "Dane Bara Gaththa", triggers: ["dane bara gaththa", "dane", "bara gaththa"] },
    { title: "Eew / Gross", triggers: ["eew", "chi", "gross"] },
    { title: "Fhaa", triggers: ["fhaa", "fa", "fah", "faa"] },
    { title: "Genna Thuwakkuwa", triggers: ["genna thuwakkuwa", "thuwakkuwa", "gun"] },
    { title: "Give Some Help", triggers: ["give some help", "help me", "help"] },
    { title: "Haaa", triggers: ["haaa", "ha"] },
    { title: "Man Kamathi Sirimalta", triggers: ["man kamathi sirimalta", "sirimalta"] },
    { title: "Man Oyata Adareyine", triggers: ["man oyata adareyine", "adareyine", "love"] },
    { title: "Mata Ba Daddy Full", triggers: ["mata ba daddy full", "daddy full", "daddy"] },
    { title: "Mata Ba Daddy", triggers: ["mama marenawa", "mata ba daddy", "mata ba"] },
    { title: "Muwa Duwanawa", triggers: ["muwa duwanawa", "duwanawa", "run"] },
    { title: "Nice / Elakiri", triggers: ["nice", "elakiri", "maru"] },
    { title: "Noo", triggers: ["noo", "no", "ne"] },
    { title: "Shakabom", triggers: ["shakabom", "shaka", "boom"] },
    { title: "Sathya Bohoma Katukayi", triggers: ["sathya bohoma katukayi", "katukayi"] },
    { title: "Tape Karaganin", triggers: ["tape karaganin", "record karaganin"] },
    { title: "Uba Hena Kathayi", triggers: ["uba hena kathayi", "hena kathayi"] },
    { title: "What", triggers: ["what", "mowada", "mokadda"] },
    { title: "Why Are You Running", triggers: ["why are you running", "running"] },
    { title: "Wow / Supiri", triggers: ["wow", "woow", "supiri"] }
];

cmd({
    pattern: "sounds",
    alias: ["sound", "meme", "memes", "soundlist"],
    desc: "Get all available meme sounds list",
    category: "fun",
    react: "🎵",
    filename: __filename
}, async (bot, mek, m, { from }) => {
    try {
        let menuText = `╭─[ 🎵 *ＭＡＬＩＹＡ－ＭＤ ＳＯＵＮＤＳ* 🎵 ]─╮\n│\n`;
        menuText += `├─ 💡 *Usage:* Type any trigger word below to play the sound!\n│\n`;

        memeSoundsList.forEach((sound, index) => {
            const num = (index + 1).toString().padStart(2, '0');
            const mainTrigger = sound.triggers[0];
            menuText += `├─ 🔊 *${num}. ${sound.title}*\n`;
            menuText += `│   └─ 👉 \`.${mainTrigger}\`\n`;
        });

        menuText += `│\n╰───────────────────╯`;

        await bot.sendMessage(from, {
            text: menuText,
            ...getChannelContext()
        }, { quoted: mek });

    } catch (error) {
        console.error("Sounds Menu Error:", error);
    }
});
