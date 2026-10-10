const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");

const {
  getTicketSettings,
  saveTicketSettings,
  getTicketRoleIds,
  saveTicketRoleIds,
} = require("../features/ticketSettings");
const { generateTranscript } = require("../features/tickets");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Configure, open, or manage support tickets")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Configure and post the ticket button panel (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where the ticket button panel will be posted")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category where new ticket channels will be created")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Custom panel title")
            .setMaxLength(100)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Custom panel instructions")
            .setMaxLength(1000)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("button_label")
            .setDescription("Custom button label, e.g. 'Create Ticket'")
            .setMaxLength(40)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("roles")
        .setDescription("Set ticket staff roles (Admin only)")
        .addRoleOption((opt) => opt.setName("role1").setDescription("Staff role 1").setRequired(true))
        .addRoleOption((opt) => opt.setName("role2").setDescription("Staff role 2").setRequired(false))
        .addRoleOption((opt) => opt.setName("role3").setDescription("Staff role 3").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close and archive this ticket")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for closing the ticket")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a member to this ticket")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to add")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a member from this ticket")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rename")
        .setDescription("Rename this ticket channel")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("New channel name")
            .setRequired(true)
            .setMaxLength(50),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("transcript")
        .setDescription("Generate and export a conversation transcript of this ticket"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("claim")
        .setDescription("Claim this ticket as the active staff handler"),
    ),

  async execute(interaction) {
    const { guild, channel } = interaction;

    if (!guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. Admin setup subcommand
    if (subcommand === "setup") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "You need administrator or server management permissions to set up tickets.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const panelChannel = interaction.options.getChannel("channel", true);
      const category = interaction.options.getChannel("category");
      const title = interaction.options.getString("title") || "📩 Support & Inquiries";
      const description =
        interaction.options.getString("description") ||
        "Need assistance from our staff team? Click the button below to open a private ticket. Our staff will respond as soon as possible.";
      const buttonLabel = interaction.options.getString("button_label") || "Open a ticket";

      const botMember = guild.members.me;
      const permissions = panelChannel.permissionsFor(botMember);

      if (
        !permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !permissions?.has(PermissionFlagsBits.SendMessages) ||
        !permissions?.has(PermissionFlagsBits.EmbedLinks)
      ) {
        return interaction.reply({
          content: `AURA needs View Channel, Send Messages, and Embed Links permissions in ${panelChannel}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const openButton = new ButtonBuilder()
          .setCustomId("aura_open_ticket")
          .setLabel(buttonLabel)
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(openButton);

        const panelEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(title)
          .setDescription(description)
          .setFooter({ text: "AURA Ticket System • One ticket per member at a time" });

        await panelChannel.send({
          embeds: [panelEmbed],
          components: [row],
        });

        const toSave = { panelChannelId: panelChannel.id };
        if (category) {
          toSave.categoryId = category.id;
        }
        saveTicketSettings(guild.id, toSave);

        return interaction.editReply(
          `✅ Ticket panel successfully posted in ${panelChannel}!\n` +
          `• Category: ${category ? `${category.name}` : "Default (No category)"}`,
        );
      } catch (error) {
        console.error("Could not post the ticket panel:", error);
        return interaction.editReply("Could not post the ticket panel. Please check AURA's permissions.");
      }
    }

    if (subcommand === "roles") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "You need administrator or server management permissions to configure roles.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const roles = [
        interaction.options.getRole("role1"),
        interaction.options.getRole("role2"),
        interaction.options.getRole("role3"),
      ].filter(Boolean);

      const roleIds = [...new Set(roles.map((r) => r.id))];
      saveTicketRoleIds(guild.id, roleIds);

      return interaction.reply({
        content:
          `✅ Ticket staff roles saved for **${guild.name}**:\n` +
          roleIds.map((id) => `• <@&${id}>`).join("\n"),
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Ticket in-channel management
    const isTicket = channel?.topic?.includes("AURA_TICKET_OWNER:");
    if (!isTicket) {
      return interaction.reply({
        content: "This command must be run inside an active AURA ticket channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const ownerMatch = channel.topic?.match(/AURA_TICKET_OWNER:(\d+)/);
    const ownerId = ownerMatch ? ownerMatch[1] : null;
    const isOwner = ownerId === interaction.user.id;
    const settings = getTicketSettings(guild.id);
    const isStaffOrAdmin =
      isAdmin(interaction.member) ||
      settings.staffRoleIds.some((id) => interaction.member?.roles.cache.has(id));

    if (!isOwner && !isStaffOrAdmin) {
      return interaction.reply({
        content: "Only ticket staff, administrators, or the ticket creator can manage this ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "close") {
      const reason = interaction.options.getString("reason") || "No reason specified";

      await interaction.reply({
        content: `🔒 Ticket closing in 5 seconds. Reason: **${reason}**... Generating transcript...`,
      });

      if (ownerId) {
        try {
          const buffer = await generateTranscript(channel);
          if (buffer) {
            const ticketUser = await guild.members.fetch(ownerId).catch(() => null);
            if (ticketUser) {
              const attachment = new AttachmentBuilder(buffer, {
                name: `transcript-${channel.name}.txt`,
              });
              await ticketUser.send({
                content: `Your ticket **#${channel.name}** in **${guild.name}** has been closed. Reason: *${reason}*. Here is your transcript:`,
                files: [attachment],
              }).catch(() => {});
            }
          }
        } catch {}
      }

      setTimeout(async () => {
        await channel.delete(`Closed by ${interaction.user.tag}: ${reason}`).catch(console.error);
      }, 5000);
      return;
    }

    if (subcommand === "add") {
      const member = interaction.options.getMember("member");
      if (!member) {
        return interaction.reply({
          content: "Could not find that member in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });

      return interaction.reply({
        content: `➕ Added ${member} to this ticket.`,
      });
    }

    if (subcommand === "remove") {
      const member = interaction.options.getMember("member");
      if (!member) {
        return interaction.reply({
          content: "Could not find that member in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (member.id === ownerId) {
        return interaction.reply({
          content: "You cannot remove the creator of the ticket.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await channel.permissionOverwrites.delete(member.id);

      return interaction.reply({
        content: `➖ Removed ${member} from this ticket.`,
      });
    }

    if (subcommand === "rename") {
      const newName = interaction.options.getString("name", true).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      await channel.setName(newName);

      return interaction.reply({
        content: `✏️ Ticket channel renamed to **${newName}**.`,
      });
    }

    if (subcommand === "transcript") {
      await interaction.deferReply();

      const buffer = await generateTranscript(channel);
      if (!buffer) {
        return interaction.editReply("Could not generate transcript.");
      }

      const attachment = new AttachmentBuilder(buffer, {
        name: `transcript-${channel.name}.txt`,
      });

      return interaction.editReply({
        content: `📄 Here is the transcript for **#${channel.name}**:`,
        files: [attachment],
      });
    }

    if (subcommand === "claim") {
      if (!isStaffOrAdmin) {
        return interaction.reply({
          content: "Only ticket staff or administrators can claim tickets.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentTopic = channel.topic || "";
      await channel.setTopic(`${currentTopic} | Claimed: ${interaction.user.tag}`).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`🙋 **${interaction.user} has claimed this ticket** and will handle your request.`);

      return interaction.reply({ embeds: [embed] });
    }
  },
};
