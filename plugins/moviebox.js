const { cmd } = require('../command');
const axios = require('axios');

// Configurations
const API_BASE = "https://chama-movie-api.koyeb.app";
const API_KEY = "chama_api_c18d54f734c23ea0c333d33b7494b3b2";
const DEFAULT_FOOTER = "👑 *Powered by MALIYA-MD*";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/file_0000000034cc720bb68937af930266d0.png?raw=true";

// Pending States in Memory
const pendingMovieSearch = {};
const pendingQualitySelect = {};
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes

// Helper to convert text to Small Caps
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

// 1. MAIN SEARCH COMMAND
cmd({
    pattern: "moviebox",
    alias: ["movieboxdl", "mb"],
    desc: "Search and download movies or TV shows from MovieBox",
    category: "download",
    react: "🍿",
    filename: __filename,
},
async (socket, mek, m, { from, args, sender, reply }) => {
    if (!args.length) {
        return reply("❌ *ERROR*\n\n*🛑 සෙවිය යුතු සිනමාපටය හෝ ටීවී කතාමාලාවේ නම ලබාදෙන්න!*\n*Example:* `.moviebox avatar`");
    }

    const movieboxQuery = args.join(' ').trim();
    await socket.sendMessage(from, { react: { text: "🔍", key: mek.key } });
    await reply("🔍 *Searching on MovieBox...*");

    try {
        const searchResponse = await axios.get(
            `${API_BASE}/api/v1/movie/moviebox/search?q=${encodeURIComponent(movieboxQuery)}&api_key=${API_KEY}`
        );
        const searchData = searchResponse.data;

        if (!searchData.status || !searchData.data || searchData.data.length === 0) {
            await socket.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
            return reply("❌ *NO RESULTS*\n\n*MovieBox හි සෙවූ නමින් කිසිවක් හමුවූයේ නැත! 🛑*");
        }

        const movieboxResults = searchData.data.slice(0, 20);

        // Store results for user selection
        pendingMovieSearch[sender] = {
            results: movieboxResults,
            query: movieboxQuery,
            timestamp: Date.now()
        };

        let listText = `╭━━━〔 🍿 *MOVIEBOX SEARCH* 〕━━━\n┃\n`;
        listText += `┃ 🔎 *Query:* ${toSmallCaps(movieboxQuery)}\n`;
        listText += `┃ 📊 *Found:* ${movieboxResults.length} Results\n┃\n`;
        listText += `╰━━━───────━━━━► ❥\n\n`;

        movieboxResults.forEach((item, index) => {
            const numStr = String(index + 1).padStart(2, '0');
            const type = item.type === 'tvshows' ? '📺 TV Series' : '🎥 Movie';
            listText += `*[ ${numStr} ]* ${type} | *${toSmallCaps(item.title)}*\n`;
        });

        listText += `\n───────────────────\n`;
        listText += `📌 *Reply with the number (1-${movieboxResults.length}) to select*`;

        await reply(listText);

    } catch (error) {
        console.error('Moviebox command error:', error);
        await socket.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        reply(`❌ *ERROR*\n\n*සර්වර් දෝෂයකි:* ${error.message || 'Unknown error'}`);
    }
});

// 2. SEARCH SELECTION LISTENER
cmd({
    filter: (text, { sender }) => {
        return (
            pendingMovieSearch[sender] &&
            !isNaN(text) &&
            parseInt(text) > 0 &&
            parseInt(text) <= pendingMovieSearch[sender].results.length
        );
    }
},
async (socket, mek, m, { body, sender, reply, from }) => {
    await socket.sendMessage(from, { react: { text: "⚡", key: mek.key } });

    const choice = parseInt(body.trim()) - 1;
    const selectedItem = pendingMovieSearch[sender].results[choice];
    delete pendingMovieSearch[sender]; // Clear search state

    const isTvShow = selectedItem.type === 'tvshows';

    if (isTvShow) {
        // --- TV SHOW FLOW ---
        await reply('⏳ *Fetching TV Series Details & Starting Download...*');
        try {
            const tvShowResponse = await axios.get(
                `${API_BASE}/api/v1/movie/moviebox/tv/info?q=${encodeURIComponent(selectedItem.link)}&api_key=${API_KEY}`
            );
            const tvShowData = tvShowResponse.data;
            if (!tvShowData.status || !tvShowData.data) {
                throw new Error('Failed to fetch TV show details');
            }

            const tvInfo = tvShowData.data;
            const tvDetailsText = 
`📺 *[ TV SERIES DETAILS ]*

🖼️ *Title:* ${tvInfo.title}
⭐ *IMDB:* ${tvInfo.rating || 'N/A'}
📅 *Year:* ${tvInfo.year || 'N/A'}
🕒 *Runtime:* ${tvInfo.duration || 'N/A'}
🌍 *Country:* ${tvInfo.country || 'N/A'}

✍️ *Story/Cast:*
Director: ${tvInfo.directors || 'N/A'}
Stars: ${tvInfo.stars || 'N/A'}

💡 *Sinhala AI Sub Available!*
${DEFAULT_FOOTER}`;

            const posterUrl = tvInfo.image || selectedItem.image || DEFAULT_IMAGE;
            await socket.sendMessage(from, {
                image: { url: posterUrl },
                caption: tvDetailsText
            }, { quoted: mek });

            const seasons = tvInfo.seasons || [];
            if (seasons.length === 0) {
                throw new Error('No seasons found for this TV Series');
            }

            const activeSeason = seasons[0];
            await reply(`📥 *Starting automatic download of Season ${activeSeason.season} (${activeSeason.episodes.length} episodes)...*\n\n⚡ *This may take some time* ⚡`);

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < activeSeason.episodes.length; i++) {
                const epNum = activeSeason.episodes[i];
                try {
                    await reply(`📥 *Downloading:* Episode ${epNum}...`);

                    const epDlRes = await axios.get(
                        `${API_BASE}/api/v1/movie/moviebox/tv/dl?q=${encodeURIComponent(selectedItem.link)}&se=${activeSeason.season}&ep=${epNum}&api_key=${API_KEY}`
                    );
                    const epDlData = epDlRes.data;

                    if (epDlData.status && epDlData.data && epDlData.data.length > 0) {
                        const videoLinks = epDlData.data.filter(dl => dl.quality !== 'SUB');
                        const subLinks = epDlData.data.filter(dl => dl.quality === 'SUB');
                        const finalLinkObj = videoLinks[0] || epDlData.data[0];

                        await socket.sendMessage(from, {
                            document: { url: finalLinkObj.link || finalLinkObj.url },
                            mimetype: 'video/mp4',
                            fileName: `${tvInfo.title} - S${activeSeason.season}E${epNum}.mp4`,
                            caption: `📺 *${tvInfo.title}*\n\n📌 *Episode:* S${activeSeason.season}E${epNum}\n\n${DEFAULT_FOOTER}`
                        }, { quoted: mek });

                        // Handle Subtitles
                        const englishSub = subLinks.find(s => s.title.toLowerCase().includes('english') || s.title.toLowerCase().includes('en'));
                        const sinhalaSub = subLinks.find(s => s.title.toLowerCase().includes('sinhala') || s.title.toLowerCase().includes('si'));
                        const subsToSend = [];
                        if (sinhalaSub) subsToSend.push(sinhalaSub);
                        if (englishSub) subsToSend.push(englishSub);
                        if (subsToSend.length === 0 && subLinks.length > 0) subsToSend.push(subLinks[0]);

                        for (const sub of subsToSend) {
                            try {
                                const subLang = sub.title.replace('Subtitle - ', '').replace(` (S${activeSeason.season}E${epNum})`, '').trim();
                                await socket.sendMessage(from, {
                                    document: { url: sub.link || sub.url },
                                    mimetype: 'text/plain',
                                    fileName: `${tvInfo.title} - S${activeSeason.season}E${epNum} - ${subLang}.srt`,
                                    caption: `📝 *${tvInfo.title} - Subtitle*\n\n🌐 *Language:* ${subLang}\n📌 *Episode:* S${activeSeason.season}E${epNum}\n\n${DEFAULT_FOOTER}`
                                }, { quoted: mek });
                            } catch (subErr) {
                                console.error('Error sending episode subtitle:', subErr);
                            }
                        }

                        successCount++;
                    } else {
                        failCount++;
                    }

                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (epError) {
                    console.error(`Error downloading episode:`, epError);
                    failCount++;
                }
            }

            await reply(`✅ *Download Complete!*\n\n📊 *Summary:*\n📥 *Success:* ${successCount} episodes\n❌ *Failed:* ${failCount} episodes\n🎬 *Series:* ${tvInfo.title}`);

        } catch (tvShowError) {
            console.error('TV Show error:', tvShowError);
            reply(`❌ *ERROR*\n\n*TV series details ලබාගැනීම අසාර්ථකයි*\n${tvShowError.message}`);
        }

    } else {
        // --- MOVIE FLOW ---
        await reply('⏳ *Fetching Movie details...*');
        try {
            const detailsResponse = await axios.get(
                `${API_BASE}/api/v1/movie/moviebox/info?q=${encodeURIComponent(selectedItem.link)}&api_key=${API_KEY}`
            );
            const detailsData = detailsResponse.data;
            if (!detailsData.status || !detailsData.data) {
                throw new Error('Failed to fetch movie details');
            }

            const movieInfo = detailsData.data;
            const validDownloads = movieInfo.downloads || [];

            if (validDownloads.length === 0) {
                return reply('❌ *NO DOWNLOADS*\n\n*මෙම චිත්‍රපටය සදහා බාගත කිරීමේ links හමුවූයේ නැත!*');
            }

            const movieDetailsText = 
`🎥 *[ MOVIE DETAILS ]*

🖼️ *Title:* ${movieInfo.title}
⭐ *IMDB:* ${movieInfo.rating || 'N/A'}/10
🕒 *Runtime:* ${movieInfo.duration || 'N/A'}
📅 *Year:* ${movieInfo.year || 'N/A'}
🌍 *Country:* ${movieInfo.country || 'N/A'}

✍️ *Story/Cast:*
Director: ${movieInfo.directors || 'N/A'}
Stars: ${movieInfo.stars || 'N/A'}

💡 *Sinhala AI Sub Available!*`;

            const moviePosterUrl = movieInfo.image || selectedItem.image || DEFAULT_IMAGE;
            await socket.sendMessage(from, {
                image: { url: moviePosterUrl },
                caption: movieDetailsText
            }, { quoted: mek });

            // Store quality options in state
            pendingQualitySelect[sender] = {
                downloads: validDownloads,
                movieTitle: movieInfo.title,
                timestamp: Date.now()
            };

            let downloadOptionsText = `📥 *DOWNLOAD OPTIONS*\n\n`;
            validDownloads.forEach((dl, i) => {
                downloadOptionsText += `*[ ${i + 1} ]* ${dl.quality} (${dl.size || 'N/A'})\n`;
            });
            downloadOptionsText += `\n───────────────────\n`;
            downloadOptionsText += `📌 *Reply with the number to download*\n\n${DEFAULT_FOOTER}`;

            await reply(downloadOptionsText);

        } catch (detailsError) {
            console.error('Movie Details error:', detailsError);
            reply(`❌ *ERROR*\n\n*Details ලබාගැනීම අසාර්ථකයි*\n${detailsError.message}`);
        }
    }
});

// 3. MOVIE QUALITY SELECTION LISTENER
cmd({
    filter: (text, { sender }) => {
        return (
            pendingQualitySelect[sender] &&
            !isNaN(text) &&
            parseInt(text) > 0 &&
            parseInt(text) <= pendingQualitySelect[sender].downloads.length
        );
    }
},
async (socket, mek, m, { body, sender, reply, from }) => {
    await socket.sendMessage(from, { react: { text: "⏳", key: mek.key } });

    const choiceNum = parseInt(body.trim()) - 1;
    const sessionData = pendingQualitySelect[sender];
    const selectedDownload = sessionData.downloads[choiceNum];
    const movieTitle = sessionData.movieTitle;
    delete pendingQualitySelect[sender]; // Clear state

    const isSub = selectedDownload.quality === 'SUB' || 
                  selectedDownload.title?.toLowerCase().includes('subtitle') || 
                  (selectedDownload.quality && selectedDownload.quality.toLowerCase().includes('sub'));

    const mimeType = isSub ? 'text/plain' : 'video/mp4';
    const fileName = isSub ? `${movieTitle} - Subtitle.srt` : `${movieTitle} - ${selectedDownload.quality}.mp4`;

    try {
        const finalDirectLink = selectedDownload.link || selectedDownload.url;

        const captionText = isSub
            ? `📝 *${movieTitle} - Subtitle*\n\n📌 *Type:* Subtitle\n📦 *Size:* ${selectedDownload.size || 'N/A'}\n\n${DEFAULT_FOOTER}`
            : `🎥 *${movieTitle}*\n\n🎥 *Quality:* ${selectedDownload.quality}\n📦 *Size:* ${selectedDownload.size || 'N/A'}\n\n${DEFAULT_FOOTER}`;

        await socket.sendMessage(from, {
            document: { url: finalDirectLink },
            mimetype: mimeType,
            fileName: fileName,
            caption: captionText
        }, { quoted: mek });

        await socket.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (downloadError) {
        console.error('Download link error:', downloadError);
        reply(`❌ *DOWNLOAD ERROR*\n\n*බාගත කිරීම අසාර්ථක විය!*\n${downloadError.message}`);
    }
});

// Memory Auto-Cleanup Task (Runs every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const s in pendingMovieSearch) {
        if (now - pendingMovieSearch[s].timestamp > SESSION_TIMEOUT) {
            delete pendingMovieSearch[s];
        }
    }
    for (const q in pendingQualitySelect) {
        if (now - pendingQualitySelect[q].timestamp > SESSION_TIMEOUT) {
            delete pendingQualitySelect[q];
        }
    }
}, 5 * 60 * 1000);
