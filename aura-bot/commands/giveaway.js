const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  getGiveawayStore,
  saveGiveawayStore,
  buildGiveawayEmbed,
  buildGiveawayButton,
  concludeGiveaway,
} = require("../features/giveaways");
const { isAdmin, parseDuration, fetchChannel, fetchMessage } = require("../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create and manage social server giveaways")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Launch a new giveaway with button entries")
        .addStringOption((opt) =>
          opt
            .setName("prize")
            .setDescription("What prize is being given away?")
            .setMaxLength(200)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Giveaway duration (e.g. 10m, 1h, 24h, 3d)")
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("winners")
            .setDescription("Number of winners to pick (1-10, default: 1)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the giveaway in (default: current channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("Optional required role to enter the giveaway")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Immediately conclude a giveaway and select winners")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("The message ID of the giveaway")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Reroll new winner(s) for a concluded giveaway")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("The message ID of the giveaway")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List active giveaways in this server"),
    ),

  async execute(interaction, bot) {
    const isStaff = isAdmin(interaction.member) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const store = getGiveawayStore();
      const guildGiveaways = Object.values(store).filter(
        (g) => g.guildId === interaction.guildId && !g.ended,
      );

      if (guildGiveaways.length === 0) {
        return interaction.reply({
          content: "🎁 There are currently no active giveaways in this server.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const desc = guildGiveaways
        .map(
          (g) =>
            `• **${g.prize}** — <#${g.channelId}>\n  Ends: <t:${Math.floor(g.endsAt / 1000)}:R> • Entries: **${g.entries?.length || 0}** • ID: \`${g.id}\``,
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(0xeb459e)
        .setTitle("🎉 Active Server Giveaways")
        .setDescription(desc);

      return interaction.reply({ embeds: [embed] });
    }

    if (!isStaff) {
      return interaction.reply({
        content: "❌ You need the **Manage Server** permission to manage giveaways.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "start") {
      const prize = interaction.options.getString("prize", true);
      const durationStr = interaction.options.getString("duration", true);
      const winnersCount = interaction.options.getInteger("winners") || 1;
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
      const reqRole = interaction.options.getRole("role");

      const durationMs = parseDuration(durationStr);
      if (!durationMs || durationMs < 10000) {
        return interaction.reply({
          content: "❌ Invalid duration. Please provide a duration of at least 10s (e.g. `10m`, `2h`, `1d`).",
          flags: MessageFlags.Ephemeral,
        });
      }

      const giveawayId = `gw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const endsAt = Date.now() + durationMs;

      const giveawayData = {
        id: giveawayId,
        guildId: interaction.guildId,
        channelId: targetChannel.id,
        hostId: interaction.user.id,
        prize,
        winnerCount: winnersCount,
        requiredRoleId: reqRole ? reqRole.id : null,
        entries: [],
        createdAt: Date.now(),
        endsAt,
        ended: false,
        winners: [],
      };

      const embed = buildGiveawayEmbed(giveawayData);
      const button = buildGiveawayButton(giveawayData);

      const msg = await targetChannel.send({
        embeds: [embed],
        components: button,
      });

      giveawayData.messageId = msg.id;
      const store = getGiveawayStore();
      store[giveawayId] = giveawayData;
      saveGiveawayStore(store);

      return interaction.reply({
        content: `🎉 Giveaway for **${prize}** has been posted in ${targetChannel}!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "end") {
      const messageId = interaction.options.getString("message_id", true);
      const store = getGiveawayStore();
      const giveaway = Object.values(store).find((g) => g.messageId === messageId);

      if (!giveaway) {
        return interaction.reply({
          content: "❌ Could not find a giveaway with that message ID.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (giveaway.ended) {
        return interaction.reply({
          content: "❌ That giveaway has already concluded.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await concludeGiveaway(giveaway, bot);
      return interaction.reply({
        content: `✅ Giveaway for **${giveaway.prize}** has been concluded and winners picked!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "reroll") {
      const messageId = interaction.options.getString("message_id", true);
      const store = getGiveawayStore();
      const giveaway = Object.values(store).find((g) => g.messageId === messageId);

      if (!giveaway) {
        return interaction.reply({
          content: "❌ Could not find a giveaway with that message ID.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!giveaway.entries || giveaway.entries.length === 0) {
        return interaction.reply({
          content: "❌ No valid entries exist to reroll from.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const randomIndex = Math.floor(Math.random() * giveaway.entries.length);
      const newWinner = giveaway.entries[randomIndex];

      const channel = await fetchChannel(bot, giveaway.channelId);
      if (channel) {
        await channel.send({
          content: `🎉 **REROLL!** The new winner for **${giveaway.prize}** is <@${newWinner}>! Congratulations!`,
        });
      }

      return interaction.reply({
        content: `✅ Successfully rerolled! New winner: <@${newWinner}>`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
