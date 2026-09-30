const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");
const sharp = require("sharp");
const { readSettings, getCustomImage } = require("../lib/botSettings");

const BASE_URL = "https://govdoc.lk";
const CHANNEL_JID = "120363427174988449@newsletter";
const CHANNEL_NAME = "🍁 ＭＡＬＩＹＡ-〽️Ｄ 🍁";
const DEFAULT_IMAGE = "https://github.com/Maliya-bro/web-pair/blob/main/ChatGPT%20Image%20Sep%2030,%202026,%2004_22_09%20PM.png?raw=true";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8"
};

const SESSION_TIMEOUT = 5 * 60 * 1000;
const LOOP_COOLDOWN = 2500;

const pendingEdu = Object.create(null);
const lastProcessedMsg = {};

const ALLOWED_SUBJECTS = [
  { slug: "sinhala", name: "Sinhala" },
  { slug: "mathematics", name: "Mathematics" },
  { slug: "science", name: "Science" },
  { slug: "english", name: "English" },
  { slug: "history", name: "History" },
  { slug: "buddhist", name: "Buddhism" },
  { slug: "information-communication-technology-ict", name: "ICT" },
  { slug: "geography", name: "Geography" },
  { slug: "civic-education", name: "Civic Education" },
  { slug: "business--accounting-studies", name: "Business & Accounting" },
  { slug: "health--physical-education", name: "Health & Physical Edu" },
  { slug: "oriental-music", name: "Oriental Music" },
  { slug: "art", name: "Art" },
  { slug: "dance", name: "Dancing" },
  { slug: "drama--theatre", name: "Drama & Theatre" },
  { slug: "appreciation-of-sinhala-literary-texts", name: "Sinhala Literature" },
  { slug: "appreciation-of-english-literary-texts", name: "English Literature" },
  { slug: "agriculture--food-technology", name: "Agriculture" },
  { slug: "home-economics", name: "Home Economics" },
  { slug: "tamil", name: "Tamil" },
  { slug: "christianity", name: "Christianity" },
  { slug: "catholicism", name: "Catholicism" },
  { slug: "accounting", name: "Accounting" },
  { slug: "business-studies", name: "Business Studies" }
];

const ALLOWED_YEARS = [
  "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", 
  "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010", "2008", "2007", "2006"
].map(y => ({ slug: y, name: y }));

function keyFor(sender, from) {
  return `${from || ""}`;
}

function clearUserSession(k) {
  delete pendingEdu[k];
}

function channelContextInfo() {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1,
    },
  };
}

async function getFittedImageBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return await sharp(Buffer.from(res.data))
      .resize(800, 800, {
        fit: "contain",
        background: { r: 18, g: 18, b: 24, alpha: 1 }
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    return url;
  }
}

// 🔥 Quoted Stanza ID හරියටම අල්ලා ගන්නා ශ්‍රිතය (Swipe to Reply)
function getQuotedId(m, mek) {
  return (
    m?.quoted?.id ||
    mek?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    m?.message?.imageMessage?.contextInfo?.stanzaId ||
    mek?.message?.imageMessage?.contextInfo?.stanzaId ||
    m?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    mek?.message?.interactiveResponseMessage?.contextInfo?.stanzaId ||
    null
  );
}

function extractTexts(body, mek, m) {
  const texts = [];
  const direct = [
    body, m?.body, m?.text, m?.message?.conversation,
    m?.message?.extendedTextMessage?.text, m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedDisplayText,
    m?.message?.listResponseMessage?.title, m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.message?.interactiveResponseMessage?.body?.text,
    mek?.message?.conversation, mek?.message?.extendedTextMessage?.text,
    mek?.message?.buttonsResponseMessage?.selectedButtonId,
    mek?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
  ];
  for (const item of direct) {
    if (item) texts.push(String(item).trim());
  }

  const p1 = m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  const p2 = mek?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  for (const raw of [p1, p2]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id) texts.push(String(parsed.id).trim());
      if (parsed.selectedId) texts.push(String(parsed.selectedId).trim());
      if (parsed.selectedRowId) texts.push(String(parsed.selectedRowId).trim());
      if (parsed.title) texts.push(String(parsed.title).trim());
      if (parsed.name) texts.push(String(parsed.name).trim());
    } catch {}
  }
  return [...new Set(texts.filter(Boolean))];
}

async function sendErrorMsg(sock, from, mek, text) {
  await sock.sendMessage(from, {
    text: `⊱━━━━━ • ✿ • ━━━━━⊰\n❌ *ERROR*\n⊱━━━━━ • ✿ • ━━━━━⊰\n\n🚫 _${text}_`,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });
}

async function scrapePapersFromUrl(targetUrl) {
  try {
    const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const papers = [];

    $("section.section .categorycard a.custom-card").each((_, el) => {
      let title = $(el).find("h5.cate-title").text().trim() \vert{}\vert{} $(el).text().trim();
      let href = $(el).attr("href");
      if (href && !href.startsWith("http")) href = BASE_URL + href;
      if (title && href) papers.push({ name: title, url: href });
    });
    return papers;
  } catch (error) {
    return [];
  }
}

async function scrapeMediumsFromPaperPage(paperUrl) {
  try {
    const response = await axios.get(paperUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const mediums = [];

    $(".product-info .btn-row a").each((_, el) => {
      let mediumName = $(el).find("button.btn").text().trim() \vert{}\vert{} $(el).text().trim();
      let link = $(el).attr("href");
      if (link && !link.startsWith("http")) link = BASE_URL + link;

      if (mediumName && link) {
        mediums.push({
          name: `${mediumName} Medium`,
          medium: mediumName,
          url: link
        });
      }
    });
    return mediums;
  } catch (error) {
    return [];
  }
}

function getDirectDownloadRoute(viewUrl) {
  try {
    const parsedUrl = new URL(viewUrl);
    const id = parsedUrl.searchParams.get("id");
    if (id) return `${BASE_URL}/downloadFile/${id}`;
  } catch (error) {}
  return viewUrl;
}

// ── 1. Main Command: .education ────────────────────────────────
cmd({
  pattern: "education",
  alias: ["edu", "paper", "papers"],
  desc: "Download School Term Papers, Past Papers and Text Books.",
  category: "education",
  react: "📚",
  filename: __filename,
}, async (sock, mek, m, { from, sender, sessionId }) => {
  try {
    await sock.sendMessage(from, { react: { text: "📚", key: mek.key } });

    const k = keyFor(sender, from);
    clearUserSession(k);

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let headerImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "education_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    const bodyText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *EDUCATION HUB* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n👋 *Welcome to Sri Lanka Educational Portal!*\n\n👇 *Select an option below to start:*`;

    if (btnsOn) {
      try {
        const { ButtonV2 } = await import("@vanzxy/baileys");
        const fittedThumb = await getFittedImageBuffer(headerImg);

        const btn = new ButtonV2(sock)
          .setBody(bodyText)
          .setFooter("WaBot by MALIYA-MD Team ツ")
          .setThumbnail(fittedThumb);

        btn.addButton("📝 Term Test Papers", ".edu_cat term-test-papers");
        btn.addButton("📑 Past Papers", ".edu_cat past-papers");
        btn.addButton("📖 Text Books", ".edu_cat text-books");

        const sentMsg = await btn.send(from, { quoted: mek });

        if (sentMsg?.key?.id) {
          pendingEdu[k] = {
            expectedMsgId: sentMsg.key.id,
            step: "main_category",
            timestamp: Date.now(),
            isProcessing: false,
          };
          return;
        }
      } catch (err) {}
    }

    let text = `${bodyText}\n\n`;
    text += `*[ 01 ]* ➔ 📝 *Term Test Papers (වාර විභාග)*\n`;
    text += `*[ 02 ]* ➔ 📑 *Past Papers (පසුගිය විභාග)*\n`;
    text += `*[ 03 ]* ➔ 📖 *Text Books (පෙළපොත්)*\n\n`;
    text += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number (1, 2, 3)...*`;

    const sentMsg = await sock.sendMessage(from, {
      image: { url: headerImg },
      caption: text,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    pendingEdu[k] = {
      expectedMsgId: sentMsg.key.id,
      step: "main_category",
      timestamp: Date.now(),
      isProcessing: false,
    };

  } catch (error) {
    await sendErrorMsg(sock, from, mek, "Failed to start Educational Portal.");
  }
});

// ── 2. Unified Master Reply Handler ────────────────────────────
const eduReplyHandler = {
  filter: (text, { sender, from, m, mek }) => {
    const k = keyFor(sender, from);
    const state = pendingEdu[k];
    if (!state) return false;

    const texts = extractTexts(text, mek, m);
    for (const t of texts) {
      if (
        t.startsWith(".edu_cat ") ||
        t.startsWith(".edu_grade ") ||
        t.startsWith(".edu_sub ") ||
        t.startsWith(".edu_year ") ||
        t.startsWith(".edu_term ") ||
        t.startsWith(".edu_paper ") ||
        t.startsWith(".edu_medium ")
      ) return true;
    }

    const num = parseInt(String(text || "").trim(), 10);
    const isNum = !isNaN(num) && num > 0;

    const quotedId = getQuotedId(m, mek);
    const isQuoted = quotedId && quotedId === state.expectedMsgId;

    // Button click එකක් නම් හෝ Quoted Reply කර අංකයක් එවා ඇත්නම් පමණක් trigger වීම
    return isQuoted || isNum;
  },
  function: async (sock, mek, m, { body, sender, from, sessionId }) => {
    const k = keyFor(sender, from);
    const pending = pendingEdu[k];
    if (!pending || pending.isProcessing) return;

    const quotedId = getQuotedId(m, mek);
    const texts = extractTexts(body, mek, m);
    let actionPayload = null;

    for (const t of texts) {
      if (
        t.startsWith(".edu_cat ") ||
        t.startsWith(".edu_grade ") ||
        t.startsWith(".edu_sub ") ||
        t.startsWith(".edu_year ") ||
        t.startsWith(".edu_term ") ||
        t.startsWith(".edu_paper ") ||
        t.startsWith(".edu_medium ")
      ) {
        actionPayload = t.split(" ")[1].trim();
        break;
      }
    }

    let choiceNum = null;
    const rawNumber = parseInt(String(body || "").trim(), 10);
    if (!isNaN(rawNumber)) {
      choiceNum = rawNumber;
    }

    // Quoted reply validation
    if (!actionPayload && (!quotedId || quotedId !== pending.expectedMsgId)) {
      return;
    }

    const now = Date.now();
    const sig = `${pending.step}_${actionPayload || choiceNum}`;
    const lastMsg = lastProcessedMsg[k];
    if (lastMsg && lastMsg.text === sig && (now - lastMsg.time) < LOOP_COOLDOWN) return;
    lastProcessedMsg[k] = { text: sig, time: now };

    const settings = await readSettings(sessionId);
    const btnsOn = !!settings.btns_enabled;

    let headerImg = DEFAULT_IMAGE;
    if (sessionId) {
      try {
        const custom = await getCustomImage(sessionId, "education_header");
        if (custom && custom.data) headerImg = custom.data;
      } catch (e) {}
    }

    // ──────────────────────────────────────────────────────────
    // STEP 1: MAIN CATEGORY CHOSEN ➔ GRADE / EXAM LIST POPUP
    // ──────────────────────────────────────────────────────────
    if (pending.step === "main_category") {
      let selectedCat = actionPayload;
      if (!selectedCat && choiceNum) {
        if (choiceNum === 1) selectedCat = "term-test-papers";
        else if (choiceNum === 2) selectedCat = "past-papers";
        else if (choiceNum === 3) selectedCat = "text-books";
      }

      if (!selectedCat) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      let listRows = [];
      let curList = [];
      let popupTitle = "Select Grade ↯";
      let bodyCaption = "Select your School Grade below:";

      if (selectedCat === "past-papers") {
        popupTitle = "Select Exam ↯";
        bodyCaption = "Select your Examination category below:";
        curList = [
          { slug: "grade-5-scholarship-exam", name: "Grade 5 Scholarship" },
          { slug: "gce-ordinary-level-exam", name: "O/L (G.C.E. Ordinary Level)" },
          { slug: "gce-advance-level-exam", name: "A/L (G.C.E. Advance Level)" },
          { slug: "government-exam-jobs", name: "Government Jobs Exam" },
          { slug: "dharmacharya-exam", name: "Dharmacharya Exam" },
          { slug: "dhamma-school-final-exam", name: "Dhamma School Final Exam" }
        ];
      } else {
        curList = Array.from({ length: 13 }, (_, i) => ({
          slug: `grade-${i + 1}`,
          name: `Grade ${i + 1}`
        }));
      }

      listRows = curList.map((item, idx) => ({
        title: `${String(idx + 1).padStart(2, "0")}. ${item.name}`,
        description: `Select ${item.name}`,
        id: `.edu_grade ${item.slug}`
      }));

      const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *STEP 1: GRADE / EXAM* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📌 *Selected :* ${selectedCat.toUpperCase()}\n👇 *${bodyCaption}*`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(cardText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: ".edu_grade_list",
            buttonText: { displayText: "🎓 Choose Grade / Exam" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: popupTitle,
                sections: [{ title: "Available Options", rows: listRows }]
              }),
            },
          });

          btn.addButton("⚡ Alive", ".alive");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_grade";
            pending.category = selectedCat;
            pending.currentList = curList;
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (err) {}
      }

      let fbText = `${cardText}\n\n`;
      curList.forEach((it, idx) => {
        fbText += `*[ ${String(idx + 1).padStart(2, "0")} ]* ➔ 🎓 *${it.name}*\n`;
      });
      fbText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with a number...*`;

      const sentMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: fbText,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_grade";
      pending.category = selectedCat;
      pending.currentList = curList;
      pending.isProcessing = false;
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 2: GRADE / EXAM SELECTED ➔ SUBJECT LIST POPUP (24 SUBJECTS)
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_grade") {
      let chosenSlug = actionPayload;
      const curList = pending.currentList || [];
      if (!chosenSlug && choiceNum && choiceNum <= curList.length) {
        chosenSlug = curList[choiceNum - 1].slug;
      }
      if (!chosenSlug) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *STEP 2: SUBJECT* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📌 *Grade/Exam :* ${chosenSlug.toUpperCase()}\n👇 *Select your Subject from the list below:*`;

      const subRows = ALLOWED_SUBJECTS.map((s, idx) => ({
        title: `${String(idx + 1).padStart(2, "0")}. ${s.name}`,
        description: "Official Curriculum Subject",
        id: `.edu_sub ${s.slug}`
      }));

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(cardText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: ".edu_sub_list",
            buttonText: { displayText: "📖 Choose Subject" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Subjects List ↯",
                sections: [{ title: "Available 24 Subjects", rows: subRows }]
              }),
            },
          });

          btn.addButton("⚡ Alive", ".alive");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_subject";
            pending.gradeSlug = chosenSlug;
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {}
      }

      let fbText = `${cardText}\n\n`;
      ALLOWED_SUBJECTS.forEach((s, idx) => {
        fbText += `*[ ${String(idx + 1).padStart(2, "0")} ]* ➔ 📖 *${s.name}*\n`;
      });
      fbText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with Subject number...*`;

      const sentMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: fbText,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_subject";
      pending.gradeSlug = chosenSlug;
      pending.isProcessing = false;
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 3: SUBJECT SELECTED ➔ YEAR LIST POPUP OR DIRECT BOOKS
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_subject") {
      let subSlug = actionPayload;
      if (!subSlug && choiceNum && choiceNum <= ALLOWED_SUBJECTS.length) {
        subSlug = ALLOWED_SUBJECTS[choiceNum - 1].slug;
      }
      if (!subSlug) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      if (pending.category === "text-books") {
        const bookUrl = `${BASE_URL}/category/text-books/${pending.gradeSlug}/${subSlug}`;
        const books = await scrapePapersFromUrl(bookUrl);

        if (!books.length) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No Text Books found for this subject.");
        }

        return await sendPapersListMenu(sock, mek, from, books, "Text Books", pending, k, headerImg, btnsOn);
      }

      const yearRows = ALLOWED_YEARS.map((y, idx) => ({
        title: `${String(idx + 1).padStart(2, "0")}. Year ${y.name}`,
        description: `Examination papers of ${y.name}`,
        id: `.edu_year ${y.slug}`
      }));

      const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *STEP 3: YEAR* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📌 *Subject :* ${subSlug.toUpperCase()}\n👇 *Select Examination Year from the list below:*`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(cardText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addRawButton({
            buttonId: ".edu_year_list",
            buttonText: { displayText: "📅 Choose Year" },
            type: 1,
            nativeFlowInfo: {
              name: "single_select",
              paramsJson: JSON.stringify({
                title: "Exam Years ↯",
                sections: [{ title: "Available 20 Years", rows: yearRows }]
              }),
            },
          });

          btn.addButton("⚡ Alive", ".alive");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_year";
            pending.subjectSlug = subSlug;
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {}
      }

      let fbText = `${cardText}\n\n`;
      ALLOWED_YEARS.forEach((y, idx) => {
        fbText += `*[ ${String(idx + 1).padStart(2, "0")} ]* ➔ 📅 *${y.name}*\n`;
      });
      fbText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with Year number...*`;

      const sentMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: fbText,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_year";
      pending.subjectSlug = subSlug;
      pending.isProcessing = false;
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 4: YEAR SELECTED ➔ TERM QUICK REPLY (FOR TERM PAPERS) OR PAPERS LIST (PAST PAPERS)
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_year") {
      let yearSlug = actionPayload;
      if (!yearSlug && choiceNum && choiceNum <= ALLOWED_YEARS.length) {
        yearSlug = ALLOWED_YEARS[choiceNum - 1].slug;
      }
      if (!yearSlug) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      if (pending.category === "past-papers") {
        const pastUrl = `${BASE_URL}/category/past-papers/${pending.gradeSlug}/${pending.subjectSlug}/${yearSlug}`;
        const papers = await scrapePapersFromUrl(pastUrl);

        if (!papers.length) {
          clearUserSession(k);
          return await sendErrorMsg(sock, from, mek, "No Past Papers found for this selection.");
        }

        return await sendPapersListMenu(sock, mek, from, papers, "Past Papers", pending, k, headerImg, btnsOn);
      }

      const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *STEP 4: TERM* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📌 *Year :* ${yearSlug}\n👇 *Select the School Term:*`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(cardText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          btn.addButton("1️⃣ 1st Term", ".edu_term 1");
          btn.addButton("2️⃣ 2nd Term", ".edu_term 2");
          btn.addButton("3️⃣ 3rd Term", ".edu_term 3");

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_term";
            pending.yearSlug = yearSlug;
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {}
      }

      let fbText = `${cardText}\n\n`;
      fbText += `*[ 01 ]* ➔ 1️⃣ *1st Term (පළමු වාරය)*\n`;
      fbText += `*[ 02 ]* ➔ 2️⃣ *2nd Term (දෙවන වාරය)*\n`;
      fbText += `*[ 03 ]* ➔ 3️⃣ *3rd Term (තෙවන වාරය)*\n\n`;
      fbText += `⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with Term number (1, 2 or 3)...*`;

      const sentMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: fbText,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_term";
      pending.yearSlug = yearSlug;
      pending.isProcessing = false;
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 5: TERM SELECTED ➔ PAPERS LIST POPUP
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_term") {
      let termNum = actionPayload || (choiceNum ? String(choiceNum) : null);
      if (!termNum || !["1", "2", "3"].includes(termNum)) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const baseFilter = `${BASE_URL}/category/term-test-papers/${pending.gradeSlug}/${pending.subjectSlug}/${pending.yearSlug}`;
      let targetUrl = `${baseFilter}?term=${termNum}`;

      let papers = await scrapePapersFromUrl(targetUrl);
      if (!papers.length) {
        papers = await scrapePapersFromUrl(baseFilter);
      }

      if (!papers.length) {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, "No Term Test papers found for this selection.");
      }

      return await sendPapersListMenu(sock, mek, from, papers, `Term ${termNum} Papers`, pending, k, headerImg, btnsOn);
    }

    // ──────────────────────────────────────────────────────────
    // STEP 6: PAPER SELECTED ➔ MEDIUM QUICK REPLY BUTTONS
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_paper") {
      let paperIdx = actionPayload ? parseInt(actionPayload, 10) : choiceNum;
      if (!paperIdx || paperIdx < 1 || paperIdx > pending.paperList.length) return;

      pending.isProcessing = true;
      await sock.sendMessage(from, { react: { text: "⏳", key: mek.key } });

      const chosenPaper = pending.paperList[paperIdx - 1];
      const mediums = await scrapeMediumsFromPaperPage(chosenPaper.url);

      if (!mediums.length) {
        clearUserSession(k);
        return await sendErrorMsg(sock, from, mek, "No download mediums available for this paper.");
      }

      const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *STEP 6: MEDIUM* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📄 *Document :* ${chosenPaper.name}\n👇 *Select your Medium to download:*`;

      if (btnsOn) {
        try {
          const { ButtonV2 } = await import("@vanzxy/baileys");
          const fittedThumb = await getFittedImageBuffer(headerImg);

          const btn = new ButtonV2(sock)
            .setBody(cardText)
            .setFooter("WaBot by MALIYA-MD Team ツ")
            .setThumbnail(fittedThumb);

          mediums.forEach((mObj, i) => {
            btn.addButton(`🌐 ${mObj.medium} Medium`, `.edu_medium ${i + 1}`);
          });

          const sentMsg = await btn.send(from, { quoted: mek });
          if (sentMsg?.key?.id) {
            pending.expectedMsgId = sentMsg.key.id;
            pending.step = "select_medium";
            pending.selectedPaper = chosenPaper;
            pending.mediums = mediums;
            pending.isProcessing = false;
            await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
            return;
          }
        } catch (e) {}
      }

      let fbText = `${cardText}\n\n`;
      mediums.forEach((mObj, idx) => {
        fbText += `*[ ${String(idx + 1).padStart(2, "0")} ]* ➔ 🌐 *${mObj.medium} Medium*\n`;
      });
      fbText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with Medium number...*`;

      const sentMsg = await sock.sendMessage(from, {
        image: { url: headerImg },
        caption: fbText,
        contextInfo: channelContextInfo(),
      }, { quoted: mek });

      pending.expectedMsgId = sentMsg.key.id;
      pending.step = "select_medium";
      pending.selectedPaper = chosenPaper;
      pending.mediums = mediums;
      pending.isProcessing = false;
      await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
    }

    // ──────────────────────────────────────────────────────────
    // STEP 7: MEDIUM SELECTED ➔ DIRECT DOWNLOAD & SEND DOCUMENT/PDF
    // ──────────────────────────────────────────────────────────
    else if (pending.step === "select_medium") {
      let medIdx = actionPayload ? parseInt(actionPayload, 10) : choiceNum;
      if (!medIdx || medIdx < 1 || medIdx > pending.mediums.length) return;

      pending.isProcessing = true;
      const chosenMedium = pending.mediums[medIdx - 1];
      const paperObj = pending.selectedPaper;
      const directRoute = getDirectDownloadRoute(chosenMedium.url);

      clearUserSession(k);
      await sendPdfDocument(sock, mek, from, directRoute, paperObj.name, chosenMedium.medium);
    }
  }
};

// Helper: Send Papers List Popup Menu & Save Stanza ID for Quoted Reply
async function sendPapersListMenu(sock, mek, from, papers, titleLabel, pending, k, headerImg, btnsOn) {
  const topPapers = papers.slice(0, 30);
  const cardText = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *AVAILABLE PAPERS* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n📚 *Category :* ${titleLabel}\n🍿 *Results :* ${topPapers.length}\n👇 *Select the document you need:*`;

  if (btnsOn) {
    try {
      const { ButtonV2 } = await import("@vanzxy/baileys");
      const fittedThumb = await getFittedImageBuffer(headerImg);

      const paperRows = topPapers.map((p, idx) => ({
        title: `${String(idx + 1).padStart(2, "0")}. ${p.name.slice(0, 38)}`,
        description: "Official PDF Document",
        id: `.edu_paper ${idx + 1}`
      }));

      const btn = new ButtonV2(sock)
        .setBody(cardText)
        .setFooter("WaBot by MALIYA-MD Team ツ")
        .setThumbnail(fittedThumb);

      btn.addRawButton({
        buttonId: ".edu_paper_list",
        buttonText: { displayText: "📑 Select Document" },
        type: 1,
        nativeFlowInfo: {
          name: "single_select",
          paramsJson: JSON.stringify({
            title: "Documents List ↯",
            sections: [{ title: "Found Documents", rows: paperRows }]
          }),
        },
      });

      btn.addButton("⚡ Alive", ".alive");

      const sentMsg = await btn.send(from, { quoted: mek });
      if (sentMsg?.key?.id) {
        pending.expectedMsgId = sentMsg.key.id;
        pending.step = "select_paper";
        pending.paperList = topPapers;
        pending.isProcessing = false;
        await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
        return;
      }
    } catch (e) {}
  }

  let fbText = `${cardText}\n\n`;
  topPapers.forEach((p, idx) => {
    fbText += `*[ ${String(idx + 1).padStart(2, "0")} ]* ➔ 📑 *${p.name.substring(0, 42)}*\n`;
  });
  fbText += `\n⊱━━━• ✿ •━━━━• ✿ •━━━⊰\n> 💬 *Swipe & Reply this message with number to select...*`;

  const sentMsg = await sock.sendMessage(from, {
    image: { url: headerImg },
    caption: fbText,
    contextInfo: channelContextInfo(),
  }, { quoted: mek });

  pending.expectedMsgId = sentMsg.key.id;
  pending.step = "select_paper";
  pending.paperList = topPapers;
  pending.isProcessing = false;
  await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
}

// Direct PDF Downloader & Sender
async function sendPdfDocument(sock, mek, from, fileUrl, rawTitle, medium) {
  try {
    await sock.sendMessage(from, { react: { text: "📥", key: mek.key } });

    const cleanTitle = (rawTitle || "Document").replace(/[^\w\s.-]/gi, "").substring(0, 55).trim();

    let caption = `┏━━━◥◣◆◢◤━━━━┓\n★彡 *EDUCATION DOWNLOAD* 彡★\n┗━━━◢◤◆◥◣━━━━┛\n\n`;
    caption += `📑 *Document :* ${cleanTitle}\n`;
    caption += `🌐 *Medium :* ${medium} Medium\n`;
    caption += `📄 *Format :* Official PDF Document\n\n`;
    caption += `⊱━━━• ✿ •━━━• ✿ •━━━⊰\n\n> 🧬 ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗠𝗔𝗟𝗜𝗬𝗔-𝗠𝗗`;

    await sock.sendMessage(from, { react: { text: "⬆️", key: mek.key } });

    await sock.sendMessage(from, {
      document: { url: fileUrl },
      mimetype: "application/pdf",
      fileName: `MALIYA-MD ${cleanTitle} [${medium}].pdf`,
      caption: caption,
      contextInfo: channelContextInfo(),
    }, { quoted: mek });

    await sock.sendMessage(from, { react: { text: "✅", key: mek.key } });
  } catch (err) {
    console.error("PDF Download Error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: mek.key } });
    await sendErrorMsg(sock, from, mek, "Failed to download and send the PDF document.");
  }
}

if (Array.isArray(replyHandlers)) {
  replyHandlers.push(eduReplyHandler);
}

setInterval(() => {
  const now = Date.now();
  for (const k in pendingEdu) {
    if (now - pendingEdu[k].timestamp > SESSION_TIMEOUT) {
      delete pendingEdu[k];
    }
  }
  for (const k in lastProcessedMsg) {
    if (now - lastProcessedMsg[k].time > LOOP_COOLDOWN) {
      delete lastProcessedMsg[k];
    }
  }
}, 2.5 * 60 * 1000);

module.exports = {};
