const { EmbedBuilder } = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel } = require("../utils/helpers");

const MOD_FILE = "mod-data.json";

function getModStore() {
  return readJson(MOD_FILE, {});
}

function saveModStore(data) {
  writeJson(MOD_FILE, data);
}

function addWarning(guildId, userId, moderatorId, reason) {
  const store = getModStore();
  if (!store[guildId]) store[guildId] = {};
  if (!store[guildId].warnings) store[guildId].warnings = {};
  if (!store[guildId].warnings[userId]) store[guildId].warnings[userId] = [];

  const warning = {
    id: `warn_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    moderatorId,
    reason: reason || "No reason specified",
    timestamp: Date.now(),
  };

  store[guildId].warnings[userId].push(warning);
  saveModStore(store);
  return warning;
}

function getWarnings(guildId, userId) {
  const store = getModStore();
  return store[guildId]?.warnings?.[userId] || [];
}

function clearWarnings(guildId, userId) {
  const store = getModStore();
  if (!store[guildId]?.warnings?.[userId]) return 0;

  const count = store[guildId].warnings[userId].length;
  delete store[guildId].warnings[userId];
  saveModStore(store);
  return count;
}

function setModLogChannel(guildId, channelId) {
  const store = getModStore();
  if (!store[guildId]) store[guildId] = {};
  store[guildId].logChannelId = channelId;
  saveModStore(store);
  return channelId;
}

function getModLogChannel(guildId) {
  const store = getModStore();
  return store[guildId]?.logChannelId || null;
}

async function sendModLog(guild, embed) {
  const channelId = getModLogChannel(guild.id);
  if (!channelId) return;

  const channel = await fetchChannel(guild, channelId);
  if (channel && channel.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = {
  addWarning,
  getWarnings,
  clearWarnings,
  setModLogChannel,
  getModLogChannel,
  sendModLog,
};
