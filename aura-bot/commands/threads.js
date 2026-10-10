const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  getThreadSettings,
  addThreadChannel,
  removeThreadChannel,
} = require("../features/threads");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("threads")
    .setDescription("Configure automatic thread creation")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Enable automatic threads in a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Trigger mode")
            .addChoices(
              { name: "Images Only (Create threads only on media/pictures)", value: "images_only" },
              { name: "All Messages (Create threads for every message)", value: "all_messages" },
            )
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("name_pattern")
            .setDescription("Thread name pattern (use {user} or {username})")
            .setMaxLength(50)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove automatic threads from a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to remove")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all channels with automatic threads enabled"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable all automatic threads across the entire server"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const mode = interaction.options.getString("mode") || "images_only";
      const pattern = interaction.options.getString("name_pattern") || "💬 {user}'s Discussion";

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.editReply("Please select a standard text channel (not inside a thread).");
      }

      addThreadChannel(interaction.guild.id, channel.id, mode, pattern);

      return interaction.editReply(
        `✅ **Automatic Threads Enabled** in ${channel}!\n` +
        `• Mode: **${mode === "images_only" ? "Images/Media Only" : "All Messages"}**\n` +
        `• Name Pattern: \`${pattern}\``,
      );
    }

    if (subcommand === "remove") {
      const channel = interaction.options.getChannel("channel", true);
      const removed = removeThreadChannel(interaction.guild.id, channel.id);

      return interaction.editReply(
        removed
          ? `✅ Removed automatic threads from ${channel}.`
          : `Automatic threads were not configured in ${channel}.`,
      );
    }

    if (subcommand === "list") {
      const settings = getThreadSettings(interaction.guild.id);
      const entries = Object.entries(settings);

      if (entries.length === 0) {
        return interaction.editReply("No channels have automatic threads enabled.");
      }

      const lines = entries.map(([channelId, conf]) => {
        return `• <#${channelId}> — Mode: **${conf.mode}** | Pattern: \`${conf.namePattern}\``;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🧵 Configured Auto-Thread Channels")
        .setDescription(lines.join("\n\n"));

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "disable") {
      removeThreadChannel(interaction.guild.id);
      return interaction.editReply("✅ All automatic threads have been disabled for this server.");
    }
  },
};