const express = require("express");
const crypto = require("crypto");
// ✅ Image functions ටිකත් මෙතනට import කරගත්තා
const { 
  readSettings, 
  writeSettings, 
  setCustomImage, 
  deleteCustomImage, 
  listCustomImages 
} = require("../lib/botSettings");

const router = express.Router();
const otpStore = new Map();
const tokenStore = new Map();

// 1. Request OTP Code
router.post("/request-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: "Phone number is required." });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { code, expires: Date.now() + 5 * 60 * 1000 });

  let sent = false;

  if (global.__maliya_active_sessions) {
    for (const [sessionId, ctx] of global.__maliya_active_sessions.entries()) {
      // ✅ හරියටම අදාල අංකය තියෙන Bot ව හොයාගන්නවා
      const sessionPhone = ctx.ownerNumber?.[0] || "";
      if (ctx.connected && ctx.sock && sessionPhone === phone) {
        try {
          const targetJid = `${phone}@s.whatsapp.net`;
          await ctx.sock.sendMessage(targetJid, {
            text: `*⚙️ MALIYA-MD WEB SETTINGS*\n\n🔑 Your verification code is: *${code}*\n\n_Valid for 5 minutes. Do not share this code with anyone._`
          });
          sent = true;
          break; // හරි කෙනාව හම්බුනාම නවත්තනවා
        } catch (e) {
          console.log("⚠️ Failed to send OTP from session:", sessionId);
        }
      }
    }
  }

  if (!sent) {
    return res.status(500).json({ ok: false, error: "ඔයාගේ Bot මේ වෙලාවේ Offline. කරුණාකර Bot ව connect කරලා නැවත උත්සාහ කරන්න." });
  }
  res.json({ ok: true, phone, sessionId: phone });
});

// 2. Verify OTP Code
router.post("/verify-code", (req, res) => {
  const { sessionId: phone, code } = req.body;
  const record = otpStore.get(phone);

  if (!record || record.code !== code || Date.now() > record.expires) {
    return res.status(400).json({ ok: false, error: "Invalid or expired code." });
  }

  otpStore.delete(phone);
  const token = crypto.randomBytes(32).toString("hex");
  tokenStore.set(token, phone);
  res.json({ ok: true, token });
});

// Security Middleware
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

// 3. Get Settings & Images
router.get("/", verifyToken, async (req, res) => {
  try {
    const settings = await readSettings(req.settingsId);
    const imagesList = await listCustomImages(req.settingsId); // Database එකෙන් images ගන්නවා
    res.json({ ok: true, settings, images: imagesList || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 4. Save Settings OR Upload Image
router.post("/", verifyToken, async (req, res) => {
  try {
    const { settings, images } = req.body;
    
    // Text Settings ටික Save කිරීම
    if (settings) {
      const current = await readSettings(req.settingsId);
      const updated = { ...current, ...settings };
      await writeSettings(req.settingsId, updated);
    }

    // Images Upload කිරීම
    if (images) {
      for (const [key, dataUrl] of Object.entries(images)) {
         await setCustomImage(req.settingsId, key, dataUrl);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 5. Delete Image Endpoint (අර Error එක එන්න හේතුව මේක නොතිබුණ නිසයි)
router.delete("/image/:key", verifyToken, async (req, res) => {
  try {
    const { key } = req.params;
    await deleteCustomImage(req.settingsId, key);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
