const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

const MAX_RESULTS = 10;
const MAX_MB = 25;

// Store: from -> { type, data }
global.replyStore = global.replyStore || {};

function cleanUrl(u) {
  try { return new URL(u).toString(); } catch { return null; }
}

function isPdf(u) {
  return /\.pdf(\?|#|$)/i.test(u);
}

async function httpGet(url) {
  return axios.get(url, {
    timeout: 25000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

// Extract the first PDF link from a page
async function extractPdfFromPage(pageUrl) {
  try {
    const res = await httpGet(pageUrl);
    const $ = cheerio.load(res.data);

    // 1) anchor links containing pdf
    let pdf = null;
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = cleanUrl(new URL(href, pageUrl).toString());
      if (abs && isPdf(abs)) {
        pdf = abs;
        return false; // break
      }
    });

    // 2) embed/iframe src
    if (!pdf) {
      const src = $("iframe").attr("src") || $("embed").attr("src");
      if (src) {
        const abs = cleanUrl(new URL(src, pageUrl).toString());
        if (abs && isPdf(abs)) pdf = abs;
      }
    }

    return pdf;
  } catch {
    return null;
  }
}

// ✅ Primary Search: pastpapers.wiki internal search.
async function searchPastpapersWiki(query) {
  const searchUrl = `https://pastpapers.wiki/?s=${encodeURIComponent(query)}`;
  const res = await httpGet(searchUrl);
  const $ = cheerio.load(res.data);

  const postLinks = [];
  // WordPress search results typically have h2.entry-title > a
  $("h2.entry-title a, h3.entry-title a, a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (!href || !text) return;

    const abs = cleanUrl(href);
    if (!abs) return;

    // keep only pastpapers.wiki pages (posts)
    if (!abs.includes("pastpapers.wiki/")) return;

    // avoid duplicates and junk
    if (abs.includes("/wp-content/")) return;
    postLinks.push({ title: text, pageUrl: abs });
  });

  // dedupe
  const seen = new Set();
  const uniq = [];
  for (const x of postLinks) {
    if (seen.has(x.pageUrl)) continue;
    seen.add(x.pageUrl);
    uniq.push(x);
  }

  // Resolve each post page into a PDF
  const results = [];
  for (const item of uniq) {
    const pdfUrl = await extractPdfFromPage(item.pageUrl);
    if (pdfUrl) {
      results.push({
        title: item.title,
        url: pdfUrl,
        domain: "pastpapers.wiki",
      });
    }
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// Download PDF to buffer
async function downloadPdf(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const size = Number(res.headers["content-length"] || 0);
  if (size && size > MAX_MB * 1024 * 1024) throw new Error("File too large");

  const buf = Buffer.from(res.data);
  if (buf.length > MAX_MB * 1024 * 1024) throw new Error("File too large");
  return buf;
}

// =======================
// .pp <query>
// =======================
cmd(
  {
    pattern: "pp",
    desc: "Search Sri Lankan past papers and reply with a number to download",
    category: "Education",
    react: "📄",
    filename: __filename,
  },
  async (conn, mek, m, { from, q, reply }) => {
    try {
      if (!q) {
        return reply(
          "Use:\n.pp <paper name>\nExample:\n.pp grade 10 science 3rd term test sinhala"
        );
      }

      await reply("Searching papers....");

      // ✅ Use pastpapers.wiki internal search (works even if DDG blocks)
      const results = await searchPastpapersWiki(q);

      if (!results.length) {
        return reply(
          "Paper results found නෑ.\nTips:\n• science කියලා try කරන්න (sciense නෙමේ)\n• 'term test', '3rd term', 'pdf', 'grade 10', 'sinhala' වගේ words add කරන්න\nExample:\n.pp grade 10 science 3rd term test sinhala"
        );
      }

      // store for number reply
      global.replyStore[from] = { type: "pastpaper", data: results };

      let msg = "📄 Past Papers (number එක reply කරන්න)\n\n";
      results.forEach((r, i) => {
        msg += `${i + 1}. ${r.title}\n   (${r.domain})\n`;
      });
      msg += "\nමේ message එකට reply කරලා: 1 / 2 / 3 ... කියලා දාන්න ✅";

      return reply(msg);
    } catch (e) {
      console.error("PP SEARCH ERROR:", e?.message || e);
      return reply("Search failed. Please try again later.");
    }
  }
);

// =======================
// Number reply handler (no index.js changes)
// =======================
cmd(
  { on: "text" },
  async (conn, mek, m, { from, body }) => {
    try {
      const store = global.replyStore?.[from];
      if (!store || store.type !== "pastpaper") return;

      const txt = String(body || "").trim();
      if (!/^\d+$/.test(txt)) return;

      const n = parseInt(txt, 10);
      if (n < 1 || n > store.data.length) return;

      const chosen = store.data[n - 1];
      await conn.sendMessage(from, { text: "Downloading paper..." }, { quoted: mek });

      const pdf = await downloadPdf(chosen.url);
      const name = (chosen.title || "past-paper")
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 80);

      await conn.sendMessage(
        from,
        { document: pdf, mimetype: "application/pdf", fileName: `${name}.pdf` },
        { quoted: mek }
      );

      delete global.replyStore[from];
    } catch (e) {
      console.error("PP DOWNLOAD ERROR:", e?.message || e);
      try {
        await conn.sendMessage(from, { text: "Download failed. Try another number." }, { quoted: mek });
      } catch {}
    }
  }
);
