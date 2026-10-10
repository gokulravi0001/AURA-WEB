const {
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel } = require("../utils/helpers");

const STATS_FILE = "serverstats-data.json";

function getStatsStore() {
  return readJson(STATS_FILE, {});
}

function saveStatsStore(data) {
  writeJson(STATS_FILE, data);
}

function getServerStatsConfig(guildId) {
  const store = getStatsStore();
  return store[guildId] || null;
}

function saveServerStatsConfig(guildId, config) {
  const store = getStatsStore();
  if (config) {
    store[guildId] = config;
  } else {
    delete store[guildId];
  }
  saveStatsStore(store);
}

async function updateServerStatsChannels(guild) {
  const config = getServerStatsConfig(guild.id);
  if (!config) return false;

  try {
    await guild.members.fetch().catch(() => {});

    const total = guild.memberCount;
    const humans = guild.members.cache.filter((m) => !m.user.bot).size;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;
    const boosts = guild.premiumSubscriptionCount || 0;

    // Update Total Channel
    if (config.totalChannelId) {
      const ch = await fetchChannel(guild, config.totalChannelId);
      if (ch) {
        const newName = `👥 Total: ${total.toLocaleString()}`;
        if (ch.name !== newName) await ch.setName(newName).catch(() => {});
      }
    }

    // Update Humans Channel
    if (config.humansChannelId) {
      const ch = await fetchChannel(guild, config.humansChannelId);
      if (ch) {
        const newName = `👤 Members: ${humans.toLocaleString()}`;
        if (ch.name !== newName) await ch.setName(newName).catch(() => {});
      }
    }

    // Update Bots Channel
    if (config.botsChannelId) {
      const ch = await fetchChannel(guild, config.botsChannelId);
      if (ch) {
        const newName = `🤖 Bots: ${bots.toLocaleString()}`;
        if (ch.name !== newName) await ch.setName(newName).catch(() => {});
      }
    }

    // Update Boosts Channel (if configured)
    if (config.boostsChannelId) {
      const ch = await fetchChannel(guild, config.boostsChannelId);
      if (ch) {
        const newName = `✨ Boosts: ${boosts.toLocaleString()}`;
        if (ch.name !== newName) await ch.setName(newName).catch(() => {});
      }
    }

    config.lastUpdated = Date.now();
    saveServerStatsConfig(guild.id, config);
    return true;
  } catch (error) {
    console.error("Error updating server stats channels:", error);
    return false;
  }
}

async function setupServerStatsChannels(guild, includeBoosts = true) {
  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("MISSING_MANAGE_CHANNELS");
  }

  // Remove old setup if exists
  await removeServerStatsChannels(guild).catch(() => {});

  await guild.members.fetch().catch(() => {});
  const total = guild.memberCount;
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  const boosts = guild.premiumSubscriptionCount || 0;

  // 1. Create Category with Connect: false for @everyone
  const category = await guild.channels.create({
    name: "📊 SERVER STATS 📊",
    type: ChannelType.GuildCategory,
    position: 0,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
        allow: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.Connect,
        ],
      },
    ],
  });

  // 2. Create Total Channel
  const totalCh = await guild.channels.create({
    name: `👥 Total: ${total.toLocaleString()}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ],
  });

  // 3. Create Humans Channel
  const humansCh = await guild.channels.create({
    name: `👤 Members: ${humans.toLocaleString()}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ],
  });

  // 4. Create Bots Channel
  const botsCh = await guild.channels.create({
    name: `🤖 Bots: ${bots.toLocaleString()}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ],
  });

  // 5. Optional Boosts Channel
  let boostsCh = null;
  if (includeBoosts) {
    boostsCh = await guild.channels.create({
      name: `✨ Boosts: ${boosts.toLocaleString()}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect],
          allow: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });
  }

  const config = {
    categoryId: category.id,
    totalChannelId: totalCh.id,
    humansChannelId: humansCh.id,
    botsChannelId: botsCh.id,
    boostsChannelId: boostsCh ? boostsCh.id : null,
    lastUpdated: Date.now(),
  };

  saveServerStatsConfig(guild.id, config);
  return config;
}

async function removeServerStatsChannels(guild) {
  const config = getServerStatsConfig(guild.id);
  if (!config) return false;

  const ids = [
    config.totalChannelId,
    config.humansChannelId,
    config.botsChannelId,
    config.boostsChannelId,
    config.categoryId,
  ].filter(Boolean);

  for (const id of ids) {
    try {
      const ch = await fetchChannel(guild, id);
      if (ch) await ch.delete("Server stats removed").catch(() => {});
    } catch {
      // Ignore if already deleted
    }
  }

  saveServerStatsConfig(guild.id, null);
  return true;
}

let updateTimer = null;

function registerServerStatsEvents(bot) {
  if (updateTimer) clearInterval(updateTimer);

  // Automatically refresh stats every 10 minutes (respecting Discord's 2 channel renames / 10m rate limit)
  updateTimer = setInterval(async () => {
    for (const [, guild] of bot.guilds.cache) {
      if (getServerStatsConfig(guild.id)) {
        await updateServerStatsChannels(guild).catch(() => {});
      }
    }
  }, 10 * 60 * 1000);

  // Debounced listener on join/leave
  const queueUpdate = (guild) => {
    if (!getServerStatsConfig(guild.id)) return;
    setTimeout(() => {
      updateServerStatsChannels(guild).catch(() => {});
    }, 15000);
  };

  bot.on("guildMemberAdd", (member) => queueUpdate(member.guild));
  bot.on("guildMemberRemove", (member) => queueUpdate(member.guild));
}

module.exports = {
  getServerStatsConfig,
  setupServerStatsChannels,
  updateServerStatsChannels,
  removeServerStatsChannels,
  registerServerStatsEvents,
};
