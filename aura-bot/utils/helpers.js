const { PermissionFlagsBits } = require("discord.js");

/**
 * Check if a guild member has full administrative rights.
 * Server Owner, members with Administrator permission, or ManageGuild permission.
 */
function isAdmin(member) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return false;
}

/**
 * Safely fetches a channel from cache or API.
 */
async function fetchChannel(guildOrClient, channelId) {
  if (!guildOrClient || !channelId) return null;

  try {
    if (guildOrClient.channels?.cache) {
      const cached = guildOrClient.channels.cache.get(channelId);
      if (cached) return cached;
      return await guildOrClient.channels.fetch(channelId).catch(() => null);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Safely fetches a message from a text-based channel.
 */
async function fetchMessage(channel, messageId) {
  if (!channel || !messageId || !channel.isTextBased()) return null;

  try {
    const cached = channel.messages?.cache?.get(messageId);
    if (cached) return cached;
    return await channel.messages.fetch(messageId).catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Parses time strings like "10s", "5m", "2h", "1d" into milliseconds.
 */
function parseDuration(input) {
  if (!input || typeof input !== "string") return null;

  const match = input.trim().match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase()[0];

  if (isNaN(value) || value <= 0) return null;

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

/**
 * Formats duration in milliseconds into human readable string.
 */
function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

module.exports = {
  isAdmin,
  fetchChannel,
  fetchMessage,
  parseDuration,
  formatDuration,
};
