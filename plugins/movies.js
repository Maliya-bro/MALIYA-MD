/**
 * ╔══════════════════════════════════════════════════════════════╗
 *   MALIYA-MD — CINESUBZ DIRECT SCRAPER MOVIE PLUGIN
 *   Direct Scraping + URL Mapping + API /dl Resolver
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
            return reply(`*🎬 Cinesubz Movie Search*\nUsage:\n*.movie movie name*\nExample:\n*.movie Minions*`);
        }

        await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });
        await reply("*🔍 Searching Cinesubz movies...*\nPlease wait...");

        const searchResults = await searchMovies(q);

        if (!searchResults.length) {
            return reply(`*❌ No movies found for:* ${q}`);
        }

        pendingSearch[sender] = {
            results: searchResults,
            timestamp: Date.now()
        };

        let text = `*🎬 CINESUBZ SEARCH RESULTS*\n`;
        text += `🔎 *Search:* ${q}\n`;
        text += `📊 *Results:* ${searchResults.length}\n\n`;

        searchResults.forEach((movie, i) => {
            text += `*${i + 1}.* ${movie.title}\n`;
        });

        text += `\n*━━━━━━━━━━━━━*\n`;
        text += `Reply with a number *1-${searchResults.length}*`;

        await danuwa.sendMessage(from, { text }, { quoted: mek });

    } catch (error) {
        console.error("Movie Search Error:", error);
        return reply(`*❌ Search Error:* ${error.message}`);
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

        if (!selected) return reply("*❌ Invalid selection!*");

        await reply(`*🎬 ${selected.title}*\n\n⏳ Fetching available qualities...`);

        const meta = await getMovieMeta(selected.url);

        if (!meta.links || !meta.links.length) {
            return reply("*❌ No download links found for this movie!*");
        }

        pendingQuality[sender] = {
            movie: {
                title: selected.title,
                links: meta.links
            },
            timestamp: Date.now()
        };

        let qualityMsg = `📥 *AVAILABLE DOWNLOAD QUALITIES*\n\n`;
        qualityMsg += `🎬 *${selected.title}*\n\n`;

        meta.links.forEach((item, i) => {
            qualityMsg += `*${i + 1}.* ${item.quality}`;
            if (item.size) qualityMsg += ` (${item.size})`;
            qualityMsg += "\n";
        });

        qualityMsg += `\n━━━━━━━━━━━━━\n`;
        qualityMsg += `Reply with quality number (1-${meta.links.length}).`;

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
        return reply(`*❌ Failed to fetch qualities:* ${error.message}`);
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

        if (!data) return reply("*❌ Session expired! Please search again.*");

        const selectedLink = data.movie.links[index];
        const title = data.movie.title;
        delete pendingQuality[sender];

        await reply(`⚡ *Resolving Direct Link via API...*\n\n🎬 *${title}*\n📊 *Quality:* ${selectedLink.quality}\n\nPlease wait (30-60s)...`);

        // Step 1: Get Sonic Cloud Link
        const sonicUrl = await getBotSonicLink(selectedLink.ztUrl);

        if (!sonicUrl) {
            return reply("*❌ Failed to extract Sonic Cloud URL!*");
        }

        // Step 2: Resolve Direct Download Link via API
        const directDlUrl = await resolveDirectUrlFromApi(sonicUrl);

        if (!directDlUrl) {
            return reply("*❌ Failed to fetch direct AvatarZone download link from API!*");
        }

        const cleanFileName = `${title} - ${selectedLink.quality}.mp4`.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();

        await reply(`*⬇️ Sending Movie Document...*\n\n🎬 *${title}*\n📊 *Quality:* ${selectedLink.quality}\n💾 *Size:* ${selectedLink.size || "Unknown"}`);

        // Step 3: Send Video Document
        await danuwa.sendMessage(
            from,
            {
                document: { url: directDlUrl },
                mimetype: "video/mp4",
                fileName: cleanFileName,
                caption: `🎬 *${title}*\n\n📊 *Quality:* ${selectedLink.quality}\n${selectedLink.size ? `💾 *Size:* ${selectedLink.size}\n` : ""}\n🍿 *Enjoy the movie!*`
            },
            { quoted: mek }
        );

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("Movie Download Error:", error);
        return reply(`*❌ Failed to send movie:* ${error.message}`);
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
