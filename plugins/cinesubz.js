const { connect } = require("puppeteer-real-browser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// common headers configuration
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

/**
 * Finalizes the real browser session and extracts details
 */
async function finalizeRealSession(browser, page, targetUrl) {
  const cookies = await page.cookies();
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const ua = await page.evaluate(() => navigator.userAgent);
  
  console.log(`[MALIYA-MD] 🔒 Closing browser session. Final captured target: ${targetUrl}`);
  await browser.close().catch(() => {});
  
  return {
    url: targetUrl,
    directUrl: targetUrl,
    cookieStr: cookieStr,
    userAgent: ua
  };
}

/**
 * Resolves the protected Sonic-Cloud page using anti-detection mechanics
 */
async function resolveSonicCloudPage(sonicUrl) {
  let browser, page;

  try {
    console.log(`\n[MALIYA-MD] 🌐 Launching Puppeteer Real Browser (Anti-Detection Mode)...`);
    
    const setup = await connect({
      headless: false, 
      turnstile: true, 
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      connectOption: {
        defaultViewport: null
      }
    });

    browser = setup.browser;
    page = setup.page;

    await page.setRequestInterception(true);
    let interceptedUrl = null;
    let apiDownloadUrl = null;

    page.on('request', request => {
      const url = request.url();
      
      // 🎯 API Download Link එකක් ආවොත් ඒක තමයි සුපිරිම Direct එක!
      if (url.includes('/api/download-data/')) {
        apiDownloadUrl = url;
        console.log(`[MALIYA-MD] 🎯 [API Interceptor] Hooked Endpoint: ${apiDownloadUrl}`);
      } else if (url.includes('bot=cscloud') || url.includes('ext=') || url.includes('?code=')) {
        if (!url.includes("fordev.jpg")) {
          interceptedUrl = url;
          console.log(`[MALIYA-MD] 🎯 [Main Interceptor] Hooked URL: ${interceptedUrl}`);
        }
      }

      if (request.resourceType() === 'image' && url.includes('fordev.jpg')) {
        return request.abort(); 
      }
      request.continue();
    });

    console.log(`[MALIYA-MD] ⏳ Navigating to target portal: ${sonicUrl}`);
    await page.goto(sonicUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
    
    console.log("[MALIYA-MD] ⏳ Holding pipeline open for 4000ms to allow DOM execution...");
    await new Promise(r => setTimeout(r, 4000)); 

    // API ලින්ක් එකක් අහුවෙලා නම් බ්‍රවුසර් එක ඒක ඩවුන්ලෝඩ් කරන්න කලින්ම අපි සෙෂන් එක ක්ලෝස් කරලා ඒක ගන්නවා
    const finalTargetUrl = apiDownloadUrl || interceptedUrl;
    if (finalTargetUrl) {
      console.log("[MALIYA-MD] ⚡ Target URL captured early via network stream. Skipping UI clicks.");
      return await finalizeRealSession(browser, page, finalTargetUrl);
    }

    console.log("[MALIYA-MD] 🕵️‍♂️ Scanning DOM for hidden direct download anchors...");
    const extractedHref = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll("a"));
      const found = allLinks.find(a => a.href.includes("ext=") || a.href.includes("download") || a.href.includes("code=") || a.href.includes("/api/"));
      return found ? found.href : null;
    });

    if (extractedHref) {
      console.log(`[MALIYA-MD] 🔗 Found raw link in DOM: ${extractedHref}`);
      return await finalizeRealSession(browser, page, extractedHref);
    }

    console.log("[MALIYA-MD] 🖱️ Executing Humanized Real Click Engine...");
    const targetSelectors = ["#dl-links button", ".direct-download", "button", "a.btn", "[onclick]"];
    
    let clicked = false;
    for (const sel of targetSelectors) {
      const el = await page.$(sel);
      if (el) {
        await page.realClick(sel); 
        console.log(`[MALIYA-MD] 💥 RealClick executed on selector: ${sel}`);
        clicked = true;
        break;
      }
    }

    await new Promise(r => setTimeout(r, 3000));
    return await finalizeRealSession(browser, page, apiDownloadUrl || interceptedUrl);

  } catch (e) {
    console.log(`[MALIYA-MD] ❌ Real Browser Exception: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

module.exports = async (maliya, mek, msg, { from, text, reply }) => {
  // 1. Basic configuration variables
  const query = text.trim();
  if (!query) return reply("*🔍 Please provide a movie name to search! (e.g., .cinesubz spider man)*");

  const tempDir = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 2. Database search simulation/fetch
    console.log(`\n[MALIYA-MD] 🔍 Searching database for query: "${query}"`);
    // (මෙතන ඔයාගේ සර්ච් ඒපීඅයි එක හෝ සීරැප් කරන ලොජික් එක දාගන්න. මේක ඩෙමෝ එකක් විදිහට සෙට් කරලා තියෙන්නේ)
    reply(`*🔍 Searching CineSubz database for "${query}"...*`);

    // Example Static Metadata values for Demonstration (replace with your scraping/API logic)
    const title = "Spider-Man (2002)";
    const quality = "480p";
    const finalSize = "400 MB";
    const scrapedPortalUrl = "https://bot3.sonic-cloud.online/server1/qmsyfzbjcavekxfuwqbi/Movies/2021-09-20/CineSubz.com%20-Spider.Man.2002.480p?ext=mp4"; 
    const fileName = `CineSubz - ${title} [${quality}].mp4`;
    const tempFilePath = path.join(tempDir, `maliya_tmp_${Date.now()}.mp4`);

    console.log(`[MALIYA-MD] 📑 Fetching movie metadata from database source...`);
    console.log(`[MALIYA-MD] 🗺️ Mapping Match! Target Portal URL: ${scrapedPortalUrl}`);

    // 3. Trigger Real Browser Core
    const resolved = await resolveSonicCloudPage(scrapedPortalUrl);
    if (!resolved || !resolved.url) {
      throw new Error("Failed to bypass download wall or capture target CDN stream.");
    }

    // 4. Native Axios Download Pipeline Activation
    try {
      const downloadUrl = resolved.directUrl || resolved.url;
      const userAgent = resolved.userAgent || HEADERS['User-Agent'];
      const cookieStr = resolved.cookieStr || '';

      console.log(`\n[MALIYA-MD] 🚀 NATIVE AXIOS STREAM PIPELINE ACTIVATED`);
      console.log(`[MALIYA-MD] 🎯 Target End-Point CDN: ${downloadUrl}`);

      const writer = fs.createWriteStream(tempFilePath);
      
      const downloadResponse = await axios({
        method: 'get',
        url: downloadUrl,
        responseType: 'stream',
        maxRedirects: 20, // ⚡ සර්වර් එකෙන් දෙන හැම රීඩිරෙක්ට් එකක්ම ෆලෝ කරන්න දෙනවා
        headers: {
          'User-Agent': userAgent,
          'Cookie': cookieStr,
          'Referer': 'https://bot3.sonic-cloud.online/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 600000 // විනාඩි 10ක මැක්ස් ටයිම්අවුට් එකක් (ලොකු ෆයිල් වලට)
      });

      downloadResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', (err) => {
          console.error(`[MALIYA-MD] Stream Writer Error: ${err.message}`);
          reject(err);
        });
      });

      const stats = fs.statSync(tempFilePath);
      console.log(`[MALIYA-MD] 📁 Local file size verified: ${(stats.size / (1024*1024)).toFixed(2)} MB`);
      
      // වැලිඩේෂන් එක: 5MB වලට වඩා අඩු නම් ඒක අනිවාර්යයෙන්ම එරර් එකක් (HTML/JSON බෑවිලා තියෙන්නේ)
      if (stats.size < 5000000) { 
        throw new Error("Corrupted payload or unauthorized session drop.");
      }

      reply(`*⬆️ Film successfully grabbed! Uploading to WhatsApp...* 🚀`);
      
      await maliya.sendMessage(from, {
        document: { url: tempFilePath },
        mimetype: "video/mp4",
        fileName,
        caption:
          `*🎬 ${title}*\n` +
          `*📊 Quality:* ${quality}\n` +
          `*💾 Size:* ${finalSize}\n\n` +
          `*Enjoy! 🍿*\n_Secured & Delivered by MALIYA-MD_`,
      }, { quoted: mek });

      if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }

    } catch (err) {
      console.log(`[MALIYA-MD] 🚨 Native Pipeline Failure Intercepted: ${err.message}`);
      if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }
      reply(`*❌ Download Pipeline Error:* ${err.message}\n\n_Server session dropped the file stream. Please try again!_`);
    }

  } catch (mainError) {
    console.error(`[MALIYA-MD] Main Command Execution Failed:`, mainError);
    reply(`*❌ Error:* ${mainError.message}`);
  }
};
