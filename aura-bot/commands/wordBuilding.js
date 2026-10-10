const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const {
  saveWordBuildingChannel,
  getWordBuildingData,
  setWordBuildingWord,
  resetWordBuilding,
  disableWordBuilding,
} = require("../features/wordBuilding");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wordbuilding")
    .setDescription("Configure, play, or manage the word-building chain game")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the channel where members build word chains (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The word-building channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View current chain streak, last word, and highscore"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set the current chain word manually (Admin only)")
        .addStringOption((opt) =>
          opt
            .setName("word")
            .setDescription("Starting word for the chain")
            .setRequired(true)
            .setMaxLength(30),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset the word chain so members can start fresh (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable the word-building game (Admin only)"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const data = getWordBuildingData(interaction.guild.id);

    if (subcommand === "stats") {
      if (!data?.channelId) {
        return interaction.reply({
          content: "Word building is not configured on this server yet. Admins can use `/wordbuilding setup`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔤 Word Building Chain Stats")
        .addFields(
          { name: "Last Word", value: data.lastWord ? `**${data.lastWord}**` : "None (fresh start)", inline: true },
          { name: "Next Required Letter", value: data.lastWord ? `**${data.lastWord.slice(-1).toUpperCase()}**` : "Any Letter", inline: true },
          { name: "Current Chain Length", value: `🔗 **${data.chainCount || 0}** words`, inline: true },
          { name: "Longest Chain Record", value: `🏆 **${data.highScore || 0}** words`, inline: true },
          { name: "Channel", value: `<#${data.channelId}>`, inline: true },
          { name: "Last Player", value: data.lastUserId ? `<@${data.lastUserId}>` : "None", inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel", true);
      saveWordBuildingChannel(interaction.guild.id, channel.id);

      return interaction.reply({
        content: `✅ Word building is now set up in ${channel}. The chain starts with any valid word!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "disable") {
      const disabled = disableWordBuilding(interaction.guild.id);
      return interaction.reply({
        content: disabled
          ? "Word building has been disabled."
          : "Word building was not active.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set") {
      const word = interaction.options.getString("word", true).toLowerCase().trim();
      if (!/^[a-z]+$/.test(word) || word.length < 2) {
        return interaction.reply({
          content: "Please provide a valid single word using letters only (minimum 2 letters).",
          flags: MessageFlags.Ephemeral,
        });
      }

      const ok = setWordBuildingWord(interaction.guild.id, word);
      if (!ok) {
        return interaction.reply({
          content: "Word building channel is not set up. Use `/wordbuilding setup` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const nextLetter = word.slice(-1).toUpperCase();
      return interaction.reply({
        content: `✅ Word chain set to **${word}**. Next word must start with **${nextLetter}**!`,
      });
    }

    if (subcommand === "reset") {
      resetWordBuilding(interaction.guild.id);

      return interaction.reply({
        content: "🔄 Word chain has been reset! Members can start a new chain with any valid word.",
      });
    }
  },
};
