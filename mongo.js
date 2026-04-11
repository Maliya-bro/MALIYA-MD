const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "maliya_md";

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  cachedClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: 20,
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);

  console.log("✅ AutoMsg MongoDB connected");
  return cachedDb;
}

async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = {
  getDb,
  getCollection,
};
