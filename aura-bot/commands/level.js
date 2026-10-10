const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const {
  saveLevelSettings,
  getMemberStats,
  getLeaderboard,
  addLevelReward,
  removeLevelReward,
  getLevelRewards,
  adminAddXp,
  adminRemoveXp,
  adminSetLevel,
  adminResetUser,
  adminResetAll,
  toggleChannelXp,
} = require("../features/levels");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("View levels, leaderboards, and manage server leveling")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show your level or another member's level and rank")
        .addUserOption((opt) => opt.setName("member").setDescription("Member to check").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show the server XP leaderboard")
        .addIntegerOption((opt) =>
          opt.setName("page").setDescription("Page number").setMinValue(1).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rewards")
        .setDescription("Show configured level reward roles"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the level-up announcement channel (Admin only)")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel where level-up messages are sent")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reward-add")
        .setDescription("Set a role reward for a level (Admin only)")
        .addIntegerOption((opt) => opt.setName("level").setDescription("Level required").setMinValue(1).setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Reward role to grant").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reward-remove")
        .setDescription("Remove a level reward role (Admin only)")
        .addIntegerOption((opt) => opt.setName("level").setDescription("Level whose reward to remove").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-xp")
        .setDescription("Give XP to a member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("XP amount to add").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-xp")
        .setDescription("Remove XP from a member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("XP amount to deduct").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-level")
        .setDescription("Set a member's level directly (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member").setRequired(true))
        .addIntegerOption((opt) => opt.setName("level").setDescription("Target level").setMinValue(0).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset a member's XP and level to 0 (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Target member to reset").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset-all")
        .setDescription("Reset ALL members' levels and XP in this server (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel-toggle")
        .setDescription("Toggle XP earning on or off in a channel (Admin only)")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Channel to toggle").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const adminCommands = [
      "setup",
      "reward-add",
      "reward-remove",
      "add-xp",
      "remove-xp",
      "set-level",
      "reset",
      "reset-all",
      "channel-toggle",
    ];

    if (adminCommands.includes(subcommand) && !isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "show") {
      const selectedUser = interaction.options.getUser("member") || interaction.user;
      const member = await interaction.guild.members.fetch(selectedUser.id).catch(() => null);

      if (!member) {
        return interaction.reply({
          content: "Could not find that member in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const stats = getMemberStats(interaction.guild.id, member.id);
      const progressPercent = stats.xpNeeded
        ? Math.min(100, Math.max(0, Math.floor((stats.progressXp / stats.xpNeeded) * 100)))
        : 100;

      const filledBars = Math.floor(progressPercent / 10);
      const progressBar = "▰".repeat(filledBars) + "▱".repeat(10 - filledBars);

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`${member.displayName}'s Profile`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "Level", value: `**${stats.level}**`, inline: true },
          { name: "Server Rank", value: stats.rank ? `**#${stats.rank}**` : "Unranked", inline: true },
          { name: "Total XP", value: `${stats.xp.toLocaleString()} XP`, inline: true },
          {
            name: "Progress to Next Level",
            value: `${progressBar} **${progressPercent}%**\n(${stats.progressXp.toLocaleString()} / ${stats.xpNeeded.toLocaleString()} XP)`,
          },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "leaderboard") {
      const page = interaction.options.getInteger("page") || 1;
      const pageSize = 10;
      const leaderboard = getLeaderboard(interaction.guild.id, 100);

      if (leaderboard.length === 0) {
        return interaction.reply({
          content: "Nobody has earned XP yet in this server! Start chatting or spending time in voice.",
        });
      }

      const totalPages = Math.ceil(leaderboard.length / pageSize) || 1;
      const currentPage = Math.min(page, totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const pageItems = leaderboard.slice(startIndex, startIndex + pageSize);

      const lines = pageItems.map((entry, index) => {
        const rank = startIndex + index + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**#${rank}**`;
        return `${medal} <@${entry.userId}> — **Level ${entry.level}** (${entry.xp.toLocaleString()} XP)`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🏆 Server XP Leaderboard")
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: `Page ${currentPage} of ${totalPages} • Total Ranked Members: ${leaderboard.length}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "rewards") {
      const rewards = getLevelRewards(interaction.guild.id);

      if (rewards.length === 0) {
        return interaction.reply({
          content: "This server hasn't set any level reward roles yet. Admins can add them using `/level reward-add`.",
        });
      }

      const description = rewards
        .map(({ level, roleId }) => `• **Level ${level}**: <@&${roleId}>`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🎖️ Level Reward Roles")
        .setDescription(description)
        .setFooter({ text: "Rewards are automatically assigned when members reach the required level" });

      return interaction.reply({ embeds: [embed] });
    }

    // Admin Subcommands
    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      saveLevelSettings(interaction.guild.id, channel.id);

      return interaction.reply({
        content: `✅ Level-up announcement channel set to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reward-add") {
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);

      addLevelReward(interaction.guild.id, level, role.id);

      return interaction.reply({
        content: `✅ Added ${role} as the reward for reaching **Level ${level}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reward-remove") {
      const level = interaction.options.getInteger("level", true);
      const removed = removeLevelReward(interaction.guild.id, level);

      return interaction.reply({
        content: removed
          ? `✅ Removed the reward role for **Level ${level}**.`
          : `There wasn't a reward role configured for Level ${level}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "add-xp") {
      const member = interaction.options.getMember("member");
      const amount = interaction.options.getInteger("amount", true);

      if (!member) {
        return interaction.reply({
          content: "Member not found.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await adminAddXp(interaction.guild, member.id, amount);

      return interaction.reply({
        content: `✅ Added **${amount.toLocaleString()} XP** to ${member}.`,
      });
    }

    if (subcommand === "remove-xp") {
      const member = interaction.options.getMember("member");
      const amount = interaction.options.getInteger("amount", true);

      if (!member) {
        return interaction.reply({
          content: "Member not found.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await adminRemoveXp(interaction.guild, member.id, amount);

      return interaction.reply({
        content: `✅ Removed **${amount.toLocaleString()} XP** from ${member}.`,
      });
    }

    if (subcommand === "set-level") {
      const member = interaction.options.getMember("member");
      const targetLevel = interaction.options.getInteger("level", true);

      if (!member) {
        return interaction.reply({
          content: "Member not found.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await adminSetLevel(interaction.guild, member.id, targetLevel);

      return interaction.reply({
        content: `✅ Set ${member}'s level to **${targetLevel}**.`,
      });
    }

    if (subcommand === "reset") {
      const member = interaction.options.getMember("member");
      if (!member) {
        return interaction.reply({
          content: "Member not found.",
          flags: MessageFlags.Ephemeral,
        });
      }

      adminResetUser(interaction.guild.id, member.id);

      return interaction.reply({
        content: `🔄 Reset all XP and level data for ${member}.`,
      });
    }

    if (subcommand === "reset-all") {
      adminResetAll(interaction.guild.id);

      return interaction.reply({
        content: `⚠️ Reset the entire leveling database for **${interaction.guild.name}**. All members are back to Level 0.`,
      });
    }

    if (subcommand === "channel-toggle") {
      const channel = interaction.options.getChannel("channel", true);
      const isNowDisabled = toggleChannelXp(interaction.guild.id, channel.id);

      return interaction.reply({
        content: isNowDisabled
          ? `🔇 XP earning is now **DISABLED** in ${channel}.`
          : `🔊 XP earning is now **ENABLED** in ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
