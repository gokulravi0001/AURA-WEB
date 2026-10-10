const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  addReminder,
  getUserReminders,
  cancelReminder,
} = require("../features/reminders");
const { parseDuration, formatDuration } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set and manage personal reminders")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set a reminder")
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("When to remind you (e.g. 10m, 2h, 1d, 30s)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("What to remind you about")
            .setMaxLength(500)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List your active reminders"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel an active reminder")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Reminder ID").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const durationStr = interaction.options.getString("duration", true);
      const message = interaction.options.getString("message", true);

      const ms = parseDuration(durationStr);
      if (!ms || ms < 10000) {
        return interaction.reply({
          content: "❌ Invalid time format. Examples: `10m`, `2h`, `1d`, `30s` (minimum 10 seconds).",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (ms > 30 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
          content: "❌ Reminder duration cannot exceed 30 days.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const remindAt = Date.now() + ms;
      addReminder({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        message,
        remindAt,
      });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("⏰ Reminder Set!")
        .setDescription(
          `I will remind you <t:${Math.floor(remindAt / 1000)}:R>:\n> ${message}`,
        )
        .setFooter({ text: `Set for ${formatDuration(ms)} from now` });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === "list") {
      const list = getUserReminders(interaction.user.id);

      if (list.length === 0) {
        return interaction.reply({
          content: "You don't have any pending reminders.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const lines = list.map((r) => {
        return `• ID: \`${r.id}\` — <t:${Math.floor(r.remindAt / 1000)}:R>\n  > ${r.message || "Bump server"}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⏰ Your Active Reminders")
        .setDescription(lines.join("\n\n"));

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === "cancel") {
      const id = interaction.options.getString("id", true);
      const cancelled = cancelReminder(id, interaction.user.id);

      return interaction.reply({
        content: cancelled
          ? `✅ Cancelled reminder \`${id}\`.`
          : `Could not find a reminder with ID \`${id}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
