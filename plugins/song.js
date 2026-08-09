/**
 * MALIYA-MD — Native Interactive Song Downloader
 * Compatible with @itsliaaa/baileys
 *
 * gifted-btns      : NOT USED
 * Native buttons   : USED
 *
 * Commands:
 * .song <song name>
 * .audio <song name>
 * .play <song name>
 * .ytmp3 <song name>
 * .adl <song name>
 *
 * Buttons:
 * 🎵 Get Audio
 * 🎙️ Get Voice Note
 * 📄 Get Document
 */

const {
    generateWAMessageFromContent
} = require("@itsliaaa/baileys");

const { cmd, replyHandlers } = require("../command");
const { ytmp3 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/* ============================================================
   CONFIG
============================================================ */

const BOT_NAME = "MALIYA-MD";
const AUDIO_LIMIT_MB = 45;

const TEMP_DIR = path.join(__dirname, "../temp");

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, {
        recursive: true
    });
}

/* ============================================================
   PENDING ACTIONS
============================================================ */

const pendingAudioActions = Object.create(null);

const PENDING_TTL = 2 * 60 * 1000;

/* ============================================================
   FILE HELPERS
============================================================ */

function makeTempFile(ext = ".mp3") {

    const id =
        crypto
            .randomBytes(6)
            .toString("hex");

    return path.join(
        TEMP_DIR,
        `${Date.now()}_${id}${ext}`
    );
}

function safeUnlink(file) {

    try {

        if (
            file &&
            fs.existsSync(file)
        ) {
            fs.unlinkSync(file);
        }

    } catch {}
}

function getFileSizeMB(filePath) {

    try {

        const stats =
            fs.statSync(filePath);

        return (
            stats.size /
            (1024 * 1024)
        );

    } catch {

        return 0;
    }
}

function sanitizeFileName(
    name = "youtube_audio"
) {

    return String(name)
        .replace(
            /[\\/:*?"<>|]/g,
            ""
        )
        .trim()
        .slice(0, 180)
        || "youtube_audio";
}

/* ============================================================
   TEXT HELPERS
============================================================ */

function normalizeText(s = "") {

    return String(s)
        .replace(/\r/g, "")
        .replace(/\n+/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function tryParseJsonString(s) {

    try {

        return JSON.parse(s);

    } catch {

        return null;
    }
}

/* ============================================================
   PENDING KEY
============================================================ */

function makePendingKey(
    sender,
    from
) {

    return `${from || ""}::${String(
        sender || ""
    ).split(":")[0]}`;
}

/* ============================================================
   EXTRACT MESSAGE TEXT
============================================================ */

function extractTexts(
    body,
    mek,
    m
) {

    const texts = [];

    const direct = [

        body,

        m?.body,
        m?.text,

        m?.message?.conversation,

        m?.message
            ?.extendedTextMessage
            ?.text,

        m?.message
            ?.buttonsResponseMessage
            ?.selectedButtonId,

        m?.message
            ?.buttonsResponseMessage
            ?.selectedDisplayText,

        m?.message
            ?.templateButtonReplyMessage
            ?.selectedId,

        m?.message
            ?.templateButtonReplyMessage
            ?.selectedDisplayText,

        m?.message
            ?.listResponseMessage
            ?.title,

        m?.message
            ?.listResponseMessage
            ?.singleSelectReply
            ?.selectedRowId,

        m?.message
            ?.interactiveResponseMessage
            ?.body
            ?.text,

        m?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson,

        mek?.message?.conversation,

        mek?.message
            ?.extendedTextMessage
            ?.text,

        mek?.message
            ?.buttonsResponseMessage
            ?.selectedButtonId,

        mek?.message
            ?.buttonsResponseMessage
            ?.selectedDisplayText,

        mek?.message
            ?.templateButtonReplyMessage
            ?.selectedId,

        mek?.message
            ?.templateButtonReplyMessage
            ?.selectedDisplayText,

        mek?.message
            ?.listResponseMessage
            ?.title,

        mek?.message
            ?.listResponseMessage
            ?.singleSelectReply
            ?.selectedRowId,

        mek?.message
            ?.interactiveResponseMessage
            ?.body
            ?.text,

        mek?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson
    ];

    for (const item of direct) {

        if (item) {

            texts.push(
                String(item).trim()
            );
        }
    }

    const params1 =
        m?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson;

    const params2 =
        mek?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson;

    for (
        const raw of [
            params1,
            params2
        ]
    ) {

        if (!raw) continue;

        const parsed =
            tryParseJsonString(raw);

        if (!parsed) continue;

        const values = [

            parsed.id,
            parsed.selectedId,
            parsed.selectedRowId,
            parsed.title,
            parsed.display_text,
            parsed.text,
            parsed.name
        ];

        for (
            const value of values
        ) {

            if (value) {

                texts.push(
                    String(value).trim()
                );
            }
        }
    }

    return [
        ...new Set(
            texts.filter(Boolean)
        )
    ];
}

/* ============================================================
   ACTION DETECTION
============================================================ */

function getAudioActionFromTexts(
    texts
) {

    const normalized =
        texts
            .map(normalizeText)
            .filter(Boolean);

    for (
        const text of normalized
    ) {

        /*
         * Native button IDs
         */

        if (
            text === "AUDIO:MP3" ||
            text.includes("AUDIO:MP3") ||
            text.includes("GET AUDIO")
        ) {

            return "audio";
        }

        if (
            text === "AUDIO:PTT" ||
            text.includes("AUDIO:PTT") ||
            text.includes("GET VOICE NOTE")
        ) {

            return "ptt";
        }

        if (
            text === "AUDIO:DOC" ||
            text.includes("AUDIO:DOC") ||
            text.includes("GET DOCUMENT")
        ) {

            return "doc";
        }
    }

    return null;
}

/* ============================================================
   YOUTUBE SEARCH
============================================================ */

async function getYoutube(
    query
) {

    const isUrl =
        /(youtube\.com|youtu\.be)/i
            .test(query);

    if (isUrl) {

        let id = "";

        if (
            query.includes("v=")
        ) {

            id =
                query
                    .split("v=")[1]
                    .split("&")[0];

        } else {

            id =
                query
                    .split("/")
                    .pop()
                    .split("?")[0];
        }

        if (!id) {
            return null;
        }

        const info =
            await yts({
                videoId: id
            });

        return info?.title
            ? info
            : null;
    }

    const search =
        await yts(query);

    if (
        !search ||
        !search.videos ||
        !search.videos.length
    ) {

        return null;
    }

    return search.videos[0];
}

/* ============================================================
   DOWNLOAD FILE
============================================================ */

async function downloadFile(
    url,
    outputPath
) {

    const response =
        await axios({
            url,
            method: "GET",
            responseType: "stream",
            timeout: 180000,

            headers: {
                "User-Agent":
                    "Mozilla/5.0"
            },

            maxRedirects: 5
        });

    return new Promise(
        (resolve, reject) => {

            const writer =
                fs.createWriteStream(
                    outputPath
                );

            response.data.pipe(
                writer
            );

            writer.on(
                "finish",
                () => resolve(
                    outputPath
                )
            );

            writer.on(
                "error",
                reject
            );

            response.data.on(
                "error",
                reject
            );
        }
    );
}

/* ============================================================
   OPUS / VOICE NOTE
============================================================ */

async function convertToOpusPTT(
    inputPath,
    outputPath
) {

    return new Promise(
        (resolve, reject) => {

            ffmpeg(inputPath)

                .audioCodec(
                    "libopus"
                )

                .audioBitrate(
                    "64k"
                )

                .audioChannels(
                    1
                )

                .audioFrequency(
                    48000
                )

                .format("ogg")

                .on(
                    "end",
                    () => resolve(
                        outputPath
                    )
                )

                .on(
                    "error",
                    reject
                )

                .save(outputPath);
        }
    );
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

function formatViews(num) {

    if (
        num === undefined ||
        num === null ||
        num === 0
    ) {

        return "Unknown";
    }

    try {

        return Number(
            num
        ).toLocaleString();

    } catch {

        return "Unknown";
    }
}

function formatSeconds(
    seconds
) {

    if (
        seconds === undefined ||
        seconds === null ||
        isNaN(seconds)
    ) {

        return "Unknown";
    }

    seconds =
        Number(seconds);

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        Math.floor(
            seconds % 60
        );

    if (hours > 0) {

        return (
            `${hours}:` +
            `${String(minutes).padStart(2, "0")}:` +
            `${String(secs).padStart(2, "0")}`
        );
    }

    return (
        `${minutes}:` +
        `${String(secs).padStart(2, "0")}`
    );
}

function generateProgressBar(
    duration = "0:00"
) {

    return (
        `*00:00* ──────────◉ *${duration}*`
    );
}

/* ============================================================
   AUDIO DETAILS
============================================================ */

function buildAudioDetails(
    video
) {

    const title =
        video?.title ||
        "Unknown Title";

    const channel =
        video?.author?.name ||
        "Unknown Channel";

    const duration =
        video?.timestamp ||
        formatSeconds(
            video?.seconds
        ) ||
        "0:00";

    const views =
        formatViews(
            video?.views
        );

    const uploaded =
        video?.ago ||
        "Unknown";

    const videoId =
        video?.videoId ||
        "Unknown";

    const url =
        video?.url ||
        "Unavailable";

    return `
🎵 *${title}*

╭━━━〔 📄 SONG DETAILS 〕━━━╮
┃ 👤 *Channel:* ${channel}
┃ 🆔 *Video ID:* ${videoId}
┃ ⏱️ *Duration:* ${duration}
┃ 👀 *Views:* ${views}
┃ 📅 *Uploaded:* ${uploaded}
╰━━━━━━━━━━━━━━━━╯

${generateProgressBar(duration)}

🎧 Select how you want the audio:
`.trim();
}

/* ============================================================
   FINAL CAPTION
============================================================ */

function buildFinalAudioCaption(
    video,
    mode,
    sizeMB
) {

    const modeLabel =
        mode === "audio"
            ? "Audio"
            : mode === "ptt"
                ? "Voice Note"
                : "Document";

    return `
╭━〔 ✅ DOWNLOAD COMPLETE 〕━╮
┃ 🎵 *Title:* ${video?.title || "Unknown Title"}
┃ 👤 *Channel:* ${video?.author?.name || "Unknown Channel"}
┃ 📦 *Type:* ${modeLabel}
┃ ⏱️ *Duration:* ${
        video?.timestamp ||
        formatSeconds(video?.seconds) ||
        "0:00"
    }
┃ 👀 *Views:* ${formatViews(video?.views)}
┃ 📅 *Uploaded:* ${video?.ago || "Unknown"}
┃ 💾 *Size:* ${Number(sizeMB || 0).toFixed(2)} MB
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();
}

/* ============================================================
   NATIVE BUTTON CREATOR
============================================================ */

function makeNativeAudioButtons() {

    return [

        {
            name: "quick_reply",

            buttonParamsJson:
                JSON.stringify({

                    display_text:
                        "🎵 Get Audio",

                    id:
                        "audio:mp3"
                })
        },

        {
            name: "quick_reply",

            buttonParamsJson:
                JSON.stringify({

                    display_text:
                        "🎙️ Voice Note",

                    id:
                        "audio:ptt"
                })
        },

        {
            name: "quick_reply",

            buttonParamsJson:
                JSON.stringify({

                    display_text:
                        "📄 Document",

                    id:
                        "audio:doc"
                })
        }
    ];
}

/* ============================================================
   SEND NATIVE AUDIO MENU
============================================================ */

async function sendAudioInteractiveButtons(
    sock,
    from,
    mek,
    video
) {

    const buttons =
        makeNativeAudioButtons();

    /*
     * Native WhatsApp interactive
     *
     * gifted-btns NOT USED
     */

    const message =
        generateWAMessageFromContent(

            from,

            {
                viewOnceMessage: {

                    message: {

                        interactiveMessage: {

                            body: {

                                text:
                                    buildAudioDetails(
                                        video
                                    )
                            },

                            footer: {

                                text:
                                    `${BOT_NAME} | Audio Selector`
                            },

                            nativeFlowMessage: {

                                buttons
                            }
                        }
                    }
                }
            },

            {
                userJid:
                    sock.user?.id,

                quoted:
                    mek
            }
        );

    await sock.relayMessage(

        from,

        message.message,

        {
            messageId:
                message.key.id
        }
    );

    return message;
}

/* ============================================================
   DUPLICATE ACTION
============================================================ */

function isDuplicateAction(
    state,
    action
) {

    const now =
        Date.now();

    const sig =
        `audio:${action}`;

    if (
        state.lastActionSig ===
            sig &&

        now -
            (state.lastActionAt || 0) <
            5000
    ) {

        return true;
    }

    state.lastActionSig =
        sig;

    state.lastActionAt =
        now;

    return false;
}

/* ============================================================
   HANDLE AUDIO ACTION
============================================================ */

async function handleAudioAction(
    sock,
    mek,
    from,
    sender,
    reply,
    actionRaw
) {

    const key =
        makePendingKey(
            sender,
            from
        );

    const pending =
        pendingAudioActions[key];

    if (!pending) {
        return;
    }

    const action =
        (
            actionRaw === "audio" ||
            actionRaw === "ptt" ||
            actionRaw === "doc"
        )
            ? actionRaw
            : null;

    if (!action) {
        return;
    }

    if (
        pending.isProcessing
    ) {
        return;
    }

    if (
        isDuplicateAction(
            pending,
            action
        )
    ) {

        return;
    }

    pending.isProcessing =
        true;

    let rawMp3 = null;
    let pttFile = null;

    try {

        const actionLabel =
            action === "audio"
                ? "audio"
                : action === "ptt"
                    ? "voice note"
                    : "document";

        await reply(
            `⬇️ Downloading *${actionLabel}*...`
        );

        /*
         * Download from sadaslk-dlcore
         */

        const data =
            await ytmp3(
                pending.video.url
            );

        const audioUrl =
            data?.url ||
            data?.dl_url ||
            data?.download_url;

        if (!audioUrl) {

            delete pendingAudioActions[
                key
            ];

            return reply(
                "❌ Failed to get MP3 download URL."
            );
        }

        rawMp3 =
            makeTempFile(".mp3");

        await downloadFile(
            audioUrl,
            rawMp3
        );

        if (
            !fs.existsSync(rawMp3)
        ) {

            throw new Error(
                "Audio file was not created."
            );
        }

        const sizeMB =
            getFileSizeMB(
                rawMp3
            );

        const cleanTitle =
            sanitizeFileName(
                pending.video.title
            );

        /*
         * WhatsApp size fallback
         *
         * If audio > 45MB and user
         * selected Audio / PTT,
         * send as document.
         */

        if (
            sizeMB > AUDIO_LIMIT_MB &&
            action !== "doc"
        ) {

            await sock.sendMessage(

                from,

                {

                    document:
                        fs.readFileSync(
                            rawMp3
                        ),

                    mimetype:
                        "audio/mpeg",

                    fileName:
                        `${cleanTitle}.mp3`,

                    caption:
                        buildFinalAudioCaption(
                            pending.video,
                            "doc",
                            sizeMB
                        )
                },

                {
                    quoted:
                        mek
                }
            );

            delete pendingAudioActions[
                key
            ];

            return;
        }

        /* ====================================================
           NORMAL AUDIO
        ==================================================== */

        if (
            action === "audio"
        ) {

            await sock.sendMessage(

                from,

                {

                    audio:
                        fs.readFileSync(
                            rawMp3
                        ),

                    mimetype:
                        "audio/mpeg",

                    fileName:
                        `${cleanTitle}.mp3`,

                    ptt:
                        false
                },

                {
                    quoted:
                        mek
                }
            );

            await reply(
                buildFinalAudioCaption(
                    pending.video,
                    "audio",
                    sizeMB
                )
            );
        }

        /* ====================================================
           VOICE NOTE
        ==================================================== */

        if (
            action === "ptt"
        ) {

            pttFile =
                makeTempFile(
                    ".ogg"
                );

            await reply(
                "🎙️ Converting to voice note..."
            );

            await convertToOpusPTT(
                rawMp3,
                pttFile
            );

            if (
                !fs.existsSync(
                    pttFile
                )
            ) {

                throw new Error(
                    "Voice note conversion failed."
                );
            }

            await sock.sendMessage(

                from,

                {

                    audio:
                        fs.readFileSync(
                            pttFile
                        ),

                    mimetype:
                        "audio/ogg; codecs=opus",

                    ptt:
                        true
                },

                {
                    quoted:
                        mek
                }
            );

            await reply(
                buildFinalAudioCaption(
                    pending.video,
                    "ptt",
                    sizeMB
                )
            );
        }

        /* ====================================================
           DOCUMENT
        ==================================================== */

        if (
            action === "doc"
        ) {

            await sock.sendMessage(

                from,

                {

                    document:
                        fs.readFileSync(
                            rawMp3
                        ),

                    mimetype:
                        "audio/mpeg",

                    fileName:
                        `${cleanTitle}.mp3`,

                    caption:
                        buildFinalAudioCaption(
                            pending.video,
                            "doc",
                            sizeMB
                        )
                },

                {
                    quoted:
                        mek
                }
            );
        }

        delete pendingAudioActions[
            key
        ];

    } catch (e) {

        console.log(
            "AUDIO ACTION ERROR:",
            e?.stack ||
            e?.message ||
            e
        );

        delete pendingAudioActions[
            key
        ];

        await reply(
            `❌ Error while downloading/sending audio.\n\n${e?.message || "Unknown error"}`
        );

    } finally {

        safeUnlink(
            rawMp3
        );

        safeUnlink(
            pttFile
        );

        if (
            pendingAudioActions[key]
        ) {

            pendingAudioActions[
                key
            ].isProcessing = false;
        }
    }
}

/* ============================================================
   SONG / AUDIO COMMAND
============================================================ */

cmd(
    {

        pattern:
            "audio",

        alias: [
            "ytmp3",
            "song",
            "play",
            "adl"
        ],

        react:
            "🎵",

        desc:
            "Download YouTube audio",

        category:
            "download",

        filename:
            __filename
    },

    async (
        sock,
        mek,
        m,
        {
            from,
            q,
            sender,
            reply
        }
    ) => {

        try {

            if (!q) {

                return reply(
                    "🎵 Please provide a YouTube link or song name.\n\nExample:\n.song Lelena"
                );
            }

            await reply(
                "🔍 Searching Audio..."
            );

            const video =
                await getYoutube(q);

            if (!video) {

                return reply(
                    "❌ No results found."
                );
            }

            const key =
                makePendingKey(
                    sender,
                    from
                );

            pendingAudioActions[
                key
            ] = {

                video,

                from,

                createdAt:
                    Date.now(),

                isProcessing:
                    false,

                lastActionSig:
                    "",

                lastActionAt:
                    0
            };

            await sendAudioInteractiveButtons(

                sock,

                from,

                mek,

                video
            );

        } catch (e) {

            console.log(
                "AUDIO MENU ERROR:",
                e?.stack ||
                e?.message ||
                e
            );

            return reply(
                "❌ Error while preparing audio menu."
            );
        }
    }
);

/* ============================================================
   NATIVE BUTTON RESPONSE HANDLER
============================================================ */

replyHandlers.push({

    filter:
        (
            _body,
            {
                sender,
                from
            }
        ) => {

            const key =
                makePendingKey(
                    sender,
                    from
                );

            return Boolean(
                pendingAudioActions[
                    key
                ]
            );
        },

    function:
        async (
            sock,
            mek,
            m,
            {
                from,
                body,
                sender,
                reply
            }
        ) => {

            try {

                const key =
                    makePendingKey(
                        sender,
                        from
                    );

                const pending =
                    pendingAudioActions[
                        key
                    ];

                if (!pending) {
                    return;
                }

                if (
                    pending.isProcessing
                ) {
                    return;
                }

                /*
                 * Check expiry
                 */

                if (
                    Date.now() -
                        pending.createdAt >
                        PENDING_TTL
                ) {

                    delete pendingAudioActions[
                        key
                    ];

                    return reply(
                        "⌛ This audio menu has expired.\n\nPlease use `.song <song name>` again."
                    );
                }

                const texts =
                    extractTexts(
                        body,
                        mek,
                        m
                    );

                const action =
                    getAudioActionFromTexts(
                        texts
                    );

                if (!action) {
                    return;
                }

                return handleAudioAction(

                    sock,

                    mek,

                    from,

                    sender,

                    reply,

                    action
                );

            } catch (e) {

                console.log(
                    "AUDIO BUTTON HANDLER ERROR:",
                    e?.stack ||
                    e?.message ||
                    e
                );
            }
        }
});

/* ============================================================
   AUTO CLEANUP
============================================================ */

setInterval(
    () => {

        const now =
            Date.now();

        for (
            const key of Object.keys(
                pendingAudioActions
            )
        ) {

            const state =
                pendingAudioActions[
                    key
                ];

            if (
                !state
            ) {
                continue;
            }

            if (
                now -
                    state.createdAt >
                    PENDING_TTL
            ) {

                delete pendingAudioActions[
                    key
                ];
            }
        }

    },

    30 * 1000
);

/* ============================================================
   EXPORT
============================================================ */

module.exports = {
    pendingAudioActions
};
