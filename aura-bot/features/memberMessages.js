const { EmbedBuilder } = require("discord.js");
const { fetchChannel } = require("../utils/helpers");
const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("greeting-settings.json", {});
}

function writeData(data) {
  writeJson("greeting-settings.json", data);
}

function getGreetingSettings(guildId) {
  const data = readData();
  const settings = data[guildId] || {};

  // Environment variable fallbacks
  const welcomeChannelId =
    settings.welcomeChannelId || process.env.WELCOME_CHANNEL_ID || null;
  const goodbyeChannelId =
    settings.goodbyeChannelId || process.env.GOODBYE_CHANNEL_ID || null;

  return {
    welcomeChannelId,
    goodbyeChannelId,
    autoRoleId: settings.autoRoleId || null,
    dmWelcome: settings.dmWelcome || false,
    welcomeMessage: settings.welcomeMessage || null,
    welcomeTitle: settings.welcomeTitle || "Welcome to {server}!",
    welcomeColor: settings.welcomeColor || "#A855F7",
    welcomeImage: settings.welcomeImage || null,
    goodbyeMessage: settings.goodbyeMessage || null,
    goodbyeTitle: settings.goodbyeTitle || "Goodbye!",
    goodbyeColor: settings.goodbyeColor || "#EF4444",
    goodbyeImage: settings.goodbyeImage || null,
  };
}

function saveGreetingSettings(guildId, newSettings) {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    ...current,
    ...newSettings,
  };

  writeData(data);
}

function disableGreeting(guildId, type) {
  const data = readData();
  data[guildId] ||= {};

  if (type === "welcome" || type === "both") {
    data[guildId].welcomeChannelId = null;
  }
  if (type === "goodbye" || type === "both") {
    data[guildId].goodbyeChannelId = null;
  }

  writeData(data);
}

function parseGreetingText(template, member) {
  if (!template) return "";
  return template
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user?.username || member.displayName)
    .replace(/{server}/g, member.guild?.name || "the server")
    .replace(/{memberCount}/g, String(member.guild?.memberCount || 0));
}

async function buildGreetingEmbed(member, type, settings) {
  const isWelcome = type === "welcome";
  const titleTemplate = isWelcome ? settings.welcomeTitle : settings.goodbyeTitle;
  const msgTemplate = isWelcome ? settings.welcomeMessage : settings.goodbyeMessage;
  const color = isWelcome ? (settings.welcomeColor || 0xa855f7) : (settings.goodbyeColor || 0xef4444);
  const image = isWelcome ? settings.welcomeImage : settings.goodbyeImage;

  const defaultDescription = isWelcome
    ? `Welcome ${member} to **${member.guild.name}**!\nYou are member **#${member.guild.memberCount}**.`
    : `**${member.user.tag}** has left **${member.guild.name}**.\nWe now have **${member.guild.memberCount}** members.`;

  const description = msgTemplate ? parseGreetingText(msgTemplate, member) : defaultDescription;
  const title = parseGreetingText(titleTemplate, member);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (image) {
    embed.setImage(image);
  }

  return embed;
}

async function sendGreeting(member, type, previewChannel = null) {
  const settings = getGreetingSettings(member.guild.id);
  const channelId = previewChannel ? previewChannel.id : (type === "welcome" ? settings.welcomeChannelId : settings.goodbyeChannelId);

  if (!channelId) return;

  const channel = previewChannel || await fetchChannel(member.guild, channelId);

  if (!channel?.isTextBased()) return;

  try {
    const embed = await buildGreetingEmbed(member, type, settings);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Could not send the ${type} message:`, error);
  }
}

function registerMemberEvents(client) {
  client.on("guildMemberAdd", async (member) => {
    const settings = getGreetingSettings(member.guild.id);

    // Auto-role assignment
    if (settings.autoRoleId) {
      const role = member.guild.roles.cache.get(settings.autoRoleId);
      if (role && role.editable) {
        await member.roles.add(role).catch((err) => {
          console.error(`Could not assign auto-role to ${member.user.tag}:`, err);
        });
      }
    }

    // DM welcome
    if (settings.dmWelcome) {
      try {
        const dmEmbed = await buildGreetingEmbed(member, "welcome", settings);
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch {
        // Safe ignore
      }
    }

    // Channel greeting
    await sendGreeting(member, "welcome");
  });

  client.on("guildMemberRemove", async (member) => {
    await sendGreeting(member, "goodbye");
  });
}

module.exports = {
  getGreetingSettings,
  saveGreetingSettings,
  disableGreeting,
  sendGreeting,
  buildGreetingEmbed,
  registerMemberEvents,
};