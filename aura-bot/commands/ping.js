const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { formatDuration } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check AURA's latency, uptime, and system performance"),

  async execute(interaction) {
    const sent = await interaction.reply({
      content: "🏓 Pinging...",
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;
    const uptime = formatDuration(interaction.client.uptime || 0);

    const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalMemory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

    let statusColor = 0x57f287; // green
    if (roundtrip > 250 || wsPing > 200) statusColor = 0xfee75c; // yellow
    if (roundtrip > 500 || wsPing > 400) statusColor = 0xed4245; // red

    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle("🏓 AURA System Diagnostics")
      .addFields(
        { name: "API Roundtrip", value: `\`${roundtrip}ms\``, inline: true },
        { name: "WebSocket Heartbeat", value: `\`${wsPing}ms\``, inline: true },
        { name: "Uptime", value: `\`${uptime}\``, inline: true },
        { name: "Memory (Heap / RSS)", value: `\`${memoryUsage} MB / ${totalMemory} MB\``, inline: true },
        { name: "Servers Cached", value: `\`${interaction.client.guilds.cache.size}\``, inline: true },
        { name: "Environment", value: `Node.js \`${process.version}\` | Discord.js \`v14\``, inline: true },
      )
      .setFooter({ text: "AURA Bot • Performance Optimal" })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};