const { EmbedBuilder } = require("discord.js");
const { fetchChannel, fetchMessage } = require("../utils/helpers");
const { readJson, writeJson } = require("../utils/jsonStore");

const refreshTimers = new Map();
const refreshQueues = new Map();

function readData() {
  return readJson("sticky-messages.json", {});
}

function writeData(data) {
  writeJson("sticky-messages.json", data);
}

function makeKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function getStickyMessage(guildId, channelId) {
  return readData()[makeKey(guildId, channelId)] || null;
}

function getAllStickies(guildId) {
  const data = readData();
  const list = [];
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith(`${guildId}:`)) {
      const channelId = key.split(":")[1];
      list.push({ channelId, ...val });
    }
  }
  return list;
}

async function postStickyMessage(client, guildId, channelId) {
  const key = makeKey(guildId, channelId);
  const data = readData();
  const sticky = data[key];

  if (!sticky) return false;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const channel = await fetchChannel(guild, channelId);
  if (!channel?.isTextBased()) return false;

  // Delete previous sticky message if exists
  if (sticky.messageId) {
    const oldMessage = await fetchMessage(channel, sticky.messageId);
    if (oldMessage) {
      await oldMessage.delete().catch(() => {});
    }
  }

  let newMessage;
  if (sticky.asEmbed) {
    const color = sticky.color ? parseInt(sticky.color.replace("#", ""), 16) : 0x5865f2;
    const embed = new EmbedBuilder()
      .setColor(isNaN(color) ? 0x5865f2 : color)
      .setTitle(sticky.title || "📌 Notice")
      .setDescription(sticky.text)
      .setFooter({ text: "Sticky Message • Stays at the bottom of the chat" });

    newMessage = await channel.send({
      embeds: [embed],
    }).catch(() => null);
  } else {
    newMessage = await channel.send({
      content: `📌 **Sticky Message:**\n${sticky.text}`,
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }

  if (newMessage) {
    data[key].messageId = newMessage.id;
    writeData(data);
    return true;
  }

  return false;
}

async function setStickyMessage(client, guildId, channelId, text, asEmbed = false, title = null, color = null) {
  const key = makeKey(guildId, channelId);
  const data = readData();
  const oldSticky = data[key];

  data[key] = {
    text,
    asEmbed,
    title,
    color,
    messageId: oldSticky?.messageId || null,
  };

  writeData(data);
  return postStickyMessage(client, guildId, channelId);
}

async function removeStickyMessage(client, guildId, channelId) {
  const key = makeKey(guildId, channelId);
  const timer = refreshTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    refreshTimers.delete(key);
  }

  const data = readData();
  const sticky = data[key];
  if (!sticky) return false;

  delete data[key];
  writeData(data);

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    const channel = await fetchChannel(guild, channelId);
    if (channel?.isTextBased() && sticky.messageId) {
      const oldMessage = await fetchMessage(channel, sticky.messageId);
      if (oldMessage) {
        await oldMessage.delete().catch(() => {});
      }
    }
  }

  return true;
}

function scheduleRefresh(client, guildId, channelId) {
  const key = makeKey(guildId, channelId);
  const oldTimer = refreshTimers.get(key);

  if (oldTimer) clearTimeout(oldTimer);

  const timer = setTimeout(() => {
    refreshTimers.delete(key);

    const previous = refreshQueues.get(key) || Promise.resolve();
    const next = previous
      .then(() => postStickyMessage(client, guildId, channelId))
      .catch((error) => {
        console.error("Could not refresh sticky message:", error);
      });

    refreshQueues.set(key, next);

    next.finally(() => {
      if (refreshQueues.get(key) === next) {
        refreshQueues.delete(key);
      }
    });
  }, 2500);

  refreshTimers.set(key, timer);
}

function registerStickyEvents(client) {
  client.on("messageCreate", (message) => {
    if (!message.guild || message.author.bot) return;

    const sticky = getStickyMessage(message.guild.id, message.channel.id);
    if (!sticky) return;

    scheduleRefresh(client, message.guild.id, message.channel.id);
  });
}

module.exports = {
  getStickyMessage,
  getAllStickies,
  setStickyMessage,
  removeStickyMessage,
  registerStickyEvents,
};