const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

const {
  getStickyMessage,
  getAllStickies,
  setStickyMessage,
  removeStickyMessage,
} = require("../features/stickyMessages");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Create or manage sticky messages across channels")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Create or update a sticky message")
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("The text AURA should keep at the bottom of the channel")
            .setMinLength(1)
            .setMaxLength(1900)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt.setName("as_embed").setDescription("Display inside a neat embed").setRequired(false),
        )
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Embed title").setMaxLength(100).setRequired(false),
        )
        .addStringOption((opt) =>
          opt.setName("color").setDescription("Embed hex color, e.g. #5865F2").setMaxLength(7).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a sticky message")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to remove sticky from (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Check the sticky message in a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to inspect (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all active sticky messages in this server"),
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      return interaction.editReply("Use this command inside a server.");
    }

    const subcommand = interaction.options.getSubcommand();
    const needsPerm = subcommand === "set" || subcommand === "remove";

    if (needsPerm && !isAdmin(interaction.member) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.editReply("You need Manage Messages or Administrator permissions to manage sticky messages.");
    }

    const guildId = interaction.guild.id;

    if (subcommand === "list") {
      const all = getAllStickies(guildId);
      if (all.length === 0) {
        return interaction.editReply("No active sticky messages found in this server.");
      }

      const lines = all.map((s) => `• <#${s.channelId}> — \`${s.text.slice(0, 60)}${s.text.length > 60 ? "..." : ""}\``);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📌 Active Sticky Messages")
        .setDescription(lines.join("\n\n"));

      return interaction.editReply({ embeds: [embed] });
    }

    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    if (!targetChannel?.isTextBased()) {
      return interaction.editReply("Please select a valid text channel.");
    }

    if (subcommand === "set") {
      const text = interaction.options.getString("message", true);
      const asEmbed = interaction.options.getBoolean("as_embed") ?? false;
      const title = interaction.options.getString("title");
      const color = interaction.options.getString("color");

      const posted = await setStickyMessage(
        client,
        guildId,
        targetChannel.id,
        text,
        asEmbed,
        title,
        color,
      );

      if (!posted) {
        return interaction.editReply("Could not post sticky message. Check AURA's channel permissions.");
      }

      return interaction.editReply(`✅ Sticky message set in ${targetChannel}!`);
    }

    if (subcommand === "remove") {
      const removed = await removeStickyMessage(client, guildId, targetChannel.id);

      return interaction.editReply(
        removed
          ? `✅ Sticky message removed from ${targetChannel}.`
          : `There wasn't a sticky message active in ${targetChannel}.`,
      );
    }

    if (subcommand === "show") {
      const sticky = getStickyMessage(guildId, targetChannel.id);

      if (!sticky) {
        return interaction.editReply(`There is no sticky message set in ${targetChannel}.`);
      }

      return interaction.editReply(
        `📌 **Sticky message in ${targetChannel}:**\n\n${sticky.text}`,
      );
    }
  },
};