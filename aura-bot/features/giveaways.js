const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel, fetchMessage } = require("../utils/helpers");

const GIVEAWAYS_FILE = "giveaways.json";

function getGiveawayStore() {
  return readJson(GIVEAWAYS_FILE, {});
}

function saveGiveawayStore(data) {
  writeJson(GIVEAWAYS_FILE, data);
}

function buildGiveawayEmbed(giveaway) {
  const endsTimestamp = Math.floor(giveaway.endsAt / 1000);

  if (giveaway.ended) {
    const winnerList =
      giveaway.winners && giveaway.winners.length > 0
        ? giveaway.winners.map((id) => `<@${id}>`).join(", ")
        : "No valid entrants!";

    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`🎉 GIVEAWAY ENDED: ${giveaway.prize}`)
      .setDescription(
        `**Winner(s):** ${winnerList}\n` +
        `**Hosted By:** <@${giveaway.hostId}>\n` +
        `**Total Entries:** ${giveaway.entries?.length || 0}`,
      )
      .setFooter({ text: `Giveaway ID: ${giveaway.id} • Concluded` })
      .setTimestamp(giveaway.endsAt);
  }

  const roleReqText = giveaway.requiredRoleId
    ? `\n**Required Role:** <@&${giveaway.requiredRoleId}>`
    : "";

  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`🎉 GIVEAWAY: ${giveaway.prize}`)
    .setDescription(
      `Click the button below to enter!\n\n` +
      `**Ends:** <t:${endsTimestamp}:R> (<t:${endsTimestamp}:f>)\n` +
      `**Hosted By:** <@${giveaway.hostId}>\n` +
      `**Winners:** **${giveaway.winnerCount}**\n` +
      `**Entries:** **${giveaway.entries?.length || 0}**${roleReqText}`,
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.id}` })
    .setTimestamp(giveaway.endsAt);
}

function buildGiveawayButton(giveaway) {
  const count = giveaway.entries?.length || 0;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aura_giveaway_enter_${giveaway.id}`)
      .setLabel(giveaway.ended ? "Giveaway Ended" : `🎉 Enter (${count})`)
      .setStyle(giveaway.ended ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(giveaway.ended)),
  );
  return [row];
}

async function concludeGiveaway(giveaway, bot) {
  giveaway.ended = true;

  const validEntries = [...(giveaway.entries || [])];
  const winners = [];

  const neededWinners = Math.min(giveaway.winnerCount || 1, validEntries.length);

  for (let i = 0; i < neededWinners; i++) {
    const randomIndex = Math.floor(Math.random() * validEntries.length);
    const chosen = validEntries.splice(randomIndex, 1)[0];
    if (chosen) winners.push(chosen);
  }

  giveaway.winners = winners;

  const store = getGiveawayStore();
  store[giveaway.id] = giveaway;
  saveGiveawayStore(store);

  // Update original message
  const channel = await fetchChannel(bot, giveaway.channelId);
  if (channel && giveaway.messageId) {
    const msg = await fetchMessage(channel, giveaway.messageId);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: buildGiveawayButton(giveaway),
      }).catch(() => {});
    }

    if (winners.length > 0) {
      const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");
      await channel.send({
        content: `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize}**! (Hosted by <@${giveaway.hostId}>)`,
      }).catch(() => {});
    } else {
      await channel.send({
        content: `😢 The giveaway for **${giveaway.prize}** ended, but there were no valid entrants.`,
      }).catch(() => {});
    }
  }

  return winners;
}

function startGiveawayChecker(bot) {
  setInterval(async () => {
    const store = getGiveawayStore();
    const now = Date.now();

    for (const giveaway of Object.values(store)) {
      if (!giveaway.ended && giveaway.endsAt <= now) {
        await concludeGiveaway(giveaway, bot).catch((err) =>
          console.error("Error concluding giveaway:", err),
        );
      }
    }
  }, 15000);
}

function registerGiveawayEvents(bot) {
  startGiveawayChecker(bot);

  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("aura_giveaway_enter_")) return;

    const giveawayId = interaction.customId.replace("aura_giveaway_enter_", "");
    const store = getGiveawayStore();
    const giveaway = store[giveawayId];

    if (!giveaway) {
      return interaction.reply({
        content: "❌ This giveaway could not be found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (giveaway.ended) {
      return interaction.reply({
        content: "❌ This giveaway has already ended.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Role check if configured
    if (giveaway.requiredRoleId) {
      const hasRole = interaction.member?.roles?.cache?.has(giveaway.requiredRoleId);
      if (!hasRole) {
        return interaction.reply({
          content: `❌ You must have the <@&${giveaway.requiredRoleId}> role to enter this giveaway!`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    giveaway.entries ||= [];
    const index = giveaway.entries.indexOf(interaction.user.id);

    if (index !== -1) {
      // Toggle leave
      giveaway.entries.splice(index, 1);
      saveGiveawayStore(store);

      await interaction.update({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: buildGiveawayButton(giveaway),
      }).catch(() => {});

      return interaction.followUp({
        content: "👋 You have left the giveaway.",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // Enter
      giveaway.entries.push(interaction.user.id);
      saveGiveawayStore(store);

      await interaction.update({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: buildGiveawayButton(giveaway),
      }).catch(() => {});

      return interaction.followUp({
        content: "🎉 You have successfully entered the giveaway! Best of luck!",
        flags: MessageFlags.Ephemeral,
      });
    }
  });
}

module.exports = {
  getGiveawayStore,
  saveGiveawayStore,
  buildGiveawayEmbed,
  buildGiveawayButton,
  concludeGiveaway,
  registerGiveawayEvents,
};
