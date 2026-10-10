const {
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const { getTicketSettings } = require("./ticketSettings");
const { isAdmin } = require("../utils/helpers");

async function generateTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = [
      `============================================================`,
      `AURA TICKET TRANSCRIPT: #${channel.name}`,
      `Guild: ${channel.guild.name} (${channel.guild.id})`,
      `Exported: ${new Date().toISOString()}`,
      `Topic: ${channel.topic || "None"}`,
      `Total Messages: ${sorted.length}`,
      `============================================================\n`,
    ];

    for (const msg of sorted) {
      const time = new Date(msg.createdTimestamp).toLocaleString();
      const author = `${msg.author.tag} (${msg.author.id})`;
      lines.push(`[${time}] ${author}:`);
      if (msg.content) lines.push(`  ${msg.content}`);
      if (msg.attachments.size > 0) {
        msg.attachments.forEach((att) => {
          lines.push(`  [Attachment: ${att.url}]`);
        });
      }
      if (msg.embeds.length > 0) {
        msg.embeds.forEach((emb, i) => {
          lines.push(`  [Embed ${i + 1}: ${emb.title || "No Title"} - ${emb.description || "No Desc"}]`);
        });
      }
      lines.push("");
    }

    return Buffer.from(lines.join("\n"), "utf-8");
  } catch (error) {
    console.error("Failed to generate ticket transcript:", error);
    return null;
  }
}

function registerTicketEvents(bot) {
  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // 1. Open Ticket Button
    if (interaction.customId === "aura_open_ticket") {
      if (!interaction.guild) {
        return interaction.reply({
          content: "Tickets can only be opened inside a server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const settings = getTicketSettings(interaction.guild.id);
      const staffRoleIds = settings.staffRoleIds || [];

      // Check if user already has an active ticket
      const existingTicket = interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.topic?.includes(`AURA_TICKET_OWNER:${interaction.user.id}`),
      );

      if (existingTicket) {
        return interaction.reply({
          content: `You already have an open ticket in ${existingTicket}. Please use that channel or close it first.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const safeUsername = interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .slice(0, 75);

        const staffPermissionOverwrites = staffRoleIds.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        }));

        const parentCategory = settings.categoryId || undefined;

        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${safeUsername}`,
          type: ChannelType.GuildText,
          parent: parentCategory,
          topic: `AURA_TICKET_OWNER:${interaction.user.id} | Status: Open`,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
              ],
            },
            ...staffPermissionOverwrites,
            {
              id: bot.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
              ],
            },
          ],
        });

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🎫 Ticket: ${interaction.user.username}`)
          .setDescription(
            `Welcome ${interaction.user}! Please describe your issue or inquiry in detail.\n` +
            `A member of our staff team will be with you shortly.`,
          )
          .addFields(
            { name: "Opened By", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
            { name: "Status", value: "🟢 Open", inline: true },
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        const closeBtn = new ButtonBuilder()
          .setCustomId("aura_close_ticket")
          .setLabel("Close Ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger);

        const claimBtn = new ButtonBuilder()
          .setCustomId("aura_claim_ticket")
          .setLabel("Claim Ticket")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Success);

        const transcriptBtn = new ButtonBuilder()
          .setCustomId("aura_transcript_ticket")
          .setLabel("Transcript")
          .setEmoji("📄")
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(closeBtn, claimBtn, transcriptBtn);

        const pingContent = staffRoleIds.length > 0
          ? `${interaction.user} ${staffRoleIds.map((id) => `<@&${id}>`).join(" ")}`
          : `${interaction.user}`;

        await ticketChannel.send({
          content: pingContent,
          embeds: [embed],
          components: [row],
        });

        await interaction.editReply(`Your ticket has been opened: ${ticketChannel}`);
      } catch (error) {
        console.error("Could not create ticket:", error);
        await interaction.editReply(
          "Could not create your ticket. Please check AURA's Manage Channels permissions and ticket settings.",
        );
      }

      return;
    }

    // 2. Claim Ticket Button
    if (interaction.customId === "aura_claim_ticket") {
      const channel = interaction.channel;
      const guild = interaction.guild;
      if (!guild || !channel) return;

      const settings = getTicketSettings(guild.id);
      const isStaffOrAdmin = isAdmin(interaction.member) ||
        settings.staffRoleIds.some((id) => interaction.member?.roles.cache.has(id));

      if (!isStaffOrAdmin) {
        return interaction.reply({
          content: "Only ticket staff members or server administrators can claim tickets.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentTopic = channel.topic || "";
      await channel.setTopic(`${currentTopic} | Claimed: ${interaction.user.tag}`).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`🙋 **${interaction.user} has claimed this ticket** and will assist you.`);

      return interaction.reply({ embeds: [embed] });
    }

    // 3. Transcript Button
    if (interaction.customId === "aura_transcript_ticket") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const buffer = await generateTranscript(interaction.channel);
      if (!buffer) {
        return interaction.editReply("Could not generate transcript.");
      }

      const attachment = new AttachmentBuilder(buffer, {
        name: `transcript-${interaction.channel.name}.txt`,
      });

      return interaction.editReply({
        content: "Here is the conversation transcript for this ticket:",
        files: [attachment],
      });
    }

    // 4. Close Ticket Button
    if (interaction.customId === "aura_close_ticket") {
      const channel = interaction.channel;
      const guild = interaction.guild;

      if (!guild || !channel) {
        return interaction.reply({
          content: "This ticket cannot be closed from here.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const ownerMatch = channel.topic?.match(/AURA_TICKET_OWNER:(\d+)/);
      const ownerId = ownerMatch ? ownerMatch[1] : null;
      const isOwner = ownerId === interaction.user.id;
      const isStaffOrAdmin = isAdmin(interaction.member) ||
        getTicketSettings(guild.id).staffRoleIds.some((id) => interaction.member?.roles.cache.has(id));

      if (!isOwner && !isStaffOrAdmin) {
        return interaction.reply({
          content: "Only the ticket owner, ticket staff, or an administrator can close this ticket.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `🔒 Ticket closing in 5 seconds by ${interaction.user}... Generating transcript...`,
      });

      // Try sending transcript to user if possible
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
                content: `Your ticket **#${channel.name}** in **${guild.name}** has been closed. Here is your transcript:`,
                files: [attachment],
              }).catch(() => {});
            }
          }
        } catch {
          // Ignore DM errors
        }
      }

      setTimeout(async () => {
        await channel.delete("Ticket closed").catch((err) => {
          console.error("Could not delete ticket channel:", err);
        });
      }, 5000);
    }
  });
}

module.exports = {
  registerTicketEvents,
  generateTranscript,
};