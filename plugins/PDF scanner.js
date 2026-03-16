const axios = require("axios");
const pdf = require("pdf-parse");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { cmd } = require("../command");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

const MAX_TEXT_FOR_AI = 20000;
const MAX_MESSAGE_CHARS = 3500;
const PROCESSING_COOLDOWN_MS = 15000;

const recentlyProcessed = new Map();

let pdfjsGetDocument = null;

async function loadPdfJs() {
  if (!pdfjsGetDocument) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsGetDocument = pdfjs.getDocument;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function trimForAI(text = "", max = MAX_TEXT_FOR_AI) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[Text trimmed because PDF is too long]";
}

function splitText(text = "", max = MAX_MESSAGE_CHARS) {
  const chunks = [];
  let remaining = String(text || "").trim();

  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n", max);

    if (cut < Math.floor(max * 0.6)) {
      cut = remaining.lastIndexOf(" ", max);
    }

    if (cut < Math.floor(max * 0.6)) {
      cut = max;
    }

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendLongMessage(sock, jid, text, quoted) {
  const parts = splitText(text);
  for (const part of parts) {
    await sock.sendMessage(jid, { text: part }, { quoted });
    await sleep(250);
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadPdfBuffer(documentMessage) {
  const stream = await downloadContentFromMessage(documentMessage, "document");
  return await streamToBuffer(stream);
}

function getPdfMessage(message) {
  if (!message) return null;

  if (
    message.documentMessage &&
    message.documentMessage.mimetype === "application/pdf"
  ) {
    return message.documentMessage;
  }

  if (
    message.documentWithCaptionMessage?.message?.documentMessage &&
    message.documentWithCaptionMessage.message.documentMessage.mimetype ===
      "application/pdf"
  ) {
    return message.documentWithCaptionMessage.message.documentMessage;
  }

  const quoted =
    message.extendedTextMessage?.contextInfo?.quotedMessage ||
    message.imageMessage?.contextInfo?.quotedMessage ||
    message.videoMessage?.contextInfo?.quotedMessage;

  if (quoted?.documentMessage?.mimetype === "application/pdf") {
    return quoted.documentMessage;
  }

  if (
    quoted?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ===
    "application/pdf"
  ) {
    return quoted.documentWithCaptionMessage.message.documentMessage;
  }

  return null;
}

function looksLikeQuestionPaper(text = "") {
  const t = text.toLowerCase();

  const patterns = [
    /\bquestion\b/g,
    /\bquestions\b/g,
    /\banswer\b/g,
    /\banswers\b/g,
    /\bworksheet\b/g,
    /\bactivity\b/g,
    /\bexercise\b/g,
    /\bexam\b/g,
    /\btest\b/g,
    /\bmodel paper\b/g,
    /\bfill in the blanks\b/g,
    /\bchoose the correct answer\b/g,
    /\btrue or false\b/g,
    /\bmatch the following\b/g,
    /\bread and answer\b/g,
    /\bcomplete the table\b/g,
    /ප්‍රශ්න/g,
    /පිළිතුරු/g,
    /අභ්‍යාස/g,
    /වරණ/g,
    /வினா/g,
    /பதில்/g,
  ];

  let hits = 0;
  for (const p of patterns) {
    if (p.test(t)) hits++;
  }

  return hits >= 2;
}

function looksGarbled(text = "") {
  if (!text) return false;

  const weirdMatches =
    text.match(/[ƒ†‡…‰Š‹ŒŽ‘’“”•–—™›œžŸ÷×¤§©®±µ¶]/g) || [];
  const sinhalaMatches = text.match(/[\u0D80-\u0DFF]/g) || [];
  const tamilMatches = text.match(/[\u0B80-\u0BFF]/g) || [];
  const latinMatches = text.match(/[A-Za-z]/g) || [];

  const hasExamStyle =
    /(\d+\.)|(\(\d+\))|question|model|paper|ප්‍රශ්න|වරණ/i.test(text);

  return (
    weirdMatches.length > 10 ||
    (hasExamStyle &&
      sinhalaMatches.length < 5 &&
      tamilMatches.length < 5 &&
      latinMatches.length > 20)
  );
}

async function extractWithPdfJs(buffer) {
  await loadPdfJs();

  const loadingTask = pdfjsGetDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    fullText += pageText + "\n\n";
  }

  return {
    text: fullText.trim(),
    numpages: pdfDoc.numPages,
  };
}

async function callGemini(prompt) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await axios.post(
        url,
        {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 4096,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );

      const text =
        response.data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("\n")
          .trim() || "";

      if (text) return text;

      lastError = new Error(`Empty response from ${model}`);
    } catch (err) {
      console.log(`[PDF SCANNER] Model failed: ${model} -> ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function analyzePdf(fileName, pageCount, extractedText, garbled = false) {
  const cleanedSource = trimForAI(normalizeText(extractedText));
  const maybeQuestions = looksLikeQuestionPaper(cleanedSource);

  const prompt = `
You are a PDF study assistant.

A text-based PDF has been parsed. Images are intentionally ignored.
Your job is to analyze only the extracted text.

Rules:
- Detect the main language.
- Detect whether this is a question paper, worksheet, activity sheet, exercise, test, exam, or study questions.
- If it contains questions, answer them in the SAME language as the paper.
- If it is not a question paper, do not invent answers.
- Keep the cleaned extracted text neat and readable.
- Make the answer user-friendly for WhatsApp.
- If some text is broken because of PDF formatting, intelligently clean it.
- If extracted text appears garbled due to font encoding, try to reconstruct meaning as much as possible.
- This may be a Sinhala or Tamil school paper with broken font encoding.
- Do NOT say it is image-only unless text is completely unavailable.
- Do not mention markdown code fences.
- Return ONLY valid JSON.

Return exactly in this JSON format:
{
  "language": "English/Sinhala/Tamil/Mixed",
  "doc_type": "Question Paper or Normal PDF",
  "title": "short title",
  "intro": "short friendly intro",
  "cleaned_text": "cleaned text",
  "answers": "same-language answers or No questions detected.",
  "has_questions": true
}

File name: ${fileName}
Page count: ${pageCount}
Heuristic says likely question paper: ${maybeQuestions ? "YES" : "NO"}
Possible garbled font encoding: ${garbled ? "YES" : "NO"}

EXTRACTED TEXT:
${cleanedSource}
`;

  const raw = await callGemini(prompt);
  const parsed = safeJsonParse(raw);

  if (parsed) return parsed;

  return {
    language: "Unknown",
    doc_type: maybeQuestions ? "Question Paper" : "Normal PDF",
    title: fileName || "PDF Analysis",
    intro: "PDF analysis completed.",
    cleaned_text: cleanedSource,
    answers: maybeQuestions
      ? "Questions detected, but AI response format was invalid."
      : "No questions detected.",
    has_questions: maybeQuestions,
  };
}

function buildFinalText(fileName, pages, result) {
  const language = result.language || "Unknown";
  const docType = result.doc_type || "Normal PDF";
  const title = result.title || fileName || "PDF";
  const intro = result.intro || "PDF analysis completed.";
  const cleanedText = normalizeText(result.cleaned_text || "");
  const answers = normalizeText(result.answers || "");

  const hasRealAnswers =
    answers &&
    !/^no questions detected\.?$/i.test(answers) &&
    !/^no question detected\.?$/i.test(answers);

  let msg = "";
  msg += `📄 *PDF Scanner Result*\n\n`;
  msg += `📝 *File:* ${fileName}\n`;
  msg += `📚 *Title:* ${title}\n`;
  msg += `🌐 *Language:* ${language}\n`;
  msg += `📄 *Pages:* ${pages}\n`;
  msg += `📌 *Type:* ${docType}\n\n`;
  msg += `✨ ${intro}\n\n`;

  if (cleanedText) {
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `📖 *Cleaned Text*\n`;
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `${cleanedText}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━\n`;
  msg += `✅ *Answers / Output*\n`;
  msg += `━━━━━━━━━━━━━━\n`;
  msg += `${hasRealAnswers ? answers : "No questions detected."}`;

  return msg.trim();
}

async function processPdf(sock, mek, context = {}) {
  try {
    if (!GEMINI_API_KEY) return false;
    if (!mek?.message) return false;

    const pdfMessage = getPdfMessage(mek.message);
    if (!pdfMessage) return false;

    const from = context.from || mek.key?.remoteJid;
    if (!from) return false;

    const messageId = mek.key?.id || `${Date.now()}`;
    const uniqueKey = `${from}:${messageId}`;

    const now = Date.now();
    if (recentlyProcessed.has(uniqueKey)) return true;
    recentlyProcessed.set(uniqueKey, now);

    for (const [k, t] of recentlyProcessed.entries()) {
      if (now - t > PROCESSING_COOLDOWN_MS) {
        recentlyProcessed.delete(k);
      }
    }

    const fileName = pdfMessage.fileName || "document.pdf";
    const senderName =
      mek.pushName ||
      mek.key?.participant ||
      mek.key?.remoteJid ||
      "User";

    await sock.sendMessage(
      from,
      {
        text:
          `📄 *PDF detected!*\n\n` +
          `👤 *Sender:* ${senderName}\n` +
          `📎 *File:* ${fileName}\n\n` +
          `⏳ PDF එක scan කරලා text extract කරමින් ඉන්නවා...`,
      },
      { quoted: mek }
    );

    const pdfBuffer = await downloadPdfBuffer(pdfMessage);

    let parsedPdf = null;
    let extractorUsed = "pdf-parse";

    try {
      parsedPdf = await pdf(pdfBuffer);
    } catch (err) {
      console.log("pdf-parse failed, trying pdfjs-dist:", err?.message || err);

      try {
        parsedPdf = await extractWithPdfJs(pdfBuffer);
        extractorUsed = "pdfjs-dist";
      } catch (err2) {
        console.log("pdfjs-dist also failed:", err2?.message || err2);

        await sock.sendMessage(
          from,
          {
            text:
              `❌ *PDF parse කරන්න බැරි වුණා.*\n\n` +
              `මේ PDF එක normal text PDF එකක් නොවෙන්න පුළුවන්,\n` +
              `නැත්නම් PDF structure / font encoding issue එකක් තියෙන්න පුළුවන්.\n\n` +
              `⚠️ මෙක scanned image PDF එකක් කියලා sure නෑ.`,
          },
          { quoted: mek }
        );
        return true;
      }
    }

    const rawText = normalizeText(parsedPdf.text || "");
    const pageCount = parsedPdf.numpages || 0;

    if (!rawText || rawText.length < 20) {
      await sock.sendMessage(
        from,
        {
          text:
            `⚠️ *Text extract වුණේ නෑ.*\n\n` +
            `මේ PDF එකේ selectable text නැති වෙන්න පුළුවන්\n` +
            `හෝ text layer එක damaged වෙලා තියෙන්න පුළුවන්.`,
        },
        { quoted: mek }
      );
      return true;
    }

    const garbled = looksGarbled(rawText);

    if (garbled) {
      await sock.sendMessage(
        from,
        {
          text:
            `⚠️ *PDF text extract වුණා, හැබැයි font / encoding issue එකක් තියෙනවා.*\n\n` +
            `මේක scanned image PDF එකක් කියලා නෙමෙයි.\n` +
            `📦 Extractor: ${extractorUsed}\n` +
            `🤖 AI එකෙන් possible නම් text එක reconstruct කරලා answers/summary හදන්න try කරනවා...`,
        },
        { quoted: mek }
      );
    }

    const result = await analyzePdf(fileName, pageCount, rawText, garbled);
    const finalText = buildFinalText(fileName, pageCount, result);

    await sendLongMessage(sock, from, finalText, mek);

    await sock.sendMessage(
      from,
      {
        document: pdfBuffer,
        mimetype: "application/pdf",
        fileName,
        caption:
          `📎 *Original PDF*\n` +
          `🌐 Language: ${result.language || "Unknown"}\n` +
          `📌 Type: ${result.doc_type || "Normal PDF"}`,
      },
      { quoted: mek }
    );

    return true;
  } catch (err) {
    console.log("PDF scanner error:", err?.message || err);

    try {
      await sock.sendMessage(
        context.from || mek.key.remoteJid,
        {
          text:
            `❌ *PDF Scanner Error*\n\n` +
            `Reason: ${err.message || "Unknown error"}`,
        },
        { quoted: mek }
      );
    } catch {}

    return true;
  }
}

/* ================= COMMAND ================= */

cmd(
  {
    pattern: "pdfscan",
    alias: ["pdfai", "autopdf"],
    react: "📄",
    desc: "Check PDF scanner plugin status",
    category: "utility",
    filename: __filename,
  },
  async (sock, mek, m, { reply }) => {
    await reply(
      `✅ *PDF Scanner Active*\n\n` +
        `• PDF auto detect කරනවා\n` +
        `• pdf-parse + pdfjs-dist fallback use කරනවා\n` +
        `• font/encoding issue detect කරනවා\n` +
        `• question paper නම් same language එකෙන් answer දෙනවා\n` +
        `• original PDF එකත් ආපහු send කරනවා`
    );
  }
);

/* ================= AUTO LISTENER ================= */

module.exports = {
  onMessage: async (sock, mek, m, context) => {
    const body = String(context?.body || "");
    const isCmd = !!context?.isCmd;

    if (isCmd && body.startsWith(".")) return false;

    return await processPdf(sock, mek, context);
  },
};
