const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const {
  getTempVoiceOwner,
  setTempVoiceOwner,
  removeTempVoiceOwner,
  saveTriggerChannel,
  saveTempVoiceCategory,
  disableTempVoice,
  getTempVoiceSettings,
} = require("../features/tempVoice");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Configure and manage temporary voice rooms")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the join-to-create channel and optional settings (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("join_to_create")
            .setDescription("Voice channel members join to create their temporary room")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category where temporary voice rooms will be created")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("name_template")
            .setDescription("Naming pattern (use {user} or {username})")
            .setRequired(false)
            .setMaxLength(50),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View current voice setup and active rooms"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable the temporary voice system (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lock")
        .setDescription("Lock your room so others cannot join"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unlock")
        .setDescription("Unlock your room so members can join"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("hide")
        .setDescription("Hide your voice room from other members"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unhide")
        .setDescription("Make your voice room visible to everyone"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rename")
        .setDescription("Change the name of your temporary room")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("New room name")
            .setMaxLength(100)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("limit")
        .setDescription("Set maximum number of members (0 for unlimited)")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("Member limit (0-99)")
            .setMinValue(0)
            .setMaxValue(99)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kick")
        .setDescription("Disconnect a member from your room")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to disconnect")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("permit")
        .setDescription("Allow a specific member or role to join even if locked")
        .addMentionableOption((option) =>
          option
            .setName("target")
            .setDescription("Member or role to grant access")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reject")
        .setDescription("Block a member or role from joining and kick them if present")
        .addMentionableOption((option) =>
          option
            .setName("target")
            .setDescription("Member or role to block")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("claim")
        .setDescription("Claim ownership of this room if the previous owner left"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("transfer")
        .setDescription("Transfer ownership to another member in the room")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("New owner")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View details and settings of this temporary room"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete this temporary voice channel (Owner or Admin)"),
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. Admin Setup Subcommands
    if (subcommand === "setup") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "You need administrator or server management permissions to configure voice channels.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const triggerChannel = interaction.options.getChannel("join_to_create", true);
      const category = interaction.options.getChannel("category");
      const nameTemplate = interaction.options.getString("name_template");

      saveTriggerChannel(
        guild.id,
        triggerChannel.id,
        category ? category.id : null,
        nameTemplate || null,
      );

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔊 Temporary Voice Channels Configured")
        .setDescription(
          `• **Join Channel**: ${triggerChannel}\n` +
          `• **Target Category**: ${category ? `${category.name}` : "Same as trigger channel"}\n` +
          `• **Name Template**: \`${nameTemplate || "{user}'s Lounge"}\`\n\n` +
          "When members join the trigger channel, AURA will automatically create a private, manageable room for them.",
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "status") {
      const settings = getTempVoiceSettings(guild.id);
      if (!settings.triggerChannelId) {
        return interaction.reply({
          content: "Temporary voice channels are currently **not configured**. Admins can use `/voice setup`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const activeRoomsCount = Object.keys(settings.rooms || {}).length;
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Temporary Voice Setup Status")
        .addFields(
          { name: "Trigger Channel", value: `<#${settings.triggerChannelId}>`, inline: true },
          { name: "Category", value: settings.categoryId ? `<#${settings.categoryId}>` : "Default", inline: true },
          { name: "Name Template", value: `\`${settings.defaultName || "{user}'s Lounge"}\``, inline: true },
          { name: "Active Rooms", value: String(activeRoomsCount), inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "disable") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "You need administrator or server management permissions to use this.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const disabled = disableTempVoice(guild.id);
      return interaction.reply({
        content: disabled
          ? "Temporary voice channels have been **disabled**."
          : "Temporary voice channels were not active.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Room Management Subcommands (Requires being in room)
    const channel = interaction.member?.voice?.channel;
    if (!channel) {
      return interaction.reply({
        content: "You must be in an AURA temporary voice room to use room controls.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const ownerId = getTempVoiceOwner(guild.id, channel.id);
    if (!ownerId) {
      return interaction.reply({
        content: "This voice channel is not an active AURA temporary room.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const isUserAdmin = isAdmin(interaction.member);
    const isOwner = ownerId === interaction.user.id;

    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: "AURA needs the **Manage Channels** permission to control this room.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // "claim" has special logic: can be claimed if owner is no longer in the channel, or by an admin
    if (subcommand === "claim") {
      if (isOwner) {
        return interaction.reply({
          content: "You are already the owner of this room.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentOwnerInRoom = channel.members.has(ownerId);
      if (currentOwnerInRoom && !isUserAdmin) {
        return interaction.reply({
          content: "The room owner is currently in this channel. You cannot claim it while they are present.",
          flags: MessageFlags.Ephemeral,
        });
      }

      setTempVoiceOwner(guild.id, channel.id, interaction.user.id);

      await channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        MuteMembers: true,
        DeafenMembers: true,
        MoveMembers: true,
      }).catch(() => {});

      return interaction.reply({
        content: `👑 ${interaction.user} is now the owner of this room!`,
      });
    }

    // All other management subcommands require Owner or Admin
    if (!isOwner && !isUserAdmin) {
      return interaction.reply({
        content: "Only the room owner or a server administrator can manage this temporary voice room.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      if (subcommand === "lock") {
        await channel.permissionOverwrites.edit(guild.id, {
          Connect: false,
        });

        return interaction.reply({
          content: "🔒 **Room locked.** Other members can no longer join.",
        });
      }

      if (subcommand === "unlock") {
        await channel.permissionOverwrites.edit(guild.id, {
          Connect: true,
        });

        return interaction.reply({
          content: "🔓 **Room unlocked.** Members can now join.",
        });
      }

      if (subcommand === "hide") {
        await channel.permissionOverwrites.edit(guild.id, {
          ViewChannel: false,
        });

        return interaction.reply({
          content: "👁️ **Room hidden.** Only members with permission can see it.",
        });
      }

      if (subcommand === "unhide") {
        await channel.permissionOverwrites.edit(guild.id, {
          ViewChannel: true,
        });

        return interaction.reply({
          content: "👀 **Room unhidden.** Everyone can now see it.",
        });
      }

      if (subcommand === "rename") {
        const name = interaction.options.getString("name", true).trim();
        await channel.setName(name);

        return interaction.reply({
          content: `✏️ Room renamed to **${name}**.`,
        });
      }

      if (subcommand === "limit") {
        const number = interaction.options.getInteger("number", true);
        await channel.setUserLimit(number);

        return interaction.reply({
          content: number === 0
            ? "👥 Room limit removed (unlimited members)."
            : `👥 Room limit set to **${number}** member(s).`,
        });
      }

      if (subcommand === "kick") {
        const targetUser = interaction.options.getUser("member", true);
        const targetMember = channel.members.get(targetUser.id);

        if (!targetMember) {
          return interaction.reply({
            content: `${targetUser} is not currently in this voice room.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (targetUser.id === interaction.user.id) {
          return interaction.reply({
            content: "You cannot kick yourself.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await targetMember.voice.disconnect(`Kicked by room owner/admin ${interaction.user.tag}`);

        return interaction.reply({
          content: `👢 Disconnected ${targetUser} from the room.`,
        });
      }

      if (subcommand === "permit") {
        const target = interaction.options.getMentionable("target", true);

        await channel.permissionOverwrites.edit(target.id, {
          Connect: true,
          ViewChannel: true,
        });

        return interaction.reply({
          content: `✅ Permitted ${target} to join this room.`,
        });
      }

      if (subcommand === "reject") {
        const target = interaction.options.getMentionable("target", true);

        await channel.permissionOverwrites.edit(target.id, {
          Connect: false,
        });

        const insideMember = channel.members.get(target.id);
        if (insideMember) {
          await insideMember.voice.disconnect("Blocked by room owner/admin").catch(() => {});
        }

        return interaction.reply({
          content: `🚫 Blocked ${target} from joining this room.`,
        });
      }

      if (subcommand === "transfer") {
        const newOwnerUser = interaction.options.getUser("member", true);
        const newOwnerMember = channel.members.get(newOwnerUser.id);

        if (!newOwnerMember) {
          return interaction.reply({
            content: `${newOwnerUser} must be inside this voice room to receive ownership.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        setTempVoiceOwner(guild.id, channel.id, newOwnerUser.id);

        await channel.permissionOverwrites.edit(newOwnerUser.id, {
          ViewChannel: true,
          Connect: true,
          Speak: true,
          MuteMembers: true,
          DeafenMembers: true,
          MoveMembers: true,
        }).catch(() => {});

        return interaction.reply({
          content: `👑 Room ownership transferred to ${newOwnerUser}!`,
        });
      }

      if (subcommand === "info") {
        const isLocked = channel.permissionOverwrites.cache.get(guild.id)?.deny.has(PermissionFlagsBits.Connect);
        const isHidden = channel.permissionOverwrites.cache.get(guild.id)?.deny.has(PermissionFlagsBits.ViewChannel);

        const embed = new EmbedBuilder()
          .setColor(0x8a2be2)
          .setTitle(`🔊 ${channel.name}`)
          .addFields(
            { name: "Owner", value: `<@${ownerId}>`, inline: true },
            { name: "Members", value: `${channel.members.size}${channel.userLimit ? `/${channel.userLimit}` : ""}`, inline: true },
            { name: "Locked", value: isLocked ? "🔒 Yes" : "🔓 No", inline: true },
            { name: "Hidden", value: isHidden ? "👁️ Yes" : "👀 No", inline: true },
            { name: "Bitrate", value: `${channel.bitrate / 1000} kbps`, inline: true },
            { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true },
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (subcommand === "delete") {
        await interaction.reply({
          content: "Deleting this temporary voice room...",
          flags: MessageFlags.Ephemeral,
        });

        removeTempVoiceOwner(guild.id, channel.id);
        await channel.delete("Deleted by owner or admin").catch(() => {});
      }
    } catch (error) {
      console.error("Voice room management error:", error);
      return interaction.reply({
        content: "An error occurred while managing the voice room. Check AURA's permissions.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};