const fs = require("node:fs");
const path = require("node:path");
const {
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const dataFile = path.join(
  __dirname,
  "..",
  "data",
  "temp-voice-data.json",
);

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return {};

    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("Could not read temporary voice data:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getTempVoiceSettings(guildId) {
  const data = readData();
  const guildData = data[guildId] || {};
  return {
    triggerChannelId: guildData.triggerChannelId || null,
    categoryId: guildData.categoryId || null,
    defaultName: guildData.defaultName || null,
    rooms: guildData.rooms || {},
  };
}

function saveTriggerChannel(guildId, channelId, categoryId = null, defaultName = null) {
  const data = readData();

  data[guildId] ||= { rooms: {} };
  data[guildId].triggerChannelId = channelId;
  if (categoryId !== null) data[guildId].categoryId = categoryId;
  if (defaultName !== null) data[guildId].defaultName = defaultName;
  data[guildId].rooms ||= {};

  writeData(data);
}

function saveTempVoiceCategory(guildId, categoryId) {
  const data = readData();
  data[guildId] ||= { rooms: {} };
  data[guildId].categoryId = categoryId;
  data[guildId].rooms ||= {};
  writeData(data);
}

function disableTempVoice(guildId) {
  const data = readData();
  if (!data[guildId]) return false;
  delete data[guildId];
  writeData(data);
  return true;
}

function getTempVoiceOwner(guildId, channelId) {
  const data = readData();
  const room = data[guildId]?.rooms?.[channelId];
  if (!room) return null;
  return typeof room === "object" ? room.ownerId : room;
}

function setTempVoiceOwner(guildId, channelId, ownerId) {
  const data = readData();

  data[guildId] ||= { rooms: {} };
  data[guildId].rooms ||= {};
  data[guildId].rooms[channelId] = {
    ownerId,
    createdAt: Date.now(),
  };

  writeData(data);
}

function removeTempVoiceOwner(guildId, channelId) {
  const data = readData();

  if (!data[guildId]?.rooms?.[channelId]) return;

  delete data[guildId].rooms[channelId];
  writeData(data);
}

function registerTempVoiceEvents(bot) {
  bot.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member;

    if (!member || member.user.bot || !newState.guild) return;

    const guildData = readData()[newState.guild.id];
    const triggerChannelId = guildData?.triggerChannelId;

    // Create a temporary room when someone joins the configured trigger channel.
    if (triggerChannelId && newState.channelId === triggerChannelId) {
      const triggerChannel = newState.channel;

      if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) {
        console.error("The saved temporary voice trigger is not a voice channel.");
        return;
      }

      try {
        const botMember = newState.guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
          console.warn(`[TempVoice] Bot missing ManageChannels in ${newState.guild.name}`);
          return;
        }

        const permissionOverwrites = [
          {
            id: newState.guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.Stream,
              PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.MuteMembers,
              PermissionFlagsBits.DeafenMembers,
              PermissionFlagsBits.MoveMembers,
            ],
          },
          {
            id: bot.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
            ],
          },
        ];

        let roomName = guildData.defaultName
          ? guildData.defaultName.replace("{user}", member.displayName).replace("{username}", member.user.username)
          : `${member.displayName}'s Lounge`;
        roomName = roomName.slice(0, 100);

        const parentCategory = guildData.categoryId || triggerChannel.parentId || undefined;

        const tempChannel = await newState.guild.channels.create({
          name: roomName,
          type: ChannelType.GuildVoice,
          parent: parentCategory,
          permissionOverwrites,
          reason: `AURA Temporary voice room for ${member.user.tag}`,
        });

        // Save who owns this room so /voice commands can check it.
        setTempVoiceOwner(
          newState.guild.id,
          tempChannel.id,
          member.id,
        );

        await member.voice.setChannel(tempChannel).catch(async (err) => {
          console.error("Could not move member to temp room:", err);
          // If member disconnected before moving, clean up the channel
          if (tempChannel.members.size === 0) {
            await tempChannel.delete("Empty temporary voice room").catch(() => {});
            removeTempVoiceOwner(newState.guild.id, tempChannel.id);
          }
        });
      } catch (error) {
        console.error("Could not create a temporary voice room:", error);
      }

      return;
    }

    // Delete an AURA room when its last member leaves.
    if (
      oldState.channelId &&
      oldState.channelId !== newState.channelId &&
      getTempVoiceOwner(oldState.guild.id, oldState.channelId)
    ) {
      const oldChannel = oldState.channel;

      if (oldChannel && oldChannel.members.size === 0) {
        try {
          await oldChannel.delete("Temporary voice room is empty");
        } catch (error) {
          console.error("Could not delete empty temporary voice room:", error);
        } finally {
          removeTempVoiceOwner(oldState.guild.id, oldChannel.id);
        }
      }
    }
  });
}

module.exports = {
  getTempVoiceSettings,
  saveTriggerChannel,
  saveTempVoiceCategory,
  disableTempVoice,
  getTempVoiceOwner,
  setTempVoiceOwner,
  removeTempVoiceOwner,
  registerTempVoiceEvents,
};