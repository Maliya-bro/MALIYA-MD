const { cmd } = require('../command');
const path = require('path');
const fs = require('fs');

// Channel Forwarding Meta Data
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ－ 〽️Ｄ 🍁";

function channelContextInfo() {
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

// ---------- SOUND CONFIGURATION ----------
const soundDir = path.join(__dirname, '../sounds'); 

const soundConfig = [
    { file: 'amma thama maha pakgediya.MP3', triggers: ['mama thama', 'pakgediya', 'danaraja', 'mama thama maha pakgediya', 'thaggedi pukawal', 'mama thama pakgediya'] },
    { file: 'apita uyagena kanna puluwan.MP3', triggers: ['uyagena kanna', 'kanna puluwan', 'apita uyagena', 'apita uyagena kanna puluwan'] },
    { file: 'ayyo hamanenanwa.MP3', triggers: ['ayyo hamanenawa', 'hamanenawa', 'ayyo', 'phone eka lamayekuta dipan'] },
    { file: 'boru marisi danna epa.MP3', triggers: ['boru marisi', 'marisi danna epa', 'marisi', 'boru marisi danna epa'] },
    { file: 'call ganna epa.MP3', triggers: ['call ganna epa', 'dont call', 'call epa'] },
    { file: 'clap.MP3', triggers: ['clap', 'appudi', 'claps'] },
    { file: 'cry.MP3', triggers: ['cry', 'andanna', 'adanawa'] },
    { file: 'dane bara gaththa neda.MP3', triggers: ['dane bara gaththa', 'dane', 'bara gaththa', 'dane bara gaththa neda'] },
    { file: 'eew.MP3', triggers: ['eew', 'chi', 'gross'] },
    { file: 'fhaa.MP3', triggers: ['fhaa', 'fa', 'fah', 'fha', 'faa'] },
    { file: 'genna thuwakkuwa.MP3', triggers: ['genna thuwakkuwa', 'thuwakkuwa', 'gun', 'police jeep eke thiyena thuwakkuwa'] },
    { file: 'give some help.MP3', triggers: ['give some help', 'help me', 'help'] },
    { file: 'haaa.MP3', triggers: ['haaa', 'ha'] },
    { file: 'man kamathi sirimalta.MP3', triggers: ['man kamathi sirimalta', 'sirimalta', 'sirimal'] },
    { file: 'man oyata adareyine.MP3', triggers: ['man oyata adareyine', 'adareyine', 'iloveyou', 'love', 'ala dennam'] },
    { file: 'mata ba mata ba daddy full.MP3', triggers: ['mata ba daddy full', 'daddy full', 'daddy', 'mata ba mata ba daddy'] },
    { file: 'mata ba mata ba daddy.MP3', triggers: ['mama marenawa', 'mata ba daddy', 'mata ba'] },
    { file: 'muwa duwanawa.MP3', triggers: ['muwa duwanawa', 'duwanawa', 'run'] },
    { file: 'nice.MP3', triggers: ['nice', 'elakiri', 'maru'] },
    { file: 'noo.MP3', triggers: ['noo', 'no', 'ne'] },
    { file: 'shakabom.MP3', triggers: ['shakabom', 'shaka', 'boom'] },
    { file: 'sthya bohoma katukayi.MP3', triggers: ['sathya bohoma katukayi', 'katukayi', 'sathya'] },
    { file: 'tape karaganin.MP3', triggers: ['tape karaganin', 'record karaganin', 'tape', 'ubalath tape karaganin bn'] },
    { file: 'uba hena kathayi.MP3', triggers: ['uba hena kathayi', 'hena kathayi', 'kathayi', 'uba hena kathayi yako'] },
    { file: 'what.MP3', triggers: ['what', 'mowada', 'mokadda'] },
    { file: 'why are you running.MP3', triggers: ['why are you running', 'why running', 'running'] },
    { file: 'wow.MP3', triggers: ['wow', 'woow', 'supiri'] }
];

// Build Map
const soundMap = {};

soundConfig.forEach(item => {
    const fullPath = path.join(soundDir, item.file);
    item.triggers.forEach(trigger => {
        soundMap[trigger.toLowerCase().trim()] = fullPath;
    });
});

// ---------- REGISTER COMMAND ----------
cmd({
    pattern: "meme",
    alias: ["sound", "audio"],
    desc: "Play meme sound effect",
    category: "fun",
    filename: __filename
}, async (sock, mek, m, { from, q }) => {
    try {
        if (!q) return;

        const soundQuery = q.trim().toLowerCase();
        const filePath = soundMap[soundQuery];

        if (!filePath || !fs.existsSync(filePath)) return;

        // React 🔊 to command
        await sock.sendMessage(from, { react: { text: "🔊", key: m.key } });

        // Read Audio Buffer directly
        const audioBuffer = fs.readFileSync(filePath);

        // Send Audio File (Option 1: Without ptt - Voice note ekak widiyata noyawaa)
        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            // ptt: true,   // මෙය ඉවත් කළා / comment කළා
            ...channelContextInfo(),
        }, { quoted: mek });

    } catch (error) {
        console.error("Meme Command Error:", error);
    }
});
