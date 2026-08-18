/**
 * ╔══════════════════════════════════════════════════════════════╗
 *   MALIYA-MD — CINESUBZ API MOVIE PLUGIN
 *   API Based Movie Search / Info / Download
 *
 *   API:
 *   GET /api/v1/movie/cinesubz/search?q=
 *   GET /api/v1/movie/cinesubz/info?q=
 *   GET /api/v1/movie/cinesubz/dl?q=
 *
 *   Header:
 *   x-api-key: YOUR_API_KEY
 * ╚══════════════════════════════════════════════════════════════╝
 */

const { cmd } = require("../command");
const axios = require("axios");

// ================================================================
// CONFIG
// ================================================================

const API_BASE = "https://sadaslk.com";
const API_KEY = "9d4eecd724daa198d662e23767bd7977";

// ================================================================
// PENDING DATA
// ================================================================

const pendingSearch = {};
const pendingQuality = {};

// ================================================================
// API CLIENT
// ================================================================

const api = axios.create({
    baseURL: API_BASE,
    timeout: 120000, // 2 minutes for /dl response
    headers: {
        "x-api-key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "MALIYA-MD/1.0"
    }
});

// ================================================================
// HELPERS
// ================================================================

function normalizeQuality(text) {
    if (!text) return "Unknown";
    const value = String(text).toUpperCase();

    if (/2160|4K/.test(value)) return "2160p";
    if (/1440/.test(value)) return "1440p";
    if (/1080|FHD/.test(value)) return "1080p";
    if (/720|HD/.test(value)) return "720p";
    if (/480|SD/.test(value)) return "480p";
    if (/360/.test(value)) return "360p";

    return String(text).trim();
}

function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function firstValue(...values) {
    for (const value of values) {
        if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            !(Array.isArray(value) && value.length === 0)
        ) {
            return value;
        }
    }
    return "";
}

function getArray(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];

    const possibleKeys = ["data", "results", "movies", "items", "result", "response"];
    for (const key of possibleKeys) {
        if (Array.isArray(data[key])) return data[key];
    }
    return [];
}

function getObject(data) {
    if (!data || typeof data !== "object") return {};
    if (Array.isArray(data)) return data[0] || {};

    const possibleKeys = ["data", "result", "movie", "info", "response"];
    for (const key of possibleKeys) {
        if (data[key] && typeof data[key] === "object" && !Array.isArray(data[key])) {
            return data[key];
        }
    }
    return data;
}

function extractThumbnail(obj) {
    return firstValue(
        obj.thumbnail, obj.thumb, obj.image, obj.poster,
        obj.posterUrl, obj.poster_url, obj.cover, obj.coverUrl, obj.cover_url
    );
}

/**
 * Filter direct video link (avatarzone) from API returned array
 */
function extractDirectDlUrl(data) {
    if (!data) return null;

    let arrayToSearch = [];
    if (Array.isArray(data)) {
        arrayToSearch = data;
    } else if (data.data && Array.isArray(data.data.links)) {
        arrayToSearch = data.data.links;
    } else if (Array.isArray(data.links)) {
        arrayToSearch = data.links;
    }

    for (const item of arrayToSearch) {
        const link = typeof item === "string" ? item : item.link || item.url;
        if (link && /^https?:\/\//i.test(link) && !link.includes("telegram.me") && !link.includes("t.me")) {
            return link;
        }
    }

    return null;
}

// ================================================================
// API REQUEST
// ================================================================

async function apiRequest(endpoint, query) {
    try {
        const response = await api.get(endpoint, {
            params: { q: query }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error("Cinesubz API Error:", error.response.status, error.response.data);
            const status = error.response.status;
            if (status === 401 || status === 403) throw new Error("API key invalid or expired.");
            if (status === 429) throw new Error("API rate limit / coins limit reached.");
            if (status === 404) throw new Error("API endpoint or movie not found.");
        }
        console.error("Cinesubz API Request Error:", error.message);
        throw new Error(error.message || "API request failed");
    }
}

// ================================================================
// SEARCH CINESUBZ
// ================================================================

async function searchMovies(query) {
    const data = await apiRequest("/api/v1/movie/cinesubz/search", query);
    const results = getArray(data);

    return results
        .slice(0, 10)
        .map((movie, index) => {
            const title = firstValue(movie.title, movie.name, movie.movie, movie.movieName, movie.movie_name);
            const movieUrl = firstValue(movie.url, movie.link, movie.movieUrl, movie.movie_url, movie.href);
            const thumbnail = extractThumbnail(movie);
            const language = firstValue(movie.language, movie.lang);
            const quality = firstValue(movie.quality, movie.resolution);

            return {
                id: index + 1,
                title: cleanText(title),
                movieUrl: cleanText(movieUrl),
                thumb: cleanText(thumbnail),
                language: cleanText(language),
                quality: cleanText(quality),
                raw: movie
            };
        })
        .filter(movie => movie.title && movie.movieUrl);
}

// ================================================================
// GET MOVIE INFORMATION
// ================================================================

async function getMovieInfo(movieUrl) {
    const data = await apiRequest("/api/v1/movie/cinesubz/info", movieUrl);
    const obj = getObject(data);

    const title = firstValue(obj.title, obj.name, obj.movie, obj.movieName, obj.movie_name);
    const language = firstValue(obj.language, obj.lang);
    const duration = firstValue(obj.duration, obj.runtime, obj.time);
    const imdb = firstValue(obj.imdb, obj.imdbRating, obj.imdb_rating, obj.rating);

    let genres = firstValue(obj.genres, obj.genre);
    if (!Array.isArray(genres)) genres = genres ? [String(genres)] : [];

    let directors = firstValue(obj.directors, obj.director);
    if (!Array.isArray(directors)) directors = directors ? [String(directors)] : [];

    let stars = firstValue(obj.stars, obj.cast, obj.actors, obj.actor);
    if (!Array.isArray(stars)) stars = stars ? [String(stars)] : [];

    const thumbnail = extractThumbnail(obj);
    let downloads = [];
    const possibleDownloads = firstValue(obj.downloads, obj.downloadLinks, obj.download_links, obj.links, obj.files);
    if (Array.isArray(possibleDownloads)) downloads = possibleDownloads;

    return {
        title: cleanText(title),
        language: cleanText(language),
        duration: cleanText(duration),
        imdb: cleanText(imdb),
        genres: genres.map(cleanText).filter(Boolean),
        directors: directors.map(cleanText).filter(Boolean),
        stars: stars.map(cleanText).filter(Boolean),
        thumbnail: cleanText(thumbnail),
        downloads,
        raw: obj
    };
}

// ================================================================
// DOWNLOAD API (/dl)
// ================================================================

async function getDownload(botSonicUrl) {
    const data = await apiRequest("/api/v1/movie/cinesubz/dl", botSonicUrl);
    return data;
}

// ================================================================
// PARSE DOWNLOAD LINKS (For Quality List)
// ================================================================

function parseDownloadLinks(data) {
    const links = [];

    function scan(value, inheritedQuality = "") {
        if (!value) return;

        if (typeof value === "string") {
            if (/^https?:\/\//i.test(value)) {
                links.push({
                    link: value,
                    quality: normalizeQuality(inheritedQuality),
                    size: ""
                });
            }
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) scan(item, inheritedQuality);
            return;
        }

        if (typeof value === "object") {
            const quality = firstValue(value.quality, value.resolution, value.videoQuality, value.video_quality, inheritedQuality);
            const size = firstValue(value.size, value.fileSize, value.file_size);
            const directUrl = firstValue(value.url, value.link, value.download, value.downloadUrl, value.file);

            if (directUrl && typeof directUrl === "string" && /^https?:\/\//i.test(directUrl)) {
                links.push({
                    link: directUrl,
                    quality: normalizeQuality(quality),
                    size: cleanText(size)
                });
            }

            for (const [key, child] of Object.entries(value)) {
                if (["url", "link", "download", "downloadUrl", "file"].includes(key)) continue;
                scan(child, quality || key);
            }
        }
    }

    scan(data);

    const unique = [];
    const seen = new Set();
    for (const item of links) {
        if (!item.link || seen.has(item.link)) continue;
        seen.add(item.link);
        unique.push(item);
    }

    unique.sort((a, b) => {
        const getNumber = q => {
            const match = String(q).match(/\d+/);
            return match ? parseInt(match[0]) : 0;
        };
        return getNumber(b.quality) - getNumber(a.quality);
    });

    return unique;
}

// ================================================================
// MOVIE SEARCH COMMAND
// ================================================================

cmd({
    pattern: "movie",
    alias: ["sinhalasub", "films", "film", "cinema", "cinesubz"],
    react: "🎬",
    desc: "Search movies using Cinesubz API",
    category: "download",
    filename: __filename
}, async (danuwa, mek, m, { from, q, sender, reply }) => {
    try {
        if (!q) {
            return reply(`*🎬 Cinesubz Movie Search*\n\nUsage:\n*.movie movie name*\n\nExample:\n*.movie Avengers*`);
        }

        await danuwa.sendMessage(from, { react: { text: "🔍", key: m.key } });
        await reply("*🔍 Searching Cinesubz movies...*\n\nPlease wait...");

        const searchResults = await searchMovies(q);

        if (!searchResults.length) {
            return reply(`*❌ No movies found!*\n\nSearch:\n${q}`);
        }

        pendingSearch[sender] = {
            results: searchResults,
            timestamp: Date.now()
        };

        let text = `*🎬 CINESUBZ SEARCH RESULTS*\n\n`;
        text += `🔎 *Search:* ${q}\n`;
        text += `📊 *Results:* ${searchResults.length}\n\n`;

        searchResults.forEach((movie, i) => {
            text += `*${i + 1}.* ${movie.title}\n`;
            if (movie.language) text += `   📝 Language: ${movie.language}\n`;
            if (movie.quality) text += `   📊 Quality: ${movie.quality}\n`;
            text += "\n";
        });

        text += `*━━━━━━━━━━━━━━━━━━*\n`;
        text += `Reply with a number *1-${searchResults.length}*`;

        await danuwa.sendMessage(from, { text }, { quoted: mek });

    } catch (error) {
        console.error("Movie Search Error:", error);
        return reply(`*❌ Movie Search Failed!*\n\n${error.message || "Unknown API error"}`);
    }
});

// ================================================================
// MOVIE NUMBER SELECTION
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

        if (!selected) return reply("*❌ Invalid movie selection!*");

        await reply(`*🎬 ${selected.title}*\n\n⏳ Fetching movie details & quality links...`);

        const metadata = await getMovieInfo(selected.movieUrl);
        const title = metadata.title || selected.title;

        let msg = `*🎬 ${title}*\n\n`;
        if (metadata.language) msg += `*📝 Language:* ${metadata.language}\n`;
        if (metadata.duration) msg += `*⏱️ Duration:* ${metadata.duration}\n`;
        if (metadata.imdb) msg += `*⭐ IMDb:* ${metadata.imdb}\n`;
        if (metadata.genres.length) msg += `*🎭 Genres:* ${metadata.genres.join(", ")}\n`;
        if (metadata.directors.length) msg += `*🎥 Directors:* ${metadata.directors.join(", ")}\n`;

        if (metadata.stars.length) {
            const stars = metadata.stars.slice(0, 5).join(", ");
            msg += `*🌟 Stars:* ${stars}${metadata.stars.length > 5 ? "..." : ""}\n`;
        }

        if (metadata.thumbnail) {
            try {
                await danuwa.sendMessage(from, { image: { url: metadata.thumbnail }, caption: msg }, { quoted: mek });
            } catch (err) {
                await danuwa.sendMessage(from, { text: msg }, { quoted: mek });
            }
        } else {
            await danuwa.sendMessage(from, { text: msg }, { quoted: mek });
        }

        let downloadLinks = parseDownloadLinks(metadata.downloads);

        if (!downloadLinks.length) {
            return reply("*❌ No download options/qualities found for this movie!*");
        }

        pendingQuality[sender] = {
            movie: {
                metadata: { ...metadata, title },
                downloadLinks
            },
            timestamp: Date.now()
        };

        let qualityMsg = `*📥 AVAILABLE DOWNLOAD QUALITIES*\n\n`;
        qualityMsg += `🎬 *${title}*\n\n`;

        downloadLinks.forEach((item, i) => {
            qualityMsg += `*${i + 1}.* ${item.quality}`;
            if (item.size) qualityMsg += ` — ${item.size}`;
            qualityMsg += "\n";
        });

        qualityMsg += `\n*━━━━━━━━━━━━━━━━━━*\n`;
        qualityMsg += `Reply with quality number (1-${downloadLinks.length}).`;

        await danuwa.sendMessage(from, { text: qualityMsg }, { quoted: mek });

    } catch (error) {
        console.error("Movie Info Error:", error);
        return reply(`*❌ Failed to get movie information!*\n\n${error.message || "Unknown API error"}`);
    }
});

// ================================================================
// QUALITY SELECTION + RESOLVE VIA /dl + SEND MOVIE
// ================================================================

cmd({
    filter: (text, { sender }) => {
        if (!pendingQuality[sender] || !text) return false;
        const number = parseInt(String(text).trim());
        return !isNaN(number) && number > 0 && number <= pendingQuality[sender].movie.downloadLinks.length;
    }
}, async (danuwa, mek, m, { body, sender, reply, from }) => {
    try {
        await danuwa.sendMessage(from, { react: { text: "⏳", key: m.key } });

        const index = parseInt(body.trim()) - 1;
        const data = pendingQuality[sender];

        if (!data) return reply("*❌ Session expired! Please search again.*");

        const movie = data.movie;
        const selectedLink = movie.downloadLinks[index];
        delete pendingQuality[sender];

        if (!selectedLink || !selectedLink.link) {
            return reply("*❌ Invalid link selection!*");
        }

        const title = movie.metadata.title || "Cinesubz Movie";
        const quality = selectedLink.quality || "Movie";
        const rawSonicUrl = selectedLink.link;

        await reply(`*⚡ Resolving Direct Link via API...*\n\n🎬 *${title}*\n📊 *Quality:* ${quality}\n\n*Please wait (30-60s)...*`);

        // Send sonic link to API /dl endpoint
        const dlResponse = await getDownload(rawSonicUrl);

        // Extract AvatarZone direct download URL
        const finalDirectUrl = extractDirectDlUrl(dlResponse);

        if (!finalDirectUrl) {
            return reply(`*❌ Failed to fetch direct AvatarZone download link from API!*`);
        }

        // Get File Size from response if available
        const fileSize = dlResponse?.data?.size || selectedLink.size || "";

        const cleanName = `${title} - ${quality}.mp4`.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();

        await reply(`*⬇️ Sending Movie Document...*\n\n🎬 *${title}*\n📊 *Quality:* ${quality}\n💾 *Size:* ${fileSize || "Unknown"}`);

        await danuwa.sendMessage(
            from,
            {
                document: { url: finalDirectUrl },
                mimetype: "video/mp4",
                fileName: cleanName,
                caption: `*🎬 ${title}*\n\n*📊 Quality:* ${quality}\n${fileSize ? `*💾 Size:* ${fileSize}\n` : ""}\n*🍿 Enjoy the movie!*`
            },
            { quoted: mek }
        );

        await danuwa.sendMessage(from, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("Movie Download Error:", error);
        return reply(`*❌ Failed to send movie!*\n\n${error.message || "Unknown error"}`);
    }
});

// ================================================================
// CLEANUP TIMEOUT
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

// ================================================================
// EXPORT
// ================================================================

module.exports = {
    pendingSearch,
    pendingQuality,
    searchMovies,
    getMovieInfo,
    getDownload
};
