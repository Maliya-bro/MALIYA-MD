/**
 * ╔══════════════════════════════════════════════════════════════╗
 *    MALIYA-MD — CINESUBZ DIRECT SCRAPER MOVIE PLUGIN
 *    Direct Scraping + URL Mapping + API /dl Resolver
 * ╚══════════════════════════════════════════════════════════════╝
 */

const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

// ================================================================
// CONFIG
// ================================================================

const CINESUBZ_BASE = "https://cinesubz.net";
const API_BASE = "https://sadaslk.com";
const API_KEY = "9d4eecd724daa198d662e23767bd7977";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": CINESUBZ_BASE
};

// ================================================================
// DECORATIVE LINE (අලුත් ස්ටයිල් එක)
// ================================================================
const DECO_LINE = "⋆｡°✩｡⋆｡°✩｡⋆｡°✩｡⋆｡°✩｡⋆｡°✩｡⋆｡°✩｡⋆";

// ================================================================
// PENDING DATA (STATE MANAGEMENT)
// ================================================================

const pendingSearch = {};
const pendingQuality = {};

// ================================================================
// URL MAPPING SETUP
// ================================================================

const URL_MAPPINGS = [
    { search: ["https://google.com/server11/1:/", "https://google.com/server12/1:/", "https://google.com/server13/1:/"], replace: "https://bot3.sonic-cloud.online/server1/" },
    { search: ["https://google.com/server21/1:/", "https://google.com/server22/1:/", "https://google.com/server23/1:/"], replace: "https://bot3.sonic-cloud.online/server2/" },
    { search: ["https://google.com/server3/1:/"], replace: "https://bot3.sonic-cloud.online/server3/" },
    { search: ["https://google.com/server4/1:/"], replace: "https://bot3.sonic-cloud.online/server4/" },
    { search: ["https://google.com/server5/1:/"], replace: "https://bot3.sonic-cloud.online/server5/" },
    { search: ["https://google.com/server6/"], replace: "https://bot3.sonic-cloud.online/server6/" }
];

// ================================================================
// HELPER FUNCTIONS
// ================================================================

// 100% Universal Small Caps Font Converter
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

// 🆕 Ultimate Bold Sans-Serif Font Effect (𝗔, 𝗕, 𝗖...)
function toBoldSans(str = "") {
    const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const boldSans = "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵";
    return String(str)
        .split("")
        .map((char) => {
            const idx = normal.indexOf(char);
            return idx !== -1 ? boldSans[idx] : char;
        })
        .join("");
}

// 🆕 Fancy Script Font Effect (𝓐, 𝓑, 𝓒...)
function toScript(str = "") {
    const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const script = "𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃";
    return String(str)
        .split("")
        .map((char) => {
            const idx = normal.indexOf(char);
            return idx !== -1 ? script[idx] : char;
        })
        .join("");
}

function cleanTitle(t = "") {
    return t
        .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
        .replace(/sinhala subtitles?.*/i, "")
        .replace(/සිංහල.*/i, "")
        .replace(/\|.*/i, "")
        .replace(/[-–]\s*$/, "")
        .trim();
}

function applyExtSuffix(url) {
    if (url.includes(".mp4?bot=cscloud2bot&code=")) return url.replace(".mp4?bot=cscloud2bot&code=", "?ext=mp4&bot=cscloud2bot&code=");
    if (url.includes(".mp4")) return url.replace(".mp4", "?ext=mp4");
    if (url.includes(".mkv?bot=cscloud2bot&code=")) return url.replace(".mkv?bot=cscloud2bot&code=", "?ext=mkv&bot=cscloud2bot&code=");
    if (url.includes(".mkv")) return url.replace(".mkv", "?ext=mkv");
    return url;
}

// ================================================================
// SCRAPING & RESOLVING FUNCTIONS
// ================================================================

// 1. CineSubz Search
async function searchMovies(query) {
    const { data } = await axios.get(`${CINESUBZ_BASE}/?s=${encodeURIComponent(query)}`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];
    const seen = new Set();

    $(".display-item .item-box, article, .post").each((_, el) => {
        const a = $(el).find("a[href*='/movies/'], a[href*='/tvshows/']").first();
        const href = a.attr("href") || "";
        const title = (a.attr("title") || a.text()).trim();
        if (!href || !title || seen.has(href)) return;
        seen.add(href);
        results.push({ title: cleanTitle(title), url: href });
    });

    return results.slice(0, 10);
}

// 2. Movie Details & Quality Meta Extraction
async function getMovieMeta(movieUrl) {
    const { data } = await axios.get(movieUrl, { headers: HEADERS });
    const $ = cheerio.load(data);
    const rawLinks = [];

    // Extract Poster
    const poster = $(".poster img, .entry-content img").first().attr("src") || "";

    $("a[href*='/zt-links/'], a[href*='/api-']").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (!href) return;

        const raw = $(el).text().replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "").trim();
        const qualM = raw.match(/(4K|2160[Pp]|1080[Pp]|FHD|720[Pp]|HD|480[Pp]|SD|360[Pp])/i);
        const sizeM = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);

        const qualityStr = qualM ? qualM[1].toUpperCase() : "Unknown Quality";

        rawLinks.push({
            label: raw,
            quality: qualityStr,
            size: sizeM ? sizeM[0] : "",
            ztUrl: href
        });
    });

    // Filter Duplicate Qualities
    const uniqueLinks = [];
    const seenQualities = new Set();

    for (const item of rawLinks) {
        const qKey = item.quality.toLowerCase();
        if (seenQualities.has(qKey)) continue;

        seenQualities.add(qKey);
        uniqueLinks.push(item);
    }

    return {
        poster,
        links: uniqueLinks
    };
}

// 3. Extract Sonic Cloud Link
async function getBotSonicLink(ztUrl) {
    const { data } = await axios.get(ztUrl, { headers: HEADERS });
    const $ = cheerio.load(data);

    const rawHref = $("#link").attr("href") || "";
    if (!rawHref) return null;

    let sonicUrl = rawHref;
    let matched = false;

    for (const mapping of URL_MAPPINGS) {
        if (matched) break;
        for (const searchStr of mapping.search) {
            if (rawHref.includes(searchStr)) {
                sonicUrl = rawHref.replace(searchStr, mapping.replace);
                sonicUrl = applyExtSuffix(sonicUrl);
                matched = true;
                break;
            }
        }
    }

    return sonicUrl;
}

// 4. Resolve Direct Download Link via API
async function resolveDirectUrlFromApi(sonicUrl) {
    try {
        const response = await axios.get(`${API_BASE}/api/v1/movie/cinesubz/dl`, {
            headers: { "x-api-key": API_KEY },
            params: { q: sonicUrl },
            timeout: 120000
        });

        const resData = response.data;

        // Structured or Recursive lookup for direct link
        if (resData && resData.data && Array.isArray(resData.data.links)) {
            const avatarZoneLink = resData.data.links.find(url => typeof url === "string" && url.startsWith("http") && !url.includes("telegram.me") && !url.includes("t.me"));
            if (avatarZoneLink) return avatarZoneLink;
        }

        // Deep Search fallback
        const strJson = JSON.stringify(resData);
        const urlMatches = strJson.match(/https?:\/\/[^\s"'\\]+/g);
        if (urlMatches) {
            const valid = urlMatches.find(u => !u.includes("telegram.me") && !u.includes("t.me"));
            if (valid) return valid;
        }

        return null;
    } catch (error) {
        console.error("API /dl Error:", error.message);
        return null;
    }
}

// ================================================================
// COMMAND 1: MOVIE SEARCH
// ================================================================

cmd({
    pattern: "movie",
    alias: ["sinhalasub", "films", "film", "cinema", "cinesubz"],
    react: "🎬",
    desc: "Search movies using CineSubz",
    category: "download",
    filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
    try {
        if (!q) {
            return reply(`✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗖𝗜𝗡𝗘𝗦𝗨𝗕𝗭 𝗠𝗢𝗩𝗜𝗘 𝗦𝗘𝗔𝗥𝗖𝗛")} *:･ﾟ✧*:･ﾟ✧
${DECO_LINE}
✦ ${toBoldSans("𝗨𝘀𝗮𝗴𝗲")} : \`.movie movie name\`
✦ ${toBoldSans("𝗘𝘅𝗮𝗺𝗽𝗹𝗲")} : \`.movie Minions\`
${DECO_LINE}
✨ ${toScript("Find movies with Sinhala subtitles!")}`);
        }

        await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });
        await reply(`✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗦𝗘𝗔𝗥𝗖𝗛𝗜𝗡𝗚")} *:･ﾟ✧*:･ﾟ✧
⏳ ${toScript("Please wait while I find the best matches...")}`);

        const searchResults = await searchMovies(q);

        if (!searchResults.length) {
            return reply(`❌ ${toBoldSans("No movies found for")} : _${q}_`);
        }

        pendingSearch[sender] = {
            results: searchResults,
            timestamp: Date.now()
        };

        let listText = "";
        searchResults.forEach((movie, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            listText += `${toBoldSans(numStr)}. 🎬 ${toBoldSans(movie.title)}\n`;
        });

        let text = `✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗦𝗘𝗔𝗥𝗖𝗛 𝗥𝗘𝗦𝗨𝗟𝗧𝗦")} *:･ﾟ✧*:･ﾟ✧
${DECO_LINE}
🔍 ${toBoldSans("𝗤𝘂𝗲𝗿𝘆")} : ${toBoldSans(q)}
📊 ${toBoldSans("𝗙𝗼𝘂𝗻𝗱")} : ${searchResults.length} ${toBoldSans("movies")}
──── ${toBoldSans("𝗟𝗜𝗦𝗧")} ────
${listText}
${DECO_LINE}
📌 ${toBoldSans(`Reply with a number (1-${searchResults.length}) to select.`)}`;

        await danuwa.sendMessage(from, { text }, { quoted: mek });

    } catch (error) {
        console.error("Movie Search Error:", error);
        return reply(`❌ ${toBoldSans("Search error")} : ${error.message}`);
    }
});

// ================================================================
// COMMAND 2: MOVIE SELECTION & QUALITY DISPLAY
// ================================================================

cmd({
    filter: (text, { sender }) => {
        if (!pendingSearch[sender] || !text) return false;
        const number = parseInt(String(text).trim());
        return !isNaN(number) && number > 0 && number <= pendingSearch[sender].results.length;
    }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
    try {
        await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

        const index = parseInt(body.trim()) - 1;
        const selected = pendingSearch[sender].results[index];
        delete pendingSearch[sender];

        if (!selected) return reply(`❌ ${toBoldSans("Invalid selection!")}`);

        await reply(`🎬 ${toBoldSans(selected.title)}
⏳ ${toScript("Fetching available qualities...")}`);

        const meta = await getMovieMeta(selected.url);

        if (!meta.links || !meta.links.length) {
            return reply(`❌ ${toBoldSans("No download links found for this movie!")}`);
        }

        pendingQuality[sender] = {
            movie: {
                title: selected.title,
                links: meta.links
            },
            timestamp: Date.now()
        };

        let qualityMsg = `✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗔𝗩𝗔𝗜𝗟𝗔𝗕𝗟𝗘 𝗤𝗨𝗔𝗟𝗜𝗧𝗜𝗘𝗦")} *:･ﾟ✧*:･ﾟ✧
${DECO_LINE}
🎬 ${toBoldSans("𝗧𝗶𝘁𝗹𝗲")} : ${toBoldSans(selected.title)}
──── ${toBoldSans("𝗤𝗨𝗔𝗟𝗜𝗧𝗬 𝗟𝗜𝗦𝗧")} ────
`;

        meta.links.forEach((item, i) => {
            const numStr = String(i + 1).padStart(2, "0");
            qualityMsg += `${toBoldSans(numStr)}. 📊 ${toBoldSans(item.quality)}`;
            if (item.size) qualityMsg += ` ${toScript("("+item.size+")")}`;
            qualityMsg += "\n";
        });

        qualityMsg += `${DECO_LINE}
📌 ${toBoldSans(`Reply with quality number (1-${meta.links.length})`)}`;

        if (meta.poster) {
            try {
                await danuwa.sendMessage(from, { image: { url: meta.poster }, caption: qualityMsg }, { quoted: mek });
            } catch (err) {
                await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
            }
        } else {
            await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });
        }

    } catch (error) {
        console.error("Quality Fetch Error:", error);
        return reply(`❌ ${toBoldSans("Failed to fetch qualities")} : ${error.message}`);
    }
});

// ================================================================
// COMMAND 3: QUALITY SELECTION & DOWNLOAD
// ================================================================

cmd({
    filter: (text, { sender }) => {
        if (!pendingQuality[sender] || !text) return false;
        const number = parseInt(String(text).trim());
        return !isNaN(number) && number > 0 && number <= pendingQuality[sender].movie.links.length;
    }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
    try {
        await danuwa.sendMessage(from, { react: { text: "⚡", key: m.key } });

        const index = parseInt(body.trim()) - 1;
        const data = pendingQuality[sender];

        if (!data) return reply(`❌ ${toBoldSans("Session expired! Please search again.")}`);

        const selectedLink = data.movie.links[index];
        const title = data.movie.title;
        delete pendingQuality[sender];

        await reply(`✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗣𝗥𝗢𝗖𝗘𝗦𝗦𝗜𝗡𝗚 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗")} *:･ﾟ✧*:･ﾟ✧
${DECO_LINE}
🎬 ${toBoldSans("𝗧𝗶𝘁𝗹𝗲")} : ${toBoldSans(title)}
📊 ${toBoldSans("𝗤𝘂𝗮𝗹𝗶𝘁𝘆")} : ${toBoldSans(selectedLink.quality)}
💾 ${toBoldSans("𝗦𝗶𝘇𝗲")} : ${selectedLink.size || toScript("Unknown")}
⏳ ${toScript("Resolving link, please wait (30-60s)...")}`);

        // Step 1: Get Sonic Cloud Link
        const sonicUrl = await getBotSonicLink(selectedLink.ztUrl);

        if (!sonicUrl) {
            return reply(`❌ ${toBoldSans("Failed to extract Sonic Cloud URL!")}`);
        }

        // Step 2: Resolve Direct Download Link via API
        const directDlUrl = await resolveDirectUrlFromApi(sonicUrl);

        if (!directDlUrl) {
            return reply(`❌ ${toBoldSans("Failed to fetch direct download link from API!")}`);
        }

        // Fixed Document Title to "MALIYA-MD MINI" as requested
        const cleanFileName = `MALIYA-MD MINI.mp4`;

        await reply(`📤 ${toBoldSans("Sending Movie...")}
${DECO_LINE}
🎬 ${toBoldSans("Title")} : ${toBoldSans(title)}
📊 ${toBoldSans("Quality")} : ${toBoldSans(selectedLink.quality)}
💾 ${toBoldSans("Size")} : ${selectedLink.size || toScript("Unknown")}`);

        // Step 3: Send Video Document
        await danuwa.sendMessage(
            from,
            {
                document: { url: directDlUrl },
                mimetype: "video/mp4",
                fileName: cleanFileName,
                caption: `✧･ﾟ: *✧･ﾟ:* ${toBoldSans("𝗠𝗢𝗩𝗜𝗘 𝗗𝗘𝗟𝗜𝗩𝗘𝗥𝗘𝗗")} *:･ﾟ✧*:･ﾟ✧
${DECO_LINE}
🎬 ${toBoldSans("𝗧𝗶𝘁𝗹𝗲")} : ${toBoldSans(title)}
📊 ${toBoldSans("𝗤𝘂𝗮𝗹𝗶𝘁𝘆")} : ${toBoldSans(selectedLink.quality)}
${selectedLink.size ? `💾 ${toBoldSans("𝗦𝗶𝘇𝗲")} : ${toBoldSans(selectedLink.size)}\n` : ""}
${DECO_LINE}
🍿 ${toScript("Enjoy the movie!")}
✦ ${toScript("Powered by MALIYA-MD")} ✦`
            },
            { quoted: mek }
        );

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("Movie Download Error:", error);
        return reply(`❌ ${toBoldSans("Failed to send movie")} : ${error.message}`);
    }
});

// ================================================================
// TIMEOUT CLEANUP
// ================================================================

setInterval(() => {
    const now = Date.now();
    const timeout = 10 * 60 * 1000;

    for (const sender in pendingSearch) {
        if (now - pendingSearch[sender].timestamp > timeout) delete pendingSearch[sender];
    }
    for (const sender in pendingQuality) {
        if (now - pendingQuality[sender].timestamp > timeout) delete pendingQuality[sender];
    }
}, 5 * 60 * 1000);
