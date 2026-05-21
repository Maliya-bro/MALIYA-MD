const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

function cleanTitle(title = "") {
  return title
    .replace(/sinhala subtitles.*/i, "")
    .replace(/සිංහල.*/i, "")
    .replace(/\|.*/i, "")
    .trim();
}



function normalizeQuality(text = "") {
  const t = text.toUpperCase();
  if (t.includes("2160") || t.includes("4K"))  return "4K";
  if (t.includes("1080") || t.includes("FHD"))  return "1080p";
  if (t.includes("720")  || t.includes("HD"))   return "720p";
  if (t.includes("480")  || t.includes("SD"))   return "480p";
  if (t.includes("360"))                         return "360p";
  return text.trim() || "Unknown";
}

// ─── 1. Search ────────────────────────────────────────────────────────────────

async function searchCinesubz(query) {
  const url = `https://cinesubz.net/?s=${encodeURIComponent(query)}`;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
  );
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  const results = await page.$$eval("article, .item-box, .post", (items) =>
    items
      .slice(0, 10)
      .map((el, i) => {
        const a =
          el.querySelector("a[href*='/movies/']") ||
          el.querySelector("a[href*='/tvshows/']") ||
          el.querySelector("a[href]");
        const img = el.querySelector("img")?.src || "";
        const imdbEl = el.querySelector("[class*='imdb'], .imdb, .rating");
        const yearEl = el.querySelector("[class*='year'], .year");
        const qualEl = el.querySelector("[class*='quality'], .quality");
        return {
          id: i + 1,
          title: a?.title?.trim() || a?.textContent?.trim() || "",
          url: a?.href || "",
          thumb: img,
          imdb: imdbEl?.textContent?.trim() || "",
          year: yearEl?.textContent?.trim() || "",
          quality: qualEl?.textContent?.trim() || "",
        };
      })
      .filter(
        (r) =>
          r.title &&
          r.url &&
          (r.url.includes("/movies/") || r.url.includes("/tvshows/"))
      )
  );

  await browser.close();
  return results;
}

// ─── 2. Get download links from movie page ────────────────────────────────────
// Returns array of { label, quality, size, sizeMB, ztUrl }

async function getDownloadLinks(movieUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
  );
  await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Movie metadata
  const meta = await page.evaluate(() => {
    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
    const title =
      getText("h1") ||
      getText(".details-title h3") ||
      getText(".entry-title") ||
      document.title.split("–")[0].trim();
    const thumb =
      document.querySelector(
        ".splash-bg img, .poster img, .wp-post-image, article img"
      )?.src || "";
    const imdb = getText(".data-imdb, [class*='imdb']")
      .replace(/imdb[:\s]*/i, "")
      .trim();
    const duration = getText("[itemprop='duration'], .duration, .data-views");
    const genres = Array.from(
      document.querySelectorAll(".details-genre a, [class*='genre'] a")
    )
      .map((a) => a.textContent.trim())
      .filter(Boolean)
      .slice(0, 5);
    const directors = Array.from(
      document.querySelectorAll("a[href*='/director/']")
    )
      .map((a) => a.textContent.trim())
      .filter(Boolean);
    const subtitleBy =
      document.body.innerHTML.match(/Subtitle By[:\s]*([^\n<]+)/i)?.[1]?.trim() || "";

    // Parse download links — label text is like "WEB-DL 480p • 2.3 GB • English"
    const links = Array.from(
      document.querySelectorAll("a[href*='/zt-links/']")
    ).map((a) => {
      const raw = a.textContent.replace(/Direct & Telegram Download Links/gi, "").trim();
      // Try to extract quality & size from label
      const qualMatch = raw.match(/(4K|2160p|1080p|FHD|720p|HD|480p|SD|360p)/i);
      const sizeMatch = raw.match(/(\d+\.?\d*)\s*(GB|MB)/i);
      return {
        label: raw,
        quality: qualMatch ? qualMatch[1] : "",
        size: sizeMatch ? sizeMatch[0] : "",
        ztUrl: a.href,
      };
    });

    return { title, thumb, imdb, duration, genres, directors, subtitleBy, links };
  });

  await browser.close();
  return meta;
}

// ─── 3. Resolve zt-link → direct .mp4 URL ─────────────────────────────────────
// The zt-link page has a "Click Here" anchor whose href is:
//   https://google.com/server6/YYYYMM/FileName.mp4
// We grab that href directly (no waiting needed — it's in the static HTML).

async function resolveZtLink(ztUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
  );

  let directUrl = null;
  try {
    await page.goto(ztUrl, { waitUntil: "networkidle2", timeout: 20000 });

    directUrl = await page.evaluate(() => {
      // Primary: "Click Here" link that has .mp4
      const mp4Link = document.querySelector("a[href*='.mp4']");
      if (mp4Link) return mp4Link.href;

      // Fallback: any download-looking anchor
      const fallback = document.querySelector(
        "a[href*='pixeldrain'], a[href*='gofile'], a[href*='drive.google'], a[href*='t.me'], a.download-btn"
      );
      return fallback?.href || null;
    });
  } catch (_) {}

  await browser.close();
  return directUrl;
}

// ─── Bot Commands ──────────────────────────────────────────────────────────────

cmd(
  {
    pattern: "movie",
    alias: ["cinesubz", "film", "cinema"],
    react: "🎬",
    desc: "Search & download movies from CineSubz.lk with Sinhala subtitles",
    category: "download",
    filename: __filename,
  },
  async (maliya, mek, m, { from, q, sender, reply }) => {
    if (!q)
      return reply(
        `*🎬 CineSubz Movie Search*\n\nUsage: *movie <name>*\nExample: *movie avatar*\n\nසිංහල උපසිරැසි සහිත ඕනෑම film/series! 🍿`
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

    let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
    results.forEach((r) => {
      const t = cleanTitle(r.title);
      text += `*${r.id}.* ${t}`;
      if (r.year) text += ` (${r.year})`;
      if (r.imdb) text += `  ⭐${r.imdb}`;
      text += "\n";
    });
    text += `\n*Number reply කරන්න (1-${results.length})*`;
    reply(text);
  }
);

// ─── Step 2: Pick a movie ──────────────────────────────────────────────────────

cmd(
  {
    filter: (text, { sender }) =>
      pendingSearch[sender] &&
      /^\d+$/.test(text.trim()) &&
      +text >= 1 &&
      +text <= pendingSearch[sender].results.length,
  },
  async (maliya, mek, m, { body, sender, reply, from }) => {
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const idx = +body.trim() - 1;
    const selected = pendingSearch[sender].results[idx];
    delete pendingSearch[sender];

    reply("*⏳ Movie details සහ download links ගන්නවා...*");

    let meta;
    try {
      meta = await getDownloadLinks(selected.url);
    } catch (e) {
      return reply(`*❌ Error:* ${e.message}`);
    }

    const title = cleanTitle(meta.title || selected.title);

    // Build info card
    let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
    if (meta.imdb)       msg += `⭐ *IMDb:* ${meta.imdb}\n`;
    if (meta.duration)   msg += `⏱ *Duration:* ${meta.duration}\n`;
    if (meta.genres.length)    msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;
    if (meta.directors.length) msg += `🎥 *Director:* ${meta.directors.join(", ")}\n`;
    if (meta.subtitleBy) msg += `📝 *Sub By:* ${meta.subtitleBy}\n`;

    // Show ALL qualities (no size limit)
    if (!meta.links.length) {
      msg += `\n⚠️ *Download links නැහැ.*`;
      try {
        if (meta.thumb)
          await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
        else
          await maliya.sendMessage(from, { text: msg }, { quoted: mek });
      } catch (_) {
        await maliya.sendMessage(from, { text: msg }, { quoted: mek });
      }
      return;
    }

    msg += `\n*📥 Quality Select කරන්න:*\n`;
    meta.links.forEach((l, i) => {
      const q = normalizeQuality(l.quality || l.label);
      msg += `*${i + 1}.* ${q}  —  ${l.size}\n`;
    });
    msg += `\n*Number reply කරන්න quality select කරන්න*`;

    pendingQuality[sender] = { title, thumb: meta.thumb, links: meta.links, timestamp: Date.now() };

    try {
      if (meta.thumb)
        await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
      else
        await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    } catch (_) {
      await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    }
  }
);

// ─── Step 3: Pick quality → resolve & send document ───────────────────────────

cmd(
  {
    filter: (text, { sender }) =>
      pendingQuality[sender] &&
      /^\d+$/.test(text.trim()) &&
      +text >= 1 &&
      +text <= pendingQuality[sender].links.length,
  },
  async (maliya, mek, m, { body, sender, reply, from }) => {
    await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

    const idx = +body.trim() - 1;
    const { title, links } = pendingQuality[sender];
    delete pendingQuality[sender];

    const chosen = links[idx];
    const quality = normalizeQuality(chosen.quality || chosen.label);

    reply(`*⏳ ${quality} direct link ගන්නවා...*`);

    let directUrl;
    try {
      directUrl = await resolveZtLink(chosen.ztUrl);
    } catch (e) {
      return reply(`*❌ Link resolve error:* ${e.message}`);
    }

    if (!directUrl) {
      return maliya.sendMessage(
        from,
        {
          text:
            `*❌ Direct link ගන්න බැරිවුණා.*\n\nManually download කරන්න:\n${chosen.ztUrl}`,
        },
        { quoted: mek }
      );
    }

    // Telegram link නම් text විදිහට යවනවා
    if (directUrl.includes("t.me") || directUrl.includes("telegram")) {
      return maliya.sendMessage(
        from,
        {
          text:
            `*🎬 ${title}*\n*Quality:* ${quality}  |  *Size:* ${chosen.size}\n\n` +
            `📲 *Telegram Download Link:*\n${directUrl}\n\nEnjoy! 🍿`,
        },
        { quoted: mek }
      );
    }

    // Direct .mp4 — document විදිහට send
    reply(`*⬇️ ${quality} (${chosen.size}) — document විදිහට යවනවා...*\nකෙටි වෙලාවක් ඉන්න 🙏`);

    const safeFileName = `${title} [${quality}] [CineSubz].mp4`
      .replace(/[^\w\s.\-\[\]()]/gi, "")
      .trim();

    try {
      await maliya.sendMessage(
        from,
        {
          document: { url: directUrl },
          mimetype: "video/mp4",
          fileName: safeFileName,
          caption:
            `*🎬 ${title}*\n` +
            `*📊 Quality:* ${quality}\n` +
            `*💾 Size:* ${chosen.size}\n\n` +
            `*Enjoy your movie! 🍿*\n_Sinhala subtitles සමඟ_`,
        },
        { quoted: mek }
      );
    } catch (err) {
      // Fallback: direct link text
      await maliya.sendMessage(
        from,
        {
          text:
            `*🎬 ${title}*  [${quality}]  ${chosen.size}\n\n` +
            `Document send වුණේ නැහැ.\nDirect link:\n${directUrl}`,
        },
        { quoted: mek }
      );
    }
  }
);

// ─── Session cleanup ──────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const ttl = 10 * 60 * 1000;
  for (const s in pendingSearch)
    if (now - pendingSearch[s].timestamp > ttl) delete pendingSearch[s];
  for (const s in pendingQuality)
    if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
