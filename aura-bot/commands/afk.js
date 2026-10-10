const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const { setAfk, clearAfk, getAfk } = require("../features/afk");
const { formatDuration } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set or check social AFK status")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set your AFK status so others know when you are away")
        .addStringOption((opt) =>
          opt
            .setName("status")
            .setDescription("Your status message (e.g. Studying, At gym, AFK)")
            .setMaxLength(100)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Remove your current AFK status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Check if a member is currently AFK")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The user to check")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const statusText = interaction.options.getString("status") || "AFK";
      setAfk(interaction.guildId, interaction.user.id, statusText);

      return interaction.reply({
        content: `💤 You are now marked as **AFK**: *${statusText}*\nI will notify anyone who mentions you, and remove your AFK as soon as you type again!`,
      });
    }

    if (sub === "clear") {
      const cleared = clearAfk(interaction.guildId, interaction.user.id);
      if (!cleared) {
        return interaction.reply({
          content: "You are not currently marked as AFK.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const elapsed = Date.now() - cleared.timestamp;
      return interaction.reply({
        content: `👋 Welcome back! Your AFK status has been removed (you were away for **${formatDuration(elapsed)}**).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "check") {
      const targetUser = interaction.options.getUser("user", true);
      const afkData = getAfk(interaction.guildId, targetUser.id);

      if (!afkData) {
        return interaction.reply({
          content: `🟢 **${targetUser.displayName || targetUser.username}** is not currently AFK.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const elapsed = Date.now() - afkData.timestamp;
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setAuthor({
          name: `${targetUser.username} is AFK`,
          iconURL: targetUser.displayAvatarURL({ dynamic: true }),
        })
        .setDescription(
          `**Status:** *${afkData.status}*\n` +
          `**Away For:** ${formatDuration(elapsed)} (<t:${Math.floor(afkData.timestamp / 1000)}:R>)`,
        );

      return interaction.reply({ embeds: [embed] });
    }
  },
};
