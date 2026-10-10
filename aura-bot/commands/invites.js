const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const {
  getInviteStats,
  getInviteLeaderboard,
  setInviteAnnouncementChannel,
  removeInviteAnnouncementChannel,
  addBonusInvites,
  removeBonusInvites,
  resetUserInvites,
  resetAllInvites,
} = require("../features/invites");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Track and manage server invites")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Check your or another member's invite statistics")
        .addUserOption((opt) => opt.setName("member").setDescription("Member to check").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show the server invite leaderboard"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the invite announcement channel (Admin only)")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for announcements (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Turn off invite join announcements (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-bonus")
        .setDescription("Add bonus invites to a member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("Number of bonus invites").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-bonus")
        .setDescription("Remove bonus invites from a member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("Number of bonus invites to deduct").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset invite stats for a member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset-all")
        .setDescription("Reset ALL invite tracking data for this server (Admin only)"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const adminCommands = ["setup", "disable", "add-bonus", "remove-bonus", "reset", "reset-all"];

    if (adminCommands.includes(subcommand) && !isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "check") {
      const user = interaction.options.getUser("member") || interaction.user;
      const stats = getInviteStats(interaction.guild.id, user.id);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📨 ${user.username}'s Invites`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: "Total Joins", value: `**${stats.total}**`, inline: true },
          { name: "Still Present", value: `🟢 **${stats.stillHere}**`, inline: true },
          { name: "Left Server", value: `🔴 **${stats.left}**`, inline: true },
          { name: "Bonus Invites", value: `⭐ **${stats.bonus}**`, inline: true },
          { name: "Net Real Invites", value: `✨ **${stats.net}**`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "leaderboard") {
      const leaderboard = getInviteLeaderboard(interaction.guild.id, 15);

      if (leaderboard.length === 0) {
        return interaction.reply({
          content: "No invite joins have been tracked yet.",
        });
      }

      const lines = leaderboard.map((entry, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**#${index + 1}**`;
        const bonusText = entry.bonus ? ` (${entry.bonus >= 0 ? `+${entry.bonus}` : entry.bonus} bonus)` : "";
        return `${medal} <@${entry.inviterId}> — **${entry.net} net** (${entry.total} joins, ${entry.stillHere} remaining${bonusText})`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🏆 Server Invite Leaderboard")
        .setDescription(lines.join("\n\n"))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Admin Commands
    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      setInviteAnnouncementChannel(interaction.guild.id, channel.id);

      return interaction.reply({
        content: `✅ Invite join announcements will now be sent to ${channel}!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "disable") {
      const removed = removeInviteAnnouncementChannel(interaction.guild.id);
      return interaction.reply({
        content: removed
          ? "✅ Invite join announcements have been disabled."
          : "Invite join announcements were not configured.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "add-bonus") {
      const user = interaction.options.getUser("member", true);
      const amount = interaction.options.getInteger("amount", true);

      addBonusInvites(interaction.guild.id, user.id, amount);

      return interaction.reply({
        content: `✅ Added **+${amount}** bonus invites to ${user}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "remove-bonus") {
      const user = interaction.options.getUser("member", true);
      const amount = interaction.options.getInteger("amount", true);

      removeBonusInvites(interaction.guild.id, user.id, amount);

      return interaction.reply({
        content: `✅ Deducted **-${amount}** bonus invites from ${user}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reset") {
      const user = interaction.options.getUser("member", true);
      resetUserInvites(interaction.guild.id, user.id);

      return interaction.reply({
        content: `🔄 Reset invite statistics and bonus invites for ${user}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reset-all") {
      resetAllInvites(interaction.guild.id);

      return interaction.reply({
        content: `⚠️ All invite tracking records have been cleared for this server.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};