const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const {
  getBirthday,
  getAllBirthdays,
  setBirthday,
  saveBirthdaySettings,
  removeBirthday,
  parseBirthday,
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
        .setDescription("View upcoming birthdays in this server")
        .addIntegerOption((opt) => opt.setName("page").setDescription("Page number to view").setMinValue(1)),
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
      const parsed = parseBirthday(rawDate);
      if (!parsed.valid) {
        return interaction.reply({
          content: "❌ Invalid date format. Please use `DD/MM` (e.g. `24/05`), `DD/MM/YYYY` (e.g. `24/05/2004`), or month names (e.g. `24 May`).",
          flags: MessageFlags.Ephemeral,
        });
      }

      setBirthday(interaction.guild.id, interaction.user.id, parsed.formatted);

      return interaction.reply({
        content: `🎂 Your birthday has been saved as **${parsed.formatted}**! We'll celebrate when the day arrives.`,
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
      let entries = Object.entries(all);

      if (entries.length === 0) {
        return interaction.reply({
          content: "No birthdays have been registered in this server yet. Members can add theirs using `/birthday set <date>`!",
        });
      }

      // Calculate days until next birthday and sort nearest first
      const now = new Date();
      const currentYear = now.getFullYear();

      function getDaysUntil(dateText) {
        const parts = dateText.split("/");
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        let bday = new Date(currentYear, month - 1, day);
        if (bday < now && bday.toDateString() !== now.toDateString()) {
          bday = new Date(currentYear + 1, month - 1, day);
        }
        return Math.ceil((bday - now) / (1000 * 60 * 60 * 24));
      }

      entries.sort((a, b) => getDaysUntil(a[1].date) - getDaysUntil(b[1].date));

      let page = interaction.options.getInteger("page") || 1;
      const pageSize = 10;
      const totalPages = Math.ceil(entries.length / pageSize) || 1;
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      function buildBirthdayPayload(currPage) {
        const startIndex = (currPage - 1) * pageSize;
        const pageItems = entries.slice(startIndex, startIndex + pageSize);

        const lines = pageItems.map(([userId, item], index) => {
          const days = getDaysUntil(item.date);
          const timeText = days === 0 ? "🎉 **Today!**" : days === 1 ? "🎈 Tomorrow!" : `in **${days} days**`;
          return `• <@${userId}>: **${item.date}** (${timeText})`;
        });

        const embed = new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle("🎂 Upcoming Server Birthdays")
          .setDescription(lines.join("\n\n"))
          .setFooter({ text: `Page ${currPage} of ${totalPages} • Total Registered: ${entries.length}` })
          .setTimestamp();

        if (totalPages <= 1) {
          return { embeds: [embed], components: [] };
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("bday_first")
            .setLabel("⏮️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currPage === 1),
          new ButtonBuilder()
            .setCustomId("bday_prev")
            .setLabel("◀️ Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currPage === 1),
          new ButtonBuilder()
            .setCustomId("bday_page")
            .setLabel(`${currPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("bday_next")
            .setLabel("Next ▶️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currPage === totalPages),
          new ButtonBuilder()
            .setCustomId("bday_last")
            .setLabel("⏭️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currPage === totalPages)
        );

        return { embeds: [embed], components: [row] };
      }

      const reply = await interaction.reply({
        ...buildBirthdayPayload(page),
        fetchReply: true,
      });

      if (totalPages > 1) {
        const collector = reply.createMessageComponentCollector({
          time: 180000, // 3 minutes
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== interaction.user.id) {
            return i.reply({
              content: "Use `/birthday upcoming` to open your own interactive pagination.",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (i.customId === "bday_first") page = 1;
          else if (i.customId === "bday_prev") page = Math.max(1, page - 1);
          else if (i.customId === "bday_next") page = Math.min(totalPages, page + 1);
          else if (i.customId === "bday_last") page = totalPages;

          await i.update(buildBirthdayPayload(page));
        });

        collector.on("end", async () => {
          try {
            const finalPayload = buildBirthdayPayload(page);
            finalPayload.components = [];
            await reply.edit(finalPayload).catch(() => {});
          } catch {}
        });
      }

      return;
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

      const botMember = interaction.guild.members.me;
      const canManageMessages = subChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages);
      const permNotice = canManageMessages
        ? "✨ AURA has Manage Messages permission to automatically clean member date submissions."
        : `⚠️ **Important**: Please grant AURA **Manage Messages** permission in ${subChannel} so member date submissions can be automatically deleted after saving!`;

      return interaction.reply({
        content:
          `✅ **Birthday System Configured**\n` +
          `• Submission Channel: ${subChannel}\n` +
          `• Announcement Channel: ${annChannel}\n` +
          `• Birthday Role: ${role ? `${role}` : "None"}\n` +
          `• ${permNotice}\n\n` +
          `Members can now submit their date in ${subChannel} or via \`/birthday set\`!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set-user") {
      const targetUser = interaction.options.getUser("member", true);
      const rawDate = interaction.options.getString("date", true);
      const parsed = parseBirthday(rawDate);

      if (!parsed.valid) {
        return interaction.reply({
          content: "❌ Invalid date format. Use `DD/MM` (e.g. `24/05`), `DD/MM/YYYY` (e.g. `24/05/2004`), or month names (e.g. `24 May`).",
          flags: MessageFlags.Ephemeral,
        });
      }

      setBirthday(interaction.guild.id, targetUser.id, parsed.formatted);

      return interaction.reply({
        content: `✅ Saved birthday for ${targetUser} as **${parsed.formatted}**.`,
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