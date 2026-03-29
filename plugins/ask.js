const { cmd } = require("../command");
const axios = require("axios");

// ✅ Read key from GitHub Actions secret/env (DO NOT hardcode)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) console.error("GEMINI_API_KEY is not set");

// =========================
// ✅ Model candidates (try in order)
// =========================
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

// =========================
// 🧠 Ask Prompt builder
// =========================
function buildAskPrompt(question) {
  return `
You are a helpful assistant.
Answer the user's question directly and clearly.

Rules:
- Reply in the SAME language the user used.
- Give a short, correct answer first.
- If needed, add brief bullet points or steps.
- Do NOT write an essay.
- If the question is unclear, ask ONE short follow-up question.

User question:
${question}
`.trim();
}

// =========================
// 🤖 Gemini generateContent with model fallback
// Uses x-goog-api-key header
// =========================
async function generateAnswer(prompt) {
  if (!API_KEY) {
    throw new Error("Missing GEMINI_API_KEY (set it in GitHub Actions Secrets and workflow env)");
  }

  let lastErr = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
          },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 2) return out;

      lastErr = new Error("Empty response from Gemini");
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;

      // If model not found, try next model
      if (status === 404) continue;

      // Other errors -> stop (quota, permission, etc.)
      break;
    }
  }

  throw lastErr || new Error("Unknown Gemini error");
}

// =========================
// .dechelp (debug) - list models
// =========================
cmd(
  {
    pattern: "dechelp",
    desc: "List available Gemini models (first 30)",
    category: "AI",
    react: "📜",
    filename: __filename,
  },
  async (conn, mek, m, { from, reply }) => {
    try {
      if (!API_KEY) return reply("GEMINI_API_KEY is not set.");

      const url = "https://generativelanguage.googleapis.com/v1beta/models";
      const res = await axios.get(url, {
        timeout: 30000,
        headers: { "x-goog-api-key": API_KEY },
      });

      const names = (res?.data?.models || []).map((x) => x.name).slice(0, 30);
      if (!names.length) return reply("No models returned by the API.");

      return reply("Available models (first 30):\n\n" + names.join("\n"));
    } catch (e) {
      console.error("GEMODELS ERROR:", e?.response?.status, e?.response?.data || e?.message || e);
      reply("Failed to list models.");
    }
  }
);

// =========================
// ✅ .ask command (Q&A)
// =========================
cmd(
  {
    pattern: "ask",
    desc: "Answer a question (Gemini)",
    category: "AI",
    react: "💡",
    filename: __filename,
  },
  async (conn, mek, m, { from, q, reply }) => {
    try {
      if (!API_KEY) return reply("GEMINI_API_KEY is not set.");
      if (!q) return reply("Usage:\n.ask <your question>");

      await reply("Thinking... 💭");

      const answer = await generateAnswer(buildAskPrompt(q));
      const text = `💡 Answer\n\nQ: ${q}\n\n${answer}`;

      await conn.sendMessage(from, { text }, { quoted: mek });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      console.error("GEMINI ERROR STATUS:", status);
      console.error("GEMINI ERROR:", data || err?.message || err);

      if (status === 403) return reply("Gemini permission denied (check key/quota).");
      if (status === 429) return reply("Gemini rate limit exceeded. Try again later.");
      if (status === 404) return reply("Models not found. Run .dechelp and try again.");

      reply("Failed to answer. Please try again later.");
    }
  }
);
