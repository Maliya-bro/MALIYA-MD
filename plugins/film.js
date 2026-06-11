/**
 * CineSubz.lk Movie Download Plugin for MALIYA-MD
 * ─────────────────────────────────────────────────
 * npm install axios cheerio
 *
 * Flow: movie <name> → pick result → pick quality (2GB↓) → document send
 */

const { cmd } = require("../command");
const axios   = require("axios");
const cheerio = require("cheerio");

// ─── Session state ────────────────────────────────────────────────────────────
const pendingSearch  = {};
const pendingQuality = {};

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE     = "https://cinesubz.net";
const TIMEOUT  = 20_000;
const MAX_MB   = 2048; // 2 GB — WhatsApp document limit

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent"     : UA,
  "Accept"         : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer"        : BASE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(url) {
  return axios.get(url, { headers: HEADERS, timeout: TIMEOUT, maxRedirects: 10 });
}

function cleanTitle(t = "") {
  return t
    .replace(/sinhala subtitles?.*/i, "")
    .replace(/සිංහල.*/i, "")
    .replace(/\|.*/i, "")
    .replace(/[-–]\s*$/, "")
    .trim();
}

function parseSizeMB(s = "") {
  const u = s.toUpperCase().trim();
  const n = parseFloat(u);
  if (isNaN(n)) return 9999;
  if (u.includes("GB")) return n * 1024;
  if (u.includes("MB")) return n;
  return 9999;
}

function normalizeQuality(t = "") {
  const u = t.toUpperCase();
  if (u.includes("2160") || u.includes("4K"))  return "4K";
  if (u.includes("1080") || u.includes("FHD")) return "1080p";
  if (u.includes("720")  || u.includes("HD"))  return "720p";
  if (u.includes("480")  || u.includes("SD"))  return "480p";
  if (u.includes("360"))                        return "360p";
  return t.trim() || "Unknown";
}

// ─── 1. Search ────────────────────────────────────────────────────────────────

async function searchMovies(query) {
  const { data } = await get(`${BASE}/?s=${encodeURIComponent(query)}`);
  const $ = cheerio.load(data);
  const results = [];
  const seen    = new Set();

  $(".display-item .item-box, article, .post").each((_, el) => {
    const a     = $(el).find("a[href*='/movies/'], a[href*='/tvshows/']").first();
    const href  = a.attr("href") || "";
    const title = (a.attr("title") || a.text()).trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);
    results.push({
      title,
      url  : href,
      imdb : $(el).find("[class*='imdb']").first().text().trim(),
      year : $(el).find("[class*='year']").first().text().trim(),
      thumb: $(el).find("img").first().attr("src") || "",
    });
  });

  // Fallback
  if (!results.length) {
    $("a[href*='/movies/'], a[href*='/tvshows/']").each((_, el) => {
      const href  = $(el).attr("href") || "";
      const title = ($(el).attr("title") || $(el).text()).trim();
      if (!href || !title || seen.has(href) || href === BASE) return;
      seen.add(href);
      results.push({ title, url: href, imdb: "", year: "", thumb: "" });
    });
  }

  return results.slice(0, 10);
}

// ─── 2. Movie page → meta + download links ────────────────────────────────────
//
//  Download link anchors match:  a[href*="/api-"]
//  Label text example: "Direct & Telegram Download LinksSD 480P • 669.6 MB • English"
//  We strip the prefix and parse quality + size from the label.

async function getMovieMeta(movieUrl) {
  const { data } = await get(movieUrl);
  const $ = cheerio.load(data);

  const title = cleanTitle(
    $("h1").first().text().trim() ||
    $(".details-title h3").text().trim() ||
    $("title").text().split(/[–|]/)[0].trim()
  );

  const thumb = $(".splash-bg img, .poster img, .wp-post-image").first().attr("src") ||
                $("article img").first().attr("src") || "";
  const imdb  = $(".data-imdb, [class*='data-imdb']").first().text()
                  .replace(/imdb[:\s]*/i, "").trim();
  const duration = $("[itemprop='duration'], .duration").first().text().trim();

  const genres = [];
  $(".details-genre a, [class*='genre'] a").each((_, el) => genres.push($(el).text().trim()));

  const directors = [];
  $("a[href*='/director/']").each((_, el) => directors.push($(el).text().trim()));

  const subBy = (data.match(/Subtitle By[:\s]*([^\n<]+)/i) || [])[1]?.trim() || "";

  // ── Download links ──────────────────────────────────────────────────────────
  // Two URL patterns exist on cinesubz:
  //   New films  → /zt-links/code/
  //   Old films  → /api-xxxx.../code/
  const links = [];
  $("a[href*='/zt-links/'], a[href*='/api-']").each((_, el) => {
    const rawLabel = $(el).text()
      .replace(/Direct\s*(&|and)\s*Telegram\s*Download\s*Links?/gi, "")
      .trim();
    // rawLabel example: "SD 480P • 669.6 MB • English"
    const qualM = rawLabel.match(/(4K|2160[Pp]|1080[Pp]|FHD|720[Pp]|HD|480[Pp]|SD|360[Pp])/i);
    const sizeM = rawLabel.match(/(\d+\.?\d*)\s*(GB|MB)/i);
    const apiUrl = $(el).attr("href");
    if (!apiUrl) return;
    links.push({
      label  : rawLabel,
      quality: qualM?.[1] || "",
      size   : sizeM?.[0] || "",
      apiUrl,          // e.g. https://cinesubz.net/api-.../iw7mhe8dki/
    });
  });

  return { title, thumb, imdb, duration, genres, directors, subBy, links };
}

// ─── 3. Resolve API link → direct .mp4 URL ────────────────────────────────────
//
//  The /api-.../code/ page redirects or returns the real download URL.
//  We follow redirects and grab the final URL, or parse the page for a .mp4 link.

async function resolveDownloadLink(ztUrl) {
  // Step 1: GET the zt-link page — grab the "Click Here" mp4 href directly from HTML
  // (No need to wait for timer — href is in static HTML)
  let mp4Url = null;
  try {
    const { data } = await get(ztUrl);
    const $ = cheerio.load(data);

    // Primary: "Click Here" anchor with .mp4
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.toLowerCase().includes(".mp4")) { mp4Url = href; return false; }
    });

    // Fallback: telegram / pixeldrain
    if (!mp4Url) {
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.includes("t.me") || href.includes("pixeldrain")) { mp4Url = href; return false; }
      });
    }
  } catch (_) {}

  if (!mp4Url) return null;

  // Step 2: If URL is google.com/server6/... — follow redirect to get real CDN URL
  if (mp4Url.includes("google.com/server")) {
    try {
      const res = await axios.get(mp4Url, {
        headers: {
          ...HEADERS,
          Referer: ztUrl,
          Range: "bytes=0-0", // tiny range — just need the redirect
        },
        timeout: TIMEOUT,
        maxRedirects: 10,
        validateStatus: s => s < 500,
      });
      const finalUrl = res.request?.res?.responseUrl || res.config?.url || "";
      if (finalUrl && finalUrl !== mp4Url && finalUrl.includes(".mp4")) return finalUrl;
      // Even if redirect didn't change, return the google.com URL — Baileys will follow it
    } catch (_) {}
  }

  return mp4Url;
}

// ─── Bot Commands ─────────────────────────────────────────────────────────────

cmd({
  pattern : "film",
  alias   : ["movie", "cinema", "cine", "sub", "films"],
  react   : "🎬",
  desc    : "Search & download movies from NEW MALIYA-MD FILM DB",
  category: "download",
  filename: __filename,
}, async (maliya, mek, m, { from, q, sender, reply }) => {

  if (!q) return reply(
    "*🎬 CineSubz Movie Search*\n\n" +
    "Usage: *movie <name>*\n" +
    "Example: *movie spider man*\n\n" +
    " film/series with Sinhala Subtitle ! 🍿"
  );

  await maliya.sendMessage(from, { react: { text: "🔍", key: mek.key } });
  reply("*🔍 Searching MALIYA-MD FILM DB...*");

  let results;
  try       { results = await searchMovies(q); }
  catch (e) { return reply(`*❌ Search error:* ${e.message}`); }

  if (!results.length)
    return reply(`*❌ "${q}" No results found*\nTry deferent name.`);

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let text = `*🎬 Results: "${q}"*\n${"─".repeat(28)}\n`;
  results.forEach((r, i) => {
    text += `*${i + 1}.* ${cleanTitle(r.title)}`;
    if (r.year) text += ` (${r.year})`;
    if (r.imdb) text += `  ⭐${r.imdb}`;
    text += "\n";
  });
  text += `\n*Reply a number (1-${results.length})*`;
  reply(text);
});

// ── Step 2: user picks a movie ────────────────────────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingSearch[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 &&
    +text <= pendingSearch[sender].results.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const selected = pendingSearch[sender].results[+body.trim() - 1];
  delete pendingSearch[sender];

  reply("*⏳ Getting Film Details..*");

  let meta;
  try       { meta = await getMovieMeta(selected.url); }
  catch (e) { return reply(`*❌ Error:* ${e.message}`); }

  const title = meta.title || cleanTitle(selected.title);

  // Build info card
  let msg = `*🎬 ${title}*\n${"─".repeat(32)}\n`;
  if (meta.imdb)             msg += `⭐ *IMDb:* ${meta.imdb}\n`;
  if (meta.duration)         msg += `⏱ *Duration:* ${meta.duration}\n`;
  if (meta.genres.length)    msg += `🎭 *Genres:* ${meta.genres.join(", ")}\n`;
  if (meta.directors.length) msg += `🎥 *Director:* ${meta.directors.join(", ")}\n`;
  if (meta.subBy)            msg += `📝 *Sub By:* ${meta.subBy}\n`;

  // Filter: 2GB max
  const validLinks = meta.links.filter(l => parseSizeMB(l.size) <= MAX_MB);

  if (!validLinks.length) {
    msg += `\n⚠️ *2GB over — Can't send on WhatsApp*\n`;
    meta.links.forEach(l => {
      msg += `• ${normalizeQuality(l.quality || l.label)}  ${l.size}\n`;
    });
    try {
      if (meta.thumb)
        await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
      else
        await maliya.sendMessage(from, { text: msg }, { quoted: mek });
    } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
    return;
  }

  msg += `\n*📥 Quality Select (under 2GB Size):*\n`;
  validLinks.forEach((l, i) => {
    msg += `*${i + 1}.* ${normalizeQuality(l.quality || l.label)}  —  ${l.size}\n`;
  });
  msg += `\n*Reply a number*`;

  pendingQuality[sender] = { title, thumb: meta.thumb, links: validLinks, timestamp: Date.now() };

  try {
    if (meta.thumb)
      await maliya.sendMessage(from, { image: { url: meta.thumb }, caption: msg }, { quoted: mek });
    else
      await maliya.sendMessage(from, { text: msg }, { quoted: mek });
  } catch (_) { await maliya.sendMessage(from, { text: msg }, { quoted: mek }); }
});

// ── Step 3: quality selected → resolve → document ────────────────────────────

cmd({
  filter: (text, { sender }) =>
    pendingQuality[sender] &&
    /^\d+$/.test(text.trim()) &&
    +text >= 1 &&
    +text <= pendingQuality[sender].links.length,
}, async (maliya, mek, m, { body, sender, reply, from }) => {

  await maliya.sendMessage(from, { react: { text: "✅", key: mek.key } });

  const { title, links } = pendingQuality[sender];
  delete pendingQuality[sender];

  const chosen  = links[+body.trim() - 1];
  const quality = normalizeQuality(chosen.quality || chosen.label);

  reply(`*⏳ ${quality} (${chosen.size}) — Getting Direct Link..*`);

  let directUrl;
  try       { directUrl = await resolveDownloadLink(chosen.apiUrl); }
  catch (e) { return reply(`*❌ Resolve error:* ${e.message}`); }

  if (!directUrl) {
    return maliya.sendMessage(from, {
      text:
        `*❌ Can't Get Direct Link*\n` +
        `Try It Manually:\n${chosen.apiUrl}`,
    }, { quoted: mek });
  }

  // Telegram link
  if (directUrl.includes("t.me") || directUrl.includes("telegram.me")) {
    return maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*\n` +
        `*Quality:* ${quality}  |  *Size:* ${chosen.size}\n\n` +
        `📲 *Telegram Download:*\n${directUrl}\n\nEnjoy! 🍿`,
    }, { quoted: mek });
  }

  // Direct .mp4 → document
  reply(`*⬇️ Sending the film.. (${chosen.size})*\nPlase wait a moment.. 🙏`);

  const fileName = `${title} [${quality}] [CineSubz].mp4`
    .replace(/[^\w\s.\-\[\]()]/gi, "").trim();

  try {
    await maliya.sendMessage(from, {
      document: { url: directUrl },
      mimetype : "video/mp4",
      fileName,
      caption:
        `*🎬 ${title}*\n` +
        `*📊 Quality:* ${quality}\n` +
        `*💾 Size:* ${chosen.size}\n\n` +
        `*Enjoy! 🍿*\n_Sinhala subtitles සමඟ_`,
    }, { quoted: mek });
  } catch (err) {
    await maliya.sendMessage(from, {
      text:
        `*🎬 ${title}*  [${quality}]  ${chosen.size}\n\n` +
        `Can't send document format\nDirect link:\n${directUrl}`,
    }, { quoted: mek });
  }
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now(), ttl = 10 * 60 * 1000;
  for (const s in pendingSearch)  if (now - pendingSearch[s].timestamp  > ttl) delete pendingSearch[s];
  for (const s in pendingQuality) if (now - pendingQuality[s].timestamp > ttl) delete pendingQuality[s];
}, 5 * 60 * 1000);

module.exports = { pendingSearch, pendingQuality };
