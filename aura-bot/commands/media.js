const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const { getMediaConfig, saveMediaConfig } = require("../features/mediaFixer");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("media")
    .setDescription("Configure automatic link-to-video / reels / GIF embedding")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Check media link embedding status for this server"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable automatic media link expansion")
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Enable or disable auto video embeds")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("platforms")
        .setDescription("Configure which platforms to convert to playable videos")
        .addBooleanOption((opt) =>
          opt.setName("instagram").setDescription("Convert Instagram Reels and posts"),
        )
        .addBooleanOption((opt) =>
          opt.setName("tiktok").setDescription("Convert TikTok videos and clips"),
        )
        .addBooleanOption((opt) =>
          opt.setName("twitter").setDescription("Convert Twitter / X videos and clips"),
        )
        .addBooleanOption((opt) =>
          opt.setName("reddit").setDescription("Convert Reddit video clips"),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const config = getMediaConfig(interaction.guild.id);

    if (subcommand === "status") {
      const embed = new EmbedBuilder()
        .setColor(0xff2a55)
        .setTitle("🎥 AURA Media Link-To-Video Engine")
        .setDescription(
          "AURA automatically intercepts Instagram Reels, TikTok videos, Twitter/X clips, and Reddit videos and renders them as **full playable videos & GIFs directly in Discord** without leaving the chat.",
        )
        .addFields(
          { name: "⚡ Master Status", value: config.enabled ? "✅ **Active & Auto-Embedding**" : "❌ **Disabled**", inline: true },
          { name: "📸 Instagram Reels", value: config.instagram ? "Enabled" : "Disabled", inline: true },
          { name: "🎵 TikTok Videos", value: config.tiktok ? "Enabled" : "Disabled", inline: true },
          { name: "🐦 Twitter / X Clips", value: config.twitter ? "Enabled" : "Disabled", inline: true },
          { name: "🤖 Reddit Videos", value: config.reddit ? "Enabled" : "Disabled", inline: true },
        )
        .setFooter({ text: "Use /media toggle to switch on/off" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator permissions to configure media embedding.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled");
      saveMediaConfig(interaction.guild.id, { enabled });

      return interaction.reply({
        content: `✅ Media link auto-embedder is now **${enabled ? "ENABLED" : "DISABLED"}** in **${interaction.guild.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "platforms") {
      const instagram = interaction.options.getBoolean("instagram");
      const tiktok = interaction.options.getBoolean("tiktok");
      const twitter = interaction.options.getBoolean("twitter");
      const reddit = interaction.options.getBoolean("reddit");

      const updates = {};
      if (instagram !== null) updates.instagram = instagram;
      if (tiktok !== null) updates.tiktok = tiktok;
      if (twitter !== null) updates.twitter = twitter;
      if (reddit !== null) updates.reddit = reddit;

      saveMediaConfig(interaction.guild.id, updates);

      return interaction.reply({
        content: "✅ Platform settings updated successfully for media embedding.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
