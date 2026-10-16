const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require("discord.js");

const { isAdmin } = require("../utils/helpers");
const { printReactionRolePanel } = require("./reactionRoles");
const { printRulesBoard } = require("./rules");
const { printAnnouncementPost } = require("./announcement");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("print")
    .setDescription("Print / post web-saved reaction roles, rules, or announcements into Discord")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reaction-role")
        .setDescription("Print/post reaction-role panel saved from website into a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("panel_id")
            .setDescription("Specific panel ID or title to print (defaults to latest)")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rules")
        .setDescription("Print/post server rules saved from website into a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("announcement")
        .setDescription("Print/post an announcement saved from website into a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("ping")
            .setDescription("Audience mention")
            .addChoices(
              { name: "None", value: "none" },
              { name: "@everyone", value: "everyone" },
              { name: "@here", value: "here" },
            )
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("announcement_id")
            .setDescription("Optional Announcement ID to print (defaults to latest)")
            .setRequired(false),
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

    const type = interaction.options.getSubcommand();

    if (type === "reaction-role") {
      return printReactionRolePanel(interaction);
    }

    if (type === "rules") {
      return printRulesBoard(interaction);
    }

    if (type === "announcement") {
      return printAnnouncementPost(interaction);
    }
  },
};
