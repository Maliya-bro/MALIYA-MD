const express = require("express");
const crypto = require("crypto");
const { readSettings, writeSettings } = require("../lib/botSettings");

const router = express.Router();

// Memory stores for OTPs and authenticated sessions
const otpStore = new Map();
const tokenStore = new Map();

// 1. Request OTP Code (Web එකෙන් phone number එක ගැහුවම වැඩ කරන තැන)
router.post("/request-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: "Phone number is required." });

  // 6-digit අහඹු කේතයක් හැදීම
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { code, expires: Date.now() + 5 * 60 * 1000 }); // විනාඩි 5ක් වලංගුයි

  let sent = false;

  // Bot ගේ active WhatsApp sessions හරහා අදාල අංකයට කේතය යැවීම
  if (global.__maliya_active_sessions) {
    for (const [sessionId, ctx] of global.__maliya_active_sessions.entries()) {
      if (ctx.connected && ctx.sock) {
        try {
          const targetJid = `${phone}@s.whatsapp.net`;
          await ctx.sock.sendMessage(targetJid, {
            text: `*⚙️ MALIYA-MD WEB SETTINGS*\n\n🔑 Your verification code is: *${code}*\n\n_Valid for 5 minutes. Do not share this code with anyone._`
          });
          sent = true;
          break; // එකපාරක් යැව්වම ඇති
        } catch (e) {
          console.log("⚠️ Failed to send OTP from session:", sessionId);
        }
      }
    }
  }

  if (!sent) {
    return res.status(500).json({ ok: false, error: "Bot is offline. Cannot send OTP via WhatsApp." });
  }

  res.json({ ok: true, phone, sessionId: phone });
});

// 2. Verify OTP Code (Web එකේ code එක ගැහුවම verify කරන තැන)
router.post("/verify-code", (req, res) => {
  const { sessionId: phone, code } = req.body;
  const record = otpStore.get(phone);

  if (!record || record.code !== code || Date.now() > record.expires) {
    return res.status(400).json({ ok: false, error: "Invalid or expired code." });
  }

  // Code එක හරි නම් token එකක් හදලා දෙනවා
  otpStore.delete(phone);
  const token = crypto.randomBytes(32).toString("hex");
  tokenStore.set(token, phone);

  res.json({ ok: true, token });
});

// Security Middleware: Request එක එන්නේ valid token එකකින්ද බලන්න
const verifyToken = (req, res, next) => {
  const token = req.headers["x-settings-token"];
  const phone = tokenStore.get(token);
  
  if (!token || !phone) {
    return res.status(401).json({ ok: false, error: "Unauthorized or session expired." });
  }
  
  req.phone = phone;
  req.settingsId = `PHONE::${phone}`;
  next();
};

// 3. Get Settings (Web එකට දැනට තියෙන settings යැවීම)
router.get("/", verifyToken, async (req, res) => {
  try {
    const settings = await readSettings(req.settingsId);
    res.json({ ok: true, settings, images: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 4. Save Settings (Web එකෙන් හදපු අලුත් settings Database එකට සේව් කිරීම)
router.post("/", verifyToken, async (req, res) => {
  try {
    const { settings } = req.body;
    if (settings) {
      const current = await readSettings(req.settingsId);
      const updated = { ...current, ...settings };
      await writeSettings(req.settingsId, updated);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
