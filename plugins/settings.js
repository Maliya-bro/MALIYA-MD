/**
 * MALIYA-MD — Native Interactive Settings Menu
 * ============================================================
 *
 * Features:
 * - gifted-btns NOT USED
 * - Native WhatsApp interactive menu
 * - Per-user / per-session settings
 * - Each session has its own settings JSON
 * - WORK_SCOPE default = PRIVATE
 * - Private / Group / All work scope
 * - Public / Private bot mode
 * - Auto message / react settings
 * - Status settings
 * - Anti delete
 * - Reject calls
 * - Presence settings
 *
 * IMPORTANT:
 * This file uses ../lib/botSettings.js
 *
 * ============================================================
 */

const {
    generateWAMessageFromContent
} = require("@itsliaaa/baileys");

const {
    cmd,
    replyHandlers
} = require("../command");

const config = require("../config");

const {
    readSettings,
    setSetting,
    toggleSetting
} = require("../lib/botSettings");

/* ============================================================
CONFIG
============================================================ */

const BOT_NAME = "MALIYA-MD";

const SETTINGS_IMAGE =
    "https://raw.githubusercontent.com/Maliya-bro/MALIYA-MD/refs/heads/main/images/ChatGPT%20Image%20Mar%2022,%202026,%2008_42_52%20AM.png?raw=true";

/* ============================================================
PER-USER PENDING SETTINGS
============================================================ */

const pendingSettings = Object.create(null);

/*
 * IMPORTANT:
 *
 * Settings are NOT stored here.
 *
 * This object only remembers which user currently
 * has the settings menu open.
 *
 * Actual settings are stored by:
 *
 *     sessionId
 *
 * inside ../lib/botSettings.js
 *
 * Therefore:
 *
 * User A -> sessionA.json
 * User B -> sessionB.json
 *
 * Changing A will NOT change B.
 */

/* ============================================================
HELPERS
============================================================ */

function makeKey(sender, from, sessionId) {
    return [
        String(sessionId || "default"),
        String(from || ""),
        String(sender || "").split(":")[0]
    ].join("::");
}

/* ============================================================
OWNER CHECK
============================================================ */

function cleanNumber(value = "") {
    return String(value)
        .replace(/\D/g, "");
}

function isRealOwner(sender = "") {

    const ownerRaw =
        config.BOT_OWNER ||
        config.OWNER_NUMBER ||
        config.SUDO ||
        "";

    const owner =
        cleanNumber(ownerRaw);

    let user =
        cleanNumber(
            String(sender)
                .split("@")[0]
                .split(":")[0]
        );

    if (user.startsWith("0")) {
        user = "94" + user.slice(1);
    }

    return !!owner && user === owner;
}

/* ============================================================
BOOLEAN DISPLAY
============================================================ */

function onOff(value) {
    return value ? "ON" : "OFF";
}

/* ============================================================
MODE TEXT
============================================================ */

function modeText(value) {

    return String(value || "public")
        .toLowerCase() === "private"
        ? "PRIVATE"
        : "PUBLIC";
}

/* ============================================================
WORK SCOPE TEXT
============================================================ */

function workScopeText(value) {

    const scope =
        String(value || "private")
            .toLowerCase();

    if (scope === "private") {
        return "PRIVATE CHAT ONLY";
    }

    if (scope === "group") {
        return "GROUP CHAT ONLY";
    }

    return "ALL CHATS";
}

/* ============================================================
REACT MODE TEXT
============================================================ */

function reactModeText(value) {

    const mode =
        String(value || "all")
            .toLowerCase();

    if (mode === "private") {
        return "PRIVATE ONLY";
    }

    if (mode === "group") {
        return "GROUP ONLY";
    }

    return "ALL CHATS";
}

/* ============================================================
PRESENCE TEXT
============================================================ */

function presenceText(value) {

    const mode =
        String(value || "off")
            .toLowerCase();

    if (mode === "typing") {
        return "AUTO TYPING";
    }

    if (mode === "recording") {
        return "AUTO RECORDING";
    }

    return "OFF";
}

/* ============================================================
STATUS CARD
============================================================ */

function getStatusCard(sessionId) {

    const s =
        readSettings(sessionId);

    return `
🎀 ═══ *MALIYA-MD SETTINGS* ═══

👤 *SESSION SETTINGS*

🍀 Bot Mode:
┃ ${modeText(s.mode)}

🍀 Work Scope:
┃ ${workScopeText(s.work_scope)}

🍀 Presence:
┃ ${presenceText(s.always_presence)}

🤖 *AI & MESSAGE*

┃ AI Chat       : ${onOff(!!s.auto_msg)}
┃ Auto Msg React: ${onOff(!!s.auto_react_msg)}
┃ React Mode    : ${reactModeText(s.auto_react_mode)}

👁 *STATUS*

┃ Auto Status Seen     : ${onOff(!!s.auto_status_seen)}
┃ Auto Status React    : ${onOff(!!s.auto_status_react)}
┃ Auto Download Status : ${onOff(!!s.auto_download_status)}

🛡️ *SECURITY*

┃ Anti Delete   : ${onOff(!!s.anti_delete)}
┃ Reject Calls  : ${onOff(!!s.auto_reject_calls)}

━━━━━━━━━━━━━━━━━━━━

🔒 Work Scope default:
PRIVATE CHAT ONLY

© ${BOT_NAME}
`.trim();
}

/* ============================================================
SAFE JSON PARSER
============================================================ */

function safeJsonParse(value) {

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/* ============================================================
EXTRACT INTERACTIVE RESPONSE
============================================================ */

function getIncomingText(body, mek, m) {

    const values = [

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

    const result = [];

    for (const item of values) {

        if (!item) {
            continue;
        }

        const text =
            String(item).trim();

        if (!text) {
            continue;
        }

        result.push(text);

        /*
         * Native flow paramsJson
         */

        if (
            text.startsWith("{") &&
            text.endsWith("}")
        ) {

            const parsed =
                safeJsonParse(text);

            if (parsed) {

                const extra = [
                    parsed.id,
                    parsed.selectedId,
                    parsed.selectedRowId,
                    parsed.title,
                    parsed.display_text,
                    parsed.text,
                    parsed.name
                ];

                for (const value of extra) {

                    if (value) {
                        result.push(
                            String(value).trim()
                        );
                    }
                }
            }
        }
    }

    return [
        ...new Set(
            result.filter(Boolean)
        )
    ];
}

/* ============================================================
RESOLVE SETTING ACTION
============================================================ */

function resolveSettingsAction(text = "") {

    const t =
        String(text)
            .trim()
            .toLowerCase();

    if (!t) {
        return null;
    }

    /* --------------------------------------------------------
    MENU
    -------------------------------------------------------- */

    if (
        t === ".setting menuopen" ||
        t === "settings menuopen" ||
        t === "change settings"
    ) {
        return {
            action: "menuopen"
        };
    }

    /* --------------------------------------------------------
    STATUS
    -------------------------------------------------------- */

    if (
        t === ".setting status" ||
        t === "show full status" ||
        t === "settings status"
    ) {
        return {
            action: "status"
        };
    }

    /* --------------------------------------------------------
    MODE
    -------------------------------------------------------- */

    if (
        t === ".setting public" ||
        t === "public mode"
    ) {
        return {
            action: "mode",
            value: "public"
        };
    }

    if (
        t === ".setting private" ||
        t === "private mode"
    ) {
        return {
            action: "mode",
            value: "private"
        };
    }

    if (
        t === ".setting toggle mode" ||
        t === "toggle mode"
    ) {
        return {
            action: "toggle",
            value: "mode"
        };
    }

    /* --------------------------------------------------------
    WORK SCOPE
    -------------------------------------------------------- */

    if (
        t === ".setting workscope private" ||
        t === "work scope private" ||
        t === "private chat only"
    ) {
        return {
            action: "workscope",
            value: "private"
        };
    }

    if (
        t === ".setting workscope group" ||
        t === "work scope group" ||
        t === "group chat only"
    ) {
        return {
            action: "workscope",
            value: "group"
        };
    }

    if (
        t === ".setting workscope all" ||
        t === "work scope all" ||
        t === "all chats"
    ) {
        return {
            action: "workscope",
            value: "all"
        };
    }

    /* --------------------------------------------------------
    PRESENCE
    -------------------------------------------------------- */

    if (
        t === ".setting presence typing" ||
        t === "auto typing"
    ) {
        return {
            action: "presence",
            value: "typing"
        };
    }

    if (
        t === ".setting presence recording" ||
        t === "auto recording"
    ) {
        return {
            action: "presence",
            value: "recording"
        };
    }

    if (
        t === ".setting presence off" ||
        t === "presence off"
    ) {
        return {
            action: "presence",
            value: "off"
        };
    }

    /* --------------------------------------------------------
    AUTO REACT MESSAGE
    -------------------------------------------------------- */

    if (
        t === ".setting on autoreactmsg" ||
        t === "enable auto react msg" ||
        t === "auto react msg on"
    ) {
        return {
            action: "on",
            value: "autoreactmsg"
        };
    }

    if (
        t === ".setting off autoreactmsg" ||
        t === "disable auto react msg" ||
        t === "auto react msg off"
    ) {
        return {
            action: "off",
            value: "autoreactmsg"
        };
    }

    if (
        t === ".setting toggle autoreactmsg" ||
        t === "toggle auto react msg"
    ) {
        return {
            action: "toggle",
            value: "autoreactmsg"
        };
    }

    /* --------------------------------------------------------
    REACT MODE
    -------------------------------------------------------- */

    if (
        t === ".setting reactmode private" ||
        t === "react mode private"
    ) {
        return {
            action: "reactmode",
            value: "private"
        };
    }

    if (
        t === ".setting reactmode group" ||
        t === "react mode group"
    ) {
        return {
            action: "reactmode",
            value: "group"
        };
    }

    if (
        t === ".setting reactmode all" ||
        t === "react mode all"
    ) {
        return {
            action: "reactmode",
            value: "all"
        };
    }

    /* --------------------------------------------------------
    AI CHAT
    -------------------------------------------------------- */

    if (
        t === ".setting on automsg" ||
        t === ".setting msg on" ||
        t === "enable ai chat"
    ) {
        return {
            action: "on",
            value: "automsg"
        };
    }

    if (
        t === ".setting off automsg" ||
        t === ".setting msg off" ||
        t === "disable ai chat"
    ) {
        return {
            action: "off",
            value: "automsg"
        };
    }

    if (
        t === ".setting toggle automsg" ||
        t === "toggle ai chat"
    ) {
        return {
            action: "toggle",
            value: "automsg"
        };
    }

    /* --------------------------------------------------------
    SEEN ALL MSG
    -------------------------------------------------------- */

    if (
        t === ".setting on seenallmsg" ||
        t === "enable seen all msg"
    ) {
        return {
            action: "on",
            value: "seenallmsg"
        };
    }

    if (
        t === ".setting off seenallmsg" ||
        t === "disable seen all msg"
    ) {
        return {
            action: "off",
            value: "seenallmsg"
        };
    }

    if (
        t === ".setting toggle seenallmsg" ||
        t === "toggle seen all msg"
    ) {
        return {
            action: "toggle",
            value: "seenallmsg"
        };
    }

    /* --------------------------------------------------------
    ANTI DELETE
    -------------------------------------------------------- */

    if (
        t === ".setting on antidelete" ||
        t === "enable anti delete"
    ) {
        return {
            action: "on",
            value: "antidelete"
        };
    }

    if (
        t === ".setting off antidelete" ||
        t === "disable anti delete"
    ) {
        return {
            action: "off",
            value: "antidelete"
        };
    }

    if (
        t === ".setting toggle antidelete" ||
        t === "toggle anti delete"
    ) {
        return {
            action: "toggle",
            value: "antidelete"
        };
    }

    /* --------------------------------------------------------
    REJECT CALLS
    -------------------------------------------------------- */

    if (
        t === ".setting on rejectcalls" ||
        t === "reject calls on"
    ) {
        return {
            action: "on",
            value: "rejectcalls"
        };
    }

    if (
        t === ".setting off rejectcalls" ||
        t === "reject calls off"
    ) {
        return {
            action: "off",
            value: "rejectcalls"
        };
    }

    if (
        t === ".setting toggle rejectcalls" ||
        t === "toggle reject calls"
    ) {
        return {
            action: "toggle",
            value: "rejectcalls"
        };
    }

    /* --------------------------------------------------------
    AUTO STATUS SEEN
    -------------------------------------------------------- */

    if (
        t === ".setting on autoseen" ||
        t === "auto status view on"
    ) {
        return {
            action: "on",
            value: "autoseen"
        };
    }

    if (
        t === ".setting off autoseen" ||
        t === "auto status view off"
    ) {
        return {
            action: "off",
            value: "autoseen"
        };
    }

    if (
        t === ".setting toggle autoseen" ||
        t === "toggle auto seen"
    ) {
        return {
            action: "toggle",
            value: "autoseen"
        };
    }

    /* --------------------------------------------------------
    AUTO STATUS REACT
    -------------------------------------------------------- */

    if (
        t === ".setting on autoreact" ||
        t === "auto status react on"
    ) {
        return {
            action: "on",
            value: "autoreact"
        };
    }

    if (
        t === ".setting off autoreact" ||
        t === "auto status react off"
    ) {
        return {
            action: "off",
            value: "autoreact"
        };
    }

    if (
        t === ".setting toggle autoreact" ||
        t === "toggle auto react"
    ) {
        return {
            action: "toggle",
            value: "autoreact"
        };
    }

    /* --------------------------------------------------------
    AUTO DOWNLOAD STATUS
    -------------------------------------------------------- */

    if (
        t === ".setting on autodownloadstatus" ||
        t === "auto download status on"
    ) {
        return {
            action: "on",
            value: "autodownloadstatus"
        };
    }

    if (
        t === ".setting off autodownloadstatus" ||
        t === "auto download status off"
    ) {
        return {
            action: "off",
            value: "autodownloadstatus"
        };
    }

    if (
        t === ".setting toggle autodownloadstatus" ||
        t === "toggle auto download status"
    ) {
        return {
            action: "toggle",
            value: "autodownloadstatus"
        };
    }

    return null;
}

/* ============================================================
SETTING KEY MAP
============================================================ */

function mapKey(name = "") {

    const k =
        String(name)
            .toLowerCase()
            .trim();

    if (
        [
            "autoseen",
            "auto_seen",
            "statusseen",
            "auto_status_seen"
        ].includes(k)
    ) {
        return "auto_status_seen";
    }

    if (
        [
            "autoreact",
            "auto_react",
            "statusreact",
            "auto_status_react"
        ].includes(k)
    ) {
        return "auto_status_react";
    }

    if (
        [
            "autodownloadstatus",
            "auto_download_status",
            "statusdownload",
            "downloadstatus"
        ].includes(k)
    ) {
        return "auto_download_status";
    }

    if (
        [
            "automsg",
            "auto_msg",
            "msg",
            "aichat",
            "ai"
        ].includes(k)
    ) {
        return "auto_msg";
    }

    if (
        [
            "seenallmsg",
            "seen_all_msg",
            "seenall",
            "allmsgseen"
        ].includes(k)
    ) {
        return "seen_all_msg";
    }

    if (
        [
            "antidelete",
            "anti_delete",
            "delete"
        ].includes(k)
    ) {
        return "anti_delete";
    }

    if (
        [
            "rejectcalls",
            "auto_reject_calls",
            "calls",
            "anticall"
        ].includes(k)
    ) {
        return "auto_reject_calls";
    }

    if (
        [
            "autoreactmsg",
            "auto_react_msg",
            "msgreact"
        ].includes(k)
    ) {
        return "auto_react_msg";
    }

    return null;
}

/* ============================================================
RESPONSE TEXT
============================================================ */

function settingResponse(key, settings) {

    const responses = {

        auto_status_seen:
            `✅ Auto Status Seen: ${onOff(settings.auto_status_seen)}`,

        auto_status_react:
            `✅ Auto Status React: ${onOff(settings.auto_status_react)}`,

        auto_download_status:
            `✅ Auto Download Status: ${onOff(settings.auto_download_status)}`,

        auto_msg:
            `✅ AI Chat: ${onOff(settings.auto_msg)}`,

        seen_all_msg:
            `✅ Seen All Msg: ${onOff(settings.seen_all_msg)}`,

        anti_delete:
            `✅ Anti Delete: ${onOff(settings.anti_delete)}`,

        auto_reject_calls:
            `✅ Reject Calls: ${onOff(settings.auto_reject_calls)}`,

        auto_react_msg:
            `✅ Auto Message React: ${onOff(settings.auto_react_msg)}`
    };

    return (
        responses[key] ||
        `✅ ${key} updated.`
    );
}

/* ============================================================
APPLY ACTION
============================================================ */

function applySettingAction(
    sessionId,
    action,
    value
) {

    /* --------------------------------------------------------
    STATUS
    -------------------------------------------------------- */

    if (action === "status") {
        return getStatusCard(sessionId);
    }

    /* --------------------------------------------------------
    MODE
    -------------------------------------------------------- */

    if (action === "mode") {

        if (
            ![
                "public",
                "private"
            ].includes(value)
        ) {
            return "❌ Invalid bot mode.";
        }

        setSetting(
            sessionId,
            "mode",
            value
        );

        return `✅ Bot Mode set to ${value.toUpperCase()}`;
    }

    /* --------------------------------------------------------
    TOGGLE MODE
    -------------------------------------------------------- */

    if (
        action === "toggle" &&
        value === "mode"
    ) {

        const current =
            readSettings(sessionId);

        const next =
            current.mode === "private"
                ? "public"
                : "private";

        setSetting(
            sessionId,
            "mode",
            next
        );

        return `✅ Bot Mode changed to ${next.toUpperCase()}`;
    }

    /* --------------------------------------------------------
    WORK SCOPE
    -------------------------------------------------------- */

    if (action === "workscope") {

        if (
            ![
                "private",
                "group",
                "all"
            ].includes(value)
        ) {
            return "❌ Invalid work scope.";
        }

        setSetting(
            sessionId,
            "work_scope",
            value
        );

        return (
            `✅ Work Scope set to ${workScopeText(value)}`
        );
    }

    /* --------------------------------------------------------
    PRESENCE
    -------------------------------------------------------- */

    if (action === "presence") {

        if (
            ![
                "off",
                "typing",
                "recording"
            ].includes(value)
        ) {
            return "❌ Invalid presence mode.";
        }

        setSetting(
            sessionId,
            "always_presence",
            value
        );

        return (
            `✅ Presence set to ${presenceText(value)}`
        );
    }

    /* --------------------------------------------------------
    REACT MODE
    -------------------------------------------------------- */

    if (action === "reactmode") {

        if (
            ![
                "private",
                "group",
                "all"
            ].includes(value)
        ) {
            return "❌ Invalid react mode.";
        }

        setSetting(
            sessionId,
            "auto_react_mode",
            value
        );

        return (
            `✅ React Mode set to ${reactModeText(value)}`
        );
    }

    /* --------------------------------------------------------
    ON / OFF
    -------------------------------------------------------- */

    if (
        action === "on" ||
        action === "off"
    ) {

        const key =
            mapKey(value);

        if (!key) {
            return "❌ Invalid setting name.";
        }

        const updated =
            setSetting(
                sessionId,
                key,
                action === "on"
            );

        return settingResponse(
            key,
            updated
        );
    }

    /* --------------------------------------------------------
    TOGGLE
    -------------------------------------------------------- */

    if (action === "toggle") {

        const key =
            mapKey(value);

        if (!key) {
            return "❌ Invalid setting name.";
        }

        const updated =
            toggleSetting(
                sessionId,
                key
            );

        return settingResponse(
            key,
            updated
        );
    }

    return getStatusCard(sessionId);
}

/* ============================================================
NATIVE SETTINGS HOME
============================================================ */

async function sendSettingsHome(
    sock,
    from,
    mek,
    sender,
    sessionId
) {

    const key =
        makeKey(
            sender,
            from,
            sessionId
        );

    pendingSettings[key] = {
        sessionId,
        createdAt: Date.now(),
        lastActionSig: "",
        lastActionAt: 0
    };

    const buttons = [

        {
            name: "quick_reply",

            buttonParamsJson:
                JSON.stringify({
                    display_text:
                        "⚙️ Change Settings",

                    id:
                        ".setting menuopen"
                })
        },

        {
            name: "quick_reply",

            buttonParamsJson:
                JSON.stringify({
                    display_text:
                        "📊 Full Status",

                    id:
                        ".setting status"
                })
        }
    ];

    const text =
        getStatusCard(
            sessionId
        );

    const message =
        generateWAMessageFromContent(
            from,
            {
                viewOnceMessage: {
                    message: {

                        interactiveMessage: {

                            header: {
                                title:
                                    `${BOT_NAME} SETTINGS`
                            },

                            body: {
                                text
                            },

                            footer: {
                                text:
                                    "MALIYA-MD | Settings"
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

                quoted: mek
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
SETTINGS CATEGORY MENU
============================================================ */

async function sendSettingsMenu(
    sock,
    from,
    mek,
    sender,
    sessionId
) {

    const key =
        makeKey(
            sender,
            from,
            sessionId
        );

    pendingSettings[key] =
        pendingSettings[key] || {

            sessionId,

            createdAt:
                Date.now(),

            lastActionSig:
                "",

            lastActionAt:
                0
        };

    pendingSettings[key].sessionId =
        sessionId;

    pendingSettings[key].createdAt =
        Date.now();

    const buttons = [

        {
            name: "single_select",

            buttonParamsJson:
                JSON.stringify({

                    title:
                        "⚙️ Settings",

                    sections: [

                        /* ------------------------------------------------
                        MAIN
                        ------------------------------------------------ */

                        {
                            title:
                                "🛠 BOT MODE",

                            rows: [

                                {
                                    title:
                                        "🌍 Public Mode",

                                    description:
                                        "Bot works in public mode",

                                    id:
                                        ".setting public"
                                },

                                {
                                    title:
                                        "🔒 Private Mode",

                                    description:
                                        "Bot works in private owner mode",

                                    id:
                                        ".setting private"
                                },

                                {
                                    title:
                                        "🔄 Toggle Mode",

                                    description:
                                        "Switch public/private",

                                    id:
                                        ".setting toggle mode"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        WORK SCOPE
                        ------------------------------------------------ */

                        {
                            title:
                                "💬 WORK SCOPE",

                            rows: [

                                {
                                    title:
                                        "🔒 Private Chat Only",

                                    description:
                                        "Bot works in private chats only",

                                    id:
                                        ".setting workscope private"
                                },

                                {
                                    title:
                                        "👥 Group Chat Only",

                                    description:
                                        "Bot works in groups only",

                                    id:
                                        ".setting workscope group"
                                },

                                {
                                    title:
                                        "🌍 All Chats",

                                    description:
                                        "Bot works in private + groups",

                                    id:
                                        ".setting workscope all"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        PRESENCE
                        ------------------------------------------------ */

                        {
                            title:
                                "✨ BOT PRESENCE",

                            rows: [

                                {
                                    title:
                                        "⌨️ Auto Typing",

                                    description:
                                        "Show typing presence",

                                    id:
                                        ".setting presence typing"
                                },

                                {
                                    title:
                                        "🎙️ Auto Recording",

                                    description:
                                        "Show recording presence",

                                    id:
                                        ".setting presence recording"
                                },

                                {
                                    title:
                                        "⭕ Presence OFF",

                                    description:
                                        "Disable presence",

                                    id:
                                        ".setting presence off"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        AI
                        ------------------------------------------------ */

                        {
                            title:
                                "🤖 AI & MESSAGE",

                            rows: [

                                {
                                    title:
                                        "✅ AI Chat ON",

                                    description:
                                        "Enable automatic AI replies",

                                    id:
                                        ".setting on automsg"
                                },

                                {
                                    title:
                                        "❌ AI Chat OFF",

                                    description:
                                        "Disable automatic AI replies",

                                    id:
                                        ".setting off automsg"
                                },

                                {
                                    title:
                                        "🔄 Toggle AI Chat",

                                    description:
                                        "Switch AI chat",

                                    id:
                                        ".setting toggle automsg"
                                },

                                {
                                    title:
                                        "👍 Auto React Msg ON",

                                    description:
                                        "Enable message auto reaction",

                                    id:
                                        ".setting on autoreactmsg"
                                },

                                {
                                    title:
                                        "👎 Auto React Msg OFF",

                                    description:
                                        "Disable message auto reaction",

                                    id:
                                        ".setting off autoreactmsg"
                                },

                                {
                                    title:
                                        "🔄 Toggle Auto React",

                                    description:
                                        "Switch message auto reaction",

                                    id:
                                        ".setting toggle autoreactmsg"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        REACT MODE
                        ------------------------------------------------ */

                        {
                            title:
                                "❤️ REACT MODE",

                            rows: [

                                {
                                    title:
                                        "🔒 Private Only",

                                    description:
                                        "React only to private chats",

                                    id:
                                        ".setting reactmode private"
                                },

                                {
                                    title:
                                        "👥 Group Only",

                                    description:
                                        "React only to groups",

                                    id:
                                        ".setting reactmode group"
                                },

                                {
                                    title:
                                        "🌍 All Chats",

                                    description:
                                        "React everywhere",

                                    id:
                                        ".setting reactmode all"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        STATUS
                        ------------------------------------------------ */

                        {
                            title:
                                "👁 STATUS SETTINGS",

                            rows: [

                                {
                                    title:
                                        "👀 Auto Status Seen ON",

                                    description:
                                        "Automatically view statuses",

                                    id:
                                        ".setting on autoseen"
                                },

                                {
                                    title:
                                        "🚫 Auto Status Seen OFF",

                                    description:
                                        "Disable status viewing",

                                    id:
                                        ".setting off autoseen"
                                },

                                {
                                    title:
                                        "❤️ Auto Status React ON",

                                    description:
                                        "Automatically react to statuses",

                                    id:
                                        ".setting on autoreact"
                                },

                                {
                                    title:
                                        "🚫 Auto Status React OFF",

                                    description:
                                        "Disable status reactions",

                                    id:
                                        ".setting off autoreact"
                                },

                                {
                                    title:
                                        "📥 Auto Download Status ON",

                                    description:
                                        "Automatically download statuses",

                                    id:
                                        ".setting on autodownloadstatus"
                                },

                                {
                                    title:
                                        "🚫 Auto Download Status OFF",

                                    description:
                                        "Disable status downloads",

                                    id:
                                        ".setting off autodownloadstatus"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        SECURITY
                        ------------------------------------------------ */

                        {
                            title:
                                "🛡️ SECURITY",

                            rows: [

                                {
                                    title:
                                        "🗑️ Anti Delete ON",

                                    description:
                                        "Enable anti delete",

                                    id:
                                        ".setting on antidelete"
                                },

                                {
                                    title:
                                        "🗑️ Anti Delete OFF",

                                    description:
                                        "Disable anti delete",

                                    id:
                                        ".setting off antidelete"
                                },

                                {
                                    title:
                                        "📵 Reject Calls ON",

                                    description:
                                        "Automatically reject calls",

                                    id:
                                        ".setting on rejectcalls"
                                },

                                {
                                    title:
                                        "📵 Reject Calls OFF",

                                    description:
                                        "Allow incoming calls",

                                    id:
                                        ".setting off rejectcalls"
                                }
                            ]
                        },

                        /* ------------------------------------------------
                        STATUS VIEW
                        ------------------------------------------------ */

                        {
                            title:
                                "📊 INFORMATION",

                            rows: [

                                {
                                    title:
                                        "📊 Show Full Status",

                                    description:
                                        "View current settings",

                                    id:
                                        ".setting status"
                                }
                            ]
                        }
                    ]
                })
        }
    ];

    const message =
        generateWAMessageFromContent(
            from,
            {
                viewOnceMessage: {
                    message: {

                        interactiveMessage: {

                            body: {
                                text:
                                    "⚙️ *MALIYA-MD SETTINGS*\n\nSelect a setting category below."
                            },

                            footer: {
                                text:
                                    "Each user/session has separate settings."
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

                quoted: mek
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
DUPLICATE ACTION PROTECTION
============================================================ */

function isDuplicateAction(
    state,
    action
) {

    const now =
        Date.now();

    const sig =
        `${action.action}:${action.value || ""}`;

    if (
        state.lastActionSig === sig &&
        now -
            (state.lastActionAt || 0) <
            2500
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
.SETTING COMMAND
============================================================ */

cmd(
    {
        pattern: "setting",

        alias: [
            "settings",
            "setbot",
            "botset"
        ],

        react: "⚙️",

        category: "owner",

        filename: __filename
    },

    async (
        sock,
        mek,
        m,
        {
            from,
            sender,
            args,
            reply,
            isOwner,
            sessionId
        }
    ) => {

        /*
         * OWNER ONLY
         */

        if (
            !(isOwner || isRealOwner(sender))
        ) {
            return reply(
                "❌ This command is owner only."
            );
        }

        const sid =
            sessionId || "default";

        const action =
            String(
                args[0] || "menu"
            )
                .toLowerCase()
                .trim();

        const value =
            String(
                args
                    .slice(1)
                    .join(" ") || ""
            )
                .toLowerCase()
                .trim();

        try {

            /* ------------------------------------------------
            MENU
            ------------------------------------------------ */

            if (
                action === "menu"
            ) {

                return sendSettingsHome(
                    sock,
                    from,
                    mek,
                    sender,
                    sid
                );
            }

            /* ------------------------------------------------
            MENU OPEN
            ------------------------------------------------ */

            if (
                action === "menuopen"
            ) {

                return sendSettingsMenu(
                    sock,
                    from,
                    mek,
                    sender,
                    sid
                );
            }

            /* ------------------------------------------------
            STATUS
            ------------------------------------------------ */

            if (
                action === "status"
            ) {

                return reply(
                    getStatusCard(sid)
                );
            }

            /* ------------------------------------------------
            MODE
            ------------------------------------------------ */

            if (
                action === "public"
            ) {

                setSetting(
                    sid,
                    "mode",
                    "public"
                );

                return reply(
                    "✅ Bot Mode set to PUBLIC"
                );
            }

            if (
                action === "private"
            ) {

                setSetting(
                    sid,
                    "mode",
                    "private"
                );

                return reply(
                    "✅ Bot Mode set to PRIVATE"
                );
            }

            /* ------------------------------------------------
            WORK SCOPE
            ------------------------------------------------ */

            if (
                action === "workscope"
            ) {

                if (
                    ![
                        "private",
                        "group",
                        "all"
                    ].includes(value)
                ) {

                    return reply(
                        "❌ Invalid Work Scope.\n\n" +
                        ".setting workscope private\n" +
                        ".setting workscope group\n" +
                        ".setting workscope all"
                    );
                }

                setSetting(
                    sid,
                    "work_scope",
                    value
                );

                return reply(
                    `✅ Work Scope set to ${workScopeText(value)}`
                );
            }

            /* ------------------------------------------------
            PRESENCE
            ------------------------------------------------ */

            if (
                action === "presence"
            ) {

                if (
                    ![
                        "off",
                        "typing",
                        "recording"
                    ].includes(value)
                ) {

                    return reply(
                        "❌ Invalid presence mode."
                    );
                }

                setSetting(
                    sid,
                    "always_presence",
                    value
                );

                return reply(
                    `✅ Presence set to ${presenceText(value)}`
                );
            }

            /* ------------------------------------------------
            REACT MODE
            ------------------------------------------------ */

            if (
                action === "reactmode"
            ) {

                if (
                    ![
                        "private",
                        "group",
                        "all"
                    ].includes(value)
                ) {

                    return reply(
                        "❌ Invalid react mode."
                    );
                }

                setSetting(
                    sid,
                    "auto_react_mode",
                    value
                );

                return reply(
                    `✅ React Mode set to ${reactModeText(value)}`
                );
            }

            /* ------------------------------------------------
            TOGGLE
            ------------------------------------------------ */

            if (
                action === "toggle"
            ) {

                if (
                    value === "mode"
                ) {

                    const current =
                        readSettings(sid);

                    const next =
                        current.mode === "private"
                            ? "public"
                            : "private";

                    setSetting(
                        sid,
                        "mode",
                        next
                    );

                    return reply(
                        `✅ Bot Mode changed to ${next.toUpperCase()}`
                    );
                }

                const key =
                    mapKey(value);

                if (!key) {

                    return reply(
                        "❌ Invalid setting name."
                    );
                }

                const updated =
                    toggleSetting(
                        sid,
                        key
                    );

                return reply(
                    settingResponse(
                        key,
                        updated
                    )
                );
            }

            /* ------------------------------------------------
            ON / OFF
            ------------------------------------------------ */

            if (
                action === "on" ||
                action === "off"
            ) {

                const key =
                    mapKey(value);

                if (!key) {

                    return reply(
                        "❌ Invalid setting name."
                    );
                }

                const updated =
                    setSetting(
                        sid,
                        key,
                        action === "on"
                    );

                return reply(
                    settingResponse(
                        key,
                        updated
                    )
                );
            }

            return reply(
                getStatusCard(sid)
            );

        } catch (error) {

            console.log(
                "SETTINGS COMMAND ERROR:",
                error?.message || error
            );

            return reply(
                "❌ Error while changing settings."
            );
        }
    }
);

/* ============================================================
INTERACTIVE SETTINGS RESPONSE HANDLER
============================================================ */

if (
    !global.__maliya_settings_handler_added
) {

    global.__maliya_settings_handler_added =
        true;

    replyHandlers.push({

        filter: (
            _body,
            {
                sender,
                from,
                sessionId
            }
        ) => {

            const key =
                makeKey(
                    sender,
                    from,
                    sessionId
                );

            return !!pendingSettings[key];
        },

        function: async (
            sock,
            mek,
            m,
            {
                body,
                from,
                sender,
                reply,
                isOwner,
                sessionId
            }
        ) => {

            try {

                /*
                 * Owner check
                 */

                if (
                    !(
                        isOwner ||
                        isRealOwner(sender)
                    )
                ) {
                    return;
                }

                const sid =
                    sessionId || "default";

                const key =
                    makeKey(
                        sender,
                        from,
                        sid
                    );

                const state =
                    pendingSettings[key];

                if (!state) {
                    return;
                }

                /*
                 * Get button response
                 */

                const texts =
                    getIncomingText(
                        body,
                        mek,
                        m
                    );

                let resolved = null;

                for (
                    const text of texts
                ) {

                    resolved =
                        resolveSettingsAction(
                            text
                        );

                    if (resolved) {
                        break;
                    }
                }

                if (!resolved) {
                    return;
                }

                /*
                 * Duplicate protection
                 */

                if (
                    isDuplicateAction(
                        state,
                        resolved
                    )
                ) {
                    return;
                }

                state.createdAt =
                    Date.now();

                /*
                 * Open settings menu
                 */

                if (
                    resolved.action ===
                    "menuopen"
                ) {

                    return sendSettingsMenu(
                        sock,
                        from,
                        mek,
                        sender,
                        sid
                    );
                }

                /*
                 * Apply setting
                 */

                const result =
                    applySettingAction(
                        sid,
                        resolved.action,
                        resolved.value
                    );

                return reply(result);

            } catch (error) {

                console.log(
                    "SETTINGS RESPONSE ERROR:",
                    error?.message || error
                );

                return reply(
                    "❌ Error while processing settings."
                );
            }
        }
    });
}

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
                pendingSettings
            )
        ) {

            if (
                now -
                    pendingSettings[key]
                        .createdAt >
                timeout
            ) {

                delete pendingSettings[key];
            }
        }

    },
    30 * 1000
);

/* ============================================================
EXPORT
============================================================ */

module.exports = {
    pendingSettings,
    sendSettingsHome,
    sendSettingsMenu,
    getStatusCard
};
