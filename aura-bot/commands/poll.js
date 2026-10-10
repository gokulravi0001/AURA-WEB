const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const {
  getPollStore,
  savePollStore,
  buildPollEmbed,
  buildPollButtons,
  endPoll,
} = require("../features/polls");
const { parseDuration, fetchMessage } = require("../utils/helpers");

const EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create and manage interactive community polls")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new interactive poll with buttons")
        .addStringOption((opt) =>
          opt
            .setName("question")
            .setDescription("The poll question or topic")
            .setMaxLength(250)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("option1")
            .setDescription("First option")
            .setMaxLength(80)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("option2")
            .setDescription("Second option")
            .setMaxLength(80)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("option3")
            .setDescription("Third option (optional)")
            .setMaxLength(80)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("option4")
            .setDescription("Fourth option (optional)")
            .setMaxLength(80)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("option5")
            .setDescription("Fifth option (optional)")
            .setMaxLength(80)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Poll duration (e.g. 10m, 1h, 1d)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End an active poll and finalize results")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("The message ID of the poll")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "end") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: "❌ You need the **Manage Messages** permission to end polls.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const messageId = interaction.options.getString("message_id", true);
      const store = getPollStore();
      const poll = Object.values(store).find((p) => p.messageId === messageId);

      if (!poll) {
        return interaction.reply({
          content: "❌ Could not find an active poll with that Message ID.",
          flags: MessageFlags.Ephemeral,
        });
      }

      endPoll(poll.id);

      const targetMessage = await fetchMessage(interaction.channel, messageId);
      if (targetMessage) {
        await targetMessage.edit({
          embeds: [buildPollEmbed(poll)],
          components: buildPollButtons(poll),
        }).catch(() => {});
      }

      return interaction.reply({
        content: `✅ Poll **"${poll.question}"** has ended. Final results updated!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "create") {
      // In create, let's fetch options
      const question = interaction.options.getString("question", true);
      const opt1 = interaction.options.getString("option1", true);
      const opt2 = interaction.options.getString("option2", true);
      const opt3 = interaction.options.getString("option3");
      const opt4 = interaction.options.getString("option4");
      const opt5 = interaction.options.getString("option5");
      const durationStr = interaction.options.getString("duration");

      const rawOptions = [opt1, opt2, opt3, opt4, opt5].filter(Boolean);
      const formattedOptions = rawOptions.map((text, idx) => ({
        label: text,
        emoji: EMOJIS[idx],
      }));

      const durationMs = durationStr ? parseDuration(durationStr) : null;
      const pollId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const pollData = {
        id: pollId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        creatorId: interaction.user.id,
        creatorTag: interaction.user.tag || interaction.user.username,
        question,
        options: formattedOptions,
        votes: {},
        voters: {},
        createdAt: Date.now(),
        expiresAt: durationMs ? Date.now() + durationMs : null,
        ended: false,
      };

      const embed = buildPollEmbed(pollData);
      const buttons = buildPollButtons(pollData);

      const msg = await interaction.reply({
        embeds: [embed],
        components: buttons,
        fetchReply: true,
      });

      pollData.messageId = msg.id;
      const store = getPollStore();
      store[pollId] = pollData;
      savePollStore(store);

      // If duration is specified, schedule automatic finish
      if (durationMs && durationMs <= 24 * 60 * 60 * 1000) {
        setTimeout(async () => {
          const fresh = getPollStore()[pollId];
          if (fresh && !fresh.ended) {
            endPoll(pollId);
            const targetMsg = await fetchMessage(interaction.channel, msg.id);
            if (targetMsg) {
              await targetMsg.edit({
                embeds: [buildPollEmbed(fresh)],
                components: buildPollButtons(fresh),
              }).catch(() => {});
            }
          }
        }, durationMs);
      }
    }
  },
};
