/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  MALIYA-MD — CINESUBZ API MOVIE PLUGIN
 *  API Based Movie Search / Info / Download
 *
 *  API:
 *  GET /api/v1/movie/cinesubz/search?q=
 *  GET /api/v1/movie/cinesubz/info?q=
 *  GET /api/v1/movie/cinesubz/dl?q=
 *
 *  Header:
 *  x-api-key: YOUR_API_KEY
 * ╚══════════════════════════════════════════════════════════════╝
 */

const { cmd } = require("../command");
const axios = require("axios");

// ================================================================
// CONFIG
// ================================================================

const API_BASE = "https://sadaslk.com";

// 👇 මෙතන ඔයාගේ API key එක දාන්න
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
    timeout: 60000,
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

    if (!data || typeof data !== "object") {
        return [];
    }

    const possibleKeys = [
        "data",
        "results",
        "movies",
        "items",
        "result",
        "response"
    ];

    for (const key of possibleKeys) {
        if (Array.isArray(data[key])) {
            return data[key];
        }
    }

    return [];
}

function getObject(data) {
    if (!data || typeof data !== "object") {
        return {};
    }

    if (Array.isArray(data)) {
        return data[0] || {};
    }

    const possibleKeys = [
        "data",
        "result",
        "movie",
        "info",
        "response"
    ];

    for (const key of possibleKeys) {
        if (
            data[key] &&
            typeof data[key] === "object" &&
            !Array.isArray(data[key])
        ) {
            return data[key];
        }
    }

    return data;
}

function extractUrl(value) {
    if (!value) return null;

    if (typeof value === "string") {
        if (/^https?:\/\//i.test(value)) {
            return value;
        }

        return null;
    }

    if (typeof value !== "object") {
        return null;
    }

    const keys = [
        "url",
        "link",
        "download",
        "downloadUrl",
        "download_url",
        "file",
        "fileUrl",
        "file_url",
        "direct",
        "directUrl",
        "direct_url"
    ];

    for (const key of keys) {
        if (value[key]) {
            const found = extractUrl(value[key]);

            if (found) {
                return found;
            }
        }
    }

    return null;
}

function extractThumbnail(obj) {
    return firstValue(
        obj.thumbnail,
        obj.thumb,
        obj.image,
        obj.poster,
        obj.posterUrl,
        obj.poster_url,
        obj.cover,
        obj.coverUrl,
        obj.cover_url
    );
}

// ================================================================
// API REQUEST
// ================================================================

async function apiRequest(endpoint, query) {
    try {
        const response = await api.get(endpoint, {
            params: {
                q: query
            }
        });

        return response.data;

    } catch (error) {

        if (error.response) {

            console.error(
                "Cinesubz API Error:",
                error.response.status,
                error.response.data
            );

            const status = error.response.status;

            if (status === 401 || status === 403) {
                throw new Error(
                    "API key invalid or expired."
                );
            }

            if (status === 429) {
                throw new Error(
                    "API rate limit / coins limit reached."
                );
            }

            if (status === 404) {
                throw new Error(
                    "API endpoint or movie not found."
                );
            }
        }

        console.error("Cinesubz API Request Error:", error.message);

        throw new Error(
            error.message || "API request failed"
        );
    }
}

// ================================================================
// SEARCH CINESUBZ
// ================================================================

async function searchMovies(query) {

    const data = await apiRequest(
        "/api/v1/movie/cinesubz/search",
        query
    );

    const results = getArray(data);

    return results
        .slice(0, 10)
        .map((movie, index) => {

            const title = firstValue(
                movie.title,
                movie.name,
                movie.movie,
                movie.movieName,
                movie.movie_name
            );

            const movieUrl = firstValue(
                movie.url,
                movie.link,
                movie.movieUrl,
                movie.movie_url,
                movie.href
            );

            const thumbnail = extractThumbnail(movie);

            const language = firstValue(
                movie.language,
                movie.lang
            );

            const quality = firstValue(
                movie.quality,
                movie.resolution
            );

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

    const data = await apiRequest(
        "/api/v1/movie/cinesubz/info",
        movieUrl
    );

    const obj = getObject(data);

    const title = firstValue(
        obj.title,
        obj.name,
        obj.movie,
        obj.movieName,
        obj.movie_name
    );

    const language = firstValue(
        obj.language,
        obj.lang
    );

    const duration = firstValue(
        obj.duration,
        obj.runtime,
        obj.time
    );

    const imdb = firstValue(
        obj.imdb,
        obj.imdbRating,
        obj.imdb_rating,
        obj.rating
    );

    let genres = firstValue(
        obj.genres,
        obj.genre
    );

    if (!Array.isArray(genres)) {
        genres = genres
            ? [String(genres)]
            : [];
    }

    let directors = firstValue(
        obj.directors,
        obj.director
    );

    if (!Array.isArray(directors)) {
        directors = directors
            ? [String(directors)]
            : [];
    }

    let stars = firstValue(
        obj.stars,
        obj.cast,
        obj.actors,
        obj.actor
    );

    if (!Array.isArray(stars)) {
        stars = stars
            ? [String(stars)]
            : [];
    }

    const thumbnail = extractThumbnail(obj);

    // ------------------------------------------------------------
    // Download links can sometimes already be returned by info API
    // ------------------------------------------------------------

    let downloads = [];

    const possibleDownloads = firstValue(
        obj.downloads,
        obj.downloadLinks,
        obj.download_links,
        obj.links,
        obj.files
    );

    if (Array.isArray(possibleDownloads)) {
        downloads = possibleDownloads;
    }

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
// DOWNLOAD API
// ================================================================

async function getDownload(movieUrl) {

    const data = await apiRequest(
        "/api/v1/movie/cinesubz/dl",
        movieUrl
    );

    return data;
}

// ================================================================
// PARSE DOWNLOAD LINKS
// ================================================================

function parseDownloadLinks(data) {

    const links = [];

    function scan(value, inheritedQuality = "") {

        if (!value) return;

        // ----------------------------------------------------------
        // String
        // ----------------------------------------------------------

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

        // ----------------------------------------------------------
        // Array
        // ----------------------------------------------------------

        if (Array.isArray(value)) {

            for (const item of value) {
                scan(item, inheritedQuality);
            }

            return;
        }

        // ----------------------------------------------------------
        // Object
        // ----------------------------------------------------------

        if (typeof value === "object") {

            const quality = firstValue(
                value.quality,
                value.resolution,
                value.videoQuality,
                value.video_quality,
                inheritedQuality
            );

            const size = firstValue(
                value.size,
                value.fileSize,
                value.file_size
            );

            const directUrl = extractUrl(value);

            if (directUrl) {

                links.push({
                    link: directUrl,
                    quality: normalizeQuality(quality),
                    size: cleanText(size)
                });
            }

            for (const [key, child] of Object.entries(value)) {

                if (
                    [
                        "url",
                        "link",
                        "download",
                        "downloadUrl",
                        "download_url",
                        "file",
                        "fileUrl",
                        "file_url",
                        "direct",
                        "directUrl",
                        "direct_url"
                    ].includes(key)
                ) {
                    continue;
                }

                scan(child, quality || key);
            }
        }
    }

    scan(data);

    // ------------------------------------------------------------
    // Remove duplicate URLs
    // ------------------------------------------------------------

    const unique = [];

    const seen = new Set();

    for (const item of links) {

        if (!item.link) continue;

        if (seen.has(item.link)) continue;

        seen.add(item.link);

        unique.push(item);
    }

    // ------------------------------------------------------------
    // Better quality ordering
    // ------------------------------------------------------------

    unique.sort((a, b) => {

        const getNumber = q => {

            const match = String(q).match(/\d+/);

            return match
                ? parseInt(match[0])
                : 0;
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
    alias: [
        "sinhalasub",
        "films",
        "film",
        "cinema",
        "cinesubz"
    ],
    react: "🎬",
    desc: "Search movies using Cinesubz API",
    category: "download",
    filename: __filename

}, async (danuwa, mek, m, {
    from,
    q,
    sender,
    reply
}) => {

    try {

        if (!q) {

            return reply(
                `*🎬 Cinesubz Movie Search*

Usage:
*.movie movie name*

Example:
*.movie Avengers
*.movie Avatar
*.movie 2024`
            );
        }

        await danuwa.sendMessage(
            from,
            {
                react: {
                    text: "🔍",
                    key: m.key
                }
            }
        );

        await reply(
            "*🔍 Searching Cinesubz movies...*\n\nPlease wait..."
        );

        const searchResults = await searchMovies(q);

        if (!searchResults.length) {

            return reply(
                `*❌ No movies found!*

Search:
${q}`
            );
        }

        pendingSearch[sender] = {
            results: searchResults,
            timestamp: Date.now()
        };

        let text =
            `*🎬 CINESUBZ SEARCH RESULTS*\n\n`;

        text += `🔎 *Search:* ${q}\n`;
        text += `📊 *Results:* ${searchResults.length}\n\n`;

        searchResults.forEach((movie, i) => {

            text +=
                `*${i + 1}.* ${movie.title}\n`;

            if (movie.language) {
                text +=
                    `   📝 Language: ${movie.language}\n`;
            }

            if (movie.quality) {
                text +=
                    `   📊 Quality: ${movie.quality}\n`;
            }

            text += "\n";
        });

        text +=
            `*━━━━━━━━━━━━━━━━━━*\n`;

        text +=
            `Reply with a number *1-${searchResults.length}*`;

        await danuwa.sendMessage(
            from,
            {
                text
            },
            {
                quoted: mek
            }
        );

    } catch (error) {

        console.error(
            "Movie Search Error:",
            error
        );

        return reply(
            `*❌ Movie Search Failed!*

${error.message || "Unknown API error"}`
        );
    }
});

// ================================================================
// MOVIE NUMBER SELECTION
// ================================================================

cmd({

    filter: (text, { sender }) => {

        if (!pendingSearch[sender]) {
            return false;
        }

        if (!text) {
            return false;
        }

        const number = parseInt(
            String(text).trim()
        );

        return (
            !isNaN(number) &&
            number > 0 &&
            number <=
                pendingSearch[sender].results.length
        );
    }

}, async (danuwa, mek, m, {
    body,
    sender,
    reply,
    from
}) => {

    try {

        await danuwa.sendMessage(
            from,
            {
                react: {
                    text: "⏳",
                    key: m.key
                }
            }
        );

        const index =
            parseInt(body.trim()) - 1;

        const selected =
            pendingSearch[sender].results[index];

        delete pendingSearch[sender];

        if (!selected) {

            return reply(
                "*❌ Invalid movie selection!*"
            );
        }

        // --------------------------------------------------------
        // Get movie info
        // --------------------------------------------------------

        await reply(
            `*🎬 ${selected.title}*

⏳ Fetching movie information...`
        );

        const metadata =
            await getMovieInfo(
                selected.movieUrl
            );

        const title =
            metadata.title ||
            selected.title;

        let msg =
            `*🎬 ${title}*\n\n`;

        if (metadata.language) {
            msg +=
                `*📝 Language:* ${metadata.language}\n`;
        }

        if (metadata.duration) {
            msg +=
                `*⏱️ Duration:* ${metadata.duration}\n`;
        }

        if (metadata.imdb) {
            msg +=
                `*⭐ IMDb:* ${metadata.imdb}\n`;
        }

        if (metadata.genres.length) {
            msg +=
                `*🎭 Genres:* ${metadata.genres.join(", ")}\n`;
        }

        if (metadata.directors.length) {
            msg +=
                `*🎥 Directors:* ${metadata.directors.join(", ")}\n`;
        }

        if (metadata.stars.length) {

            const stars =
                metadata.stars
                    .slice(0, 5)
                    .join(", ");

            msg +=
                `*🌟 Stars:* ${stars}`;

            if (metadata.stars.length > 5) {
                msg += "...";
            }

            msg += "\n";
        }

        msg +=
            `\n*🔗 Fetching download links...*`;

        // --------------------------------------------------------
        // Send movie info
        // --------------------------------------------------------

        if (metadata.thumbnail) {

            try {

                await danuwa.sendMessage(
                    from,
                    {
                        image: {
                            url: metadata.thumbnail
                        },
                        caption: msg
                    },
                    {
                        quoted: mek
                    }
                );

            } catch (imageError) {

                console.log(
                    "Thumbnail send failed:",
                    imageError.message
                );

                await danuwa.sendMessage(
                    from,
                    {
                        text: msg
                    },
                    {
                        quoted: mek
                    }
                );
            }

        } else {

            await danuwa.sendMessage(
                from,
                {
                    text: msg
                },
                {
                    quoted: mek
                }
            );
        }

        // --------------------------------------------------------
        // Check if info already contains links
        // --------------------------------------------------------

        let downloadLinks =
            parseDownloadLinks(
                metadata.downloads
            );

        // --------------------------------------------------------
        // If info has no links, call DL API
        // --------------------------------------------------------

        if (!downloadLinks.length) {

            const downloadData =
                await getDownload(
                    selected.movieUrl
                );

            downloadLinks =
                parseDownloadLinks(
                    downloadData
                );
        }

        if (!downloadLinks.length) {

            return reply(
                `*❌ No download links found!*

The API did not return any downloadable video link.`
            );
        }

        // --------------------------------------------------------
        // Save quality selection
        // --------------------------------------------------------

        pendingQuality[sender] = {

            movie: {
                metadata: {
                    ...metadata,
                    title
                },
                downloadLinks
            },

            timestamp: Date.now()
        };

        // --------------------------------------------------------
        // Quality message
        // --------------------------------------------------------

        let qualityMsg =
            `*📥 AVAILABLE DOWNLOADS*\n\n`;

        qualityMsg +=
            `🎬 *${title}*\n\n`;

        downloadLinks.forEach((item, i) => {

            qualityMsg +=
                `*${i + 1}.* ${item.quality}`;

            if (item.size) {
                qualityMsg +=
                    ` — ${item.size}`;
            }

            qualityMsg += "\n";
        });

        qualityMsg +=
            `\n*━━━━━━━━━━━━━━━━━━*\n`;

        qualityMsg +=
            `Reply with quality number.`;

        await danuwa.sendMessage(
            from,
            {
                text: qualityMsg
            },
            {
                quoted: mek
            }
        );

    } catch (error) {

        console.error(
            "Movie Info Error:",
            error
        );

        return reply(
            `*❌ Failed to get movie information!*

${error.message || "Unknown API error"}`
        );
    }
});

// ================================================================
// QUALITY SELECTION + SEND MOVIE
// ================================================================

cmd({

    filter: (text, { sender }) => {

        if (!pendingQuality[sender]) {
            return false;
        }

        if (!text) {
            return false;
        }

        const number =
            parseInt(
                String(text).trim()
            );

        return (
            !isNaN(number) &&
            number > 0 &&
            number <=
                pendingQuality[sender]
                    .movie
                    .downloadLinks
                    .length
        );
    }

}, async (danuwa, mek, m, {
    body,
    sender,
    reply,
    from
}) => {

    try {

        await danuwa.sendMessage(
            from,
            {
                react: {
                    text: "⬇️",
                    key: m.key
                }
            }
        );

        const index =
            parseInt(body.trim()) - 1;

        const data =
            pendingQuality[sender];

        if (!data) {

            return reply(
                "*❌ Download session expired!*"
            );
        }

        const movie =
            data.movie;

        const selectedLink =
            movie.downloadLinks[index];

        delete pendingQuality[sender];

        if (!selectedLink) {

            return reply(
                "*❌ Invalid quality selection!*"
            );
        }

        const title =
            movie.metadata.title ||
            "Cinesubz Movie";

        const quality =
            selectedLink.quality ||
            "Movie";

        const fileName =
            `${title.substring(0, 80)} - ${quality}.mp4`
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
                .trim();

        await reply(
            `*⬇️ Preparing Movie...*

🎬 *${title}*
📊 *Quality:* ${quality}

Please wait...`
        );

        // --------------------------------------------------------
        // Direct URL from /dl API
        // --------------------------------------------------------

        const directUrl =
            selectedLink.link;

        if (!directUrl) {

            return reply(
                "*❌ Download URL not available!*"
            );
        }

        console.log(
            "Cinesubz Download URL:",
            directUrl
        );

        // --------------------------------------------------------
        // Send as document
        // --------------------------------------------------------

        await danuwa.sendMessage(
            from,
            {
                document: {
                    url: directUrl
                },

                mimetype: "video/mp4",

                fileName,

                caption:
                    `*🎬 ${title}*\n\n` +
                    `*📊 Quality:* ${quality}\n` +
                    (
                        selectedLink.size
                            ? `*💾 Size:* ${selectedLink.size}\n`
                            : ""
                    ) +
                    `\n*🍿 Enjoy the movie!*`
            },
            {
                quoted: mek
            }
        );

        await danuwa.sendMessage(
            from,
            {
                react: {
                    text: "✅",
                    key: m.key
                }
            }
        );

    } catch (error) {

        console.error(
            "Movie Download Error:",
            error
        );

        return reply(
            `*❌ Failed to send movie!*

${error.message || "Unknown error"}`
        );
    }
});

// ================================================================
// SINHALASUB SEARCH
// ================================================================

cmd({

    pattern: "ssmovie",

    alias: [
        "sinhalasubmovie",
        "sinhalasubsearch"
    ],

    react: "🇱🇰",

    desc: "Search SinhalaSub movies using API",

    category: "download",

    filename: __filename

}, async (danuwa, mek, m, {
    from,
    q,
    sender,
    reply
}) => {

    try {

        if (!q) {

            return reply(
                `*🇱🇰 SinhalaSub Movie Search*

Usage:
*.ssmovie movie name*

Example:
*.ssmovie Avatar`
            );
        }

        await reply(
            "*🔍 Searching SinhalaSub movies...*"
        );

        const data =
            await apiRequest(
                "/api/v1/movie/sinhalasub/search",
                q
            );

        const results =
            getArray(data);

        if (!results.length) {

            return reply(
                "*❌ No SinhalaSub movies found!*"
            );
        }

        const movies =
            results.slice(0, 10);

        pendingSearch[sender] = {

            results: movies.map(
                (movie, index) => {

                    return {

                        id: index + 1,

                        title: cleanText(
                            firstValue(
                                movie.title,
                                movie.name,
                                movie.movie,
                                movie.movieName,
                                movie.movie_name
                            )
                        ),

                        movieUrl: cleanText(
                            firstValue(
                                movie.url,
                                movie.link,
                                movie.movieUrl,
                                movie.movie_url,
                                movie.href
                            )
                        ),

                        thumb: cleanText(
                            extractThumbnail(movie)
                        ),

                        language: cleanText(
                            firstValue(
                                movie.language,
                                movie.lang
                            )
                        ),

                        quality: cleanText(
                            firstValue(
                                movie.quality,
                                movie.resolution
                            )
                        ),

                        raw: movie
                    };
                }
            ).filter(
                movie =>
                    movie.title &&
                    movie.movieUrl
            ),

            timestamp: Date.now()
        };

        if (!pendingSearch[sender].results.length) {

            return reply(
                "*❌ No usable movie results found!*"
            );
        }

        let text =
            `*🇱🇰 SINHALASUB RESULTS*\n\n`;

        pendingSearch[sender]
            .results
            .forEach((movie, i) => {

                text +=
                    `*${i + 1}.* ${movie.title}\n`;

                if (movie.language) {
                    text +=
                        `   📝 ${movie.language}\n`;
                }

                if (movie.quality) {
                    text +=
                        `   📊 ${movie.quality}\n`;
                }

                text += "\n";
            });

        text +=
            `Reply with number *1-${pendingSearch[sender].results.length}*`;

        await danuwa.sendMessage(
            from,
            {
                text
            },
            {
                quoted: mek
            }
        );

    } catch (error) {

        console.error(
            "SinhalaSub Search Error:",
            error
        );

        return reply(
            `*❌ SinhalaSub API Error!*

${error.message || "Unknown error"}`
        );
    }
});

// ================================================================
// CLEANUP
// ================================================================

setInterval(() => {

    const now =
        Date.now();

    const timeout =
        10 * 60 * 1000;

    // Search sessions

    for (
        const sender in pendingSearch
    ) {

        if (
            now -
            pendingSearch[sender]
                .timestamp >
            timeout
        ) {

            delete pendingSearch[sender];
        }
    }

    // Quality sessions

    for (
        const sender in pendingQuality
    ) {

        if (
            now -
            pendingQuality[sender]
                .timestamp >
            timeout
        ) {

            delete pendingQuality[sender];
        }
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
