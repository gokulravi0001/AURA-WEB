// =============================================================================
// AURA WEB CENTRAL DATABASE CONNECTOR (MONGODB ATLAS + RENDER SYNC)
// Directly connects Render Web Service with Bot Hosting via cloud database
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");

// Priority locations for local data fallback
const botDataDirPrimary = path.join(__dirname, "..", "aura-bot", "data");
const botDataDirFallback = path.join(__dirname, "data");

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || "";

let client = null;
let db = null;
let collection = null;
let isConnected = false;

// Hot memory cache for ultrafast dashboard responses
const memoryCache = new Map();

function getLocalDataDir() {
  if (fs.existsSync(botDataDirPrimary)) return botDataDirPrimary;
  return botDataDirFallback;
}

function readLocalFile(fileName, fallback) {
  const targetDir = getLocalDataDir();
  const filePath = path.join(targetDir, fileName);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeLocalFile(fileName, data) {
  const targetDir = getLocalDataDir();
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    // Non-fatal on read-only/ephemeral filesystems
  }
}

async function initDatabase() {
  if (!MONGODB_URI || !MONGODB_URI.startsWith("mongodb")) {
    console.log("ℹ️ MONGODB_URI not set on Render. Operating in Local Data mode.");
    console.log("👉 Tip: Add MONGODB_URI environment variable on Render to synchronize live with your Bot Host!");
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

    console.log(`🔥 Central Database Connected on Render: MongoDB [${db.databaseName}]`);

function mergeWithLocal(fileName, cloudData, localData) {
  if (!localData) return cloudData;
  if (!cloudData) return localData;

  if (fileName === "birthdays.json") {
    const merged = {
      settings: { ...(cloudData.settings || {}), ...(localData.settings || {}) },
      birthdays: {},
    };
    const guilds = new Set([
      ...Object.keys(cloudData.birthdays || {}),
      ...Object.keys(localData.birthdays || {}),
    ]);
    for (const g of guilds) {
      merged.birthdays[g] = {
        ...(cloudData.birthdays?.[g] || {}),
        ...(localData.birthdays?.[g] || {}),
      };
    }
    return merged;
  }

  if (fileName === "level-data.json") {
    const merged = {
      settings: { ...(cloudData.settings || {}), ...(localData.settings || {}) },
      users: {},
    };
    const guilds = new Set([
      ...Object.keys(cloudData.users || {}),
      ...Object.keys(localData.users || {}),
    ]);
    for (const g of guilds) {
      merged.users[g] = {
        ...(cloudData.users?.[g] || {}),
        ...(localData.users?.[g] || {}),
      };
    }
    return merged;
  }

  return cloudData !== undefined ? cloudData : localData;
}

    // Preload docs from MongoDB into cache
    const docs = await collection.find({}).toArray();
    for (const doc of docs) {
      if (doc._id && doc.data !== undefined) {
        const local = readLocalFile(doc._id, null);
        const merged = mergeWithLocal(doc._id, doc.data, local);
        memoryCache.set(doc._id, merged);
      }
    }

    return true;
  } catch (err) {
    console.error("⚠️ Central Database connection failed on Render, using local storage:", err.message);
    isConnected = false;
    return false;
  }
}

function readBotData(fileName, fallback) {
  if (memoryCache.has(fileName) && memoryCache.get(fileName) !== null) {
    return memoryCache.get(fileName);
  }

  const local = readLocalFile(fileName, fallback);
  memoryCache.set(fileName, local);
  return local;
}

function writeBotData(fileName, data) {
  memoryCache.set(fileName, data);
  writeLocalFile(fileName, data);

  if (isConnected && collection) {
    collection
      .updateOne(
        { _id: fileName },
        { $set: { data, updatedAt: new Date() } },
        { upsert: true }
      )
      .catch((err) => {
        console.error(`MongoDB write error for ${fileName}:`, err.message);
      });
  }
}

function getDbStatus() {
  return {
    connected: isConnected,
    type: isConnected ? "MongoDB Atlas (Cloud Sync Active)" : "Local Storage",
    uriConfigured: Boolean(MONGODB_URI),
    hostEnvironment: process.env.RENDER ? "Render" : "Local / Custom",
  };
}

module.exports = {
  initDatabase,
  readBotData,
  writeBotData,
  getDbStatus,
  isDbConnected: () => isConnected,
};
