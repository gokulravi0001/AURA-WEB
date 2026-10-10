const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const {
  getGuildSecurity,
  saveGuildSecurity,
  executeEmergencyLockdown,
} = require("../features/security");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("security")
    .setDescription("Enterprise-grade Anti-Raid, Anti-Nuke, and Server Protection")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("View server security posture, active shields, and defense logs"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("lockdown")
        .setDescription("1-Click emergency lockdown: toggle chat access across all public channels")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Lock server (true) or lift lockdown (false)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Set the dedicated security audit log channel for raid and nuke alerts")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The log channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("antiraid")
        .setDescription("Configure Anti-Join Raid defense settings")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable Anti-Raid detection")
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("join_threshold")
            .setDescription("Max joins allowed in 10s before triggering defense (default: 5)")
            .setMinValue(2)
            .setMaxValue(50)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Automated action on raid detection")
            .addChoices(
              { name: "Emergency Lockdown (Recommended)", value: "lockdown" },
              { name: "Kick suspicious alts (<3 days old)", value: "kick" },
              { name: "Alert Staff Only", value: "alert" },
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("antinuke")
        .setDescription("Toggle Anti-Nuke defense (auto-bans rogue admins deleting channels/roles/bans)")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable Anti-Nuke protection")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("antispam")
        .setDescription("Configure Anti-Mass Mention and Flood Spam shield")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable Anti-Spam protection")
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("max_mentions")
            .setDescription("Max allowed mentions per message before auto-timeout (default: 4)")
            .setMinValue(2)
            .setMaxValue(20)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("whitelist")
        .setDescription("Manage trusted users or roles exempt from Anti-Nuke restrictions")
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Whitelist action")
            .addChoices(
              { name: "View Whitelist", value: "list" },
              { name: "Add to Whitelist", value: "add" },
              { name: "Remove from Whitelist", value: "remove" },
            )
            .setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to whitelist/unwhitelist")
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("Role to whitelist/unwhitelist")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "❌ You need Administrator permissions or Server Ownership to configure security settings.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();
    const config = getGuildSecurity(interaction.guildId);

    if (sub === "status") {
      const logChannelDisplay = config.logChannelId
        ? `<#${config.logChannelId}>`
        : "⚠️ Not Configured (use `/security log`)";

      const whitelistDisplay =
        config.whitelist?.length > 0
          ? config.whitelist.map((id) => `<@${id}> / <@&${id}>`).join(", ")
          : "None (Server Owner only)";

      const embed = new EmbedBuilder()
        .setColor(config.activeLockdown ? 0xed4245 : 0x5865f2)
        .setTitle(`🛡️ ${interaction.guild.name} • Security Defense Matrix`)
        .setDescription(
          `**Current Server State:** ${
            config.activeLockdown
              ? "🔴 **EMERGENCY LOCKDOWN ACTIVE**"
              : "🟢 **NORMAL (ALL DEFENSES READY)**"
          }\n**Security Log Channel:** ${logChannelDisplay}`,
        )
        .addFields(
          {
            name: "🛡️ Anti-Raid Defense",
            value: `**Status:** ${config.antiRaid?.enabled ? "✅ Enabled" : "❌ Disabled"}\n**Threshold:** ${config.antiRaid?.joinThreshold || 5} joins / 10s\n**Action:** \`${config.antiRaid?.action?.toUpperCase() || "LOCKDOWN"}\``,
            inline: true,
          },
          {
            name: "💣 Anti-Nuke Shield",
            value: `**Status:** ${config.antiNuke?.enabled ? "✅ Enabled" : "❌ Disabled"}\n**Thresholds:** >2 channel/role deletes or >3 bans in 30s\n**Punishment:** Strip Admin Roles & Instant Ban`,
            inline: true,
          },
          {
            name: "💬 Anti-Spam / Mass-Mention",
            value: `**Status:** ${config.antiSpam?.enabled ? "✅ Enabled" : "❌ Disabled"}\n**Max Mentions:** ${config.antiSpam?.maxMentions || 4} pings/msg\n**Flood Limit:** >5 msgs in 3s`,
            inline: true,
          },
          {
            name: "📜 Anti-Nuke Whitelist",
            value: whitelistDisplay,
            inline: false,
          },
        )
        .setFooter({ text: "AURA Security Engine • Protecting community integrity" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "lockdown") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await interaction.deferReply();

      const count = await executeEmergencyLockdown(interaction.guild, enabled);
      return interaction.editReply({
        content: enabled
          ? `🚨 **Server lockdown engaged!** Chat disabled across **${count}** public channels.`
          : `🟢 **Lockdown lifted!** Normal permissions restored across **${count}** channels.`,
      });
    }

    if (sub === "log") {
      const channel = interaction.options.getChannel("channel", true);
      config.logChannelId = channel.id;
      saveGuildSecurity(interaction.guildId, config);

      return interaction.reply({
        content: `✅ Security audit logs will now be dispatched to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "antiraid") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const threshold = interaction.options.getInteger("join_threshold");
      const action = interaction.options.getString("action");

      config.antiRaid.enabled = enabled;
      if (threshold) config.antiRaid.joinThreshold = threshold;
      if (action) config.antiRaid.action = action;
      saveGuildSecurity(interaction.guildId, config);

      return interaction.reply({
        content: `✅ Anti-Raid defense **${enabled ? "ENABLED" : "DISABLED"}** (Threshold: ${config.antiRaid.joinThreshold} joins/10s, Action: \`${config.antiRaid.action}\`).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "antinuke") {
      const enabled = interaction.options.getBoolean("enabled", true);
      config.antiNuke.enabled = enabled;
      saveGuildSecurity(interaction.guildId, config);

      return interaction.reply({
        content: `✅ Anti-Nuke protection **${enabled ? "ENABLED" : "DISABLED"}** (Rogue admins mass-deleting channels/roles will be instantly stripped and banned).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "antispam") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const maxMentions = interaction.options.getInteger("max_mentions");

      config.antiSpam.enabled = enabled;
      if (maxMentions) config.antiSpam.maxMentions = maxMentions;
      saveGuildSecurity(interaction.guildId, config);

      return interaction.reply({
        content: `✅ Anti-Spam protection **${enabled ? "ENABLED" : "DISABLED"}** (Max mentions per message: ${config.antiSpam.maxMentions}).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "whitelist") {
      const action = interaction.options.getString("action", true);
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const targetId = user?.id || role?.id;

      config.whitelist ||= [];

      if (action === "list") {
        const display =
          config.whitelist.length > 0
            ? config.whitelist.map((id) => `<@${id}> / <@&${id}>`).join("\n• ")
            : "No users or roles whitelisted yet.";

        return interaction.reply({
          content: `📜 **Anti-Nuke Whitelist:**\n• ${display}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!targetId) {
        return interaction.reply({
          content: "❌ You must specify a user or role to add/remove.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === "add") {
        if (!config.whitelist.includes(targetId)) {
          config.whitelist.push(targetId);
          saveGuildSecurity(interaction.guildId, config);
        }
        return interaction.reply({
          content: `✅ Added <@${targetId}> to the Anti-Nuke whitelist.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === "remove") {
        config.whitelist = config.whitelist.filter((id) => id !== targetId);
        saveGuildSecurity(interaction.guildId, config);
        return interaction.reply({
          content: `✅ Removed <@${targetId}> from the Anti-Nuke whitelist.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
