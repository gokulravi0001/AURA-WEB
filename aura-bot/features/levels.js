const fs = require("node:fs");
const path = require("node:path");
const { ActivityType, EmbedBuilder } = require("discord.js");

const dataFile = path.join(__dirname, "..", "data", "level-data.json");
const messageCooldowns = new Map();

function readData() {
  try {
    if (!fs.existsSync(dataFile)) {
      return { settings: {}, users: {} };
    }

    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

    return {
      settings: data.settings || {},
      users: data.users || {},
    };
  } catch (error) {
    console.error("Could not read level data:", error);
    return { settings: {}, users: {} };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Level 1 needs 100 total XP; each next level needs more.
function xpNeededForLevel(level) {
  if (level <= 0) return 0;
  return 50 * level * (level + 1);
}

function calculateLevel(xp) {
  let level = 0;
  while (xp >= xpNeededForLevel(level + 1)) {
    level++;
  }
  return level;
}

function getLevelSettings(guildId) {
  return readData().settings[guildId] || {};
}

function saveLevelSettings(guildId, channelId) {
  const data = readData();
  data.settings[guildId] ||= {};
  data.settings[guildId].announcementChannelId = channelId;
  writeData(data);
}

function addLevelReward(guildId, level, roleId) {
  const data = readData();
  data.settings[guildId] ||= {};
  data.settings[guildId].roleRewards ||= {};
  data.settings[guildId].roleRewards[String(level)] = roleId;
  writeData(data);
}

function removeLevelReward(guildId, level) {
  const data = readData();
  const rewards = data.settings[guildId]?.roleRewards;

  if (!rewards || !rewards[String(level)]) {
    return false;
  }

  delete rewards[String(level)];
  writeData(data);
  return true;
}

function getLevelRewards(guildId) {
  const rewards = readData().settings[guildId]?.roleRewards || {};

  return Object.entries(rewards)
    .map(([level, roleId]) => ({
      level: Number(level),
      roleId,
    }))
    .sort((a, b) => a.level - b.level);
}

function toggleChannelXp(guildId, channelId) {
  const data = readData();
  data.settings[guildId] ||= {};
  data.settings[guildId].disabledChannels ||= [];

  const list = data.settings[guildId].disabledChannels;
  const index = list.indexOf(channelId);
  let disabledNow = false;

  if (index === -1) {
    list.push(channelId);
    disabledNow = true;
  } else {
    list.splice(index, 1);
    disabledNow = false;
  }

  writeData(data);
  return disabledNow; // true if now blacklisted, false if enabled
}

function isChannelXpDisabled(guildId, channelId) {
  const list = readData().settings[guildId]?.disabledChannels || [];
  return list.includes(channelId);
}

function getMemberRank(guildId, userId) {
  const guildUsers = readData().users[guildId] || {};
  const userStats = guildUsers[userId];
  const userXp = Number(userStats?.xp || 0);

  if (!userStats || userXp <= 0) {
    return null;
  }

  const membersAhead = Object.values(guildUsers).filter(
    (stats) => Number(stats?.xp || 0) > userXp,
  ).length;

  return membersAhead + 1;
}

function getMemberStats(guildId, userId) {
  const data = readData();
  const xp = data.users[guildId]?.[userId]?.xp || 0;
  const level = calculateLevel(xp);
  const xpAtCurrentLevel = xpNeededForLevel(level);
  const xpAtNextLevel = xpNeededForLevel(level + 1);
  const rank = getMemberRank(guildId, userId);

  return {
    xp,
    level,
    progressXp: xp - xpAtCurrentLevel,
    xpNeeded: xpAtNextLevel - xpAtCurrentLevel,
    rank,
  };
}

function getLeaderboard(guildId, limit = 20) {
  const guildUsers = readData().users[guildId] || {};

  return Object.entries(guildUsers)
    .map(([userId, stats]) => ({
      userId,
      username: stats.username || `User (${userId.slice(-4)})`,
      avatar: stats.avatar || null,
      xp: stats.xp || 0,
      level: calculateLevel(stats.xp || 0),
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

async function giveRewardRoles(guild, userId, oldLevel, newLevel) {
  const rewards = getLevelRewards(guild.id).filter(
    (reward) => reward.level > oldLevel && reward.level <= newLevel,
  );

  if (rewards.length === 0) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  for (const reward of rewards) {
    const role = guild.roles.cache.get(reward.roleId) || await guild.roles.fetch(reward.roleId).catch(() => null);

    if (!role || !role.editable || member.roles.cache.has(role.id)) {
      continue;
    }

    await member.roles.add(role).catch((error) => {
      console.error(
        `Could not give level ${reward.level} reward role to ${userId}:`,
        error,
      );
    });
  }
}

async function giveXp(guild, userId, amount, username = null, avatar = null) {
  const data = readData();
  data.users[guild.id] ||= {};

  const userData = data.users[guild.id][userId] || { xp: 0 };
  const oldLevel = calculateLevel(userData.xp);
  userData.xp += amount;
  if (username) userData.username = username;
  if (avatar) userData.avatar = avatar;
  const newLevel = calculateLevel(userData.xp);

  data.users[guild.id][userId] = userData;
  writeData(data);

  if (newLevel <= oldLevel) return;

  const earnedRewards = getLevelRewards(guild.id).filter(
    (reward) => reward.level > oldLevel && reward.level <= newLevel,
  );

  await giveRewardRoles(guild, userId, oldLevel, newLevel);

  const settings = data.settings[guild.id];
  if (!settings?.announcementChannelId) return;

  const channel = await guild.channels
    .fetch(settings.announcementChannelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return;

  const rewardMessage = earnedRewards
    .map((reward) => {
      const role = guild.roles.cache.get(reward.roleId);
      const roleName = role ? role.name : "Guild Rank";
      return `🎖️ You earned **${roleName}**!`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(earnedRewards.length > 0 ? 0xffb347 : 0x9b59b6)
    .setTitle(
      earnedRewards.length > 0 ? "🏆 New Guild Rank Unlocked!" : "✨ Level Up!",
    )
    .setDescription(
      [
        `Congratulations <@${userId}>! You've reached **Level ${newLevel}**!`,
        rewardMessage,
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .setTimestamp();

  await channel
    .send({
      content: `<@${userId}>`,
      embeds: [embed],
      allowedMentions: {
        users: [userId],
      },
    })
    .catch((error) => {
      console.error("Could not send level-up message:", error);
    });
}

// Admin management methods
function adminAddXp(guild, userId, amount) {
  return giveXp(guild, userId, amount);
}

async function adminRemoveXp(guild, userId, amount) {
  const data = readData();
  data.users[guild.id] ||= {};
  const userData = data.users[guild.id][userId] || { xp: 0 };
  userData.xp = Math.max(0, (userData.xp || 0) - amount);
  data.users[guild.id][userId] = userData;
  writeData(data);
}

async function adminSetLevel(guild, userId, targetLevel) {
  const data = readData();
  data.users[guild.id] ||= {};
  const targetXp = xpNeededForLevel(targetLevel);
  const oldLevel = calculateLevel(data.users[guild.id][userId]?.xp || 0);

  data.users[guild.id][userId] = { xp: targetXp };
  writeData(data);

  if (targetLevel > oldLevel) {
    await giveRewardRoles(guild, userId, oldLevel, targetLevel);
  }
}

function adminResetUser(guildId, userId) {
  const data = readData();
  if (data.users[guildId]?.[userId]) {
    delete data.users[guildId][userId];
    writeData(data);
    return true;
  }
  return false;
}

function adminResetAll(guildId) {
  const data = readData();
  if (data.users[guildId]) {
    delete data.users[guildId];
    writeData(data);
    return true;
  }
  return false;
}

async function giveActivityXp(client) {
  const data = readData();
  let changed = false;

  for (const guild of client.guilds.cache.values()) {
    data.users[guild.id] ||= {};

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      let xpToGive = 0;

      // Voice XP: at least 2 humans in voice channel
      const voiceChannel = member.voice.channel;
      const humanMembersInVoice = voiceChannel
        ? voiceChannel.members.filter((m) => !m.user.bot).size
        : 0;

      if (voiceChannel && humanMembersInVoice >= 2 && !member.voice.selfDeaf && !member.voice.serverDeaf) {
        xpToGive += 5;
      }

      // Game XP if presence available
      try {
        if (member.presence?.activities) {
          const isPlayingGame = member.presence.activities.some(
            (act) => act.type === ActivityType.Playing,
          );
          if (isPlayingGame) xpToGive += 5;
        }
      } catch {
        // Safe ignore
      }

      if (xpToGive > 0) {
        data.users[guild.id][member.id] ||= { xp: 0 };
        data.users[guild.id][member.id].username = member.user.globalName || member.user.username;
        data.users[guild.id][member.id].avatar = member.user.displayAvatarURL({ size: 128 });
        const oldLvl = calculateLevel(data.users[guild.id][member.id].xp);
        data.users[guild.id][member.id].xp += xpToGive;
        const newLvl = calculateLevel(data.users[guild.id][member.id].xp);
        changed = true;

        if (newLvl > oldLvl) {
          // Trigger level up rewards asynchronously
          giveRewardRoles(guild, member.id, oldLvl, newLvl).catch(() => {});
        }
      }
    }
  }

  if (changed) {
    writeData(data);
  }
}

function registerLevelEvents(client) {
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    if (message.content.trim().length < 4) return;

    if (isChannelXpDisabled(message.guild.id, message.channel.id)) return;

    const cooldownKey = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const lastMessageXp = messageCooldowns.get(cooldownKey) || 0;

    if (now - lastMessageXp < 60 * 1000) return;

    messageCooldowns.set(cooldownKey, now);

    const chatXp = Math.floor(Math.random() * 11) + 10;
    const authorUsername = message.author.globalName || message.author.username;
    const authorAvatar = message.author.displayAvatarURL({ size: 128 });

    await giveXp(message.guild, message.author.id, chatXp, authorUsername, authorAvatar).catch((error) => {
      console.error("Could not give chat XP:", error);
    });
  });

  client.once("clientReady", () => {
    const timer = setInterval(() => {
      giveActivityXp(client).catch((error) => {
        console.error("Could not give voice/activity XP:", error);
      });
    }, 60 * 1000);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

module.exports = {
  getLevelSettings,
  saveLevelSettings,
  addLevelReward,
  removeLevelReward,
  getLevelRewards,
  toggleChannelXp,
  isChannelXpDisabled,
  getMemberStats,
  getMemberRank,
  getLeaderboard,
  giveXp,
  adminAddXp,
  adminRemoveXp,
  adminSetLevel,
  adminResetUser,
  adminResetAll,
  registerLevelEvents,
};