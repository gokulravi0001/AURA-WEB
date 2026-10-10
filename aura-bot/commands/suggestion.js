const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const {
  getSuggestionConfig,
  setSuggestionConfig,
  saveSuggestion,
  getSuggestion,
  updateSuggestion,
  disableSuggestions,
} = require("../features/suggestions");
const { isAdmin, fetchChannel, fetchMessage } = require("../utils/helpers");

function buildSuggestionEmbed(sug) {
  let color = 0x9b59b6;
  let statusText = "⏳ Pending Review";

  if (sug.status === "accepted") {
    color = 0x57f287;
    statusText = "🟢 Accepted";
  } else if (sug.status === "rejected") {
    color = 0xed4245;
    statusText = "🔴 Rejected";
  } else if (sug.status === "considered") {
    color = 0xfee75c;
    statusText = "🟡 Under Consideration";
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(sug.title)
    .setDescription(sug.description)
    .setAuthor({
      name: `Suggestion #${sug.id} by ${sug.authorName}`,
      iconURL: sug.authorAvatar || undefined,
    })
    .addFields(
      { name: "Status", value: statusText, inline: true },
    );

  if (sug.adminComment) {
    embed.addFields({
      name: `Staff Response (${sug.adminTag || "Staff"})`,
      value: sug.adminComment,
      inline: false,
    });
  }

  embed.setFooter({ text: `ID: ${sug.id} • Vote using reactions below` }).setTimestamp(sug.createdAt);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Submit or review server suggestions")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the suggestion channel (Forum or Text channel) (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The forum or text channel where suggestions will be sent")
            .addChannelTypes(
              ChannelType.GuildForum,
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_thread")
            .setDescription("Automatically create discussion threads for text channel suggestions")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("submit")
        .setDescription("Submit a suggestion")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Short title for your suggestion")
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Explain your suggestion in detail")
            .setMinLength(1)
            .setMaxLength(1900)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("accept")
        .setDescription("Accept a suggestion (Admin only)")
        .addStringOption((option) =>
          option.setName("id").setDescription("Suggestion ID").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason or feedback").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reject")
        .setDescription("Reject a suggestion (Admin only)")
        .addStringOption((option) =>
          option.setName("id").setDescription("Suggestion ID").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason for rejection").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("consider")
        .setDescription("Mark a suggestion as under consideration (Admin only)")
        .addStringOption((option) =>
          option.setName("id").setDescription("Suggestion ID").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Reason or feedback").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable the suggestions system (Admin only)"),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Use this command inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const adminCommands = ["setup", "accept", "reject", "consider", "disable"];

    if (adminCommands.includes(subcommand) && !isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You need administrator or server management permissions to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "setup") {
      const channel = interaction.options.getChannel("channel", true);
      const autoThread = interaction.options.getBoolean("auto_thread") ?? true;

      const isForum = channel.type === ChannelType.GuildForum;

      setSuggestionConfig(interaction.guild.id, {
        channelId: channel.id,
        isForum,
        autoThread: isForum ? false : autoThread,
      });

      return interaction.reply({
        content:
          `✅ Suggestions configured in ${channel}!\n` +
          `• Channel Type: **${isForum ? "Forum Channel" : "Text Channel"}**\n` +
          `• Discussion Threads: **${isForum ? "Built-in Posts" : (autoThread ? "Enabled" : "Disabled")}**\n` +
          `Members can now submit suggestions with \`/suggestion submit\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "disable") {
      const disabled = disableSuggestions(interaction.guild.id);
      return interaction.reply({
        content: disabled
          ? "Suggestions system has been disabled."
          : "Suggestions were not configured.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "submit") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const config = getSuggestionConfig(interaction.guild.id);
      if (!config?.channelId) {
        return interaction.editReply(
          "The suggestion system has not been set up yet. Ask an admin to run `/suggestion setup`.",
        );
      }

      const targetChannel = await fetchChannel(interaction.guild, config.channelId);
      if (!targetChannel) {
        return interaction.editReply(
          "The configured suggestion channel could not be found. Please check AURA's permissions.",
        );
      }

      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description", true);
      const id = Date.now().toString(36).slice(-6).toUpperCase();

      const suggestionRecord = {
        id,
        guildId: interaction.guild.id,
        channelId: targetChannel.id,
        messageId: null,
        threadId: null,
        authorId: interaction.user.id,
        authorName: interaction.member?.displayName || interaction.user.username,
        authorAvatar: interaction.user.displayAvatarURL(),
        title,
        description,
        status: "pending",
        adminComment: null,
        adminTag: null,
        createdAt: Date.now(),
      };

      try {
        if (targetChannel.type === ChannelType.GuildForum) {
          const embed = buildSuggestionEmbed(suggestionRecord);
          const post = await targetChannel.threads.create({
            name: `[#${id}] ${title}`.slice(0, 100),
            message: {
              embeds: [embed],
            },
            autoArchiveDuration: 1440,
          });

          const starter = await post.fetchStarterMessage();
          await starter.react("👍").catch(() => {});
          await starter.react("👎").catch(() => {});

          suggestionRecord.messageId = starter.id;
          suggestionRecord.threadId = post.id;
          saveSuggestion(interaction.guild.id, suggestionRecord);

          return interaction.editReply(`✅ Your suggestion has been posted: ${post}`);
        } else {
          // Regular text channel
          const embed = buildSuggestionEmbed(suggestionRecord);
          const msg = await targetChannel.send({ embeds: [embed] });
          await msg.react("👍").catch(() => {});
          await msg.react("👎").catch(() => {});

          suggestionRecord.messageId = msg.id;

          if (config.autoThread) {
            const thread = await msg.startThread({
              name: `Discussion: ${title}`.slice(0, 100),
              autoArchiveDuration: 1440,
            }).catch(() => null);

            if (thread) {
              suggestionRecord.threadId = thread.id;
            }
          }

          saveSuggestion(interaction.guild.id, suggestionRecord);
          return interaction.editReply(`✅ Your suggestion has been submitted: ${msg.url}`);
        }
      } catch (error) {
        console.error("Could not post suggestion:", error);
        return interaction.editReply(
          "Failed to submit suggestion. Please ensure AURA has permissions to send messages, add reactions, and create threads.",
        );
      }
    }

    // Status management: accept, reject, consider
    if (["accept", "reject", "consider"].includes(subcommand)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const id = interaction.options.getString("id", true).trim().toUpperCase();
      const reason = interaction.options.getString("reason") || null;

      const sug = getSuggestion(interaction.guild.id, id);
      if (!sug) {
        return interaction.editReply(`Could not find a suggestion with ID \`#${id}\`.`);
      }

      const statusMap = {
        accept: "accepted",
        reject: "rejected",
        consider: "considered",
      };

      const newStatus = statusMap[subcommand];
      const updated = updateSuggestion(interaction.guild.id, id, {
        status: newStatus,
        adminComment: reason,
        adminTag: interaction.user.tag,
      });

      // Update the original message
      const channel = await fetchChannel(interaction.guild, updated.channelId);
      if (channel) {
        let msg = null;
        if (updated.threadId && channel.type === ChannelType.GuildForum) {
          const thread = await fetchChannel(interaction.guild, updated.threadId);
          if (thread) msg = await fetchMessage(thread, updated.messageId);
        } else {
          msg = await fetchMessage(channel, updated.messageId);
        }

        if (msg) {
          const newEmbed = buildSuggestionEmbed(updated);
          await msg.edit({ embeds: [newEmbed] }).catch(() => {});
        }
      }

      return interaction.editReply(
        `✅ Suggestion \`#${id}\` has been marked as **${newStatus.toUpperCase()}**.\n` +
        (reason ? `• Feedback: "${reason}"` : ""),
      );
    }
  },
};