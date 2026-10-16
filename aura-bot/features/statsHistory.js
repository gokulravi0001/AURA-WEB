const { readJson, writeJson } = require("../utils/jsonStore");

function getUserXpHistory(guildId, userId) {
  const history = readJson("stats-history.json", {});
  return history[guildId]?.users?.[userId] || [];
}

function recordDailyXp(client) {
  const levelData = readJson("level-data.json", { users: {} });
  const history = readJson("stats-history.json", {});
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

  if (changed) writeJson("stats-history.json", history);
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