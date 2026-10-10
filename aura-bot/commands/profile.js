const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const { getUserProfile, setUserBio } = require("../features/social");
const { getMemberStats } = require("../features/levels");
const { getVoiceTime } = require("../features/voiceTime");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View or customize your social profile card")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View a member's social profile card")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The member whose profile to view (defaults to yourself)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("setbio")
        .setDescription("Set your personal status tagline / bio")
        .addStringOption((opt) =>
          opt
            .setName("bio")
            .setDescription("Your bio (up to 250 characters)")
            .setMaxLength(250)
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setbio") {
      const bioText = interaction.options.getString("bio", true);
      const savedBio = setUserBio(interaction.guildId, interaction.user.id, bioText);

      return interaction.reply({
        content: `✅ Your profile bio has been updated!\n> "${savedBio}"`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "view") {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("user") || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      const profile = getUserProfile(interaction.guildId, targetUser.id);
      const levelStats = getMemberStats(interaction.guildId, targetUser.id);
      const voiceStats = getVoiceTime(interaction.guildId, targetUser.id);

      // Compute badges
      const badges = [];
      if (interaction.guild.ownerId === targetUser.id) badges.push("👑 Server Owner");
      if (member?.permissions?.has("Administrator")) badges.push("🛡️ Admin");
      if (member?.premiumSince) badges.push("💎 Server Booster");
      if (levelStats.level >= 20) badges.push("🏆 Level 20+ Master");
      else if (levelStats.level >= 10) badges.push("⭐ Level 10+ Veteran");
      if (profile.rep >= 25) badges.push("🌟 Renowned (+25 Rep)");
      else if (profile.rep >= 5) badges.push("✨ Respected (+5 Rep)");

      const voiceMinutes = (voiceStats.voiceMemberMinutes || 0) + (voiceStats.stageMemberMinutes || 0);
      const voiceHours = (voiceMinutes / 60).toFixed(1);

      const createdTimestamp = Math.floor(targetUser.createdTimestamp / 1000);
      const joinedTimestamp = member?.joinedTimestamp
        ? Math.floor(member.joinedTimestamp / 1000)
        : null;

      const embed = new EmbedBuilder()
        .setColor(member?.displayColor || 0x5865f2)
        .setAuthor({
          name: `${targetUser.displayName || targetUser.username}'s Profile`,
          iconURL: targetUser.displayAvatarURL({ dynamic: true }),
        })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(
          `**About Me**\n> ${profile.bio}\n\n` +
          `**Badges:** ${badges.length > 0 ? badges.join(" • ") : "None yet"}`,
        )
        .addFields(
          {
            name: "📊 Level & Experience",
            value: `**Level:** ${levelStats.level}\n**XP:** ${levelStats.xp.toLocaleString()}\n**Rank:** #${levelStats.rank || "Unranked"}`,
            inline: true,
          },
          {
            name: "⭐ Social Standing",
            value: `**Reputation:** +${profile.rep}\n**Voice Time:** ${voiceHours} hrs\n**Highest Role:** ${member?.roles?.highest ? `<@&${member.roles.highest.id}>` : "None"}`,
            inline: true,
          },
          {
            name: "📅 Dates",
            value: `**Joined Server:** ${joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Unknown"}\n**Account Created:** <t:${createdTimestamp}:R>`,
            inline: false,
          },
        )
        .setFooter({
          text: `User ID: ${targetUser.id} • Use /profile setbio to customize`,
          iconURL: interaction.guild.iconURL(),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
