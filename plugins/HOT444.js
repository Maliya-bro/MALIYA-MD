const { cmd, replyHandlers } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, readFile, rm } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');
const { readSettings, getCustomImage } = require("../lib/botSettings");

const execFileAsync = promisify(execFile);

// State Management
const pendingXhamSearch = {};
const pendingXhamQuality = {}; 
const lastProcessedMsg = {};   

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_SEARCH_IMAGE = "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/Gemini_Generated_Image_ljlmxoljlmxoljlm.jpg";

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1
    }
  };
}

function keyFor(sender, from) {
    return `${from || ""}::${(sender || "").split(":")[0]}`;
}

function toSmallCaps(str = "") {
    const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const small  = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
    return String(str)
        .split("")
        .map((char) => {
            const idx = normal.indexOf(char);
            return idx !== -1 ? small[idx] : char;
        })
        .join("");
}

function clearUserSession(k) {
    delete pendingXhamSearch[k];
    delete pendingXhamQuality[k];
}

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
}

function getQuotedStanzaId(mek) {
    return (
        mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
        mek?.message?.imageMessage?.contextInfo?.stanzaId ||
        mek?.message?.videoMessage?.contextInfo?.stanzaId ||
        mek?.message?.documentMessage?.contextInfo?.stanzaId ||
        mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
        null
    );
}

function extractIncomingPayload(body, mek, m) {
    const paramsJson =
        m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        
    if (paramsJson) {
        const parsed = safeJsonParse(paramsJson);
        if (parsed) {
            const btnId = parsed.id || parsed.selectedId || parsed.selectedRowId || parsed.name;
            if (btnId) return String(btnId).trim();
        }
    }

    const directId =
        m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m?.message?.buttonsResponseMessage?.selectedButtonId ||
        mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        mek?.message?.buttonsResponseMessage?.selectedButtonId;
        
    if (directId) return String(directId).trim();

    const text =
        m?.message?.interactiveResponseMessage?.body?.text ||
        m?.message?.conversation ||
        m?.message?.extendedTextMessage?.text ||
        mek?.message?.interactiveResponseMessage?.body?.text ||
        mek?.message?.conversation ||
        mek?.message?.extendedTextMessage?.text ||
        body ||
        "";
        
    return String(text).trim();
}

async function xhamSearch(query, limit = 100) {
    let allResults = [];
    let page = 1;

    while (allResults.length < limit && page <= 5) {
        const url = page === 1 
            ? `https://xhamster.com/search/${encodeURIComponent(query)}` 
            : `https://xhamster.com/search/${encodeURIComponent(query)}?page=${page}`;

        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 12000
            });
            const $= cheerio.load(data);$('.video-thumb').each((_, el) => {
                if (allResults.length >= limit) return false;
                const anchor = $(el).find('a.video-thumb__image-container').first();
                const img = $(el).find('img.thumb-image-container__image').first();
                const href = anchor.attr('href') || '';
                const title = $(el).find('.video-thumb-info__name').first().text().trim() || anchor.attr('title') || '';
                const duration = $(el).find('.video-thumb-views-box__item--duration, [data-role="video-duration"]').first().text().trim();

                if (title && href) {
                    allResults.push({
                        title,
                        url: href.startsWith('http') ? href : `https://xhamster.com${href}`,
                        thumb: img.attr('src') || '',
                        duration
                    });
                }
            });
            page++;
        } catch (err) {
            break;
        }
    }
    return allResults;
}

async function fetchXhamVideoDetails(url) {
    const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 12000
    });

    const $ = cheerio.load(data);
    let hlsUrl = null;

    const windowStateMatch = data.match(/window\.initials\s*=\s*({.*?});/s);
    if (windowStateMatch) {
        try {
            const initialState = JSON.parse(windowStateMatch[1]);
            const videoModel = initialState.videoModel || initialState.video;
            if (videoModel && videoModel.sources) {
                hlsUrl = videoModel.sources.hls || videoModel.sources.mp4?.h264?.[0]?.url || videoModel.sources.standard?.h264?.[0]?.url;
            }
        } catch {}
    }

    if (!hlsUrl) {
        const m3u8Match = data.match(/(https?:\\?\/\\?\/[^"]+\.m3u8[^"]*)/i);
        if (m3u8Match) hlsUrl = m3u8Match[1].replace(/\\/g, '');
    }

    if (!hlsUrl) throw new Error('No video stream URL found for this video.');

    let title = $('h1').first().text().trim() || 'xHamster Video';
    const duration = $('[data-role="video-duration"]').first().text().trim();

    let qualities = [];
    try {
        const m3u8Res = await axios.get(hlsUrl, {
            headers: { 'User-Agent': UA, 'Referer': 'https://xhamster.com/' },
            timeout: 10000
        });
        const lines = m3u8Res.data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
                const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                if (resMatch && lines[i + 1]) {
                    const qualityName = `${resMatch[1]}p`;
                    let streamUrl = lines[i + 1].trim();
                    if (!streamUrl.startsWith('http')) {
                        streamUrl = new URL(streamUrl, hlsUrl).href;
                    }
                    if (!qualities.some(q => q.quality === qualityName)) {
                        qualities.push({ quality: qualityName, url: streamUrl });
                    }
                }
            }
        }
    } catch (e) {
        console.error("Master playlist parse error:", e.message);
    }

    if (qualities.length === 0) {
        qualities.push({ quality: 'Auto / 720p', url: hlsUrl });
    }

    return { title, duration, hlsUrl, qualities };
}

async function xhamDownloadBuffer(streamUrl) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'xhamdl-'));
    const outPath = join(tmpDir, 'video.mp4');

    const ffmpegArgs = [
        '-v', 'error',
        '-y',
        '-user_agent', UA,
        '-headers', 'Referer: https://xhamster.com/\r\n',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', streamUrl,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath
    ];

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 600000 });
        const buffer = await readFile(outPath);
        
        if (buffer.length < 5000) {
            throw new Error('Downloaded stream returned empty file.');
        }

        return buffer;
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

function generateResultText(results, startIndex = 0) {
    const endIndex = Math.min(startIndex + 10, results.length);
    let text = `╭─[ 🔞 *𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝟭𝟴+* ]\n│\n`;
    text += `├ 📊 *𝗥𝗲𝘀𝘂𝗹𝘁𝘀:* ${startIndex + 1} - ${endIndex} of ${results.length}\n`;
    text += `├ 👇 *Reply with a Number:*\n│\n`;

    for (let i = startIndex; i < endIndex; i++) {
        const v = results[i];
        const numStr = String(i + 1).padStart(2, "0");
        const shortTitle = toSmallCaps(v.title.slice(0, 36));
        text += `├ 📱 *[ ${numStr} ]* 🎬 ${shortTitle} ${v.duration ? `_(${v.duration})_` : ''}\n`;
    }

    text += `│\n╰───────────────⮞\n`;
    if (endIndex < results.length && endIndex <= 90) {
        text += `\n> ➡️ *Reply with "${endIndex + 1}" for next 10 results*`;
    }
    return text;
}

async function processDownload(bot, mek, m, reply, from, selected, streamUrl, qualityName) {
    await bot.sendMessage(from, { react: { text: "⬇️", key: m.key } });

    try {
        const buffer = await xhamDownloadBuffer(streamUrl);

        if (!buffer || buffer.length < 5000) {
            return reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Could not process video stream!_\n╰───────────────⮞`);
        }

        const sizeMB = buffer.length / (1024 * 1024);
        const title = selected.title || "xHamster Video";
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').substring(0, 50);

        let captionText = `╭─[ 🔞 *𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝟭𝟴+* ]\n│\n`;
        captionText += `├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(cleanTitle)}\n`;
        captionText += `├ 📊 *𝗤𝘂𝗮𝗹𝗶𝘁𝘆:* ${qualityName}\n`;
        captionText += `├ ⏱️ *𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:* ${selected.duration || 'N/A'}\n`;
        captionText += `├ 💾 *𝗦𝗶𝘇𝗲:* ${sizeMB.toFixed(2)} MB\n`;
        captionText += `│\n╰───────────────⮞\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

        const fileName = `MALIYA-MD ${cleanTitle}.mp4`;

        if (sizeMB > 60) {
            await bot.sendMessage(from, {
                document: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText + `\n\n_📄 Video sent as document due to size limit._`,
                contextInfo: channelContextInfo()
            }, { quoted: mek });
        } else {
            await bot.sendMessage(from, {
                video: buffer,
                mimetype: "video/mp4",
                fileName: fileName,
                caption: captionText,
                contextInfo: channelContextInfo()
            }, { quoted: mek });
        }

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("xHamster Download Error:", e);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`╭─[ ❌ *𝗙𝗔𝗜𝗟𝗘𝗗* ]\n│\n├ 🚫 _${e.message || "Unknown Download Error"}_\n╰───────────────⮞`);
    }
}

// ===== 1. MAIN SEARCH COMMAND =====
cmd({
    pattern: "xham",
    alias: ["xh", "xhamster"],
    desc: "Search and download videos from xHamster",
    category: "download",
    react: "🔍",
    filename: __filename
}, async (bot, mek, m, { from, q, sender, reply, sessionId }) => {
    if (!q) {
        return reply(`╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗨𝗦𝗔𝗚𝗘* ]\n│\n├ 📌 *Usage:* .xham [search_term]\n├ 💡 *Example:* .xham hot\n╰───────────────⮞`);
    }

    await bot.sendMessage(from, { react: { text: "🔍", key: m.key } });

    try {
        const results = await xhamSearch(q.trim(), 100);

        if (!results || !Array.isArray(results) || results.length === 0) {
            await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
            return reply(`╭─[ 😞 *𝗡𝗢 𝗥𝗘𝗦𝗨𝗟𝗧𝗦* ]\n│\n├ 🎬 *Query:* _${q}_\n╰───────────────⮞`);
        }

        const k = keyFor(sender, from);
        clearUserSession(k);

        const settings = await readSettings(sessionId);
        const btnsOn = !!settings.btns_enabled;

        let searchImg = DEFAULT_SEARCH_IMAGE;
        if (sessionId) {
            try {
                const custom = await getCustomImage(sessionId, "xham_header");
                if (custom && custom.data) searchImg = custom.data;
            } catch (e) {}
        }

        // 🔥 Asitha-MD Style ButtonV2 Search Results
        if (btnsOn) {
            try {
                const { ButtonV2 } = await import("@vanzxy/baileys");

                const topResults = results.slice(0, 20); // Top 20 results in popup list
                const videoRows = topResults.map((v, index) => ({
                    title: `${String(index + 1).padStart(2, "0")}. ${v.title.substring(0, 45)}`,
                    description: `Duration: ${v.duration || 'N/A'}`,
                    id: `.xh_select ${index + 1}`
                }));

                const bodyText = `╭─[ 🔞 *𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗 𝟭𝟴+* ]\n│\n├ 🔍 *Search :* ${q}\n├ 📊 *Total Results :* ${results.length}\n│\n╰───────────────⮞\n\n© 2026 MALIYA-MD BOT SYSTEM`;

                const btn = new ButtonV2(bot)
                    .setBody(bodyText)
                    .setFooter("WaBot by MALIYA-MD Team ツ")
                    .setThumbnail(searchImg);

                // 1. Popup List Menu Button
                btn.addRawButton({
                    buttonId: "xham_search_list",
                    buttonText: { displayText: "🎬 Select Video" },
                    type: 1,
                    nativeFlowInfo: {
                        name: "single_select",
                        paramsJson: JSON.stringify({
                            title: "Search Results ↯",
                            sections: [
                                {
                                    title: "🎥 Available Videos",
                                    rows: videoRows
                                }
                            ]
                        }),
                    },
                });

                // 2. Bot Menu Button
                btn.addButton("📜 Bot Menu", ".menu");

                const sentMsg = await btn.send(from, { quoted: mek });

                if (sentMsg?.key?.id) {
                    pendingXhamSearch[k] = { 
                        results, 
                        timestamp: Date.now(),
                        expectedMsgId: sentMsg.key.id
                    };
                    await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                    return;
                }
            } catch (err) {
                console.log("XHAM BUTTON ERROR:", err?.message || err);
            }
        }

        // 🔢 Fallback: Numbered Menu
        const sentMsg = await bot.sendMessage(from, { 
            image: { url: searchImg },
            caption: generateResultText(results, 0),
            contextInfo: channelContextInfo()
        }, { quoted: mek });

        pendingXhamSearch[k] = { 
            results, 
            timestamp: Date.now(),
            expectedMsgId: sentMsg.key.id
        };

        await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("xHamster Search Error:", error);
        await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
        reply(`╭─[ ❌ *𝗦𝗬𝗦𝗧𝗘𝗠 𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Error occurred while searching xHamster!_\n╰───────────────⮞`);
    }
});

// ===== 2. NUMBER & SELECTION REPLY HANDLER =====
const xhamReplyHandler = {
    filter: (text, { sender, from }) => {
        const k = keyFor(sender, from);
        return Boolean(pendingXhamSearch[k] || pendingXhamQuality[k]);
    },
    function: async (bot, mek, m, { body, sender, reply, from, sessionId }) => {
        const payload = extractIncomingPayload(body, mek, m);
        if (!payload) return;

        const k = keyFor(sender, from);

        // Loop Protection System
        const now = Date.now();
        const lastMsg = lastProcessedMsg[k];
        if (lastMsg && lastMsg.text === payload && (now - lastMsg.time) < LOOP_COOLDOWN) {
            return;
        }
        lastProcessedMsg[k] = { text: payload, time: now };

        const quotedId = getQuotedStanzaId(mek);

        // STEP 1: Search Result Selection -> Extract Qualities
        if (pendingXhamSearch[k]) {
            const session = pendingXhamSearch[k];
            if (quotedId && session.expectedMsgId && quotedId !== session.expectedMsgId) return;

            let num = null;
            if (payload.startsWith(".xh_select ")) {
                num = parseInt(payload.replace(".xh_select ", "").trim(), 10);
            } else if (/^\d+$/.test(payload)) {
                num = parseInt(payload, 10);
            }

            if (num === null || isNaN(num) || num <= 0 || num > session.results.length) return;

            if ([11, 21, 31, 41, 51, 61, 71, 81, 91].includes(num)) {
                session.timestamp = Date.now();
                return reply(generateResultText(session.results, num - 1));
            }

            const selected = session.results[num - 1];
            delete pendingXhamSearch[k];

            await bot.sendMessage(from, { react: { text: "⏳", key: m.key } });

            try {
                const videoDetails = await fetchXhamVideoDetails(selected.url);

                const settings = await readSettings(sessionId);
                const btnsOn = !!settings.btns_enabled;
                const thumbImg = selected.thumb || DEFAULT_SEARCH_IMAGE;

                // 🔥 ButtonV2 Quality Selection Popup
                if (btnsOn) {
                    try {
                        const { ButtonV2 } = await import("@vanzxy/baileys");

                        const qualityRows = videoDetails.qualities.map((q, idx) => ({
                            title: `${String(idx + 1).padStart(2, "0")}. ${q.quality}`,
                            description: `Download video in ${q.quality}`,
                            id: `.xh_dl ${idx + 1}`
                        }));

                        const bodyText = `╭─[ 📊 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(selected.title.slice(0, 36))}\n├ ⏱️ *Duration:* ${selected.duration || 'N/A'}\n│\n╰───────────────⮞\n\n© 2026 MALIYA-MD BOT SYSTEM`;

                        const btn = new ButtonV2(bot)
                            .setBody(bodyText)
                            .setFooter("WaBot by MALIYA-MD Team ツ")
                            .setThumbnail(thumbImg);

                        btn.addRawButton({
                            buttonId: "xham_quality_list",
                            buttonText: { displayText: "📥 Select Quality" },
                            type: 1,
                            nativeFlowInfo: {
                                name: "single_select",
                                paramsJson: JSON.stringify({
                                    title: "Available Qualities ↯",
                                    sections: [
                                        {
                                            title: "Choose Quality",
                                            rows: qualityRows
                                        }
                                    ]
                                }),
                            },
                        });

                        btn.addButton("📜 Bot Menu", ".menu");

                        const sentQualityMsg = await btn.send(from, { quoted: mek });

                        if (sentQualityMsg?.key?.id) {
                            pendingXhamQuality[k] = {
                                selected: { ...selected, title: videoDetails.title || selected.title, duration: videoDetails.duration || selected.duration },
                                qualities: videoDetails.qualities,
                                timestamp: Date.now(),
                                expectedMsgId: sentQualityMsg.key.id
                            };
                            await bot.sendMessage(from, { react: { text: "✅", key: m.key } });
                            return;
                        }
                    } catch (e) {
                        console.log("XHAM QUALITY BUTTON ERROR:", e?.message || e);
                    }
                }

                // 🔢 Fallback: Numbered Menu for Quality
                let qMsg = `╭─[ 📊 *𝗦𝗘𝗟𝗘𝗖𝗧 𝗤𝗨𝗔𝗟𝗜𝗧𝗬* ]\n│\n`;
                qMsg += `├ 🎬 *𝗧𝗶𝘁𝗹𝗲:* ${toSmallCaps(selected.title.slice(0, 36))}\n│\n`;
                qMsg += `├ 👇 *Reply with Quality Number:*\n│\n`;

                videoDetails.qualities.forEach((q, idx) => {
                    const numStr = String(idx + 1).padStart(2, "0");
                    qMsg += `├ 📱 *[ ${numStr} ]* 🎬 ${q.quality}\n`;
                });

                qMsg += `│\n╰───────────────⮞`;

                const sentQualityMsg = await bot.sendMessage(from, {
                    image: { url: thumbImg },
                    caption: qMsg,
                    contextInfo: channelContextInfo()
                }, { quoted: mek });

                pendingXhamQuality[k] = {
                    selected: { ...selected, title: videoDetails.title || selected.title, duration: videoDetails.duration || selected.duration },
                    qualities: videoDetails.qualities,
                    timestamp: Date.now(),
                    expectedMsgId: sentQualityMsg.key.id
                };

                await bot.sendMessage(from, { react: { text: "✅", key: m.key } });

            } catch (err) {
                console.error("Quality Extract Error:", err);
                await bot.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
                return reply(`╭─[ ❌ *𝗘𝗥𝗥𝗢𝗥* ]\n│\n├ 🚫 _Failed to extract stream qualities!_\n╰───────────────⮞`);
            }
            return;
        }

        // STEP 2: Quality Selection -> Direct Full Download (Cut options completely removed)
        if (pendingXhamQuality[k]) {
            const session = pendingXhamQuality[k];
            if (quotedId && session.expectedMsgId && quotedId !== session.expectedMsgId) return;

            let choiceNum = null;
            if (payload.startsWith(".xh_dl ")) {
                choiceNum = parseInt(payload.replace(".xh_dl ", "").trim(), 10) - 1;
            } else if (/^\d+$/.test(payload)) {
                choiceNum = parseInt(payload, 10) - 1;
            }

            const { selected, qualities } = session;

            if (choiceNum === null || isNaN(choiceNum) || choiceNum < 0 || choiceNum >= qualities.length) {
                return reply(`╭─[ ⚠️ *𝗜𝗡𝗩𝗔𝗟𝗜𝗗 𝗢𝗣𝗧𝗜𝗢𝗡* ]\n│\n├ 🎯 *Range:* 1 - ${qualities.length}\n╰───────────────⮞`);
            }

            const chosenQuality = qualities[choiceNum];
            delete pendingXhamQuality[k];

            // 🚀 සෘජුවම Full Video එක Download කිරීම
            return processDownload(bot, mek, m, reply, from, selected, chosenQuality.url, chosenQuality.quality);
        }
    }
};

// Register reply handler
if (Array.isArray(replyHandlers)) {
    replyHandlers.push(xhamReplyHandler);
}

// Auto Cleanup
setInterval(() => {
    const now = Date.now();
    for (const s in pendingXhamSearch) {
        if (now - pendingXhamSearch[s].timestamp > SESSION_TIMEOUT) delete pendingXhamSearch[s];
    }
    for (const s in pendingXhamQuality) {
        if (now - pendingXhamQuality[s].timestamp > SESSION_TIMEOUT) delete pendingXhamQuality[s];
    }
    for (const s in lastProcessedMsg) {
        if (now - lastProcessedMsg[s].time > LOOP_COOLDOWN) delete lastProcessedMsg[s];
    }
}, 2.5 * 60 * 1000);

module.exports = { pendingXhamSearch };
