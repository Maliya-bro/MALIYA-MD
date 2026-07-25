/**
 * CineSubz.lk Movie/TV Show Download Plugin for MALIYA-MD
 * ────────────────────────────────────────────────────────────────────────────
 * FIXED: Proper import handling for cinesubz-scraper npm package
 */

const { cmd } = require("../command");

// ─── Import with proper error handling ─────────────────────────────────────

let cinesubzModule = null;
let searchCineSubz = null;
let scrapeCineSubz = null;
let scrapeCineSubzServerLink = null;
let Utils = null;
let isPackageLoaded = false;

try {
    // Try to load the package
    cinesubzModule = require('cinesubz-scraper');
    
    // Check what's exported
    console.log('[CINESUBZ] Package loaded. Exports:', Object.keys(cinesubzModule));
    
    // Handle different export structures
    if (cinesubzModule.default) {
        // If it has a default export
        const defaultExport = cinesubzModule.default;
        if (typeof defaultExport === 'function') {
            // If default is a class/constructor
            cinesubzModule.CineSubzScraper = defaultExport;
        } else if (typeof defaultExport === 'object') {
            // If default is an object with methods
            Object.assign(cinesubzModule, defaultExport);
        }
    }
    
    // Assign functions with fallbacks
    searchCineSubz = cinesubzModule.searchCineSubz || cinesubzModule.search;
    scrapeCineSubz = cinesubzModule.scrapeCineSubz || cinesubzModule.scrape;
    scrapeCineSubzServerLink = cinesubzModule.scrapeCineSubzServerLink || cinesubzModule.scrapeServerLink;
    Utils = cinesubzModule.Utils;
    
    // Check if we have what we need
    isPackageLoaded = !!(searchCineSubz && scrapeCineSubz);
    
    console.log('[CINESUBZ] Package loaded successfully:', {
        search: !!searchCineSubz,
        scrape: !!scrapeCineSubz,
        serverLink: !!scrapeCineSubzServerLink,
        utils: !!Utils
    });
    
} catch (error) {
    console.error('[CINESUBZ] Failed to load package:', error.message);
    console.error('[CINESUBZ] Stack:', error.stack);
}

// ─── Fallback Utility Functions ────────────────────────────────────────────

const fallbackUtils = {
    cleanTitle: (title = '') => {
        if (!title) return 'Unknown';
        return title
            .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, '')
            .replace(/sinhala subtitles?.*/i, '')
            .replace(/සිංහල.*/i, '')
            .replace(/\|.*/i, '')
            .replace(/[-–]\s*$/, '')
            .trim() || 'Unknown';
    },
    
    parseSize: (size = '') => {
        if (!size) return 9999;
        const upper = size.toUpperCase().trim();
        const num = parseFloat(upper);
        if (isNaN(num)) return 9999;
        if (upper.includes('GB')) return num * 1024;
        if (upper.includes('MB')) return num;
        return 9999;
    },
    
    normalizeQuality: (text = '') => {
        if (!text) return 'Unknown';
        const upper = text.toUpperCase();
        if (upper.includes('2160') || upper.includes('4K')) return '4K';
        if (upper.includes('1080') || upper.includes('FHD')) return '1080p';
        if (upper.includes('720') || upper.includes('HD')) return '720p';
        if (upper.includes('480') || upper.includes('SD')) return '480p';
        if (upper.includes('360')) return '360p';
        return text.trim() || 'Unknown';
    },
    
    getContentType: (url = '') => {
        if (!url) return 'unknown';
        if (url.includes('/movies/')) return 'movie';
        if (url.includes('/tvshows/')) return 'tvshow';
        return 'unknown';
    },
    
    extractYear: (text = '') => {
        if (!text) return null;
        const match = text.match(/\b(19|20)\d{2}\b/);
        return match ? match[0] : null;
    }
};

// Use Utils from package or fallback
const _Utils = Utils || fallbackUtils;

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
    MAX_SIZE_MB: 2048,
    SEARCH_LIMIT: 10,
    ENABLE_LOGGING: true,
    AUTO_SELECT_QUALITY: true,
};

// ─── State Management ──────────────────────────────────────────────────────

const userStates = {
    search: {},
    quality: {},
    download: {},
};

// ─── Helper Functions ───────────────────────────────────────────────────────

function log(message, type = 'INFO') {
    if (!CONFIG.ENABLE_LOGGING) return;
    console.log(`[CINESUBZ:${type}] ${message}`);
}

function formatSearchResults(results) {
    if (!results || results.length === 0) {
        return '❌ *No results found.*\n\nTry a different search term.';
    }

    let text = `🎬 *CineSubz Search Results*\n${'─'.repeat(30)}\n\n`;
    
    results.forEach((result, index) => {
        const title = _Utils.cleanTitle(result.title || 'Unknown');
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

    const title = _Utils.cleanTitle(metadata.title || 'Unknown');
    let text = `🎬 *${title}*\n${'─'.repeat(32)}\n\n`;
    
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
        const castNames = metadata.cast.slice(0, 5).map(c => c.name || 'Unknown').join(', ');
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

    const downloadLinks = metadata.downloadLinks || [];
    const validLinks = downloadLinks.filter(link => {
        const sizeMB = link.sizeMB || _Utils.parseSize(link.size);
        return sizeMB > 0 && sizeMB <= CONFIG.MAX_SIZE_MB;
    });

    if (validLinks.length === 0) {
        text += `\n⚠️ *No quality under 2GB available.*\n\n`;
        downloadLinks.forEach(link => {
            const quality = _Utils.normalizeQuality(link.quality || link.label || 'Unknown');
            const size = link.size || `${link.sizeMB || 'Unknown'}MB`;
            text += `• ${quality} — ${size}\n`;
        });
        text += `\n_All qualities are over 2GB_`;
        return text;
    }

    text += `\n📥 *Available Qualities:*\n`;
    validLinks.forEach((link, index) => {
        const quality = _Utils.normalizeQuality(link.quality || link.label || 'Unknown');
        const size = link.size || `${link.sizeMB || 'Unknown'}MB`;
        text += `${index + 1}. *${quality}* — ${size}\n`;
    });

    text += `\n_Reply with a number (1-${validLinks.length}) to download_`;
    return text;
}

function formatDownloadResult(title, quality, size, url, isTelegram) {
    const cleanTitle = _Utils.cleanTitle(title || 'Unknown');
    let text = `🎬 *${cleanTitle}*\n${'─'.repeat(32)}\n\n`;
    text += `📊 *Quality:* ${quality || 'Unknown'}\n`;
    text += `💾 *Size:* ${size || 'Unknown'}\n`;
    text += `📥 *Type:* ${isTelegram ? 'Telegram' : 'Direct Download'}\n\n`;

    if (isTelegram) {
        text += `📲 *Telegram Download:*\n${url || 'N/A'}\n\n`;
        text += `_Click the link to download via Telegram_`;
    } else {
        text += `⬇️ *Direct Download:*\n${url || 'N/A'}\n\n`;
        text += `_Sending file via WhatsApp..._`;
    }

    return text;
}

// ─── Custom Search Function (Fallback if package fails) ────────────────────

async function customSearch(query) {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    try {
        const response = await axios.get(`https://cinesubz.lk/?s=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        const seen = new Set();

        $('.display-item .item-box, article, .post').each((_, el) => {
            const a = $(el).find('a[href*="/movies/"], a[href*="/tvshows/"]').first();
            const href = a.attr('href') || '';
            const title = (a.attr('title') || a.text()).trim();
            
            if (!href || !title || seen.has(href)) return;
            seen.add(href);

            results.push({
                title: title,
                url: href,
                type: href.includes('/movies/') ? 'movie' : 'tvshow',
                rating: $(el).find("[class*='data-imdb']").first().text().replace(/imdb[:\s]*/i, '').trim(),
                year: _Utils.extractYear($(el).find("[class*='year']").first().text()),
                poster: $(el).find('img').first().attr('src') || '',
            });
        });

        return results;
    } catch (error) {
        log(`Custom search error: ${error.message}`, 'ERROR');
        throw error;
    }
}

// ─── Search Command ─────────────────────────────────────────────────────────

cmd({
    pattern: "film",
    alias: ["movie", "cinema", "cine", "sub", "cinesubz", "search"],
    react: "🎬",
    desc: "Search & download movies/TV shows from CineSubz.lk",
    category: "download",
    filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
    
    if (!q) {
        return reply(
            `*🎬 CineSubz Movie Search*\n\n` +
            `Usage: film <movie name>\n` +
            `Example: film spider man\n\n` +
            `_Sinhala subtitles සමඟ film download කරන්න!_ 🍿`
        );
    }

    await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
    reply(`🔍 *Searching for:* ${q}\n_Please wait..._`);

    try {
        let results;
        
        // Try using the package first
        if (isPackageLoaded && searchCineSubz) {
            try {
                results = await searchCineSubz(q, { limit: CONFIG.SEARCH_LIMIT });
            } catch (packageError) {
                log(`Package search failed: ${packageError.message}`, 'WARN');
                // Fallback to custom search
                results = await customSearch(q);
            }
        } else {
            // Use custom search
            results = await customSearch(q);
        }

        if (!results || results.length === 0) {
            return reply(
                `❌ *No results found for:* "${q}"\n\n` +
                `Try:\n` +
                `• Different keyword\n` +
                `• Shorter search term\n` +
                `• Check spelling`
            );
        }

        userStates.search[sender] = {
            results,
            timestamp: Date.now(),
            query: q
        };

        const formattedResults = formatSearchResults(results);
        await maliya.sendMessage(from, { text: formattedResults }, { quoted: mek });

    } catch (error) {
        log(`Search error: ${error.message}`, 'ERROR');
        reply(
            `❌ *Search failed:* ${error.message}\n\n` +
            `Please try again later.`
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

    if (Date.now() - searchState.timestamp > 600000) {
        delete userStates.search[sender];
        return reply('⏰ *Search session expired.* Please search again.');
    }

    const selectedIndex = parseInt(body.trim()) - 1;
    const selected = searchState.results[selectedIndex];

    if (!selected) {
        return reply('❌ *Invalid selection.*');
    }

    delete userStates.search[sender];

    reply(`📖 *Fetching details...*\n_Please wait_`);

    try {
        let metadata;
        
        // Try using the package
        if (isPackageLoaded && scrapeCineSubz) {
            try {
                metadata = await scrapeCineSubz(selected.url);
            } catch (packageError) {
                log(`Package scrape failed: ${packageError.message}`, 'WARN');
                // Try custom fetch
                metadata = await customFetchMetadata(selected.url);
            }
        } else {
            metadata = await customFetchMetadata(selected.url);
        }

        if (!metadata) {
            return reply('❌ *Failed to fetch details.*');
        }

        userStates.quality[sender] = {
            metadata,
            selected,
            timestamp: Date.now()
        };

        const formattedDetails = formatMovieDetails(metadata);
        
        if (metadata.poster) {
            try {
                await maliya.sendMessage(from, {
                    image: { url: metadata.poster },
                    caption: formattedDetails
                }, { quoted: mek });
            } catch {
                await maliya.sendMessage(from, { text: formattedDetails }, { quoted: mek });
            }
        } else {
            await maliya.sendMessage(from, { text: formattedDetails }, { quoted: mek });
        }

    } catch (error) {
        log(`Metadata error: ${error.message}`, 'ERROR');
        reply(`❌ *Failed to fetch details:* ${error.message}`);
    }
});

// ─── Custom Metadata Fetch ──────────────────────────────────────────────────

async function customFetchMetadata(url) {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        const title = $('.info-details .details-title h3').first().text().trim() ||
                      $('h1.entry-title').first().text().trim() ||
                      $('h1').first().text().trim();
        
        const poster = $('.splash-bg img').first().attr('src') ||
                       $('.poster img').first().attr('src') ||
                       $('.wp-post-image').first().attr('src') || '';
        
        const imdb_rate = $('.data-imdb').first().text().replace(/imdb[:\s]*/i, '').trim();
        const duration = $('[itemprop="duration"]').first().text().trim() ||
                         $('.runtime').first().text().trim();
        
        const genres = [];
        $('.details-genre a, .sgeneros a').each((_, el) => {
            const g = $(el).text().trim();
            if (g && genres.length < 6) genres.push(g);
        });
        
        const description = $('.description, .content-desc').first().text().trim() ||
                           $('[itemprop="description"]').first().text().trim();
        
        const downloadLinks = [];
        $('a[href*="/zt-links/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (!href) return;
            
            const text = $(el).text().trim();
            const qualityMatch = text.match(/(4K|2160|1080|FHD|720|HD|480|SD|360)/i);
            const sizeMatch = text.match(/(\d+\.?\d*)\s*(GB|MB)/i);
            
            downloadLinks.push({
                label: text,
                quality: qualityMatch ? qualityMatch[1] : '',
                size: sizeMatch ? sizeMatch[0] : '',
                sizeMB: sizeMatch ? _Utils.parseSize(sizeMatch[0]) : 0,
                url: href,
            });
        });
        
        return {
            title,
            poster,
            imdb_rate,
            vote: imdb_rate,
            duration,
            genre: genres.join(', '),
            genres,
            description,
            directors: [],
            cast: [],
            subtitle_by: '',
            downloadLinks,
        };
        
    } catch (error) {
        log(`Custom metadata error: ${error.message}`, 'ERROR');
        throw error;
    }
}

// ─── Handle Quality Selection ──────────────────────────────────────────────

cmd({
    filter: (text, { sender }) => {
        if (!userStates.quality[sender]) return false;
        const num = parseInt(text.trim());
        const metadata = userStates.quality[sender].metadata;
        const downloadLinks = metadata.downloadLinks || [];
        const validLinks = downloadLinks.filter(link => {
            const sizeMB = link.sizeMB || _Utils.parseSize(link.size);
            return sizeMB > 0 && sizeMB <= CONFIG.MAX_SIZE_MB;
        });
        return !isNaN(num) && num >= 1 && num <= validLinks.length;
    },
}, async (maliya, mek, m, { body, sender, reply, from }) => {
    
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const qualityState = userStates.quality[sender];
    if (!qualityState) {
        return reply('❌ *Session expired.*');
    }

    if (Date.now() - qualityState.timestamp > 600000) {
        delete userStates.quality[sender];
        return reply('⏰ *Session expired.*');
    }

    const { metadata, selected } = qualityState;
    const downloadLinks = metadata.downloadLinks || [];
    const validLinks = downloadLinks.filter(link => {
        const sizeMB = link.sizeMB || _Utils.parseSize(link.size);
        return sizeMB > 0 && sizeMB <= CONFIG.MAX_SIZE_MB;
    });

    const selectedIndex = parseInt(body.trim()) - 1;
    const selectedLink = validLinks[selectedIndex];

    if (!selectedLink) {
        return reply('❌ *Invalid selection.*');
    }

    delete userStates.quality[sender];

    const quality = _Utils.normalizeQuality(selectedLink.quality || selectedLink.label || 'Unknown');
    const size = selectedLink.size || `${selectedLink.sizeMB || 'Unknown'}MB`;

    reply(`⏳ *Getting download link for:* ${quality}\n_This may take a moment..._`);

    try {
        let downloadResult;
        
        // Try using the package
        if (isPackageLoaded && scrapeCineSubzServerLink) {
            try {
                downloadResult = await scrapeCineSubzServerLink(selectedLink.url);
            } catch (packageError) {
                log(`Package server link failed: ${packageError.message}`, 'WARN');
                downloadResult = { url: selectedLink.url, size: size };
            }
        } else {
            downloadResult = { url: selectedLink.url, size: size };
        }

        const title = metadata.title || selected.title || 'Unknown';
        const isTelegram = downloadResult.telegram ? true : false;
        const downloadUrl = downloadResult.telegram || downloadResult.direct || downloadResult.url;
        const fileSize = downloadResult.size || size;

        // Send as text link (most reliable)
        await maliya.sendMessage(from, {
            text: formatDownloadResult(title, quality, fileSize, downloadUrl, isTelegram) +
                  '\n\n⚠️ *Direct file sending may fail for large files.*\n' +
                  `📥 *Download Link:*\n${downloadUrl}`
        }, { quoted: mek });

    } catch (error) {
        log(`Download error: ${error.message}`, 'ERROR');
        reply(`❌ *Download failed:* ${error.message}\n\nPlease try again.`);
    }
});

// ─── Quick Download Command ────────────────────────────────────────────────

cmd({
    pattern: "getfilm",
    alias: ["getmovie", "get", "dl"],
    react: "⬇️",
    desc: "Quick download movie/TV show with best quality",
    category: "download",
    filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {
    
    if (!q) {
        return reply(
            `*⬇️ Quick Download*\n\n` +
            `Usage: getfilm <movie name or URL>\n\n` +
            `Examples:\n` +
            `getfilm avengers\n` +
            `getfilm https://cinesubz.lk/movies/avatar/\n\n` +
            `_Automatically selects best quality under 2GB_`
        );
    }

    await maliya.sendMessage(from, { react: { text: "⬇️", key: mek.key } });
    reply(`⏳ *Processing request...*\n_Please wait_`);

    try {
        let url = q.trim();
        let title = '';

        // If not a URL, search first
        if (!url.startsWith('http')) {
            let results;
            
            if (isPackageLoaded && searchCineSubz) {
                try {
                    results = await searchCineSubz(q, { limit: 1 });
                } catch {
                    results = await customSearch(q);
                }
            } else {
                results = await customSearch(q);
            }
            
            if (!results || results.length === 0) {
                return reply(`❌ *No results found for:* "${q}"`);
            }
            
            url = results[0].url;
            title = results[0].title;
        }

        // Get metadata
        let metadata;
        if (isPackageLoaded && scrapeCineSubz) {
            try {
                metadata = await scrapeCineSubz(url);
            } catch {
                metadata = await customFetchMetadata(url);
            }
        } else {
            metadata = await customFetchMetadata(url);
        }

        if (!metadata) {
            return reply('❌ *Failed to fetch movie details.*');
        }

        // Find best quality under 2GB
        const downloadLinks = metadata.downloadLinks || [];
        const validLinks = downloadLinks.filter(link => {
            const sizeMB = link.sizeMB || _Utils.parseSize(link.size);
            return sizeMB > 0 && sizeMB <= CONFIG.MAX_SIZE_MB;
        });

        if (validLinks.length === 0) {
            return reply(
                `⚠️ *No quality under 2GB available.*\n\n` +
                `Available qualities:\n` +
                downloadLinks.map(l => `• ${_Utils.normalizeQuality(l.quality || l.label)} — ${l.size}`).join('\n')
            );
        }

        // Select best quality (1080p > 720p > 480p)
        const qualityOrder = ['4K', '1080p', '720p', '480p', '360p'];
        const sortedLinks = validLinks.sort((a, b) => {
            const aQuality = _Utils.normalizeQuality(a.quality || a.label);
            const bQuality = _Utils.normalizeQuality(b.quality || b.label);
            const aIndex = qualityOrder.indexOf(aQuality);
            const bIndex = qualityOrder.indexOf(bQuality);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

        const bestLink = sortedLinks[0];
        const quality = _Utils.normalizeQuality(bestLink.quality || bestLink.label);
        const size = bestLink.size || `${bestLink.sizeMB}MB`;

        // Get download link
        let downloadResult;
        if (isPackageLoaded && scrapeCineSubzServerLink) {
            try {
                downloadResult = await scrapeCineSubzServerLink(bestLink.url);
            } catch {
                downloadResult = { url: bestLink.url };
            }
        } else {
            downloadResult = { url: bestLink.url };
        }

        const finalTitle = metadata.title || title || 'Movie';
        const downloadUrl = downloadResult.telegram || downloadResult.direct || downloadResult.url;
        const isTelegram = !!downloadResult.telegram;

        // Send the link
        await maliya.sendMessage(from, {
            text: formatDownloadResult(finalTitle, quality, size, downloadUrl, isTelegram) +
                  '\n\n📥 *Direct Download:*\n' + downloadUrl
        }, { quoted: mek });

    } catch (error) {
        log(`Quick download error: ${error.message}`, 'ERROR');
        reply(`❌ *Download failed:* ${error.message}`);
    }
});

// ─── Cleanup Command ───────────────────────────────────────────────────────

cmd({
    pattern: "clearcine",
    alias: ["cinesubzreset"],
    react: "🧹",
    desc: "Clear CineSubz search sessions",
    category: "utility",
    filename: __filename,
}, async (maliya, mek, m, { from, sender, reply }) => {
    
    delete userStates.search[sender];
    delete userStates.quality[sender];
    delete userStates.download[sender];

    reply(`🧹 *CineSubz sessions cleared!*\n\nSearch again: film <name>`);
});

// ─── Help Command ──────────────────────────────────────────────────────────

cmd({
    pattern: "cinehelp",
    alias: ["cine"],
    react: "📚",
    desc: "Show CineSubz help",
    category: "utility",
    filename: __filename,
}, async (maliya, mek, m, { from, reply }) => {
    
    await maliya.sendMessage(from, {
        text: `
📚 *CineSubz Downloader Help*
${'═'.repeat(30)}

🎬 *Commands:*

• film <name> - Search and select quality
• getfilm <name> - Quick download (best quality)
• clearcine - Clear sessions
• cinehelp - Show this help

${'─'.repeat(30)}
📖 *Examples:*
film spider man
getfilm avengers

${'─'.repeat(30)}
⚠️ *Notes:*
• Files under 2GB
• Sinhala subtitles included
• Supports movies & TV shows

${'═'.repeat(30)}
*Powered by CineSubz.lk* 🍿
`
    }, { quoted: mek });
});

// ─── Session Cleanup ──────────────────────────────────────────────────────

setInterval(() => {
    const now = Date.now();
    const TTL = 10 * 60 * 1000;

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
}, 5 * 60 * 1000);

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
    userStates,
    CONFIG,
    isPackageLoaded,
    _Utils
};
