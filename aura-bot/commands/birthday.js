const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  getBirthday,
  getAllBirthdays,
  setBirthday,
  saveBirthdaySettings,
  removeBirthday,
  isValidBirthday,
  formatBirthdayString,
} = require("../features/birthdays");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Set, view, or manage birthday celebrations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set your birthday directly (DD/MM or DD/MM/YYYY)")
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("Your birthday, e.g. 15/08 or 15/08/2005")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Check your or another member's saved birthday")
        .addUserOption((opt) => opt.setName("member").setDescription("Member to check").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Delete your saved birthday"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("upcoming")
        .setDescription("View upcoming birthdays in this server"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Configure birthday channels and roles (Admin only)")
        .addChannelOption((opt) =>
          opt
            .setName("submission_channel")
            .setDescription("Channel where members type their birthday date")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("announcement_channel")
            .setDescription("Channel where birthday wishes are posted")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addRoleOption((opt) =>
          opt
            .setName("birthday_role")
            .setDescription("Optional role given to members on their birthday")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-user")
        .setDescription("Set a birthday for a specific member (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Member").setRequired(true))
        .addStringOption((opt) => opt.setName("date").setDescription("Date (DD/MM or DD/MM/YYYY)").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-user")
        .setDescription("Remove a member's saved birthday (Admin only)")
        .addUserOption((opt) => opt.setName("member").setDescription("Member").setRequired(true)),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const adminCommands = ["setup", "set-user", "remove-user"];

    if (adminCommands.includes(subcommand) && !isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set") {
      const rawDate = interaction.options.getString("date", true);
      if (!isValidBirthday(rawDate)) {
        return interaction.reply({
          content: "❌ Invalid date format. Please use `DD/MM` (e.g. `24/05`) or `DD/MM/YYYY` (e.g. `24/05/2004`).",
          flags: MessageFlags.Ephemeral,
        });
      }

      const formatted = formatBirthdayString(rawDate);
      setBirthday(interaction.guild.id, interaction.user.id, formatted);

      return interaction.reply({
        content: `🎂 Your birthday has been saved as **${formatted}**! We'll celebrate when the day arrives.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "show") {
      const targetUser = interaction.options.getUser("member") || interaction.user;
      const bday = getBirthday(interaction.guild.id, targetUser.id);

      if (!bday) {
        return interaction.reply({
          content: targetUser.id === interaction.user.id
            ? "You don't have a birthday saved yet. Use `/birthday set <date>`!"
            : `${targetUser.username} does not have a saved birthday.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: `🎂 ${targetUser.id === interaction.user.id ? "Your" : `${targetUser.username}'s`} saved birthday is **${bday.date}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "remove") {
      const removed = removeBirthday(interaction.guild.id, interaction.user.id);
      return interaction.reply({
        content: removed
          ? "✅ Your saved birthday has been removed."
          : "You don't have a saved birthday to remove.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "upcoming") {
      const all = getAllBirthdays(interaction.guild.id);
      const entries = Object.entries(all);

      if (entries.length === 0) {
        return interaction.reply({
          content: "No birthdays have been registered in this server yet.",
        });
      }

      const list = entries.slice(0, 15).map(([userId, item]) => `• <@${userId}>: **${item.date}**`).join("\n");

      const embed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle("🎂 Registered Server Birthdays")
        .setDescription(list)
        .setFooter({ text: `Total Registered: ${entries.length}` });

      return interaction.reply({ embeds: [embed] });
    }

    // Admin Commands
    if (subcommand === "setup") {
      const subChannel = interaction.options.getChannel("submission_channel", true);
      const annChannel = interaction.options.getChannel("announcement_channel", true);
      const role = interaction.options.getRole("birthday_role");

      saveBirthdaySettings(interaction.guild.id, {
        inputChannelId: subChannel.id,
        announcementChannelId: annChannel.id,
        birthdayRoleId: role ? role.id : null,
      });

      return interaction.reply({
        content:
          `✅ **Birthday System Configured**\n` +
          `• Submission Channel: ${subChannel}\n` +
          `• Announcement Channel: ${annChannel}\n` +
          `• Birthday Role: ${role ? `${role}` : "None"}\n` +
          `Members can submit their date in ${subChannel} or via \`/birthday set\`!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set-user") {
      const targetUser = interaction.options.getUser("member", true);
      const rawDate = interaction.options.getString("date", true);

      if (!isValidBirthday(rawDate)) {
        return interaction.reply({
          content: "❌ Invalid date format. Use `DD/MM` or `DD/MM/YYYY`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const formatted = formatBirthdayString(rawDate);
      setBirthday(interaction.guild.id, targetUser.id, formatted);

      return interaction.reply({
        content: `✅ Saved birthday for ${targetUser} as **${formatted}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "remove-user") {
      const targetUser = interaction.options.getUser("member", true);
      const removed = removeBirthday(interaction.guild.id, targetUser.id);

      return interaction.reply({
        content: removed
          ? `✅ Removed birthday for ${targetUser}.`
          : `${targetUser.username} did not have a registered birthday.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};