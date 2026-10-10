const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  getGreetingSettings,
  saveGreetingSettings,
  disableGreeting,
  buildGreetingEmbed,
} = require("../features/memberMessages");
const { isAdmin, fetchChannel } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("greetings")
    .setDescription("Configure welcome and goodbye messages, auto-roles, and styling")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set welcome/goodbye channels, auto-roles, and DM options")
        .addChannelOption((opt) =>
          opt
            .setName("welcome_channel")
            .setDescription("Where to send welcome messages")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("goodbye_channel")
            .setDescription("Where to send goodbye messages")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt
            .setName("auto_role")
            .setDescription("Role given automatically to members upon joining")
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("dm_welcome")
            .setDescription("Send welcome message directly to the member's DMs")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("customize")
        .setDescription("Customize text, title, color, or banner for welcome or goodbye")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Choose welcome or goodbye to customize")
            .addChoices(
              { name: "Welcome Message", value: "welcome" },
              { name: "Goodbye Message", value: "goodbye" },
            )
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Message text. Use {user}, {username}, {server}, {memberCount}")
            .setMaxLength(1500)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Embed title")
            .setMaxLength(100)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("color")
            .setDescription("Embed hex color, e.g. #5865F2")
            .setMaxLength(7)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("image_url")
            .setDescription("Banner image URL")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Send a preview test greeting")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Which preview to send")
            .addChoices(
              { name: "Welcome", value: "welcome" },
              { name: "Goodbye", value: "goodbye" },
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View current greeting configuration"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Turn off welcome or goodbye messages")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Choose which message to disable")
            .setRequired(true)
            .addChoices(
              { name: "Welcome messages", value: "welcome" },
              { name: "Goodbye messages", value: "goodbye" },
              { name: "Both", value: "both" },
            ),
        ),
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setup") {
      const welcomeChannel = interaction.options.getChannel("welcome_channel");
      const goodbyeChannel = interaction.options.getChannel("goodbye_channel");
      const autoRole = interaction.options.getRole("auto_role");
      const dmWelcome = interaction.options.getBoolean("dm_welcome");

      const updates = {};
      if (welcomeChannel) updates.welcomeChannelId = welcomeChannel.id;
      if (goodbyeChannel) updates.goodbyeChannelId = goodbyeChannel.id;
      if (autoRole) updates.autoRoleId = autoRole.id;
      if (dmWelcome !== null) updates.dmWelcome = dmWelcome;

      saveGreetingSettings(interaction.guild.id, updates);
      const settings = getGreetingSettings(interaction.guild.id);

      return interaction.reply({
        content:
          `✅ **Greeting Settings Updated**\n` +
          `• Welcome Channel: ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Not set"}\n` +
          `• Goodbye Channel: ${settings.goodbyeChannelId ? `<#${settings.goodbyeChannelId}>` : "Not set"}\n` +
          `• Auto-Role: ${settings.autoRoleId ? `<@&${settings.autoRoleId}>` : "None"}\n` +
          `• DM Welcome: **${settings.dmWelcome ? "Enabled" : "Disabled"}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "customize") {
      const type = interaction.options.getString("type", true);
      const message = interaction.options.getString("message");
      const title = interaction.options.getString("title");
      const color = interaction.options.getString("color");
      const image = interaction.options.getString("image_url");

      const updates = {};
      if (type === "welcome") {
        if (message) updates.welcomeMessage = message;
        if (title) updates.welcomeTitle = title;
        if (color) updates.welcomeColor = color;
        if (image) updates.welcomeImage = image;
      } else {
        if (message) updates.goodbyeMessage = message;
        if (title) updates.goodbyeTitle = title;
        if (color) updates.goodbyeColor = color;
        if (image) updates.goodbyeImage = image;
      }

      saveGreetingSettings(interaction.guild.id, updates);

      return interaction.reply({
        content: `🎨 Updated customization for **${type}** messages! Test it with \`/greetings test ${type}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "test") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const type = interaction.options.getString("type", true);
      const settings = getGreetingSettings(interaction.guild.id);
      const targetChannelId = type === "welcome" ? settings.welcomeChannelId : settings.goodbyeChannelId;

      if (!targetChannelId) {
        return interaction.editReply(`The **${type}** channel is not set up yet. Use \`/greetings setup\` first.`);
      }

      const channel = await fetchChannel(interaction.guild, targetChannelId);
      if (!channel) {
        return interaction.editReply("Could not access the configured channel. Check AURA's permissions.");
      }

      const embed = await buildGreetingEmbed(interaction.member, type, settings);
      await channel.send({
        content: `*(Test Preview)*`,
        embeds: [embed],
      }).catch((err) => {
        return interaction.editReply(`Failed to send preview: ${err.message}`);
      });

      return interaction.editReply(`✅ Preview test for **${type}** sent to ${channel}!`);
    }

    if (subcommand === "status") {
      const settings = getGreetingSettings(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("👋 Greeting System Status")
        .addFields(
          { name: "Welcome Channel", value: settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Not set", inline: true },
          { name: "Goodbye Channel", value: settings.goodbyeChannelId ? `<#${settings.goodbyeChannelId}>` : "Not set", inline: true },
          { name: "Auto Role", value: settings.autoRoleId ? `<@&${settings.autoRoleId}>` : "None", inline: true },
          { name: "DM Welcome", value: settings.dmWelcome ? "Enabled" : "Disabled", inline: true },
          { name: "Welcome Title", value: `\`${settings.welcomeTitle}\``, inline: false },
          { name: "Goodbye Title", value: `\`${settings.goodbyeTitle}\``, inline: false },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "disable") {
      const type = interaction.options.getString("type", true);
      disableGreeting(interaction.guild.id, type);

      return interaction.reply({
        content: `Turned off **${type}** greetings for this server.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};