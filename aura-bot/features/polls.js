const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchMessage } = require("../utils/helpers");

const POLLS_FILE = "polls.json";

function getPollStore() {
  return readJson(POLLS_FILE, {});
}

function savePollStore(data) {
  writeJson(POLLS_FILE, data);
}

function createProgressBar(percent, totalBars = 10) {
  const filled = Math.min(totalBars, Math.max(0, Math.round((percent / 100) * totalBars)));
  const empty = totalBars - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

function buildPollEmbed(poll) {
  const totalVotes = Object.keys(poll.voters || {}).length;

  const fields = poll.options.map((opt, index) => {
    const voteCount = poll.votes[index] || 0;
    const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    const bar = createProgressBar(percent);

    return {
      name: `${opt.emoji || `Option ${index + 1}`} ${opt.label}`,
      value: `\`${bar}\` **${percent}%** (${voteCount} vote${voteCount === 1 ? "" : "s"})`,
      inline: false,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(poll.ended ? 0x95a5a6 : 0x5865f2)
    .setTitle(poll.ended ? `📊 Poll Ended: ${poll.question}` : `📊 Poll: ${poll.question}`)
    .setDescription(
      poll.ended
        ? `**Final Results** • Total Votes: **${totalVotes}**`
        : `Click a button below to cast your vote! • Total Votes: **${totalVotes}**\n${
            poll.expiresAt ? `Ends <t:${Math.floor(poll.expiresAt / 1000)}:R>` : "Open poll"
          }`,
    )
    .addFields(fields)
    .setFooter({
      text: `Poll ID: ${poll.id} • Created by ${poll.creatorTag || "Admin"}`,
    })
    .setTimestamp(poll.createdAt);

  return embed;
}

function buildPollButtons(poll) {
  const row = new ActionRowBuilder();

  poll.options.forEach((opt, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`aura_poll_${poll.id}_${index}`)
        .setLabel(opt.label.slice(0, 80))
        .setEmoji(opt.emoji || "🔘")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(poll.ended)),
    );
  });

  return [row];
}

function registerPollEvents(bot) {
  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("aura_poll_")) return;

    const parts = interaction.customId.split("_");
    const pollId = parts[2];
    const optionIndex = parseInt(parts[3], 10);

    const store = getPollStore();
    const poll = store[pollId];

    if (!poll) {
      return interaction.reply({
        content: "❌ This poll is no longer active or could not be found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (poll.ended) {
      return interaction.reply({
        content: "❌ This poll has already concluded.",
        flags: MessageFlags.Ephemeral,
      });
    }

    poll.voters ||= {};
    poll.votes ||= {};

    const previousVote = poll.voters[interaction.user.id];

    if (previousVote === optionIndex) {
      return interaction.reply({
        content: `ℹ️ You have already voted for **${poll.options[optionIndex].label}**!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Adjust previous vote count if switching
    if (previousVote !== undefined) {
      poll.votes[previousVote] = Math.max(0, (poll.votes[previousVote] || 1) - 1);
    }

    // Record new vote
    poll.voters[interaction.user.id] = optionIndex;
    poll.votes[optionIndex] = (poll.votes[optionIndex] || 0) + 1;

    savePollStore(store);

    const updatedEmbed = buildPollEmbed(poll);
    await interaction.update({
      embeds: [updatedEmbed],
      components: buildPollButtons(poll),
    }).catch(() => {});
  });
}

function endPoll(pollId) {
  const store = getPollStore();
  const poll = store[pollId];
  if (!poll) return null;

  poll.ended = true;
  savePollStore(store);
  return poll;
}

module.exports = {
  getPollStore,
  savePollStore,
  buildPollEmbed,
  buildPollButtons,
  registerPollEvents,
  endPoll,
};
