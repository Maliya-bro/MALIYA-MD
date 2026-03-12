const { cmd, replyHandlers } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

// GitHub Actions වලට ගැලපෙන Puppeteer Launch Options
const puppeteerOptions = {
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-zygote",
    "--single-process",
    "--disable-gpu"
  ],
  executablePath: '/usr/bin/google-chrome'
};

async function getDirectDownloadLinks(movieUrl) {
  const browser = await puppeteer.launch(puppeteerOptions);
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Step 1: Movie Page
    await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const linkItems = await page.$$eval('a[href*="/zt-links/"]', links => 
      links.map(link => ({
        url: link.href,
        quality: link.closest('tr, div')?.innerText?.includes('1080p') ? '1080p' : '720p',
        size: link.closest('tr, div')?.innerText?.match(/\d+(\.\d+)?\s*(GB|MB)/i)?.[0] || 'N/A'
      }))
    );

    let finalLinks = [];
    for (const item of linkItems.slice(0, 2)) {
      try {
        // Step 2: ZT-Links Page (Screenshot 3)
        await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        
        // Timer එක ඉවර වන තෙක් තත්පර 12ක් රැඳී සිටීම
        await new Promise(r => setTimeout(r, 12000)); 

        const directLink = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a'));
          const target = anchors.find(a => 
            a.href.includes('sonic-cloud.online') || 
            a.innerText.toLowerCase().includes('download') ||
            a.className.includes('btn-danger')
          );
          return target ? target.href : null;
        });

        if (directLink) {
          finalLinks.push({ link: directLink, quality: item.quality, size: item.size });
        }
      } catch (e) { console.log("Inner Link Error:", e.message); }
    }
    return finalLinks;
  } finally {
    await browser.close();
  }
}

// --- Commands ---

cmd({
  pattern: "film",
  alias: ["movie", "cinesubz"],
  category: "download",
  react: "🎬",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("චිත්‍රපටයේ නම ලබා දෙන්න. (උදා: .film Leo)");
  reply("🔎 සෙවුම් කරමින් පවතී, කරුණාකර රැඳී සිටින්න...");

  try {
    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    await page.goto(`https://cinesubz.lk/?s=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
    
    const results = await page.$$eval(".display-item .item-box", boxes =>
      boxes.slice(0, 5).map((box, index) => ({
        id: index + 1,
        title: box.querySelector("a")?.title?.trim() || "No Title",
        movieUrl: box.querySelector("a")?.href || "",
        thumb: box.querySelector("img")?.src || "",
      }))
    );
    await browser.close();

    if (results.length === 0) return reply("❌ කිසිවක් හමු වූයේ නැත.");

    pendingSearch[sender] = { results };
    let msg = `🎬 *MALIYA-MD MOVIE SEARCH*\n\n`;
    results.forEach((res, i) => msg += `*${i+1}.* ${res.title}\n`);
    msg += `\n📥 *ලින්ක් ලබාගැනීමට අංකය Reply කරන්න.*`;

    await sock.sendMessage(from, { image: { url: results[0].thumb }, caption: msg }, { quoted: mek });
  } catch (e) { reply("Error: " + e.message); }
});

// Selection Handler
replyHandlers.push({
  filter: (body, { sender }) => pendingSearch[sender] && !isNaN(body),
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const selected = pendingSearch[sender].results[parseInt(body) - 1];
    if (!selected) return;
    delete pendingSearch[sender];

    reply(`⏳ *${selected.title}* ලින්ක් ලබාගනිමින් පවතී... (තත්පර 30ක් පමණ ගතවේ)`);
    const links = await getDirectDownloadLinks(selected.movieUrl);
    
    if (links.length === 0) return reply("❌ ලින්ක් ලබාගැනීමට අපහසුයි. කරුණාකර නැවත උත්සාහ කරන්න.");

    pendingQuality[sender] = { title: selected.title, links };
    let qMsg = `🎬 *${selected.title}*\n\n`;
    links.forEach((l, i) => qMsg += `*${i+1}.* ${l.quality} (${l.size})\n`);
    reply(qMsg + `\n📥 *Quality අංකය Reply කරන්න.*`);
  }
});

replyHandlers.push({
  filter: (body, { sender }) => pendingQuality[sender] && !isNaN(body),
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const data = pendingQuality[sender];
    const selected = data.links[parseInt(body) - 1];
    if (!selected) return;
    delete pendingQuality[sender];

    reply("📤 ගොනුව එවමින් පවතී...");
    try {
      await sock.sendMessage(from, {
        document: { url: selected.link },
        mimetype: "video/mp4",
        fileName: `${data.title}.mp4`,
        caption: `🎬 *${data.title}*\n\n*Enjoy! - Powered by MALIYA-MD*`
      }, { quoted: mek });
    } catch (e) {
      reply("❌ ගොනුව එවීමේදී දෝෂයක් ඇතිවිය. ඩිරෙක්ට් ලින්ක් එක: " + selected.link);
    }
  }
});
