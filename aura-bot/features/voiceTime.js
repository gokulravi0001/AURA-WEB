const { ChannelType } = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("voice-time.json", {});
}

function writeData(data) {
  writeJson("voice-time.json", data);
}

function getVoiceTime(guildId, userId = null) {
  const guildData = readData()[guildId];

  if (!guildData) {
    return { voiceMemberMinutes: 0, stageMemberMinutes: 0 };
  }

  if (userId) {
    return (
      guildData.users?.[userId] || {
        voiceMemberMinutes: 0,
        stageMemberMinutes: 0,
      }
    );
  }

  return guildData;
}

function getVoiceRank(guildId, userId) {
  const guildUsers = readData()[guildId]?.users || {};
  const userStats = guildUsers[userId];
  const userMinutes = Number(userStats?.voiceMemberMinutes || 0);

  if (!userStats || userMinutes <= 0) {
    return null;
  }

  const membersAhead = Object.values(guildUsers).filter(
    (stats) => Number(stats?.voiceMemberMinutes || 0) > userMinutes,
  ).length;

  return membersAhead + 1;
}

function recordVoiceMinute(client) {
  const data = readData();
  let changed = false;

  for (const guild of client.guilds.cache.values()) {
    data[guild.id] ||= {
      voiceMemberMinutes: 0,
      stageMemberMinutes: 0,
      users: {},
    };

    data[guild.id].users ||= {};

    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || !state.member || state.member.user.bot) continue;

      const channel = state.channel;
      let type = null;

      if (channel?.type === ChannelType.GuildVoice) {
        type = "voiceMemberMinutes";
      } else if (channel?.type === ChannelType.GuildStageVoice) {
        type = "stageMemberMinutes";
      }

      if (!type) continue;

      data[guild.id][type]++;

      data[guild.id].users[state.member.id] ||= {
        voiceMemberMinutes: 0,
        stageMemberMinutes: 0,
      };

      data[guild.id].users[state.member.id][type]++;
      changed = true;
    }
  }

  if (changed) writeData(data);
}

function registerVoiceTimeTracking(client) {
  client.once("clientReady", () => {
    const timer = setInterval(() => {
      recordVoiceMinute(client);
    }, 60 * 1000);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

module.exports = {
  getVoiceTime,
  getVoiceRank,
  registerVoiceTimeTracking,
};