const { cmd } = require("../command");
const { Client } = require("@gradio/client");

const HF_SPACE = "yuntian-deng/ChatGPT";

// 🧠 Active Gemini chats (KEYED BY SENDER — IMPORTANT)
const geminiSession = {};

/* ==========================
   🤖 GEMINI COMMAND
========================== */
cmd({
  pattern: "gemini",
  react: "🤖",
  desc: "Conversational Gemini AI",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("📎 Use `.gemini <message>`");

    const text = q.toLowerCase();

    // 🛑 STOP CHAT
    if (text === "stop") {
      if (geminiSession[sender]) geminiSession[sender].active = false;
      return reply("🛑 Gemini chat stopped.");
    }

    // 🧹 RESET CHAT
    if (text === "reset") {
      delete geminiSession[sender];
      return reply("🧹 Gemini memory cleared.");
    }

    await reply("🤖 Thinking...");

    let session = geminiSession[sender];

    // 🔐 Create new session
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});

      session = {
        client,
        chatbot: [],
        counter: 0,
        active: true,
        timestamp: Date.now()
      };

      geminiSession[sender] = session;
    } else {
      session.active = true;
    }

    await runGemini(session, q, maliya, from, mek);

  } catch (e) {
    console.error("Gemini command error:", e);
    reply("❌ Gemini error occurred.");
  }
});

/* ==========================
   💬 AUTO CHAT HANDLER
========================== */
cmd({
  filter: (text, { sender }) => {
    const session = geminiSession[sender];

    if (!session) return false;          // no session
    if (!session.active) return false;   // stopped
    if (!text || !text.trim()) return false;
    if (text.startsWith(".")) return false; // ignore commands

    return true;
  }
}, async (maliya, mek, m, { body, sender, from, reply }) => {
  try {
    const session = geminiSession[sender];
    if (!session) return;

    session.timestamp = Date.now();

    await reply("🤖 Thinking...");

    await runGemini(session, body, maliya, from, mek);

  } catch (e) {
    console.error("Gemini auto-chat error:", e);
  }
});

/* ==========================
   🧠 GEMINI CORE LOGIC
========================== */
async function runGemini(session, q, maliya, from, mek) {
  const result = await session.client.predict("/predict", {
    inputs: q,
    top_p: 1,
    temperature: 1,
    chat_counter: session.counter,
    chatbot: session.chatbot,
  });

  const data = result.data;
  let aiReply = "🤖 I couldn't generate a reply.";

  if (Array.isArray(data[0]) && data[0].length > 0) {
    const last = data[0][data[0].length - 1];
    if (Array.isArray(last) && typeof last[1] === "string") {
      aiReply = last[1];
    }
  }

  session.chatbot.push([q, aiReply]);
  session.counter = session.chatbot.length;

  if (session.chatbot.length > 10) {
    session.chatbot.shift();
    session.counter--;
  }

  await maliya.sendMessage(from, { text: aiReply }, { quoted: mek });
}

/* ==========================
   🧹 AUTO CLEANUP (OPTIONAL)
========================== */
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 min
  for (const s in geminiSession) {
    if (now - geminiSession[s].timestamp > timeout) {
      delete geminiSession[s];
    }
  }
}, 60 * 1000);


/* ==========================
   💻 CODE COMMAND
========================== */
cmd({
  pattern: "code2",
  react: "💻",
  desc: "AI programming assistant",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("💻 Use `.code <programming question>`");

    await reply("💻 Coding...");

    // Get or create Gemini session
    let session = geminiSession[sender];
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});
      session = { client, chatbot: [], counter: 0, active: true, timestamp: Date.now() };
      geminiSession[sender] = session;
    }

    // Prevent auto-chat interference
    session.active = false;
    session.timestamp = Date.now();

    const prompt = `
You are a professional software engineer.
Explain clearly with examples.
If code is needed, format it properly.

Question:
${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Code AI error:", e);
    reply("❌ Code AI error occurred.");
  }
});

/* ==========================
   📝 SUMMARIZE COMMAND
========================== */
cmd({
  pattern: "summarize",
  react: "📝",
  desc: "Summarize text using AI",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("📝 Use `.summarize <text>`");

    await reply("📝 Summarizing...");

    let session = geminiSession[sender];

    // create session if not exists
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});

      session = {
        client,
        chatbot: [],
        counter: 0,
        active: true,
        timestamp: Date.now()
      };

      geminiSession[sender] = session;
    }

    session.active = false; // prevent auto-chat trigger
    session.timestamp = Date.now();

    const prompt = `
Summarize the following text clearly.
Use short paragraphs or bullet points.
Keep important details.

Text:
${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Summarize AI error:", e);
    reply("❌ Summarize error occurred.");
  }
});

/* ==========================
   📚 EXPLAIN COMMAND
========================== */
cmd({
  pattern: "explain",
  react: "📖",
  desc: "Explain concept in student-friendly way",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("📖 Use `.explain <topic>`");

    await reply("📖 Explaining...");

    let session = geminiSession[sender];
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});
      session = { client, chatbot: [], counter: 0, active: true, timestamp: Date.now() };
      geminiSession[sender] = session;
    }

    session.active = false;
    session.timestamp = Date.now();

    const prompt = `
Explain this concept in a simple, student-friendly way:
${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Explain AI error:", e);
    reply("❌ Explain error occurred.");
  }
});


/* ==========================
   🐞 BUGFIX COMMAND
========================== */
cmd({
  pattern: "bugfix",
  react: "🐞",
  desc: "Paste code and get a fix",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("🐞 Use `.bugfix <code snippet>`");

    await reply("🐞 Fixing code...");

    let session = geminiSession[sender];
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});
      session = { client, chatbot: [], counter: 0, active: true, timestamp: Date.now() };
      geminiSession[sender] = session;
    }

    session.active = false;
    session.timestamp = Date.now();

    const prompt = `
The following code has errors. Provide a corrected version and explain changes:

${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Bugfix AI error:", e);
    reply("❌ Bugfix error occurred.");
  }
});


/* ==========================
   ⚡ OPTIMIZE COMMAND
========================== */
cmd({
  pattern: "optimize",
  react: "⚡",
  desc: "Improve code performance / style",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("⚡ Use `.optimize <code snippet>`");

    await reply("⚡ Optimizing code...");

    let session = geminiSession[sender];
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});
      session = { client, chatbot: [], counter: 0, active: true, timestamp: Date.now() };
      geminiSession[sender] = session;
    }

    session.active = false;
    session.timestamp = Date.now();

    const prompt = `
Optimize this code for performance, readability, and best practices:

${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Optimize AI error:", e);
    reply("❌ Optimize error occurred.");
  }
});


/* ==========================
   ✍️ ESSAY COMMAND
========================== */
cmd({
  pattern: "essay",
  react: "✍️",
  desc: "Generate essay on a topic",
  category: "ai",
  filename: __filename
}, async (maliya, mek, m, { from, q, sender, reply }) => {
  try {
    if (!q) return reply("✍️ Use `.essay <topic>`");

    await reply("✍️ Writing essay...");

    let session = geminiSession[sender];
    if (!session) {
      const client = await Client.connect(HF_SPACE);
      await client.predict("/enable_inputs", {});
      session = { client, chatbot: [], counter: 0, active: true, timestamp: Date.now() };
      geminiSession[sender] = session;
    }

    session.active = false;
    session.timestamp = Date.now();

    const prompt = `
Write a detailed essay on the following topic:
${q}
`;

    await runGemini(session, prompt, maliya, from, mek);

  } catch (e) {
    console.error("Essay AI error:", e);
    reply("❌ Essay error occurred.");
  }
});
