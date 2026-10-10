const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Explore AURA's multipurpose commands, security suite, and social features"),

  async execute(interaction) {
    const mainEmbed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("✨ AURA Multipurpose & Security Bot Guide")
      .setDescription(
        "Welcome to **AURA**! A state-of-the-art multipurpose bot equipped with full Anti-Raid & Anti-Nuke protection, community interaction, social profiles, moderation, voice hubs, minigames, and administrative tools.\n",
      )
      .addFields(
        {
          name: "🚨 Security & Anti-Raid / Anti-Nuke",
          value:
            "`/security status` • `/security lockdown` • `/security antiraid` • `/security antinuke` • `/security antispam` • `/security whitelist` • `/security log`",
          inline: false,
        },
        {
          name: "🌟 Social & Identity",
          value:
            "`/profile view` • `/profile setbio` • `/rep give` • `/rep leaderboard` • `/afk set` • `/afk check`",
          inline: false,
        },
        {
          name: "🎉 Giveaways & Polls",
          value:
            "`/giveaway start` • `/giveaway end` • `/giveaway reroll` • `/giveaway list` • `/poll create` • `/poll end`",
          inline: false,
        },
        {
          name: "🛡️ Moderation Suite",
          value:
            "`/mod kick` • `/mod ban` • `/mod unban` • `/mod timeout` • `/mod warn` • `/mod warnings` • `/mod purge` • `/mod lock` • `/mod slowmode` • `/mod logs`",
          inline: false,
        },
        {
          name: "🔍 Member & Server Utilities",
          value:
            "`/utility userinfo` • `/utility serverinfo` • `/utility avatar` • `/media status` • `/media toggle` • `/ping` • `/remind` • `/bump` • `/say`",
          inline: false,
        },
        {
          name: "🎫 Tickets & Support",
          value:
            "`/ticket setup` • `/ticket close` • `/ticket transcript` • `/ticket claim` • `/ticket add` • `/ticket remove`",
          inline: false,
        },
        {
          name: "🔊 Dynamic Temp Voice",
          value:
            "`/voice setup` • `/voice lock` • `/voice unlock` • `/voice hide` • `/voice rename` • `/voice limit` • `/voice kick` • `/voice claim`",
          inline: false,
        },
        {
          name: "🏆 Levels & Statistics",
          value:
            "`/level show` • `/level leaderboard` • `/level rewards` • `/invites check` • `/serverstats view` • `/serverstats setup` • `/serverstats remove`",
          inline: false,
        },
        {
          name: "💬 Community & Automation",
          value:
            "`/announcement` • `/rules` • `/event` • `/reaction-role` • `/sticky` • `/threads` • `/suggestion` • `/greetings` • `/birthday`",
          inline: false,
        },
        {
          name: "🎮 Minigames",
          value:
            "`/counting setup` • `/counting stats` • `/wordbuilding setup` • `/wordbuilding stats`",
          inline: false,
        },
        {
          name: "⚙️ Master Server Setup",
          value:
            "`/setup overview` • `/setup permissions` • `/setup toggle`",
          inline: false,
        },
      )
      .setFooter({
        text: "AURA • Fully versatile multipurpose bot • 30 unified commands",
        iconURL: interaction.guild.iconURL(),
      })
      .setTimestamp();

    await interaction.reply({ embeds: [mainEmbed] });
  },
};
