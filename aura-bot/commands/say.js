const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Have AURA broadcast a message or embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("The message AURA should post")
        .setMaxLength(3000)
        .setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post in (defaults to current)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addBooleanOption((opt) =>
      opt
        .setName("embed")
        .setDescription("Send as an embed")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Embed title")
        .setMaxLength(256)
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("color")
        .setDescription("Embed hex color, e.g. #5865F2")
        .setMaxLength(7)
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("image_url")
        .setDescription("Optional image URL for the embed")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("footer")
        .setDescription("Optional embed footer text")
        .setMaxLength(100)
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("ping")
        .setDescription("Audience to ping")
        .addChoices(
          { name: "None", value: "none" },
          { name: "@everyone", value: "everyone" },
          { name: "@here", value: "here" },
        )
        .setRequired(false),
    )
    .addRoleOption((opt) =>
      opt
        .setName("role_ping")
        .setDescription("Specific role to ping")
        .setRequired(false),
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
        content: "You need administrator or server management permissions to use `/say`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    if (!targetChannel?.isTextBased()) {
      return interaction.reply({
        content: "Please select a valid text channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const messageText = interaction.options.getString("message", true);
    const useEmbed = interaction.options.getBoolean("embed") ?? false;
    const title = interaction.options.getString("title");
    const colorHex = interaction.options.getString("color");
    const imageUrl = interaction.options.getString("image_url");
    const footerText = interaction.options.getString("footer");
    const pingChoice = interaction.options.getString("ping") || "none";
    const rolePing = interaction.options.getRole("role_ping");

    let ping = "";
    if (rolePing) ping = `${rolePing}`;
    else if (pingChoice === "everyone") ping = "@everyone";
    else if (pingChoice === "here") ping = "@here";

    try {
      if (useEmbed || title || imageUrl) {
        const color = colorHex ? parseInt(colorHex.replace("#", ""), 16) : 0x5865f2;

        const embed = new EmbedBuilder()
          .setColor(isNaN(color) ? 0x5865f2 : color)
          .setDescription(messageText)
          .setTimestamp();

        if (title) embed.setTitle(title);
        if (imageUrl) embed.setImage(imageUrl);
        if (footerText) embed.setFooter({ text: footerText });

        await targetChannel.send({
          content: ping || undefined,
          embeds: [embed],
        });
      } else {
        await targetChannel.send({
          content: `${ping ? `${ping}\n` : ""}${messageText}`,
        });
      }

      await interaction.reply({
        content: `✅ Message sent to ${targetChannel}!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Could not post /say message:", error);
      await interaction.reply({
        content: "Could not send message. Check AURA's channel permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
