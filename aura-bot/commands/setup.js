const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const { getGreetingSettings } = require("../features/memberMessages");
const { getTicketSettings } = require("../features/ticketSettings");
const { getTempVoiceSettings } = require("../features/tempVoice");
const { getCountingData } = require("../features/counting");
const { getWordBuildingData } = require("../features/wordBuilding");
const { getSuggestionConfig } = require("../features/suggestions");
const { getBirthdaySettings } = require("../features/birthdays");
const { getLevelSettings } = require("../features/levels");
const { getInviteAnnouncementChannel } = require("../features/invites");
const { getAllStickies } = require("../features/stickyMessages");
const { getThreadSettings } = require("../features/threads");
const { getModLogChannel } = require("../features/moderation");
const { getGiveawayStore } = require("../features/giveaways");
const { getPollStore } = require("../features/polls");
const { readJson } = require("../utils/jsonStore");
const { saveCommandEnabled, isCommandEnabled } = require("../features/commandSettings");
const { isAdmin, fetchChannel } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("View server dashboard or toggle bot features")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("overview")
        .setDescription("View comprehensive dashboard of all AURA modules"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("permissions")
        .setDescription("Audit AURA's channel permissions across all configured channels"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable or disable a specific command in this server")
        .addStringOption((opt) =>
          opt
            .setName("command")
            .setDescription("Command name to toggle")
            .setRequired(true)
            .addChoices(
              { name: "/bump", value: "bump" },
              { name: "/remind", value: "remind" },
              { name: "/counting", value: "counting" },
              { name: "/wordbuilding", value: "wordbuilding" },
              { name: "/suggestion", value: "suggestion" },
              { name: "/level", value: "level" },
              { name: "/birthday", value: "birthday" },
              { name: "/voice", value: "voice" },
              { name: "/ticket", value: "ticket" },
              { name: "/say", value: "say" },
              { name: "/announcement", value: "announcement" },
              { name: "/rules", value: "rules" },
              { name: "/serverstats", value: "serverstats" },
              { name: "/invites", value: "invites" },
              { name: "/mod", value: "mod" },
              { name: "/giveaway", value: "giveaway" },
              { name: "/poll", value: "poll" },
              { name: "/profile", value: "profile" },
              { name: "/rep", value: "rep" },
              { name: "/afk", value: "afk" },
              { name: "/utility", value: "utility" },
              { name: "/security", value: "security" },
            ),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Set command enabled (true) or disabled (false)")
            .setRequired(true),
        ),
    ),

  async execute(interaction, bot) {
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

    const subcommand = interaction.options.getSubcommand() || "overview";

    if (subcommand === "toggle") {
      const commandName = interaction.options.getString("command", true);
      const enabled = interaction.options.getBoolean("enabled", true);

      saveCommandEnabled(interaction.guild.id, commandName, enabled);

      return interaction.reply({
        content: `⚙️ Command **/${commandName}** is now **${enabled ? "ENABLED" : "DISABLED"}** in this server.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "permissions") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const botMember = interaction.guild.members.me;
      const issues = [];

      const checkPerms = async (channelId, label, requiredPerms) => {
        if (!channelId) return;
        const channel = await fetchChannel(interaction.guild, channelId);
        if (!channel) {
          issues.push(`⚠️ **${label}**: Channel not found (\`${channelId}\`)`);
          return;
        }

        const perms = channel.permissionsFor(botMember);
        if (!perms) return;

        const missing = requiredPerms.filter((p) => !perms.has(p));
        if (missing.length > 0) {
          issues.push(`❌ **${label}** (${channel}): Missing permission(s)`);
        }
      };

      const greetings = getGreetingSettings(interaction.guild.id);
      await checkPerms(greetings.welcomeChannelId, "Welcome Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
      await checkPerms(greetings.goodbyeChannelId, "Goodbye Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

      const counting = getCountingData(interaction.guild.id);
      await checkPerms(counting?.channelId, "Counting Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]);

      const word = getWordBuildingData(interaction.guild.id);
      await checkPerms(word?.channelId, "Word Building Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages]);

      const bday = getBirthdaySettings(interaction.guild.id);
      await checkPerms(bday?.inputChannelId, "Birthday Input Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages]);
      await checkPerms(bday?.announcementChannelId, "Birthday Announcement Channel", [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

      const embed = new EmbedBuilder()
        .setColor(issues.length === 0 ? 0x57f287 : 0xed4245)
        .setTitle("🛡️ AURA Permission Audit")
        .setDescription(
          issues.length === 0
            ? "✅ **All permissions are healthy!** AURA has all necessary rights in all configured channels."
            : `Detected **${issues.length}** permission issue(s):\n\n${issues.join("\n")}`,
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === "overview") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const greetings = getGreetingSettings(interaction.guild.id);
      const tickets = getTicketSettings(interaction.guild.id);
      const voice = getTempVoiceSettings(interaction.guild.id);
      const counting = getCountingData(interaction.guild.id);
      const words = getWordBuildingData(interaction.guild.id);
      const sug = getSuggestionConfig(interaction.guild.id);
      const bdays = getBirthdaySettings(interaction.guild.id);
      const levels = getLevelSettings(interaction.guild.id);
      const inviteChan = getInviteAnnouncementChannel(interaction.guild.id);
      const stickies = getAllStickies(interaction.guild.id);
      const threads = getThreadSettings(interaction.guild.id);
      const rxPanels = (readJson("reaction-roles.json", { panels: [] }).panels || []).filter((p) => p.guildId === interaction.guild.id);
      const modLogChan = getModLogChannel(interaction.guild.id);
      const activeGiveaways = Object.values(getGiveawayStore()).filter((g) => g.guildId === interaction.guild.id && !g.ended).length;
      const activePolls = Object.values(getPollStore()).filter((p) => p.guildId === interaction.guild.id && !p.ended).length;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`⚡ ${interaction.guild.name} • AURA Control Center`)
        .setDescription("Live configuration overview of all server modules and channels:")
        .addFields(
          {
            name: "👋 Greetings",
            value: `Welcome: ${greetings.welcomeChannelId ? `<#${greetings.welcomeChannelId}>` : "Disabled"}\nGoodbye: ${greetings.goodbyeChannelId ? `<#${greetings.goodbyeChannelId}>` : "Disabled"}\nAuto-Role: ${greetings.autoRoleId ? `<@&${greetings.autoRoleId}>` : "None"}`,
            inline: true,
          },
          {
            name: "🎫 Tickets",
            value: `Category: ${tickets.categoryId ? `<#${tickets.categoryId}>` : "None"}\nStaff Roles: ${tickets.staffRoleIds.length ? `${tickets.staffRoleIds.length} role(s)` : "None"}`,
            inline: true,
          },
          {
            name: "🔊 Temp Voice",
            value: `Trigger: ${voice.triggerChannelId ? `<#${voice.triggerChannelId}>` : "Disabled"}\nCategory: ${voice.categoryId ? `<#${voice.categoryId}>` : "Default"}`,
            inline: true,
          },
          {
            name: "🔢 Counting Game",
            value: `Channel: ${counting?.channelId ? `<#${counting.channelId}>` : "Disabled"}\nCount: **${counting?.number || 0}** (Record: ${counting?.highScore || 0})`,
            inline: true,
          },
          {
            name: "🔤 Word Building",
            value: `Channel: ${words?.channelId ? `<#${words.channelId}>` : "Disabled"}\nChain: **${words?.chainCount || 0}** (Record: ${words?.highScore || 0})`,
            inline: true,
          },
          {
            name: "💡 Suggestions",
            value: `Channel: ${sug?.channelId ? `<#${sug.channelId}>` : "Disabled"}\nType: **${sug?.isForum ? "Forum" : "Text"}**`,
            inline: true,
          },
          {
            name: "🎂 Birthdays",
            value: `Input: ${bdays?.inputChannelId ? `<#${bdays.inputChannelId}>` : "Disabled"}\nAnnounce: ${bdays?.announcementChannelId ? `<#${bdays.announcementChannelId}>` : "Disabled"}`,
            inline: true,
          },
          {
            name: "🏆 Leveling",
            value: `Announce: ${levels.announcementChannelId ? `<#${levels.announcementChannelId}>` : "Default"}\nRewards: **${Object.keys(levels.roleRewards || {}).length}** role(s)`,
            inline: true,
          },
          {
            name: "📨 Invites",
            value: `Announce: ${inviteChan ? `<#${inviteChan}>` : "Disabled"}`,
            inline: true,
          },
          {
            name: "📌 Sticky Messages",
            value: `Active in **${stickies.length}** channel(s)`,
            inline: true,
          },
          {
            name: "🧵 Auto-Threads",
            value: `Active in **${Object.keys(threads).length}** channel(s)`,
            inline: true,
          },
          {
            name: "🎭 Reaction Roles",
            value: `**${rxPanels.length}** active panel(s)`,
            inline: true,
          },
          {
            name: "🛡️ Moderation Logs",
            value: modLogChan ? `<#${modLogChan}>` : "Disabled",
            inline: true,
          },
          {
            name: "🎉 Giveaways",
            value: `**${activeGiveaways}** active`,
            inline: true,
          },
          {
            name: "📊 Polls",
            value: `**${activePolls}** active`,
            inline: true,
          },
        )
        .setFooter({ text: "Use /help to view command options or /setup toggle to enable/disable commands" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};