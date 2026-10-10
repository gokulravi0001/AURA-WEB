const { readJson, writeJson } = require("../utils/jsonStore");
const { formatDuration } = require("../utils/helpers");

const AFK_FILE = "afk-data.json";

function getAfkStore() {
  return readJson(AFK_FILE, {});
}

function saveAfkStore(data) {
  writeJson(AFK_FILE, data);
}

function setAfk(guildId, userId, status) {
  const store = getAfkStore();
  if (!store[guildId]) store[guildId] = {};

  store[guildId][userId] = {
    status: status || "AFK",
    timestamp: Date.now(),
  };

  saveAfkStore(store);
  return store[guildId][userId];
}

function clearAfk(guildId, userId) {
  const store = getAfkStore();
  if (!store[guildId] || !store[guildId][userId]) return null;

  const previous = store[guildId][userId];
  delete store[guildId][userId];
  saveAfkStore(store);
  return previous;
}

function getAfk(guildId, userId) {
  const store = getAfkStore();
  return store[guildId]?.[userId] || null;
}

function registerAfkEvents(bot) {
  bot.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const authorId = message.author.id;

    // 1. Check if the message author was AFK. If so, welcome them back and remove AFK.
    const authorAfk = getAfk(guildId, authorId);
    if (authorAfk) {
      const elapsed = Date.now() - authorAfk.timestamp;
      // Allow a 5-second grace period after setting so the confirmation doesn't immediately clear it
      if (elapsed > 5000) {
        clearAfk(guildId, authorId);
        await message
          .reply({
            content: `👋 Welcome back, ${message.author}! I removed your AFK status (you were away for **${formatDuration(elapsed)}**).`,
          })
          .then((msg) => {
            setTimeout(() => msg.delete().catch(() => {}), 10000);
          })
          .catch(() => {});
      }
    }

    // 2. Check if any mentioned users are currently AFK
    if (message.mentions.users.size > 0) {
      const notifiedUsers = new Set();

      for (const [userId, user] of message.mentions.users) {
        if (userId === authorId || user.bot || notifiedUsers.has(userId)) continue;

        const targetAfk = getAfk(guildId, userId);
        if (targetAfk) {
          notifiedUsers.add(userId);
          const elapsed = Date.now() - targetAfk.timestamp;

          await message
            .reply({
              content: `💤 **${user.displayName || user.username}** is currently AFK: *${targetAfk.status}* (${formatDuration(elapsed)} ago)`,
              allowedMentions: { repliedUser: false },
            })
            .then((msg) => {
              setTimeout(() => msg.delete().catch(() => {}), 15000);
            })
            .catch(() => {});
        }
      }
    }
  });
}

module.exports = {
  setAfk,
  clearAfk,
  getAfk,
  registerAfkEvents,
};
