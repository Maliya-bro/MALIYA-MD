/**
 * CineSubz.lk Movie/TV Show Download Plugin for MALIYA-MD
 * ────────────────────────────────────────────────────────────────────────────
 * Complete integration using the official cinesubz-scraper npm package
 * 
 * Features:
 *   ✅ Search movies and TV shows
 *   ✅ Get detailed metadata (cast, rating, description, etc.)
 *   ✅ Auto-select best quality under 2GB
 *   ✅ Direct download via WhatsApp document
 *   ✅ Telegram download option
 *   ✅ Stealth protection (bypasses bot detection)
 *   ✅ Smart quality selection
 *   ✅ Caching for better performance
 * 
 * Installation:
 *   npm install cinesubz-scraper
 * 
 * ────────────────────────────────────────────────────────────────────────────
 */

const { cmd } = require("../command");
const { 
    CineSubzScraper, 
    searchCineSubz, 
    scrapeCineSubz, 
    scrapeCineSubzServerLink,
    Utils 
} = require('cinesubz-scraper');

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
    MAX_SIZE_MB: 2048,           // Max file size for WhatsApp (2GB)
    SEARCH_LIMIT: 10,            // Max search results
    CACHE_DURATION: 300000,      // 5 minutes cache
    ENABLE_LOGGING: true,
    AUTO_SELECT_QUALITY: true,   // Auto-select best quality under 2GB
    PREFER_TELEGRAM: false,      // Prefer Telegram links over direct
};

// ─── State Management ──────────────────────────────────────────────────────

const userStates = {
    search: {},      // Pending search sessions
    quality: {},     // Pending quality selection
    download: {},    // Pending download confirmation
};

// ─── Helper Functions ───────────────────────────────────────────────────────

function log(message, type = 'INFO') {
    if (!CONFIG.ENABLE_LOGGING) return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CINESUBZ:${type}] ${message}`);
}

function formatSearchResults(results) {
    if (!results || results.length === 0) {
        return '❌ *No results found.*\n\nTry a different search term.';
    }

    let text = `🎬 *CineSubz Search Results*\n${'─'.repeat(30)}\n\n`;
    
    results.forEach((result, index) => {
        const title = Utils.cleanTitle(result.title);
        const rating = result.rating || result.imdb_rate || 'N/A';
        const year = result.year || '';
        const type = result.type === 'tvshow' ? '📺' : '🎬';
        
        text += `${index + 1}. ${type} *${title}*`;
        if (year) text += ` (${year})`;
        if (rating !== 'N/A') text += `\n   ⭐ ${rating}/10`;
        text += '\n\n';
    });

    text += `_Reply with a number (1-${results.length}) to continue_`;
    return text;
}

function formatMovieDetails(metadata) {
    if (!metadata) return '❌ *Failed to fetch movie details.*';

    let text = `🎬 *${Utils.cleanTitle(metadata.title)}*\n${'─'.repeat(32)}\n\n`;
    
    if (metadata.imdb_rate) {
        text += `⭐ *IMDb:* ${metadata.imdb_rate}/10\n`;
    }
    
    if (metadata.vote) {
        text += `⭐ *Rating:* ${metadata.vote}/10\n`;
    }
    
    if (metadata.duration) {
        text += `⏱️ *Duration:* ${metadata.duration}\n`;
    }
    
    if (metadata.genre) {
        text += `🎭 *Genre:* ${metadata.genre}\n`;
    }
    
    if (metadata.directors && metadata.directors.length > 0) {
        text += `🎥 *Director:* ${metadata.directors.join(', ')}\n`;
    }
    
    if (metadata.cast && metadata.cast.length > 0) {
        const castNames = metadata.cast.slice(0, 5).map(c => c.name).join(', ');
        text += `👥 *Cast:* ${castNames}\n`;
    }
    
    if (metadata.subtitle_by) {
        text += `📝 *Subtitles:* ${metadata.subtitle_by}\n`;
    }
    
    if (metadata.description) {
        const desc = metadata.description.length > 200 
            ? metadata.description.substring(0, 200) + '...' 
            : metadata.description;
        text += `\n📖 *Description:*\n${desc}\n`;
    }

    // Filter and show available qualities
    const validLinks = metadata.downloadLinks.filter(link => 
        link.sizeMB > 0 && link.sizeMB <= CONFIG.MAX_SIZE_MB
    );

    if (validLinks.length === 0) {
        text += `\n⚠️ *No quality under 2GB available.*\n\n`;
        metadata.downloadLinks.forEach(link => {
            text += `• ${Utils.normalizeQuality(link.quality || link.label)} — ${link.size || 'Unknown size'}\n`;
        });
        text += `\n_All qualities are over 2GB_`;
        return text;
    }

    text += `\n📥 *Available Qualities:*\n`;
    validLinks.forEach((link, index) => {
        const quality = Utils.normalizeQuality(link.quality || link.label);
        const size = link.size || `${link.sizeMB}MB`;
        text += `${index + 1}. *${quality}* — ${size}\n`;
    });

    text += `\n_Reply with a number (1-${validLinks.length}) to download_`;
    return text;
}

function formatDownloadResult(title, quality, size, url, isTelegram) {
    let text = `🎬 *${Utils.cleanTitle(title)}*\n${'─'.repeat(32)}\n\n`;
    text += `📊 *Quality:* ${quality}\n`;
    text += `💾 *Size:* ${size}\n`;
    text += `📥 *Type:* ${isTelegram ? 'Telegram' : 'Direct Download'}\n\n`;

    if (isTelegram) {
        text += `📲 *Telegram Download:*\n${url}\n\n`;
        text += `_Click the link to download via Telegram_`;
    } else {
        text += `⬇️ *Direct Download:*\n${url}\n\n`;
        text += `_Sending file via WhatsApp..._`;
    }

    return text;
}

// ─── Search Command ─────────────────────────────────────────────────────────

cmd({
    pattern: "film",
    alias: ["movie", "cinema", "cine", "sub", "cinesubz", "search", "filme", "pelicula"],
    react: "🎬",
    desc: "Search & download movies/TV shows from CineSubz.lk with Sinhala subtitles",
    category: "download",
    filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
    
    if (!q) {
        return reply(
            `*🎬 CineSubz Movie/TV Show Search*\n\n` +
            `*Usage:*\n` +
            `• film <movie name>\n` +
            `• movie <movie name>\n` +
            `• cinema <movie name>\n\n` +
            `*Examples:*\n` +
            `film spider man\n` +
            `movie avatar\n` +
            `cinema the batman\n\n` +
            `_Sinhala subtitles සමඟ movie/TV show download කරන්න!_ 🍿`
        );
    }

    await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
    reply(`🔍 *Searching for:* ${q}\n_Please wait..._`);

    try {
        // Use the search function from the package
        const results = await searchCineSubz(q, { 
            limit: CONFIG.SEARCH_LIMIT,
            type: 'all' // Search both movies and TV shows
        });

        if (!results || results.length === 0) {
            return reply(
                `❌ *No results found for:* "${q}"\n\n` +
                `Try:\n` +
                `• Using a different keyword\n` +
                `• Shorter search term\n` +
                `• Check spelling\n\n` +
                `_Example: film spider_`
            );
        }

        // Store search results for this user
        userStates.search[sender] = {
            results,
            timestamp: Date.now(),
            query: q
        };

        const formattedResults = formatSearchResults(results);
        await maliya.sendMessage(from, { text: formattedResults }, { quoted: mek });

    } catch (error) {
        log(`Search error for "${q}": ${error.message}`, 'ERROR');
        reply(
            `❌ *Search failed:* ${error.message}\n\n` +
            `Please try again later or use a different search term.`
        );
    }
});

// ─── Handle Search Selection ───────────────────────────────────────────────

cmd({
    filter: (text, { sender }) => {
        if (!userStates.search[sender]) return false;
        const num = parseInt(text.trim());
        return !isNaN(num) && num >= 1 && num <= userStates.search[sender].results.length;
    },
}, async (maliya, mek, m, { body, sender, reply, from }) => {
    
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const searchState = userStates.search[sender];
    if (!searchState) {
        return reply('❌ *Search session expired.* Please search again.');
    }

    // Check if session expired (10 minutes)
    if (Date.now() - searchState.timestamp > 600000) {
        delete userStates.search[sender];
        return reply('⏰ *Search session expired.* Please search again.');
    }

    const selectedIndex = parseInt(body.trim()) - 1;
    const selected = searchState.results[selectedIndex];

    if (!selected) {
        return reply('❌ *Invalid selection.* Please try again.');
    }

    // Clear search state
    delete userStates.search[sender];

    reply(`📖 *Fetching details for:* ${Utils.cleanTitle(selected.title)}\n_Please wait..._`);

    try {
        // Get full metadata
        const metadata = await scrapeCineSubz(selected.url);

        if (!metadata) {
            return reply('❌ *Failed to fetch movie details.* Please try again.');
        }

        // Store metadata for this user
        userStates.quality[sender] = {
            metadata,
            selected,
            timestamp: Date.now()
        };

        const formattedDetails = formatMovieDetails(metadata);
        
        // Send poster image if available
        if (metadata.poster) {
            try {
                await maliya.sendMessage(from, {
                    image: { url: metadata.poster },
                    caption: formattedDetails
                }, { quoted: mek });
            } catch (imageError) {
                // If image fails, send as text
                await maliya.sendMessage(from, { text: formattedDetails }, { quoted: mek });
            }
        } else {
            await maliya.sendMessage(from, { text: formattedDetails }, { quoted: mek });
        }

    } catch (error) {
        log(`Metadata error for "${selected.url}": ${error.message}`, 'ERROR');
        reply(
            `❌ *Failed to fetch details:* ${error.message}\n\n` +
            `Try:\n` +
            `• Search again\n` +
            `• Select a different result\n` +
            `• Try again later`
        );
    }
});

// ─── Handle Quality Selection ──────────────────────────────────────────────

cmd({
    filter: (text, { sender }) => {
        if (!userStates.quality[sender]) return false;
        const num = parseInt(text.trim());
        const metadata = userStates.quality[sender].metadata;
        const validLinks = metadata.downloadLinks.filter(link => 
            link.sizeMB > 0 && link.sizeMB <= CONFIG.MAX_SIZE_MB
        );
        return !isNaN(num) && num >= 1 && num <= validLinks.length;
    },
}, async (maliya, mek, m, { body, sender, reply, from }) => {
    
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const qualityState = userStates.quality[sender];
    if (!qualityState) {
        return reply('❌ *Session expired.* Please search again.');
    }

    // Check if session expired (10 minutes)
    if (Date.now() - qualityState.timestamp > 600000) {
        delete userStates.quality[sender];
        return reply('⏰ *Session expired.* Please search again.');
    }

    const { metadata, selected } = qualityState;
    const validLinks = metadata.downloadLinks.filter(link => 
        link.sizeMB > 0 && link.sizeMB <= CONFIG.MAX_SIZE_MB
    );

    const selectedIndex = parseInt(body.trim()) - 1;
    const selectedLink = validLinks[selectedIndex];

    if (!selectedLink) {
        return reply('❌ *Invalid selection.* Please try again.');
    }

    // Clear quality state
    delete userStates.quality[sender];

    const quality = Utils.normalizeQuality(selectedLink.quality || selectedLink.label);
    const size = selectedLink.size || `${selectedLink.sizeMB}MB`;

    reply(`⏳ *Getting download link for:* ${quality}\n_This may take a moment..._`);

    try {
        // Extract the server link
        const downloadResult = await scrapeCineSubzServerLink(selectedLink.url);

        if (!downloadResult || !downloadResult.url) {
            return reply(
                `❌ *Failed to get download link.*\n\n` +
                `You can try manually:\n` +
                `${selectedLink.url}`
            );
        }

        const title = metadata.title || selected.title;
        const isTelegram = !!downloadResult.telegram;
        const downloadUrl = downloadResult.telegram || downloadResult.direct || downloadResult.url;
        const fileSize = downloadResult.size || size;

        // Store download info for potential retry
        userStates.download[sender] = {
            title,
            quality,
            size: fileSize,
            url: downloadUrl,
            isTelegram,
            timestamp: Date.now()
        };

        // If it's a direct download, send the file
        if (!isTelegram && downloadResult.direct) {
            const fileName = `${Utils.cleanTitle(title)} [${quality}] [CineSubz].mp4`
                .replace(/[^\w\s.\-\[\]()]/gi, '')
                .trim();

            try {
                // Send the document
                await maliya.sendMessage(from, {
                    document: { url: downloadResult.direct },
                    mimetype: 'video/mp4',
                    fileName: fileName,
                    caption: formatDownloadResult(title, quality, fileSize, downloadResult.direct, false)
                }, { quoted: mek });

                // Clean up download state
                delete userStates.download[sender];
                
            } catch (sendError) {
                log(`Document send error: ${sendError.message}`, 'ERROR');
                
                // If document send fails, send the link
                await maliya.sendMessage(from, {
                    text: formatDownloadResult(title, quality, fileSize, downloadResult.direct, false) +
                          '\n\n⚠️ *File too large or failed to send.*\n' +
                          `📥 *Direct Link:*\n${downloadResult.direct}`
                }, { quoted: mek });
            }
        } else {
            // It's a Telegram link or we couldn't get direct link
            const message = formatDownloadResult(title, quality, fileSize, downloadUrl, isTelegram);
            
            if (isTelegram) {
                // Send Telegram link
                await maliya.sendMessage(from, {
                    text: message
                }, { quoted: mek });
            } else {
                // Send as fallback
                await maliya.sendMessage(from, {
                    text: message + '\n\n⚠️ *Direct download not available.*\n' +
                          'Please use the link above.'
                }, { quoted: mek });
            }
        }

    } catch (error) {
        log(`Download error: ${error.message}`, 'ERROR');
        reply(
            `❌ *Download failed:* ${error.message}\n\n` +
            `You can try:\n` +
            `• Select a different quality\n` +
            `• Search again\n` +
            `• Try again later\n\n` +
            `_If the issue persists, the file might be unavailable._`
        );
    }
});

// ─── Auto-Download Best Quality Command ────────────────────────────────────

cmd({
    pattern: "dl",
    alias: ["download", "get", "getfilm", "getmovie"],
    react: "⬇️",
    desc: "Download movie/TV show directly with best quality",
    category: "download",
    filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
    
    if (!q) {
        return reply(
            `*⬇️ Quick Download*\n\n` +
            `Usage: dl <movie URL or name>\n\n` +
            `Examples:\n` +
            `dl https://cinesubz.lk/movies/avatar-2026/\n` +
            `dl avatar\n\n` +
            `_Automatically selects best quality under 2GB_`
        );
    }

    await maliya.sendMessage(from, { react: { text: "⬇️", key: mek.key } });
    reply(`⏳ *Processing download request...*\n_Please wait_`);

    try {
        let url = q.trim();

        // Check if it's a URL or a search query
        if (!url.startsWith('http')) {
            // Search first
            const results = await searchCineSubz(q, { limit: 1, type: 'all' });
            
            if (!results || results.length === 0) {
                return reply(`❌ *No results found for:* "${q}"\nTry using the film command to search.`);
            }

            url = results[0].url;
        }

        // Get download URL using the scraper
        const scraper = new CineSubzScraper();
        
        try {
            // Get metadata
            const metadata = await scraper.getMetadata(url);
            
            // Get download link with auto-select
            const download = await scraper.getDownloadUrl(url, {
                autoSelect: CONFIG.AUTO_SELECT_QUALITY,
                qualityIndex: 0
            });

            await scraper.close();

            if (!download || !download.url) {
                return reply(`❌ *No download link found.*\n\nPlease try using the film command.`);
            }

            const title = metadata.title || 'Movie';
            const quality = Utils.normalizeQuality(
                metadata.downloadLinks.find(l => l.url === download.url)?.quality || 'Best'
            );
            const size = download.confirmedSize || 'Unknown';
            const isTelegram = download.isTelegram || false;
            const downloadUrl = download.url || download.directUrl;

            // Send the file or link
            if (!isTelegram && download.directUrl) {
                const fileName = `${Utils.cleanTitle(title)} [${quality}] [CineSubz].mp4`
                    .replace(/[^\w\s.\-\[\]()]/gi, '')
                    .trim();

                try {
                    await maliya.sendMessage(from, {
                        document: { url: download.directUrl },
                        mimetype: 'video/mp4',
                        fileName: fileName,
                        caption: formatDownloadResult(title, quality, size, download.directUrl, false)
                    }, { quoted: mek });
                } catch (sendError) {
                    await maliya.sendMessage(from, {
                        text: formatDownloadResult(title, quality, size, download.directUrl, false) +
                              '\n\n⚠️ *File send failed.*\n' +
                              `📥 *Direct Link:*\n${download.directUrl}`
                    }, { quoted: mek });
                }
            } else {
                await maliya.sendMessage(from, {
                    text: formatDownloadResult(title, quality, size, downloadUrl, isTelegram)
                }, { quoted: mek });
            }

        } catch (error) {
            await scraper.close();
            throw error;
        }

    } catch (error) {
        log(`Quick download error: ${error.message}`, 'ERROR');
        reply(
            `❌ *Download failed:* ${error.message}\n\n` +
            `Try using the film command instead for more options.`
        );
    }
});

// ─── Cleanup Command ───────────────────────────────────────────────────────

cmd({
    pattern: "clearcine",
    alias: ["cinesubzreset", "clearfilm"],
    react: "🧹",
    desc: "Clear all CineSubz search sessions",
    category: "utility",
    filename: __filename,
}, async (maliya, mek, m, { from, sender, reply }) => {
    
    // Clear user's sessions
    delete userStates.search[sender];
    delete userStates.quality[sender];
    delete userStates.download[sender];

    reply(
        `🧹 *CineSubz sessions cleared!*\n\n` +
        `You can now start a fresh search using:\n` +
        `• film <movie name>\n` +
        `• dl <movie URL or name>`
    );
});

// ─── Help Command ──────────────────────────────────────────────────────────

cmd({
    pattern: "cinehelp",
    alias: ["cine", "cinesubzhelp"],
    react: "📚",
    desc: "Show CineSubz downloader help",
    category: "utility",
    filename: __filename,
}, async (maliya, mek, m, { from, reply }) => {
    
    const help = `
📚 *CineSubz Downloader Help*
${'═'.repeat(35)}

🎬 *Commands:*

┌─ *Search & Download*
│  film <movie name>
│  └─ Search and download with quality selection
│
│  dl <movie URL or name>
│  └─ Quick download with best quality

┌─ *Utils*
│  clearcine
│  └─ Clear your search sessions
│
│  cinehelp
│  └─ Show this help menu

${'─'.repeat(35)}
📖 *How it works:*

1. Search: \`film spider man\`
2. Select: Reply with number
3. Choose quality: Reply with number
4. Get download: File sent automatically

${'─'.repeat(35)}
⚠️ *Notes:*
• Files under 2GB only (WhatsApp limit)
• Sinhala subtitles included
• Supports both movies and TV shows
• Auto-detects best quality

${'═'.repeat(35)}
*Powered by CineSubz.lk* 🍿
`;

    await maliya.sendMessage(from, { text: help }, { quoted: mek });
});

// ─── Session Cleanup (Garbage Collection) ──────────────────────────────────

// Clean expired sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    const TTL = 10 * 60 * 1000; // 10 minutes

    for (const sender in userStates.search) {
        if (now - userStates.search[sender].timestamp > TTL) {
            delete userStates.search[sender];
        }
    }

    for (const sender in userStates.quality) {
        if (now - userStates.quality[sender].timestamp > TTL) {
            delete userStates.quality[sender];
        }
    }

    for (const sender in userStates.download) {
        if (now - userStates.download[sender].timestamp > TTL) {
            delete userStates.download[sender];
        }
    }

    log(`Cleaned expired sessions. Active: ${Object.keys(userStates.search).length} search, ${Object.keys(userStates.quality).length} quality, ${Object.keys(userStates.download).length} download`, 'CLEANUP');
    
}, 5 * 60 * 1000);

// ─── Error Handler for Uncaught Exceptions ─────────────────────────────────

process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`, 'CRITICAL');
    log(error.stack, 'CRITICAL');
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled rejection at: ${promise}`, 'CRITICAL');
    log(`Reason: ${reason}`, 'CRITICAL');
});

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
    userStates,
    CONFIG,
    formatSearchResults,
    formatMovieDetails,
    formatDownloadResult,
    Utils
};
