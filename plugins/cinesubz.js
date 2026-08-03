const axios = require('axios');
const cheerio = require('cheerio');
const { connect } = require('puppeteer-real-browser');

/**
 * CineSubz සයිට් එකෙන් මැච් වෙන මූවීස් සර්ච් කරන ෆන්ක්ෂන් එක
 */
async function searchMovies(query) {
    try {
        const searchUrl = `https://cinesubz.net/?s=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.result-item').each((index, element) => {
            const title = $(element).find('.title a').text().trim();
            const link = $(element).find('.title a').attr('href');
            const image = $(element).find('.thumbnail img').attr('src');
            const year = $(element).find('.meta .year').text().trim();

            if (title && link) {
                results.push({ title, link, image, year });
            }
        });

        console.log(`[MALIYA-MD] 📦 Found ${results.length} movie results.`);
        return results;
    } catch (error) {
        console.error(`[MALIYA-MD] ❌ Error searching movies: ${error.message}`);
        return [];
    }
}

/**
 * මූවී පේජ් එක ඇතුලෙන් ඩවුන්ලෝඩ් ලින්ක්ස් (Zone-T හෝ Sonic-Cloud) උදලා ගන්නා ෆන්ක්ෂන් එක
 */
async function fetchMovieMetadata(movieUrl) {
    try {
        console.log(`\n[MALIYA-MD] 📑 Fetching movie metadata from: ${movieUrl}`);
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const downloadLinks = [];

        // CineSubz එකේ සාමාන්‍යයෙන් ඩවුන්ලෝඩ් බටන් හෝ ඇන්කර් ටැග් තියෙන තැන් ස්කෑන් කිරීම
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            if (href && (href.includes('cinesubz.net/api-') || href.includes('sonic-cloud') || href.includes('zone-t'))) {
                downloadLinks.push({
                    name: text || `Download Link ${i + 1}`,
                    link: href
                });
            }
        });

        console.log(`[MALIYA-MD] 🔗 Scraped Movie Movie Links found: ${downloadLinks.length}`);
        return downloadLinks;
    } catch (error) {
        console.error(`[MALIYA-MD] ❌ Error fetching movie metadata: ${error.message}`);
        return [];
    }
}

/**
 * Cloudflare සහ Anti-Bot Firewall බයිපාස් කරමින් Sonic Cloud ලින්ක් එක රිසෝල්ව් කරන ප්‍රධාන එන්ජිම
 */
async function resolveSonicCloudPage(sonicUrl) {
    let browser, page;

    try {
        console.log(`\n[MALIYA-MD] 🌐 Launching Puppeteer Real Browser (Anti-Detection Mode)...`);
        
        // ⚡ Railway Docker පරිසරය සඳහා Real Browser එක සම්බන්ධ කිරීම
        const setup = await connect({
            headless: false, // Docker Xvfb එක පාවිච්චි කරන නිසා false දීම වඩාත් ස්ටේබල් වේ
            turnstile: true, // Cloudflare Turnstile Captchas ඔටෝ ක්ලික් කිරීමට
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            connectOption: {
                defaultViewport: null
            }
        });

        browser = setup.browser;
        page = setup.page;

        await page.setRequestInterception(true);
        let interceptedUrl = null;

        // 🎯 [Main Interceptor] නෙට්වර්ක් එක හරහා යන API බ්ලොක් එක කැප්චර් කිරීම
        page.on('request', request => {
            const url = request.url();
            
            // ඩවුන්ලෝඩ් ඩේටා API හෝ ටෝකන් සහිත ලින්ක්ස් ෆිල්ටර් කිරීම
            if (url.includes('/api/download-data/') || url.includes('bot=cscloud') || url.includes('ext=') || url.includes('?code=') || url.includes('?token=')) {
                if (!url.includes("fordev.jpg")) {
                    interceptedUrl = url;
                    console.log(`[MALIYA-MD] 🎯 [Main Interceptor] Hooked URL: ${interceptedUrl}`);
                }
            }
            
            // අනවශ්‍ය දැන්වීම් ඉමේජ් බ්ලොක් කර ස්පීඩ් එක වැඩි කිරීම
            if (request.resourceType() === 'image' && url.includes('fordev.jpg')) {
                return request.abort(); 
            }
            request.continue();
        });

        console.log(`[MALIYA-MD] ⏳ Navigating to target portal: ${sonicUrl}`);
        await page.goto(sonicUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
        
        // DOM එක සහ ටෝකන්ස් රන් වීමට තත්පර 4ක් පයිප්ලයින් එක විවෘතව තැබීම
        console.log("[MALIYA-MD] ⏳ Holding pipeline open for 4000ms to allow DOM execution...");
        await new Promise(r => setTimeout(r, 4000)); 

        // ⚡ නෙට්වර්ක් එකෙන් මුලින්ම ලින්ක් එක අහුවුනා නම් UI Click Engine එක ස්කිප් කර කෙලින්ම රිටර්න් වීම
        if (interceptedUrl) {
            console.log("[MALIYA-MD] ⚡ Target URL captured early via network stream. Skipping UI clicks.");
            return await finalizeRealSession(browser, page, interceptedUrl);
        }

        // 🕵️‍♂️ [UI Scraper Fallback] බටන් එකක් නැතත් DOM එක ඇතුලේ සැඟවුනු ඩිරෙක්ට් ලින්ක් සෙවීම
        console.log("[MALIYA-MD] 🕵️‍♂️ Scanning DOM for hidden direct download anchors...");
        const extractedHref = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll("a"));
            const found = allLinks.find(a => a.href.includes("ext=") || a.href.includes("download") || a.href.includes("code=") || a.href.includes("/api/"));
            return found ? found.href : null;
        });

        if (extractedHref) {
            console.log(`[MALIYA-MD] 🔗 Found raw link in DOM: ${extractedHref}`);
            interceptedUrl = extractedHref;
            return await finalizeRealSession(browser, page, interceptedUrl);
        }

        // 🖱️ [Multi-Vector Smart Click Engine] රියල් මවුස් එකකින් ක්ලික් කිරීම සිමියුලේට් කිරීම
        console.log("[MALIYA-MD] 🖱️ Executing Multi-Vector Smart Click Engine...");
        const targetSelectors = ["#dl-links button", ".direct-download", "button", "a.btn", "[onclick]"];
        
        let clicked = false;
        for (const sel of targetSelectors) {
            const el = await page.$(sel);
            if (el) {
                // page.click වෙනුවට ලයිබ්‍රරියේ එන හියුමනයිස්ඩ් page.realClick පාවිච්චි කිරීම
                await page.realClick(sel); 
                console.log(`[MALIYA-MD] 💥 RealClick executed on selector: ${sel}`);
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            console.log("[MALIYA-MD] 📡 Click Response: No element found to click in DOM");
        }

        // ක්ලික් එකෙන් පසු රීඩිරෙක්ට් වීමට තත්පර 3ක් රැඳී සිටීම
        await new Promise(r => setTimeout(r, 3000));
        return await finalizeRealSession(browser, page, interceptedUrl);

    } catch (error) {
        console.log(`[MALIYA-MD] ❌ Engine Critical Exception: ${error.message}`);
        if (browser) await browser.close().catch(() => {});
        throw error;
    }
}

/**
 * සෙශන් එක අවසන් කර කුකීස් සහ අවසන් ඩිරෙක්ට් ලින්ක් එක රිටර්න් කරන හෙල්පර් එක
 */
async function finalizeRealSession(browser, page, interceptedUrl) {
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const finalUrl = page.url();

    // නෙට්වර්ක් එකෙන් මිස් වුනා නම් බ්‍රවුසර් එක දැනට නතර වී ඇති අවසන් URL එක ගැනීම
    if (!interceptedUrl && finalUrl && !finalUrl.includes("fordev.jpg")) {
        interceptedUrl = finalUrl;
    }

    console.log(`[MALIYA-MD] 🔒 Closing primary session. Final URL: ${interceptedUrl}`);
    await browser.close().catch(() => {});
    
    return { 
        fileSize: null, // ෆයිල් සයිස් එක පසුව පින්ට් කරගැනීමට
        directUrl: interceptedUrl, 
        cookieStr: cookieHeader, 
        userAgent: userAgent 
    };
}

module.exports = {
    searchMovies,
    fetchMovieMetadata,
    resolveSonicCloudPage
};
