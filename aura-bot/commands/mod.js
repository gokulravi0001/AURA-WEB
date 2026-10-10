const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  addWarning,
  getWarnings,
  clearWarnings,
  setModLogChannel,
  sendModLog,
} = require("../features/moderation");
const { isAdmin, parseDuration, formatDuration } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Full-featured server moderation and administration suite")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Kick a member from the server")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to kick")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for kicking")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to ban")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for banning")
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("delete_days")
            .setDescription("Number of days of messages to delete (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Unban a user by their user ID")
        .addStringOption((opt) =>
          opt
            .setName("user_id")
            .setDescription("The ID of the user to unban")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for unbanning")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timeout")
        .setDescription("Timeout (mute) a member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to timeout")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Timeout duration (e.g. 5m, 1h, 1d, max 28d)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for timeout")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("untimeout")
        .setDescription("Remove timeout from a member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to untimeout")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for removing timeout")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("warn")
        .setDescription("Issue a formal warning to a member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to warn")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for warning")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("warnings")
        .setDescription("View warning history for a member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member whose warnings to inspect")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clearwarns")
        .setDescription("Clear all warnings for a member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member whose warnings to clear")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("purge")
        .setDescription("Bulk delete messages with optional filters")
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Number of messages to delete (1-100)")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("filter")
            .setDescription("Optional filter")
            .addChoices(
              { name: "All messages", value: "all" },
              { name: "Bots only", value: "bots" },
              { name: "Humans only", value: "humans" },
              { name: "Contains links", value: "links" },
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("slowmode")
        .setDescription("Set channel slowmode delay")
        .addIntegerOption((opt) =>
          opt
            .setName("seconds")
            .setDescription("Seconds per message (0 to disable, max 21600)")
            .setMinValue(0)
            .setMaxValue(21600)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to set slowmode in (default: current)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("lock")
        .setDescription("Lock a channel to prevent regular members from chatting")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to lock (default: current)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Lockdown reason")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlock")
        .setDescription("Unlock a previously locked channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to unlock (default: current)")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("logs")
        .setDescription("Set the channel for moderation audit log entries")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The log channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const isStaff =
      isAdmin(interaction.member) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

    if (!isStaff) {
      return interaction.reply({
        content: "❌ You do not have permission to use moderation commands.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "logs") {
      const logChannel = interaction.options.getChannel("channel", true);
      setModLogChannel(interaction.guildId, logChannel.id);
      return interaction.reply({
        content: `✅ Moderation logs will now be sent to ${logChannel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "kick") {
      const targetUser = interaction.options.getUser("member", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: "❌ Member not found in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!member.kickable) {
        return interaction.reply({
          content: "❌ I cannot kick this member (they have equal or higher role hierarchy).",
          flags: MessageFlags.Ephemeral,
        });
      }

      await member.kick(`[Mod: ${interaction.user.tag}] ${reason}`);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("👢 Member Kicked")
        .setDescription(
          `**User:** ${targetUser} (${targetUser.tag})\n` +
          `**Moderator:** ${interaction.user}\n` +
          `**Reason:** ${reason}`,
        )
        .setTimestamp();

      await sendModLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "ban") {
      const targetUser = interaction.options.getUser("member", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const deleteDays = interaction.options.getInteger("delete_days") || 0;

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (member && !member.bannable) {
        return interaction.reply({
          content: "❌ I cannot ban this member (they have equal or higher role hierarchy).",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.guild.bans.create(targetUser.id, {
        reason: `[Mod: ${interaction.user.tag}] ${reason}`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔨 Member Banned")
        .setDescription(
          `**User:** ${targetUser} (${targetUser.tag})\n` +
          `**Moderator:** ${interaction.user}\n` +
          `**Deleted Messages:** ${deleteDays} days\n` +
          `**Reason:** ${reason}`,
        )
        .setTimestamp();

      await sendModLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "unban") {
      const userId = interaction.options.getString("user_id", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      try {
        await interaction.guild.bans.remove(userId, `[Mod: ${interaction.user.tag}] ${reason}`);
        return interaction.reply({
          content: `✅ Successfully unbanned user ID \`${userId}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        return interaction.reply({
          content: "❌ Could not unban that user. Make sure the ID is valid and currently banned.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (sub === "timeout") {
      const targetUser = interaction.options.getUser("member", true);
      const durationStr = interaction.options.getString("duration", true);
      const reason = interaction.options.getString("reason") || "No reason provided";

      const ms = parseDuration(durationStr);
      if (!ms || ms < 10000 || ms > 28 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
          content: "❌ Duration must be between 10 seconds and 28 days (e.g. `10m`, `2h`, `1d`).",
          flags: MessageFlags.Ephemeral,
        });
      }

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: "❌ Member not found in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!member.moderatable) {
        return interaction.reply({
          content: "❌ I cannot timeout this member due to role hierarchy.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await member.timeout(ms, `[Mod: ${interaction.user.tag}] ${reason}`);

      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⏳ Member Timed Out")
        .setDescription(
          `**User:** ${targetUser} (${targetUser.tag})\n` +
          `**Duration:** ${formatDuration(ms)}\n` +
          `**Moderator:** ${interaction.user}\n` +
          `**Reason:** ${reason}`,
        )
        .setTimestamp();

      await sendModLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "untimeout") {
      const targetUser = interaction.options.getUser("member", true);
      const reason = interaction.options.getString("reason") || "Timeout removed";

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member || !member.isCommunicationDisabled()) {
        return interaction.reply({
          content: "❌ That member is not currently timed out.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await member.timeout(null, `[Mod: ${interaction.user.tag}] ${reason}`);
      return interaction.reply({
        content: `✅ Removed timeout for ${targetUser}.`,
      });
    }

    if (sub === "warn") {
      const targetUser = interaction.options.getUser("member", true);
      const reason = interaction.options.getString("reason", true);

      const warning = addWarning(interaction.guildId, targetUser.id, interaction.user.id, reason);
      const totalWarns = getWarnings(interaction.guildId, targetUser.id).length;

      // Try sending a DM to warned user
      await targetUser.send({
        content: `⚠️ You received a formal warning in **${interaction.guild.name}**:\n> **Reason:** ${reason}\n*(Total warnings: ${totalWarns})*`,
      }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⚠️ Warning Issued")
        .setDescription(
          `**Member:** ${targetUser} (${targetUser.tag})\n` +
          `**Moderator:** ${interaction.user}\n` +
          `**Reason:** ${reason}\n` +
          `**Total Warnings:** ${totalWarns}`,
        )
        .setFooter({ text: `Warn ID: ${warning.id}` })
        .setTimestamp();

      await sendModLog(interaction.guild, embed);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "warnings") {
      const targetUser = interaction.options.getUser("member", true);
      const list = getWarnings(interaction.guildId, targetUser.id);

      if (list.length === 0) {
        return interaction.reply({
          content: `✅ **${targetUser.tag}** has a clean record with 0 warnings.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const desc = list
        .map(
          (w, idx) =>
            `**#${idx + 1}** • <t:${Math.floor(w.timestamp / 1000)}:d>\n  **Reason:** ${w.reason}\n  **Moderator:** <@${w.moderatorId}>`,
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`⚠️ Warnings for ${targetUser.username} (${list.length})`)
        .setDescription(desc);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "clearwarns") {
      const targetUser = interaction.options.getUser("member", true);
      const count = clearWarnings(interaction.guildId, targetUser.id);

      return interaction.reply({
        content: `✅ Cleared **${count}** warning(s) for ${targetUser}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "purge") {
      const amount = interaction.options.getInteger("amount", true);
      const filter = interaction.options.getString("filter") || "all";

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      let filtered = [...fetched.values()];

      if (filter === "bots") {
        filtered = filtered.filter((m) => m.author.bot);
      } else if (filter === "humans") {
        filtered = filtered.filter((m) => !m.author.bot);
      } else if (filter === "links") {
        filtered = filtered.filter((m) => /(https?:\/\/[^\s]+)/gi.test(m.content));
      }

      const deleted = await interaction.channel.bulkDelete(filtered, true);

      return interaction.editReply({
        content: `🧹 Deleted **${deleted.size}** message(s) (Filter: \`${filter}\`). Note: Messages older than 14 days cannot be bulk deleted.`,
      });
    }

    if (sub === "slowmode") {
      const seconds = interaction.options.getInteger("seconds", true);
      const channel = interaction.options.getChannel("channel") || interaction.channel;

      await channel.setRateLimitPerUser(seconds);
      return interaction.reply({
        content: seconds === 0
          ? `✅ Disabled slowmode in ${channel}.`
          : `⏱️ Slowmode in ${channel} set to **${seconds}s**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "lock") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const reason = interaction.options.getString("reason") || "Lockdown in effect";

      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
      });

      return interaction.reply({
        content: `🔒 ${channel} has been locked. (${reason})`,
      });
    }

    if (sub === "unlock") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;

      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
      });

      return interaction.reply({
        content: `🔓 ${channel} has been unlocked.`,
      });
    }
  },
};
