const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { addReminder } = require("../features/reminders");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bump")
    .setDescription("Set a server bump reminder for 2 hours from now"),

  async execute(interaction) {
    const remindAt = Date.now() + 2 * 60 * 60 * 1000;

    addReminder({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      message: "It's time to bump the server using `/bump` or your bump bot!",
      remindAt,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("⏰ Bump Reminder Set!")
      .setDescription(
        `I will remind you to bump this server in this channel <t:${Math.floor(remindAt / 1000)}:R> (<t:${Math.floor(remindAt / 1000)}:t>).`,
      )
      .setFooter({ text: "AURA Reminders" });

    await interaction.reply({ embeds: [embed] });
  },
};