const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const { readJson, writeJson } = require("../utils/jsonStore");
const { isAdmin, fetchChannel, fetchMessage } = require("../utils/helpers");

function getAnnouncements() {
  const announcements = readJson("announcements.json", []);
  return Array.isArray(announcements) ? announcements : [];
}

function buildAnnouncementEmbed(data) {
  const color = data.color ? parseInt(data.color.replace("#", ""), 16) : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(isNaN(color) ? 0x5865f2 : color)
    .setTitle(data.title)
    .setDescription(data.description)
    .setTimestamp(data.createdAt || Date.now());

  if (data.imageUrl) {
    embed.setImage(data.imageUrl);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announcement")
    .setDescription("Create, edit, or delete server announcements")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Publish an announcement")
        .addStringOption((opt) => opt.setName("title").setDescription("Announcement title").setMaxLength(256).setRequired(true))
        .addStringOption((opt) => opt.setName("description").setDescription("Announcement content").setMaxLength(3500).setRequired(true))
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("ping")
            .setDescription("Mention audience")
            .addChoices(
              { name: "None", value: "none" },
              { name: "@everyone", value: "everyone" },
              { name: "@here", value: "here" },
            )
            .setRequired(false),
        )
        .addRoleOption((opt) => opt.setName("role_ping").setDescription("Specific role to ping").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Embed hex color, e.g. #5865F2").setMaxLength(7).setRequired(false))
        .addStringOption((opt) => opt.setName("image_url").setDescription("Image or banner URL").setRequired(false))
        .addBooleanOption((opt) => opt.setName("as_embed").setDescription("Post as embed (default true)").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing announcement created by AURA")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Message ID of the announcement").setRequired(true))
        .addStringOption((opt) => opt.setName("title").setDescription("New title").setMaxLength(256).setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("New description").setMaxLength(3500).setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("New hex color").setMaxLength(7).setRequired(false))
        .addStringOption((opt) => opt.setName("image_url").setDescription("New image URL").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an announcement message and remove its record")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Message ID to delete").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List active announcements created in this server"),
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

    if (action === "create") {
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description", true);
      const pingChoice = interaction.options.getString("ping") || "none";
      const rolePing = interaction.options.getRole("role_ping");
      const color = interaction.options.getString("color");
      const imageUrl = interaction.options.getString("image_url");
      const asEmbed = interaction.options.getBoolean("as_embed") ?? true;

      let pingText = "";
      if (rolePing) pingText = `${rolePing}`;
      else if (pingChoice === "everyone") pingText = "@everyone";
      else if (pingChoice === "here") pingText = "@here";

      const announcementData = {
        guildId: interaction.guildId,
        channelId: targetChannel.id,
        messageId: "",
        title,
        description,
        color: color || "#5865F2",
        imageUrl: imageUrl || null,
        asEmbed,
        createdAt: Date.now(),
      };

      try {
        let sentMessage;

        if (asEmbed) {
          const embed = buildAnnouncementEmbed(announcementData);
          sentMessage = await targetChannel.send({
            content: pingText || undefined,
            embeds: [embed],
          });
        } else {
          sentMessage = await targetChannel.send({
            content: `${pingText ? `${pingText}\n` : ""}# ${title}\n━━━━━━━━━━━━━━━━━━\n\n${description}`,
          });
        }

        announcementData.messageId = sentMessage.id;

        const all = getAnnouncements();
        all.push(announcementData);
        writeJson("announcements.json", all);

        return interaction.editReply(`✅ Announcement published in ${targetChannel}! [Jump to Message](${sentMessage.url})`);
      } catch (error) {
        console.error("Could not post announcement:", error);
        return interaction.editReply("Could not publish announcement. Check AURA's permissions in that channel.");
      }
    }

    if (action === "list") {
      const serverAnnouncements = getAnnouncements().filter((a) => a.guildId === interaction.guildId);

      if (serverAnnouncements.length === 0) {
        return interaction.editReply("No announcements recorded for this server yet.");
      }

      const lines = serverAnnouncements.slice(-15).map((a) => {
        return `• ID \`${a.messageId}\` in <#${a.channelId}> — **${a.title}** (<t:${Math.floor(a.createdAt / 1000)}:R>)`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📢 Server Announcements")
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "Use /announcement edit or /announcement delete with the Message ID" });

      return interaction.editReply({ embeds: [embed] });
    }

    if (action === "edit") {
      const messageId = interaction.options.getString("message_id", true);
      const all = getAnnouncements();
      const announcement = all.find((a) => a.guildId === interaction.guildId && a.messageId === messageId);

      if (!announcement) {
        return interaction.editReply("Could not find that announcement in records. Use `/announcement list`.");
      }

      const channel = await fetchChannel(interaction.guild, announcement.channelId);
      if (!channel) {
        return interaction.editReply("Could not find the announcement channel.");
      }

      const msg = await fetchMessage(channel, messageId);
      if (!msg) {
        return interaction.editReply("Could not fetch the announcement message from Discord.");
      }

      const newTitle = interaction.options.getString("title");
      const newDesc = interaction.options.getString("description");
      const newColor = interaction.options.getString("color");
      const newImage = interaction.options.getString("image_url");

      if (!newTitle && !newDesc && !newColor && !newImage) {
        return interaction.editReply("Provide at least one field to edit (title, description, color, or image).");
      }

      if (newTitle) announcement.title = newTitle;
      if (newDesc) announcement.description = newDesc;
      if (newColor) announcement.color = newColor;
      if (newImage) announcement.imageUrl = newImage;

      try {
        if (announcement.asEmbed !== false) {
          const updatedEmbed = buildAnnouncementEmbed(announcement);
          await msg.edit({ embeds: [updatedEmbed] });
        } else {
          await msg.edit({
            content: `# ${announcement.title}\n━━━━━━━━━━━━━━━━━━\n\n${announcement.description}`,
          });
        }

        writeJson("announcements.json", all);
        return interaction.editReply(`✅ Announcement updated! [Jump to Message](${msg.url})`);
      } catch (error) {
        console.error("Could not edit announcement:", error);
        return interaction.editReply("Failed to edit announcement.");
      }
    }

    if (action === "delete") {
      const messageId = interaction.options.getString("message_id", true);
      const all = getAnnouncements();
      const index = all.findIndex((a) => a.guildId === interaction.guildId && a.messageId === messageId);

      if (index === -1) {
        return interaction.editReply("Announcement not found in records.");
      }

      const record = all[index];
      const channel = await fetchChannel(interaction.guild, record.channelId);

      if (channel) {
        const msg = await fetchMessage(channel, messageId);
        if (msg) {
          await msg.delete().catch(() => {});
        }
      }

      all.splice(index, 1);
      writeJson("announcements.json", all);

      return interaction.editReply("✅ Announcement deleted and removed from records.");
    }
  },
};
