const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const {
  getUserProfile,
  giveRep,
  getRepLeaderboard,
} = require("../features/social");
const { formatDuration } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Community reputation system")
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Award a reputation point to a helpful community member (24h cooldown)")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The member to award reputation to")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("View the most reputable community members"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Check your or another member's reputation score")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The member to check (defaults to yourself)")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "give") {
      const targetUser = interaction.options.getUser("user", true);

      if (targetUser.bot) {
        return interaction.reply({
          content: "❌ You cannot award reputation points to bots.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: "❌ You cannot award reputation points to yourself!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const result = giveRep(interaction.guildId, interaction.user.id, targetUser.id);

      if (!result.success) {
        if (result.reason === "COOLDOWN") {
          return interaction.reply({
            content: `⏳ You have already awarded reputation recently! You can give rep again in **${formatDuration(result.remainingMs)}**.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          content: "❌ Could not give reputation.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("⭐ Reputation Awarded!")
        .setDescription(
          `${interaction.user} awarded **+1 Reputation** to ${targetUser}!\n` +
          `${targetUser} now has **+${result.newRep} Reputation** points!`,
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "You can award reputation once every 24 hours." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "leaderboard") {
      const topMembers = getRepLeaderboard(interaction.guildId, 10);

      if (topMembers.length === 0) {
        return interaction.reply({
          content: "⭐ No reputation points have been awarded yet in this server! Use `/rep give @user` to get started.",
        });
      }

      const medals = ["🥇", "🥈", "🥉"];
      const description = topMembers
        .map((entry, index) => {
          const prefix = medals[index] || `\`#${index + 1}\``;
          return `${prefix} <@${entry.userId}> — **+${entry.rep} Rep**`;
        })
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("🏆 Community Reputation Leaderboard")
        .setDescription(description)
        .setFooter({
          text: `Showing top ${topMembers.length} members • Earn rep by being helpful!`,
          iconURL: interaction.guild.iconURL(),
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "check") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const profile = getUserProfile(interaction.guildId, targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({
          name: `${targetUser.username}'s Reputation`,
          iconURL: targetUser.displayAvatarURL({ dynamic: true }),
        })
        .setDescription(
          `${targetUser} currently has **+${profile.rep} Reputation** points in this server.\n` +
          `Bio: *${profile.bio}*`,
        )
        .setFooter({ text: "Use /rep give @user to award reputation points." });

      return interaction.reply({ embeds: [embed] });
    }
  },
};
