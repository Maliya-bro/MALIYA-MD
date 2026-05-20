const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingLinks = {};

// ─── Helpers ────────────────────────────────────────────────────────────────

function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

function cleanTitle(title = "") {
  // Remove " Sinhala Subtitles | සිංහල..." suffix
  return title.replace(/\s*sinhala subtitles.*$/i, "").replace(/\s*\|.*$/i, "").trim();
}

// ─── 1. Search movies/tvshows ────────────────────────────────────────────────

async function searchCinesubz(query) {
  const url = `https://cinesubz.net/?s=${encodeURIComponent(query)}`;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  const results = await page.$$eval("article, .item-box, .post", items =>
    items.slice(0, 10).map((el, i) => {
      const a = el.querySelector("a[href*='/movies/'],a[href*='/tvshows/']");
      const img =
        el.querySelector("img")?.src || "";
      const ratingEl = el.querySelector(".imdb, .rating, [class*='imdb']");
      const yearEl = el.querySelector("[class*='year'], .year");
      const qualityEl = el.querySelector("[class*='quality'], .quality");
      return {
        id: i + 1,
        title: a?.title?.trim() || a?.textContent?.trim() || "",
        url: a?.href || "",
        thumb: img,
        imdb: ratingEl?.textContent?.trim() || "",
        year: yearEl?.textContent?.trim() || "",
        quality: qualityEl?.textContent?.trim() || "",
      };
    }).filter(r => r.title && r.url)
  );

  await browser.close();
  return results;
}

// ─── 2. Get movie details ────────────────────────────────────────────────────

async function getMovieDetails(movieUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 30000 });

  const details = await page.evaluate(() => {
    const getText = sel => document.querySelector(sel)?.textContent?.trim() || "";

    // Title
    const title =
      getText("h1") ||
      getText(".details-title h3") ||
      getText(".entry-title") ||
      document.title.split("–")[0].trim();

    // Thumbnail
    const thumb =
      document.querySelector(".splash-bg img, .poster img, .thumb img, article img")?.src || "";

    // IMDb
    const imdbRaw = getText(".data-imdb, [class*='imdb']");
    const imdb = imdbRaw.replace(/imdb[:\s]*/i, "").trim();

    // Duration
    const duration = getText("[itemprop='duration'], .data-views, .duration");

    // Genres
    const genres = Array.from(
      document.querySelectorAll(".details-genre a, .genre a, [class*='genre'] a")
    )
      .map(a => a.textContent.trim())
      .filter(Boolean)
      .slice(0, 6);

    // Directors
    const directors = Array.from(
      document.querySelectorAll("a[href*='/director/']")
    )
      .map(a => a.textContent.trim())
      .filter(Boolean);

    // Stars / Cast
    const stars = Array.from(
      document.querySelectorAll(".cast-item, [class*='cast'] a, a[href*='/cast/']")
    )
      .map(a => a.textContent.trim())
      .filter(Boolean)
      .slice(0, 6);

    // Subtitle info
    const subtitleBy =
      document.body.innerHTML.match(/Subtitle By[:\s]*([^\n<]+)/i)?.[1]?.trim() || "";

    // Download links section (zt-links)
    const linkEls = Array.from(
      document.querySelectorAll("a[href*='/zt-links/']")
    ).map(a => ({
      label: a.textContent.trim(),
      href: a.href,
    }));

    return { title, thumb, imdb, duration, genres, directors, stars, subtitleBy, linkEls };
  });

  await browser.close();
  return details;
}

// ─── 3. Resolve zt-link → telegram/direct URL ───────────────────────────────

async function resolveZtLink(ztUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );

  let resolvedUrl = null;
  try {
    await page.goto(ztUrl, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 5000));

    resolvedUrl = await page.evaluate(() => {
      // Try telegram link first
      const tgLink = document.querySelector("a[href*='t.me'], a[href*='telegram']");
      if (tgLink) return tgLink.href;
      // Try direct file link
      const dlLink = document.querySelector(
        "a[href*='.mp4'], a[href*='pixeldrain'], a[href*='gofile'], a[href*='drive.google']"
      );
      if (dlLink) return dlLink.href;
      // Try any big button
      const btn = document.querySelector(".download-btn a, .btn-download, .wait-done a");
      if (btn) return btn.href;
      return null;
    });
  } catch (_) {}

  await browser.close();
  return resolvedUrl;
}

// ─── Bot Commands ────────────────────────────────────────────────────────────

cmd(
  {
    pattern: "movie",
    alias: ["cinesubz", "film", "cinema", "චිත්‍රපටය"],
    react: "🎬",
    desc: "Search movies & TV shows from CineSubz.lk (with Sinhala subtitles)",
    category: "download",
    filename: __filename,
  },
  async (maliya, mek, m, { from, q, sender, reply }) => {
    if (!q)
      return reply(
        `*🎬 CineSubz Movie Search*\n\nUsage: *movie <name>*\nExample: *movie avatar*\n\nසිංහල උපසිරැසි සහිත ඕනෑම film/series හොයාගන්නත් පුළුවන්! 🍿`
      );

    await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
    reply("*🔍 CineSubz.lk හොයනවා...*");

    let results;
    try {
      results = await searchCinesubz(q);
    } catch (e) {
      return reply(`*❌ Search error:* ${e.message}`);
    }

    if (!results.length)
      return reply(`*❌ "${q}" ගැන results නැහැ.*\nවෙනත් නමකින් try කරන්න.`);

    pendingSearch[sender] = { results, timestamp: Date.now() };

    let text = `*🎬 CineSubz Search: "${q}"*\n${"─".repeat(30)}\n`;
    results.forEach(r => {
      const title = cleanTitle(r.title);
      text += `*${r.id}.* ${title}`;
      if (r.year) text += ` *(${r.year})*`;
      if (r.imdb) text += `  ⭐${r.imdb}`;
      if (r.quality) text += `  [${r.quality}]`;
      text += "\n";
    });
    text += `\n*Number reply කරන්න (1-${results.length})*`;

    reply(text);
  }
);

// ─── Step 2: User picks a result ─────────────────────────────────────────────

cmd(
  {
    filter: (text, { sender }) =>
      pendingSearch[sender] &&
      !isNaN(text) &&
      parseInt(text) >= 1 &&
      parseInt(text) <= pendingSearch[sender].results.length,
  },
  async (maliya, mek, m, { body, sender, reply, from }) => {
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const idx = parseInt(body.trim()) - 1;
    const selected = pendingSearch[sender].results[idx];
    delete pendingSearch[sender];

    reply("*⏳ Movie details ගන්නවා...*");

    let details;
    try {
      details = await getMovieDetails(selected.url);
    } catch (e) {
      return reply(`*❌ Details error:* ${e.message}`);
    }

    const title = cleanTitle(details.title || selected.title);

    // Build info message
    let msg = `*🎬 ${title}*\n${"─".repeat(35)}\n`;
    if (details.imdb) msg += `⭐ *IMDb:* ${details.imdb}\n`;
    if (details.duration) msg += `⏱ *Duration:* ${details.duration}\n`;
    if (details.genres.length) msg += `🎭 *Genres:* ${details.genres.join(", ")}\n`;
    if (details.directors.length) msg += `🎥 *Director:* ${details.directors.join(", ")}\n`;
    if (details.stars.length) msg += `🌟 *Cast:* ${details.stars.join(", ")}\n`;
    if (details.subtitleBy) msg += `📝 *Sub By:* ${details.subtitleBy}\n`;
    msg += `\n🔗 *Links ගන්නවා, ඉන්න...*`;

    // Send poster + info
    try {
      if (details.thumb) {
        await maliya.sendMessage(
          from,
          { image: { url: details.thumb }, caption: msg },
          { quoted: mek }
        );
      } else {
        await maliya.sendMessage(from, { text: msg }, { quoted: mek });
      }
    } catch (_) {
      await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    }

    if (!details.linkEls.length) {
      return maliya.sendMessage(
        from,
        { text: "*❌ Download links නැහැ.*" },
        { quoted: mek }
      );
    }

    pendingLinks[sender] = { title, details, timestamp: Date.now() };

    let linksMsg = `*📥 Download Links — ${title}*\n${"─".repeat(35)}\n`;
    details.linkEls.forEach((l, i) => {
      linksMsg += `*${i + 1}.* ${l.label || `Link ${i + 1}`}\n`;
    });
    linksMsg += `\n*Number reply කරන්න link ගන්න*`;

    await maliya.sendMessage(from, { text: linksMsg }, { quoted: mek });
  }
);

// ─── Step 3: User picks a link ───────────────────────────────────────────────

cmd(
  {
    filter: (text, { sender }) =>
      pendingLinks[sender] &&
      !isNaN(text) &&
      parseInt(text) >= 1 &&
      parseInt(text) <= pendingLinks[sender].details.linkEls.length,
  },
  async (maliya, mek, m, { body, sender, reply, from }) => {
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const idx = parseInt(body.trim()) - 1;
    const { title, details } = pendingLinks[sender];
    delete pendingLinks[sender];

    const chosen = details.linkEls[idx];
    reply(`*⏳ Link resolve කරනවා...*\nTelegram/Direct link හොයනවා.`);

    let finalUrl;
    try {
      finalUrl = await resolveZtLink(chosen.href);
    } catch (e) {
      return reply(`*❌ Link error:* ${e.message}`);
    }

    if (!finalUrl) {
      // Fallback: send the zt-link page itself
      return maliya.sendMessage(
        from,
        {
          text:
            `*🎬 ${title}*\n*${chosen.label}*\n\n` +
            `Direct link resolve වුණේ නැහැ.\nමේ page eka open කරන්න:\n${chosen.href}`,
        },
        { quoted: mek }
      );
    }

    // Telegram channel link?
    if (finalUrl.includes("t.me") || finalUrl.includes("telegram")) {
      return maliya.sendMessage(
        from,
        {
          text:
            `*🎬 ${title}*\n*${chosen.label}*\n\n` +
            `📲 *Telegram Link:*\n${finalUrl}\n\nමේ link eka click කරලා download කරන්න! 🍿`,
        },
        { quoted: mek }
      );
    }

    // Try send as document
    reply(`*⬇️ ${chosen.label} — Document විදිහට යවනවා...*`);
    try {
      const safeFileName =
        `${title} - ${chosen.label}.mp4`.replace(/[^\w\s.\-()]/gi, "").trim();
      await maliya.sendMessage(
        from,
        {
          document: { url: finalUrl },
          mimetype: "video/mp4",
          fileName: safeFileName,
          caption: `*🎬 ${title}*\n*Quality:* ${chosen.label}\n\nEnjoy! 🍿`,
        },
        { quoted: mek }
      );
    } catch (err) {
      // Fallback: just send the link
      await maliya.sendMessage(
        from,
        {
          text:
            `*🎬 ${title}*\n*${chosen.label}*\n\n` +
            `Document send නොවුණා.\nDirect link:\n${finalUrl}`,
        },
        { quoted: mek }
      );
    }
  }
);

// ─── Timeout cleanup ─────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const ttl = 10 * 60 * 1000; // 10 min
  for (const s in pendingSearch)
    if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingLinks)
    if (now - pendingLinks[s].timestamp > ttl) delete pendingLinks[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingLinks };
