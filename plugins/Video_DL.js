/**
 * MALIYA-MD — YouTube Video Downloader
 * ─────────────────────────────────────────────
 * Native WhatsApp Interactive Quality Selector
 *
 * Engine:
 *   sadaslk-dlcore
 *
 * Search:
 *   yt-search
 *
 * Features:
 *   • YouTube URL / Search
 *   • Native WhatsApp quality selector
 *   • 360p
 *   • 480p
 *   • 720p HD
 *   • 1080p FHD
 *   • WhatsApp compatible MP4 conversion
 *   • 45MB video limit
 *   • Per-user pending state
 *   • Duplicate click protection
 *   • Auto cleanup
 *
 * IMPORTANT:
 *   gifted-btns is NOT used.
 */

const {
    generateWAMessageFromContent
} = require("@itsliaaa/baileys");

const {
    cmd,
    replyHandlers
} = require("../command");

const {
    ytmp4
} = require("sadaslk-dlcore");

const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath =
    require("@ffmpeg-installer/ffmpeg").path;

const ffprobePath =
    require("@ffprobe-installer/ffprobe").path;


/* ============================================================
   FFMPEG
============================================================ */

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);


/* ============================================================
   CONFIG
============================================================ */

const TEMP_DIR =
    path.join(__dirname, "../temp");

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, {
        recursive: true
    });
}

const VIDEO_LIMIT_MB = 45;


/* ============================================================
   PENDING VIDEO DOWNLOADS
============================================================ */

const pendingVideoQuality =
    Object.create(null);


/* ============================================================
   TEMP FILE
============================================================ */

function makeTempFile(ext = ".mp4") {

    const id =
        crypto
            .randomBytes(6)
            .toString("hex");

    return path.join(
        TEMP_DIR,
        `${Date.now()}_${id}${ext}`
    );
}


/* ============================================================
   SAFE DELETE
============================================================ */

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


/* ============================================================
   FORMAT VIEWS
============================================================ */

function formatViews(num) {

    if (!num) {
        return "Unknown";
    }

    return Number(num)
        .toLocaleString();
}


/* ============================================================
   FORMAT DURATION
============================================================ */

function formatSeconds(seconds) {

    if (
        !seconds ||
        isNaN(seconds)
    ) {
        return "Unknown";
    }

    seconds = Number(seconds);

    const h =
        Math.floor(
            seconds / 3600
        );

    const m =
        Math.floor(
            (seconds % 3600) / 60
        );

    const s =
        Math.floor(
            seconds % 60
        );

    if (h > 0) {

        return `${h}:${String(m)
            .padStart(2, "0")}:${String(s)
            .padStart(2, "0")}`;

    }

    return `${m}:${String(s)
        .padStart(2, "0")}`;
}


/* ============================================================
   PROGRESS BAR
============================================================ */

function generateProgressBar(
    duration = "0:00"
) {

    return `*00:00* ──────────◉ *${duration}*`;
}


/* ============================================================
   FILE SIZE
============================================================ */

function getFileSizeMB(filePath) {

    const stats =
        fs.statSync(filePath);

    return (
        stats.size /
        (1024 * 1024)
    );
}


/* ============================================================
   SAFE FILE NAME
============================================================ */

function sanitizeFileName(
    name = "youtube_video"
) {

    return String(name)
        .replace(
            /[\\/:\*?"<>|]/g,
            ""
        )
        .trim() ||
        "youtube_video";
}


/* ============================================================
   NORMALIZE TEXT
============================================================ */

function normalizeText(s = "") {

    return String(s)
        .replace(/\r/g, "")
        .replace(/\n+/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}


/* ============================================================
   JSON PARSER
============================================================ */

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

    return `${from || ""}::${(
        sender || ""
    ).split(":")[0]}`;
}


/* ============================================================
   QUALITY PARSER
============================================================ */

function getQualityFromChoice(
    choice
) {

    switch (
        String(choice)
            .trim()
            .toLowerCase()
    ) {

        case "1":
        case "360":
        case "360p":
        case "quality:360":
            return "360";

        case "2":
        case "480":
        case "480p":
        case "quality:480":
            return "480";

        case "3":
        case "720":
        case "720p":
        case "quality:720":
            return "720";

        case "4":
        case "1080":
        case "1080p":
        case "quality:1080":
            return "1080";

        default:
            return null;
    }
}


/* ============================================================
   QUALITY LABEL
============================================================ */

function getQualityLabel(
    choice
) {

    switch (
        String(choice)
            .trim()
            .toLowerCase()
    ) {

        case "1":
        case "360":
        case "360p":
        case "quality:360":
            return "360p";

        case "2":
        case "480":
        case "480p":
        case "quality:480":
            return "480p";

        case "3":
        case "720":
        case "720p":
        case "quality:720":
            return "720p HD";

        case "4":
        case "1080":
        case "1080p":
        case "quality:1080":
            return "1080p FHD";

        default:
            return "Unknown";
    }
}


/* ============================================================
   EXTRACT TEXTS
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
            ?.description,

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
            ?.description,

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


    const p1 =
        m?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson;


    const p2 =
        mek?.message
            ?.interactiveResponseMessage
            ?.nativeFlowResponseMessage
            ?.paramsJson;


    for (
        const raw of [p1, p2]
    ) {

        if (!raw) {
            continue;
        }

        const parsed =
            tryParseJsonString(raw);

        if (!parsed) {
            continue;
        }


        const vals = [

            parsed.id,

            parsed.selectedId,

            parsed.selectedRowId,

            parsed.title,

            parsed.display_text,

            parsed.text,

            parsed.name,

            parsed.description

        ];


        for (const v of vals) {

            if (v) {

                texts.push(
                    String(v).trim()
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
   EXTRACT QUALITY
============================================================ */

function extractQualityFromTexts(
    texts
) {

    const normalized =
        texts
            .map(t =>
                normalizeText(t)
            )
            .filter(Boolean);


    for (
        const text of normalized
    ) {

        if (
            text.includes(
                "QUALITY:360"
            )
        ) {
            return "360";
        }

        if (
            text.includes(
                "QUALITY:480"
            )
        ) {
            return "480";
        }

        if (
            text.includes(
                "QUALITY:720"
            )
        ) {
            return "720";
        }

        if (
            text.includes(
                "QUALITY:1080"
            )
        ) {
            return "1080";
        }


        if (
            text.includes("360P")
        ) {
            return "360";
        }

        if (
            text.includes("480P")
        ) {
            return "480";
        }

        if (
            text.includes("720P")
        ) {
            return "720";
        }

        if (
            text.includes("1080P")
        ) {
            return "1080";
        }


        if (text === "1") {
            return "360";
        }

        if (text === "2") {
            return "480";
        }

        if (text === "3") {
            return "720";
        }

        if (text === "4") {
            return "1080";
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

        let id = null;


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

        return info;
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
   VIDEO DETAILS
============================================================ */

function buildVideoDetails(
    video
) {

    const title =
        video.title ||
        "Unknown Title";


    const channel =
        video.author?.name ||
        "Unknown Channel";


    const duration =
        video.timestamp ||
        formatSeconds(
            video.seconds
        ) ||
        "0:00";


    const views =
        formatViews(
            video.views
        );


    const uploaded =
        video.ago ||
        "Unknown";


    const videoId =
        video.videoId ||
        "Unknown";


    const url =
        video.url ||
        "Unavailable";


    const live =
        video.live
            ? "Yes"
            : "No";


    return `🎥 *${title}*

╭━━━〔 📄 VIDEO DETAILS 〕━━━╮
👤 *Channel:* ${channel}
🆔 *Video ID:* ${videoId}
⏱️ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}
📡 *Live:* ${live}
🔗 *Link:* ${url}
╰━━━━━━━━━━━━━━━━━━━━━━━╯

${generateProgressBar(duration)}

🎬 *Select your video quality below.*`;
}


/* ============================================================
   FINAL CAPTION
============================================================ */

function buildFinalCaption(
    video,
    qualityLabel,
    sizeMB
) {

    return `╭━〔 ✅ DOWNLOAD COMPLETE 〕━╮
🎥 *Title:* ${video.title || "Unknown Title"}
👤 *Channel:* ${video.author?.name || "Unknown Channel"}
🎞️ *Quality:* ${qualityLabel}
⏱️ *Duration:* ${video.timestamp || formatSeconds(video.seconds) || "0:00"}
👀 *Views:* ${formatViews(video.views)}
📅 *Uploaded:* ${video.ago || "Unknown"}
📦 *Size:* ${sizeMB.toFixed(2)} MB
╰━━━━━━━━━━━━━━━━━╯`;
}


/* ============================================================
   DOWNLOAD FILE
============================================================ */

async function downloadFile(
    url,
    outPath
) {

    const res =
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
                    outPath
                );


            res.data.pipe(writer);


            writer.on(
                "finish",
                () => resolve(outPath)
            );


            writer.on(
                "error",
                reject
            );


            res.data.on(
                "error",
                reject
            );

        }
    );
}


/* ============================================================
   FFMPEG CONVERT
============================================================ */

async function reencodeForWhatsApp(
    inputPath,
    outputPath
) {

    return new Promise(
        (resolve, reject) => {

            ffmpeg(inputPath)

                .videoCodec("libx264")

                .audioCodec("aac")

                .outputOptions([

                    "-movflags +faststart",

                    "-pix_fmt yuv420p",

                    "-profile:v main",

                    "-level 3.1",

                    "-preset veryfast",

                    "-crf 28",

                    "-maxrate 1200k",

                    "-bufsize 2400k",

                    "-vf scale='min(854,iw)':-2"

                ])

                .format("mp4")

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

                .save(
                    outputPath
                );
        }
    );
}


/* ============================================================
   SEND NATIVE QUALITY MENU
============================================================ */

async function sendQualityInteractiveMenu(
    sock,
    from,
    mek,
    video
) {

    /*
     * Native WhatsApp interactive list.
     *
     * No gifted-btns.
     */

    const nativeButton = {

        name: "single_select",

        buttonParamsJson:
            JSON.stringify({

                title:
                    "🎬 Select Quality",

                sections: [

                    {

                        title:
                            "📺 Available Qualities",

                        rows: [

                            {

                                title:
                                    "📹 360p",

                                description:
                                    "Fast download • Smaller size",

                                id:
                                    "quality:360"
                            },

                            {

                                title:
                                    "📺 480p",

                                description:
                                    "Standard quality",

                                id:
                                    "quality:480"
                            },

                            {

                                title:
                                    "✨ 720p HD",

                                description:
                                    "HD quality • Recommended",

                                id:
                                    "quality:720"
                            },

                            {

                                title:
                                    "🔥 1080p FHD",

                                description:
                                    "Full HD • Larger size",

                                id:
                                    "quality:1080"
                            }

                        ]

                    }

                ]

            })
    };


    /*
     * Build native interactive message.
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
                                    buildVideoDetails(
                                        video
                                    )

                            },

                            footer: {

                                text:
                                    "MALIYA-MD | Video Downloader"

                            },

                            nativeFlowMessage: {

                                buttons: [
                                    nativeButton
                                ]

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


    /*
     * Send message
     */

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
   DUPLICATE ACTION PROTECTION
============================================================ */

function isDuplicateQualityAction(
    state,
    quality
) {

    const now =
        Date.now();


    const sig =
        `quality:${quality}`;


    if (
        state.lastActionSig === sig &&
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
   HANDLE DOWNLOAD
============================================================ */

async function handleVideoQualityDownload(
    sock,
    mek,
    from,
    sender,
    reply,
    choiceRaw
) {

    const key =
        makePendingKey(
            sender,
            from
        );


    const pending =
        pendingVideoQuality[key];


    if (!pending) {
        return;
    }


    const quality =
        getQualityFromChoice(
            choiceRaw
        );


    const qualityLabel =
        getQualityLabel(
            choiceRaw
        );


    if (!quality) {
        return;
    }


    if (
        pending.isProcessing
    ) {
        return;
    }


    if (
        isDuplicateQualityAction(
            pending,
            quality
        )
    ) {
        return;
    }


    pending.isProcessing =
        true;


    let rawFile = null;
    let fixedFile = null;


    try {

        /*
         * Download status
         */

        await reply(
            `⬇️ Downloading *${qualityLabel}* video...`
        );


        /*
         * sadaslk-dlcore
         */

        const data =
            await ytmp4(
                pending.video.url,
                {

                    format: "mp4",

                    videoQuality:
                        quality

                }
            );


        if (
            !data ||
            !data.url
        ) {

            delete
                pendingVideoQuality[key];

            return reply(
                "❌ Failed to download selected quality video."
            );
        }


        /*
         * Temporary files
         */

        rawFile =
            makeTempFile(
                ".mp4"
            );


        fixedFile =
            makeTempFile(
                ".mp4"
            );


        /*
         * Download source
         */

        await downloadFile(
            data.url,
            rawFile
        );


        /*
         * Convert
         */

        await reply(
            "🛠️ Processing video for WhatsApp..."
        );


        await reencodeForWhatsApp(
            rawFile,
            fixedFile
        );


        /*
         * File size
         */

        const sizeMB =
            getFileSizeMB(
                fixedFile
            );


        const cleanTitle =
            sanitizeFileName(
                pending.video.title
            );


        /*
         * If larger than 45MB,
         * send as document.
         */

        if (
            sizeMB >
            VIDEO_LIMIT_MB
        ) {

            await sock.sendMessage(

                from,

                {

                    document:
                        fs.readFileSync(
                            fixedFile
                        ),

                    mimetype:
                        "video/mp4",

                    fileName:
                        `${cleanTitle}_${quality}p.mp4`,

                    caption:
                        buildFinalCaption(
                            pending.video,
                            qualityLabel,
                            sizeMB
                        )

                },

                {
                    quoted:
                        mek
                }

            );

        } else {

            /*
             * Normal WhatsApp video
             */

            await sock.sendMessage(

                from,

                {

                    video:
                        fs.readFileSync(
                            fixedFile
                        ),

                    mimetype:
                        "video/mp4",

                    fileName:
                        `${cleanTitle}_${quality}p.mp4`,

                    caption:
                        buildFinalCaption(
                            pending.video,
                            qualityLabel,
                            sizeMB
                        ),

                    gifPlayback:
                        false

                },

                {
                    quoted:
                        mek
                }

            );

        }


        /*
         * Remove pending state
         */

        delete
            pendingVideoQuality[key];


    } catch (e) {

        console.log(
            "VIDEO QUALITY ERROR:",
            e
        );


        try {

            await reply(
                "❌ Error while downloading/converting selected quality video."
            );

        } catch {}


        delete
            pendingVideoQuality[key];


    } finally {

        /*
         * Delete temp files
         */

        safeUnlink(
            rawFile
        );

        safeUnlink(
            fixedFile
        );


        /*
         * Reset processing
         * if state still exists.
         */

        if (
            pendingVideoQuality[key]
        ) {

            pendingVideoQuality[key]
                .isProcessing = false;

        }

    }
}


/* ============================================================
   .VIDEO COMMAND
============================================================ */

cmd(

    {

        pattern:
            "video",

        alias: [
            "ytmp4",
            "ytv",
            "vdl"
        ],

        react:
            "🎥",

        desc:
            "Download YouTube video with quality selection",

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
                    "🎬 Please provide a YouTube link or video name."
                );

            }


            /*
             * Search
             */

            await reply(
                "🔍 Searching Video..."
            );


            const video =
                await getYoutube(
                    q
                );


            if (!video) {

                return reply(
                    "❌ No results found."
                );

            }


            /*
             * User pending state
             */

            const key =
                makePendingKey(
                    sender,
                    from
                );


            pendingVideoQuality[key] = {

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


            /*
             * Send native menu
             */

            await sendQualityInteractiveMenu(
                sock,
                from,
                mek,
                video
            );


        } catch (e) {

            console.log(
                "VIDEO MENU ERROR:",
                e
            );


            reply(
                "❌ Error while preparing video menu."
            );

        }

    }

);


/* ============================================================
   NATIVE INTERACTIVE RESPONSE HANDLER
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


            return !!pendingVideoQuality[key];

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

            const key =
                makePendingKey(
                    sender,
                    from
                );


            const pending =
                pendingVideoQuality[key];


            if (!pending) {
                return;
            }


            if (
                pending.isProcessing
            ) {
                return;
            }


            /*
             * Extract native response
             */

            const texts =
                extractTexts(
                    body,
                    mek,
                    m
                );


            /*
             * Resolve quality
             */

            let quality =
                extractQualityFromTexts(
                    texts
                );


            /*
             * Normal text fallback
             */

            if (
                !quality &&
                /^[1-4]$/.test(
                    String(
                        body || ""
                    ).trim()
                )
            ) {

                quality =
                    getQualityFromChoice(
                        body
                    );

            }


            /*
             * Ignore unrelated
             * messages.
             */

            if (!quality) {
                return;
            }


            /*
             * Start download
             */

            return handleVideoQualityDownload(

                sock,

                mek,

                from,

                sender,

                reply,

                quality

            );

        }

});


/* ============================================================
   AUTO CLEANUP
============================================================ */

setInterval(

    () => {

        const now =
            Date.now();


        const timeout =
            2 * 60 * 1000;


        for (
            const key of
            Object.keys(
                pendingVideoQuality
            )
        ) {

            const state =
                pendingVideoQuality[key];


            if (
                now -
                    state.createdAt >
                timeout
            ) {

                delete
                    pendingVideoQuality[key];

            }

        }

    },

    30 * 1000

);


/* ============================================================
   EXPORT
============================================================ */

module.exports = {

    pendingVideoQuality

};
