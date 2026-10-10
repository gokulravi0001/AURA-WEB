const fs = require("node:fs");
const path = require("node:path");

const historyFile = path.join(__dirname, "..", "data", "stats-history.json");
const levelsFile = path.join(__dirname, "..", "data", "level-data.json");

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${path.basename(filePath)}:`, error);
    return fallback;
  }
}

function writeHistory(data) {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
}

function getUserXpHistory(guildId, userId) {
  const history = readJson(historyFile, {});
  return history[guildId]?.users?.[userId] || [];
}

function recordDailyXp(client) {
  const levelData = readJson(levelsFile, { users: {} });
  const history = readJson(historyFile, {});
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;

  for (const guild of client.guilds.cache.values()) {
    const guildUsers = levelData.users?.[guild.id] || {};

    history[guild.id] ||= { users: {} };
    history[guild.id].users ||= {};

    for (const [userId, stats] of Object.entries(guildUsers)) {
      const points = (history[guild.id].users[userId] ||= []);
      const xp = Number(stats.xp) || 0;
      const lastPoint = points[points.length - 1];

      if (lastPoint?.date === today) {
        lastPoint.xp = xp;
      } else {
        points.push({ date: today, xp });
      }

      // Keep the latest 30 daily points.
      if (points.length > 30) {
        points.splice(0, points.length - 30);
      }

      changed = true;
    }
  }

  if (changed) writeHistory(history);
}

function registerStatsHistoryTracking(client) {
  client.once("clientReady", () => {
    recordDailyXp(client);

    const timer = setInterval(() => {
      recordDailyXp(client);
    }, 60 * 60 * 1000);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

module.exports = {
  getUserXpHistory,
  registerStatsHistoryTracking,
};