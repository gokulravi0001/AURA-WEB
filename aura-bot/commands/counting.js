const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const {
  saveCountingChannel,
  getCountingData,
  setCountingNumber,
  resetCounting,
  setCountingMode,
  disableCounting,
} = require("../features/counting");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Configure, play, or manage the counting game")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the channel for the counting game (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel where members will count")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Chat tolerance mode")
            .setRequired(false)
            .addChoices(
              { name: "Friendly (Allow conversation, only wrong numbers reset)", value: "allow_chat" },
              { name: "Strict (Any non-number message resets)", value: "strict" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View current count streak, highscore, and last player"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set the current count number manually (Admin only)")
        .addIntegerOption((opt) =>
          opt
            .setName("number")
            .setDescription("Number to set as current count")
            .setMinValue(0)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset the current count back to 0 (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mode")
        .setDescription("Change chat tolerance mode (Admin only)")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Chat tolerance mode")
            .addChoices(
              { name: "Friendly (Allow conversation)", value: "allow_chat" },
              { name: "Strict (Any wrong message resets)", value: "strict" },
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable the counting game (Admin only)"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const data = getCountingData(interaction.guild.id);

    if (subcommand === "stats") {
      if (!data?.channelId) {
        return interaction.reply({
          content: "The counting game is not set up on this server yet. Admins can use `/counting setup`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔢 Counting Game Stats")
        .addFields(
          { name: "Current Number", value: `**${data.number || 0}**`, inline: true },
          { name: "Next Expected", value: `**${(data.number || 0) + 1}**`, inline: true },
          { name: "All-Time Highscore", value: `🏆 **${data.highScore || 0}**`, inline: true },
          { name: "Channel", value: `<#${data.channelId}>`, inline: true },
          { name: "Last Counter", value: data.lastUserId ? `<@${data.lastUserId}>` : "None", inline: true },
          { name: "Mode", value: data.mode === "strict" ? "Strict" : "Friendly", inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Admin commands
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to modify the counting game.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel", true);
      const mode = interaction.options.getString("mode") || "allow_chat";

      saveCountingChannel(interaction.guild.id, channel.id, mode);

      return interaction.reply({
        content:
          `✅ Counting game set up in ${channel}!\n` +
          `• Mode: **${mode === "allow_chat" ? "Friendly (Chat Allowed)" : "Strict"}**\n` +
          `Members can start counting from **1**!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "disable") {
      const removed = disableCounting(interaction.guild.id);
      return interaction.reply({
        content: removed
          ? "Counting game has been disabled."
          : "Counting game was not active.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set") {
      const number = interaction.options.getInteger("number", true);
      const updated = setCountingNumber(interaction.guild.id, number);

      if (!updated) {
        return interaction.reply({
          content: "Please set up the counting channel first using `/counting setup`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: `✅ Counting number updated to **${number}**. The next number to count is **${number + 1}**!`,
      });
    }

    if (subcommand === "reset") {
      resetCounting(interaction.guild.id);

      return interaction.reply({
        content: "🔄 Counting streak has been reset to **0**. Start again from **1**!",
      });
    }

    if (subcommand === "mode") {
      const mode = interaction.options.getString("type", true);
      setCountingMode(interaction.guild.id, mode);

      return interaction.reply({
        content: `⚙️ Counting mode changed to **${mode === "strict" ? "Strict" : "Friendly"}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
