// =============================================================================
// AURA CENTRAL DATABASE CONNECTOR (MONGODB ATLAS + HYBRID LOCAL SYNC)
// Designed for Bot Hosting (Bot) + Render (Dashboard) cross-environment sync
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");

const dataFolder = path.join(__dirname, "..", "data");
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || "";

let client = null;
let db = null;
let collection = null;
let isConnected = false;
let syncInterval = null;

// In-memory hot cache for instant synchronous reads
const memoryCache = new Map();
const lastLocalWriteTime = new Map();

// All tracked data files
const TRACKED_FILES = [
  "announcements.json",
  "birthdays.json",
  "command-settings.json",
  "counting-data.json",
  "events.json",
  "greeting-settings.json",
  "invite-data.json",
  "invite-settings.json",
  "level-data.json",
  "media-fixer-settings.json",
  "member-avatars.json",
  "mod-data.json",
  "reaction-roles.json",
  "reminders.json",
  "rules.json",
  "security-data.json",
  "serverstats-data.json",
  "social-data.json",
  "stats-history.json",
  "sticky-messages.json",
  "suggestion-settings.json",
  "temp-voice-data.json",
  "thread-settings.json",
  "ticket-settings.json",
  "voice-time.json",
  "word-building-data.json",
];

function readLocalFile(fileName, fallback) {
  const filePath = path.join(dataFolder, fileName);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function writeLocalFile(fileName, data) {
  try {
    fs.mkdirSync(dataFolder, { recursive: true });
    const filePath = path.join(dataFolder, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Could not write local file ${fileName}:`, err.message);
  }
}

// Initial populate of memory cache from local disk
for (const file of TRACKED_FILES) {
  memoryCache.set(file, readLocalFile(file, null));
}

async function initDatabase() {
  if (!MONGODB_URI || !MONGODB_URI.startsWith("mongodb")) {
    console.log("ℹ️ MONGODB_URI not detected - AURA operating in Local JSON mode.");
    console.log("👉 Tip: Set MONGODB_URI in Bot Host & Render to synchronize them across the cloud!");
    return false;
  }

  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    db = client.db();
    collection = db.collection("aura_store");
    isConnected = true;

    console.log(`🔥 Central Database Connected: MongoDB [${db.databaseName}]`);

    // 1. Download existing data from MongoDB to local disk & cache
    await pullAllFromDb();

    // 2. Upload any local files that don't yet exist in MongoDB
    await seedMissingToDb();

    // 3. Start background periodic sync every 15 seconds to pull changes made from Render
    if (!syncInterval) {
      syncInterval = setInterval(() => {
        pullAllFromDb().catch(() => {});
      }, 15000);
      if (typeof syncInterval.unref === "function") syncInterval.unref();
    }

    return true;
  } catch (err) {
    console.error("⚠️ Central Database connection failed, falling back to local storage:", err.message);
    if (err.message.includes("SSL alert number 80") || err.message.includes("tlsv1 alert")) {
      console.warn("👉 Quick Fix: In MongoDB Atlas -> Network Access (left menu), add '0.0.0.0/0' (Allow access from anywhere).");
    }
    isConnected = false;
    return false;
  }
}

async function pullAllFromDb() {
  if (!isConnected || !collection) return;
  try {
    const docs = await collection.find({}).toArray();
    for (const doc of docs) {
      if (doc._id && doc.data !== undefined) {
        const localTime = lastLocalWriteTime.get(doc._id) || 0;
        const docTime = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;

        // If cloud data is newer than local write, accept cloud changes
        if (docTime > localTime || !localTime) {
          memoryCache.set(doc._id, doc.data);
          writeLocalFile(doc._id, doc.data);
          lastLocalWriteTime.set(doc._id, docTime || Date.now());
        } else if (localTime > docTime) {
          // Local changes are newer, sync back to cloud
          const current = getData(doc._id, null);
          if (current !== null) {
            collection
              .updateOne(
                { _id: doc._id },
                { $set: { data: current, updatedAt: new Date(localTime) } },
                { upsert: true }
              )
              .catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("Database pull error:", err.message);
  }
}

async function seedMissingToDb() {
  if (!isConnected || !collection) return;
  try {
    for (const file of TRACKED_FILES) {
      const localData = readLocalFile(file, null);
      if (localData !== null) {
        const existing = await collection.findOne({ _id: file });
        if (!existing) {
          await collection.updateOne(
            { _id: file },
            { $set: { data: localData, updatedAt: new Date() } },
            { upsert: true }
          );
        }
      }
    }
  } catch (err) {
    console.error("Database seed error:", err.message);
  }
}

function getData(fileName, fallback) {
  if (memoryCache.has(fileName) && memoryCache.get(fileName) !== null) {
    return memoryCache.get(fileName);
  }

  const local = readLocalFile(fileName, fallback);
  memoryCache.set(fileName, local);
  return local;
}

function setData(fileName, data) {
  const now = Date.now();
  lastLocalWriteTime.set(fileName, now);
  memoryCache.set(fileName, data);
  writeLocalFile(fileName, data);

  // Asynchronously sync to MongoDB if connected
  if (isConnected && collection) {
    collection
      .updateOne(
        { _id: fileName },
        { $set: { data, updatedAt: new Date(now) } },
        { upsert: true }
      )
      .catch((err) => {
        console.error(`Database write error for ${fileName}:`, err.message);
      });
  }
}

function isDbConnected() {
  return isConnected;
}

module.exports = {
  initDatabase,
  getData,
  setData,
  isDbConnected,
  pullAllFromDb,
};
