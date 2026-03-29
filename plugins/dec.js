const axios = require("axios");
const { cmd } = require("../command");

const IMAGE_URL =
  "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/a1b18d21-fd72-43cb-936b-5b9712fb9af0.png?raw=true";

// ✅ REQUIRED: Set a proper User-Agent for Wikimedia APIs
const WIKI_HEADERS = {
  "User-Agent": "MALIYA-MD/1.0 (WhatsApp Bot; contact: owner@local)", // <-- can edit text
  "Accept": "application/json",
};

function buildEssay(lang, title, summary, extra) {
  const intro = (summary || "").trim();
  const body = (extra || "").trim();

  if (lang === "en") {
    return [
      `📝 *ESSAY*: ${title}`,
      ``,
      `*Introduction*`,
      intro || "No summary found on Wikipedia.",
      ``,
      `*Main Points*`,
      body || "Try a more specific title (add year/place/full name).",
      ``,
      `*Conclusion*`,
      `In conclusion, ${title} is an important topic. The above information gives a clear overview based on Wikipedia.`
    ].join("\n");
  }

  return [
    `📝 *රචනාව*: ${title}`,
    ``,
    `*හැඳින්වීම*`,
    intro || "Wikipedia වලින් සාරාංශයක් ලබාගැනීමට නොහැකි විය. වෙනත් මාතෘකාවක් උත්සාහ කරන්න.",
    ``,
    `*ප්‍රධාන කරුණු*`,
    body || "මාතෘකාව තවත් පැහැදිලි කරලා බලන්න (නම/අවුරුද්ද/තැනක් එක්කරලා).",
    ``,
    `*නිගමනය*`,
    `නිගමනයක් ලෙස, ${title} පිළිබඳ ඉහත සටහන Wikipedia තොරතුරු මත පදනම්ව සරලව ඉදිරිපත් කළ හැකිය.`
  ].join("\n");
}

async function wikiFetch(lang, title) {
  // 1) Search best match
  const searchUrl = `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
    title
  )}&limit=1`;

  const s = await axios.get(searchUrl, { headers: WIKI_HEADERS, timeout: 30000 });
  const page = s?.data?.pages?.[0];
  if (!page?.key) return null;

  // 2) Summary
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    page.key
  )}`;

  const sum = await axios.get(summaryUrl, { headers: WIKI_HEADERS, timeout: 30000 });
  const summary = sum?.data?.extract || "";
  const displayTitle = sum?.data?.title || title;

  // 3) Extra content (plain text)
  const extraUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&titles=${encodeURIComponent(
    displayTitle
  )}`;

  const extraRes = await axios.get(extraUrl, { headers: WIKI_HEADERS, timeout: 30000 });
  const pages = extraRes?.data?.query?.pages || {};
  const firstPageId = Object.keys(pages)[0];
  const extractAll = pages[firstPageId]?.extract || "";

  // take a few paragraphs after first line
  const extra = extractAll.split("\n").slice(1, 10).join("\n").trim();

  return { displayTitle, summary, extra };
}

cmd(
  {
    pattern: "info",
    react: "📚",
    desc: "information genarator for MALIYA-MD",
    category: "info",
    filename: __filename,
  },
  async (bot, mek, m, { from, q }) => {
    try {
      if (!q || !q.trim()) {
        return await bot.sendMessage(
          from,
          { text: "❌ Usage:\n.dec <මාතෘකාව>\n.dec en <title>" },
          { quoted: mek }
        );
      }

      let lang = "si";
      let title = q.trim();

      if (q.toLowerCase().startsWith("en ")) {
        lang = "en";
        title = q.slice(3).trim();
      }

      let result = await wikiFetch(lang, title);

      // Optional fallback: Sinhala page missing -> try English
      if (!result && lang === "si") {
        result = await wikiFetch("en", title);
        lang = "en";
      }

      if (!result) {
        return await bot.sendMessage(
          from,
          { text: "❌ Wikipedia page not found. Try a different title." },
          { quoted: mek }
        );
      }

      const essay = buildEssay(lang, result.displayTitle, result.summary, result.extra);

      // WhatsApp caption safe limit
      const MAX = 3500;
      const caption = essay.length > MAX ? essay.slice(0, MAX) + "\n\n...(trimmed)" : essay;

      await bot.sendMessage(
        from,
        { image: { url: IMAGE_URL }, caption },
        { quoted: mek }
      );
    } catch (e) {
      console.log("DEC WIKI ERROR:", e?.response?.data || e?.message || e);
      await bot.sendMessage(
        from,
        { text: "❌ Wikipedia error. Try again later." },
        { quoted: mek }
      );
    }
  }
);
