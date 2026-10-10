const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const { readJson, writeJson } = require("../utils/jsonStore");
const { isAdmin, fetchChannel, fetchMessage } = require("../utils/helpers");

const IST_OFFSET_MINUTES = 330;

function getEvents() {
  const events = readJson("events.json", []);
  return Array.isArray(events) ? events : [];
}

function parseIstDateTime(input) {
  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const dateAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(dateAsUtc);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return dateAsUtc - IST_OFFSET_MINUTES * 60 * 1000;
}

function makeEventEmbed(event, guildName) {
  const cancelled = event.status === "cancelled";

  return new EmbedBuilder()
    .setColor(cancelled ? 0x777777 : 0x8a2be2)
    .setAuthor({ name: `${guildName} • EVENTS` })
    .setTitle(cancelled ? `🚫 CANCELLED • ${event.title}` : `📅 ${event.title}`)
    .setDescription(event.description)
    .addFields(
      { name: "Start Time", value: `<t:${Math.floor(event.startsAt / 1000)}:F> (<t:${Math.floor(event.startsAt / 1000)}:R>)`, inline: true },
      { name: "Status", value: cancelled ? "❌ Cancelled" : "🟢 Upcoming", inline: true },
    )
    .setFooter({ text: `Event ID: ${event.id} • Reminder sent 15 mins prior` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create, manage, and track server events")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create and announce a new event")
        .addStringOption((opt) => opt.setName("title").setDescription("Event name").setMaxLength(200).setRequired(true))
        .addStringOption((opt) => opt.setName("description").setDescription("Event details").setMaxLength(3000).setRequired(true))
        .addStringOption((opt) => opt.setName("start_time").setDescription("Time in IST format: 2026-10-15 19:30").setRequired(true))
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post event in (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((opt) => opt.setName("mention_role").setDescription("Role to ping for reminder").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing event's details")
        .addStringOption((opt) => opt.setName("event_id").setDescription("Event ID").setRequired(true))
        .addStringOption((opt) => opt.setName("title").setDescription("New title").setMaxLength(200).setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("New description").setMaxLength(3000).setRequired(false))
        .addStringOption((opt) => opt.setName("start_time").setDescription("New time in IST: YYYY-MM-DD HH:mm").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Mark an event as cancelled")
        .addStringOption((opt) => opt.setName("event_id").setDescription("Event ID").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an event message and purge from database")
        .addStringOption((opt) => opt.setName("event_id").setDescription("Event ID").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all upcoming events in this server"),
    ),

  async execute(interaction) {
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const action = interaction.options.getSubcommand();
    const events = getEvents();

    if (action === "create") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description", true);
      const timeStr = interaction.options.getString("start_time", true);
      const mentionRole = interaction.options.getRole("mention_role");

      const startsAt = parseIstDateTime(timeStr);
      if (!startsAt) {
        return interaction.editReply("❌ Enter a valid date & time in format: `YYYY-MM-DD HH:mm` (e.g. `2026-10-15 19:30`).");
      }

      if (startsAt < Date.now() + 5 * 60 * 1000) {
        return interaction.editReply("Choose a start time at least 5 minutes in the future.");
      }

      const event = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: "",
        title,
        description,
        startsAt,
        remindAt: startsAt - 15 * 60 * 1000,
        reminderSent: false,
        mentionRole: mentionRole ? mentionRole.id : null,
        status: "upcoming",
      };

      try {
        const message = await channel.send({
          embeds: [makeEventEmbed(event, interaction.guild.name)],
        });

        event.messageId = message.id;
        events.push(event);
        writeJson("events.json", events);

        return interaction.editReply(`✅ Event **${title}** created in ${channel}! [Jump to Message](${message.url})`);
      } catch (error) {
        console.error("Could not post event:", error);
        return interaction.editReply("Could not post event. Check AURA's channel permissions.");
      }
    }

    if (action === "list") {
      const serverEvents = events.filter((e) => e.guildId === interaction.guildId && e.startsAt > Date.now());

      if (serverEvents.length === 0) {
        return interaction.editReply("There are no upcoming events scheduled for this server.");
      }

      const lines = serverEvents.map((e) => {
        const status = e.status === "cancelled" ? "❌ Cancelled" : "🟢 Upcoming";
        return `• **${e.title}** — <t:${Math.floor(e.startsAt / 1000)}:F>\n  ID: \`${e.id}\` · Channel: <#${e.channelId}> · Status: ${status}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x8a2be2)
        .setTitle("📅 Server Scheduled Events")
        .setDescription(lines.join("\n\n"));

      return interaction.editReply({ embeds: [embed] });
    }

    const eventId = interaction.options.getString("event_id", true);
    const eventIndex = events.findIndex((e) => e.id === eventId && e.guildId === interaction.guildId);

    if (eventIndex === -1) {
      return interaction.editReply(`Could not find event with ID \`${eventId}\`. Check \`/event list\`.`);
    }

    const event = events[eventIndex];
    const channel = await fetchChannel(interaction.guild, event.channelId);

    if (action === "delete") {
      if (channel) {
        const msg = await fetchMessage(channel, event.messageId);
        if (msg) await msg.delete().catch(() => {});
      }

      events.splice(eventIndex, 1);
      writeJson("events.json", events);

      return interaction.editReply(`✅ Event \`${eventId}\` deleted.`);
    }

    if (action === "cancel") {
      event.status = "cancelled";

      if (channel) {
        const msg = await fetchMessage(channel, event.messageId);
        if (msg) {
          await msg.edit({ embeds: [makeEventEmbed(event, interaction.guild.name)] }).catch(() => {});
        }
      }

      writeJson("events.json", events);
      return interaction.editReply(`✅ Event **${event.title}** marked as cancelled.`);
    }

    if (action === "edit") {
      const newTitle = interaction.options.getString("title");
      const newDesc = interaction.options.getString("description");
      const newTime = interaction.options.getString("start_time");

      if (!newTitle && !newDesc && !newTime) {
        return interaction.editReply("Provide at least one field to edit.");
      }

      if (newTitle) event.title = newTitle;
      if (newDesc) event.description = newDesc;
      if (newTime) {
        const startsAt = parseIstDateTime(newTime);
        if (!startsAt) return interaction.editReply("Invalid date & time format. Use `YYYY-MM-DD HH:mm`.");
        event.startsAt = startsAt;
        event.remindAt = startsAt - 15 * 60 * 1000;
        event.reminderSent = false;
      }

      if (channel) {
        const msg = await fetchMessage(channel, event.messageId);
        if (msg) {
          await msg.edit({ embeds: [makeEventEmbed(event, interaction.guild.name)] }).catch(() => {});
        }
      }

      writeJson("events.json", events);
      return interaction.editReply(`✅ Event **${event.title}** has been updated.`);
    }
  },
};
