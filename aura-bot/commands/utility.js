const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("utility")
    .setDescription("Social server and member inspection utilities")
    .addSubcommand((sub) =>
      sub
        .setName("userinfo")
        .setDescription("View comprehensive details about a server member")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("The member to inspect (defaults to yourself)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("serverinfo")
        .setDescription("View detailed statistics and settings of this server"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("avatar")
        .setDescription("View and download a user's full-resolution avatar")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The user whose avatar to view (defaults to yourself)")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "avatar") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 2048 });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${targetUser.displayName || targetUser.username}'s Avatar`)
        .setDescription(
          `[PNG](${targetUser.displayAvatarURL({ extension: "png", size: 2048 })}) • ` +
          `[JPG](${targetUser.displayAvatarURL({ extension: "jpg", size: 2048 })}) • ` +
          `[WebP](${targetUser.displayAvatarURL({ extension: "webp", size: 2048 })})` +
          (targetUser.avatar?.startsWith("a_")
            ? ` • [GIF](${targetUser.displayAvatarURL({ extension: "gif", size: 2048 })})`
            : ""),
        )
        .setImage(avatarUrl)
        .setFooter({ text: `User ID: ${targetUser.id}` });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "userinfo") {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("member") || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      const createdTime = Math.floor(targetUser.createdTimestamp / 1000);
      const joinedTime = member?.joinedTimestamp
        ? Math.floor(member.joinedTimestamp / 1000)
        : null;

      const roles = member?.roles?.cache
        ? member.roles.cache
            .filter((r) => r.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((r) => `<@&${r.id}>`)
        : [];

      const roleDisplay =
        roles.length > 0
          ? roles.length > 10
            ? `${roles.slice(0, 10).join(", ")} *(and ${roles.length - 10} more)*`
            : roles.join(", ")
          : "None";

      const keyPerms = [];
      if (member?.permissions?.has("Administrator")) keyPerms.push("Administrator");
      if (member?.permissions?.has("ManageGuild")) keyPerms.push("Manage Server");
      if (member?.permissions?.has("ManageChannels")) keyPerms.push("Manage Channels");
      if (member?.permissions?.has("ManageRoles")) keyPerms.push("Manage Roles");
      if (member?.permissions?.has("ModerateMembers")) keyPerms.push("Moderate Members");
      if (member?.permissions?.has("BanMembers")) keyPerms.push("Ban Members");
      if (member?.permissions?.has("KickMembers")) keyPerms.push("Kick Members");

      const embed = new EmbedBuilder()
        .setColor(member?.displayColor || 0x5865f2)
        .setAuthor({
          name: `${targetUser.tag}`,
          iconURL: targetUser.displayAvatarURL({ dynamic: true }),
        })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          {
            name: "👤 General Info",
            value: `**Mention:** ${targetUser}\n**User ID:** \`${targetUser.id}\`\n**Bot:** ${targetUser.bot ? "Yes 🤖" : "No"}`,
            inline: true,
          },
          {
            name: "💎 Server Standing",
            value: `**Nickname:** ${member?.nickname || "None"}\n**Booster:** ${member?.premiumSince ? `Since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:d>` : "No"}\n**Highest Role:** ${member?.roles?.highest ? `<@&${member.roles.highest.id}>` : "None"}`,
            inline: true,
          },
          {
            name: "📅 Dates",
            value: `**Joined Server:** ${joinedTime ? `<t:${joinedTime}:F> (<t:${joinedTime}:R>)` : "Unknown"}\n**Account Created:** <t:${createdTime}:F> (<t:${createdTime}:R>)`,
            inline: false,
          },
          {
            name: `🎭 Roles (${roles.length})`,
            value: roleDisplay,
            inline: false,
          },
          {
            name: "🛡️ Key Permissions",
            value: keyPerms.length > 0 ? keyPerms.join(", ") : "Standard Member Permissions",
            inline: false,
          },
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "serverinfo") {
      const { guild } = interaction;
      await guild.members.fetch().catch(() => {});

      const totalMembers = guild.memberCount;
      const humans = guild.members.cache.filter((m) => !m.user.bot).size;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;

      const channels = guild.channels.cache;
      const textCount = channels.filter((c) => c.type === ChannelType.GuildText).size;
      const voiceCount = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
      const categoryCount = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

      const boostTier = guild.premiumTier;
      const boostCount = guild.premiumSubscriptionCount || 0;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setImage(guild.bannerURL({ size: 1024 }))
        .setDescription(guild.description || "No server description set.")
        .addFields(
          {
            name: "👑 Ownership & Region",
            value: `**Owner:** <@${guild.ownerId}>\n**Server ID:** \`${guild.id}\`\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "👥 Members",
            value: `**Total:** ${totalMembers.toLocaleString()}\n**Humans:** ${humans.toLocaleString()}\n**Bots:** ${bots.toLocaleString()}`,
            inline: true,
          },
          {
            name: "💬 Channels",
            value: `**Text:** ${textCount}\n**Voice:** ${voiceCount}\n**Categories:** ${categoryCount}`,
            inline: true,
          },
          {
            name: "✨ Boosting",
            value: `**Tier:** Level ${boostTier}\n**Boosts:** ${boostCount} boost${boostCount === 1 ? "" : "s"}`,
            inline: true,
          },
          {
            name: "🎨 Assets & Settings",
            value: `**Roles:** ${guild.roles.cache.size}\n**Emojis:** ${guild.emojis.cache.size}\n**Verification:** Level ${guild.verificationLevel}`,
            inline: true,
          },
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
