const { Storage } = require("megajs");
const fs = require("fs");
const path = require("path");

const LOCAL_DB = path.join(__dirname, "../data/mega_db.json");

// ⚠️ CHANGE THIS
const email = process.env.MEGA_EMAIL;
const password = process.env.MEGA_PASS;

let mega = null;

// INIT
async function initMega() {
  return new Promise((resolve, reject) => {
    mega = new Storage({ email, password }, (err) => {
      if (err) return reject(err);
      console.log("✅ MEGA connected");
      resolve();
    });
  });
}

// READ
function readDB() {
  if (!fs.existsSync(LOCAL_DB)) return { users: {}, messages: [] };
  return JSON.parse(fs.readFileSync(LOCAL_DB));
}

// SAVE
function saveDB(data) {
  fs.writeFileSync(LOCAL_DB, JSON.stringify(data, null, 2));
}

// SAVE KEY (WITH PHONE)
async function saveUserKey(jid, key) {
  const db = readDB();

  db.users[jid] = {
    key,
    jid,
    updated: Date.now(),
  };

  saveDB(db);
  await uploadToMega();
}

// GET KEY
function getUserKey(jid) {
  const db = readDB();
  return db.users[jid]?.key || null;
}

// SAVE MSG
async function saveMessage(jid, text, reply) {
  const db = readDB();

  db.messages.push({
    jid,
    text,
    reply,
    ts: Date.now(),
  });

  if (db.messages.length > 2000) db.messages.shift();

  saveDB(db);
  await uploadToMega();
}

// CACHE
function findCached(jid, text) {
  const db = readDB();

  for (let i = db.messages.length - 1; i >= 0; i--) {
    const m = db.messages[i];
    if (m.jid === jid && m.text === text) {
      return m.reply;
    }
  }
  return null;
}

// UPLOAD
async function uploadToMega() {
  if (!mega) return;

  const file = fs.readFileSync(LOCAL_DB);

  const up = mega.root.upload({
    name: "maliya_db.json",
  });

  up.end(file);
}

// LOAD
async function loadFromMega() {
  if (!mega) return;

  mega.root.children.forEach((f) => {
    if (f.name === "maliya_db.json") {
      const file = fs.createWriteStream(LOCAL_DB);
      f.download().pipe(file);
    }
  });
}

module.exports = {
  initMega,
  loadFromMega,
  saveUserKey,
  getUserKey,
  saveMessage,
  findCached,
};
