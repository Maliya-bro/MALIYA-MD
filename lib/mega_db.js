const { Storage } = require("megajs");
const fs = require("fs");
const path = require("path");

// 🔥 PUT YOUR MEGA ACCOUNT HERE
const email = "sithmikavihara801@gmail.com";
const password = "@@@iron.spider*man";

const DATA_DIR = path.join(__dirname, "../data");
const LOCAL_DB = path.join(DATA_DIR, "mega_db.json");

let mega = null;
let uploading = false;

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

// CREATE FILE
function ensureDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(LOCAL_DB)) {
    fs.writeFileSync(
      LOCAL_DB,
      JSON.stringify({ users: {}, messages: [] }, null, 2)
    );
  }
}

// READ
function readDB() {
  try {
    ensureDB();
    return JSON.parse(fs.readFileSync(LOCAL_DB));
  } catch {
    return { users: {}, messages: [] };
  }
}

// SAVE
function saveDB(data) {
  ensureDB();
  fs.writeFileSync(LOCAL_DB, JSON.stringify(data, null, 2));
}

// SAVE KEY
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

// SAVE MESSAGE
async function saveMessage(jid, text, reply) {
  const db = readDB();

  db.messages.push({
    jid,
    text,
    reply,
    ts: Date.now(),
  });

  if (db.messages.length > 1500) {
    db.messages.splice(0, db.messages.length - 1500);
  }

  saveDB(db);

  if (!uploading) {
    uploading = true;
    setTimeout(async () => {
      await uploadToMega();
      uploading = false;
    }, 5000);
  }
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

  try {
    const fileData = fs.readFileSync(LOCAL_DB);

    // delete old
    mega.root.children.forEach((f) => {
      if (f.name === "maliya_db.json") {
        f.delete(true);
      }
    });

    const up = mega.root.upload({
      name: "maliya_db.json",
    });

    up.end(fileData);

    console.log("☁️ Uploaded to MEGA");
  } catch (e) {
    console.log("MEGA upload error:", e.message);
  }
}

// LOAD
async function loadFromMega() {
  if (!mega) return;

  return new Promise((resolve) => {
    let found = false;

    mega.root.children.forEach((f) => {
      if (f.name === "maliya_db.json") {
        found = true;

        const stream = f.download();
        const write = fs.createWriteStream(LOCAL_DB);

        stream.pipe(write);

        write.on("finish", () => {
          console.log("☁️ DB loaded from MEGA");
          resolve();
        });
      }
    });

    if (!found) {
      ensureDB();
      resolve();
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
