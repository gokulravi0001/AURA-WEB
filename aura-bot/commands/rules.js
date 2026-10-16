const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

const { readJson, writeJson } = require("../utils/jsonStore");
const { isAdmin, fetchChannel, fetchMessage } = require("../utils/helpers");

function getSavedRules() {
  const saved = readJson("rules.json", []);
  return Array.isArray(saved) ? saved : [];
}

function parseRulesText(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const rules = [];
  const headerLines = [];
  const bottomLines = [];
  let currentRule = null;
  let inBottom = false;

  const saveCurrentRule = () => {
    if (!currentRule) return;
    rules.push({
      title: currentRule.title,
      content: currentRule.content.join("\n").trim(),
    });
    currentRule = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (/^---+$/.test(trimmed)) {
      saveCurrentRule();
      inBottom = true;
      continue;
    }
    if (inBottom) {
      bottomLines.push(line);
      continue;
    }

    const headerMatch = trimmed.match(/^#\s+(.+)$/);
    if (headerMatch && !currentRule && rules.length === 0) {
      headerLines.push(line);
      continue;
    }

    const ruleMatch = trimmed.match(/^##\s+(.+)$/);
    if (ruleMatch) {
      saveCurrentRule();
      currentRule = { title: line, content: [] };
      continue;
    }

    if (currentRule) currentRule.content.push(line);
    else headerLines.push(line);
  }

  saveCurrentRule();
  const header = headerLines.join("\n").trim();
  const bottom = bottomLines.join("\n").trim();

  // If no ## rules were found, treat whole text as general rules
  if (rules.length === 0) {
    rules.push({
      title: header || "Server Rules",
      content: text.trim(),
    });
  }

  return { rules, header, bottom };
}

function formatRulesEmbed(parsed, guildName, colorHex) {
  const color = colorHex ? parseInt(colorHex.replace("#", ""), 16) : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(isNaN(color) ? 0x5865f2 : color)
    .setTitle(`📜 ${guildName} • Server Rules & Guidelines`)
    .setTimestamp();

  if (parsed.header) {
    embed.setDescription(parsed.header);
  }

  const fields = [];
  parsed.rules.forEach((rule, idx) => {
    const cleanTitle = rule.title.replace(/^#+\s*/, "");
    fields.push({
      name: `${idx + 1}. ${cleanTitle}`,
      value: rule.content || "No details provided.",
      inline: false,
    });
  });

  // Discord allows up to 25 fields per embed
  embed.addFields(fields.slice(0, 25));

  if (parsed.bottom) {
    embed.setFooter({ text: parsed.bottom });
  } else {
    embed.setFooter({ text: "Please respect and follow all server rules" });
  }

  return embed;
}

async function printRulesBoard(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const all = getSavedRules();
  const serverRules = all.filter((r) => r.guildId === interaction.guildId);

  if (serverRules.length === 0) {
    return interaction.editReply("❌ No saved rules found for this server. You can configure rules on the website or use `/rules create`.");
  }

  // Pick newest or pending web_rules_
  const ruleRecord =
    serverRules.find((r) => typeof r.messageId === "string" && r.messageId.startsWith("web_")) ||
    serverRules[serverRules.length - 1];

  const channelOption = interaction.options.getChannel("channel");
  let targetChannel = null;

  if (channelOption) {
    targetChannel = channelOption;
  } else if (ruleRecord.channelId) {
    targetChannel = await fetchChannel(interaction.guild, ruleRecord.channelId);
  }
  if (!targetChannel) {
    targetChannel = interaction.channel;
  }

  if (!targetChannel) {
    return interaction.editReply("❌ Could not find the channel to print rules into.");
  }

  try {
    let embed;
    if (ruleRecord.rawText) {
      const parsed = parseRulesText(ruleRecord.rawText);
      embed = formatRulesEmbed(parsed, interaction.guild.name, ruleRecord.color || "#5865F2");
    } else if (Array.isArray(ruleRecord.rules)) {
      const color = ruleRecord.color ? parseInt(ruleRecord.color.replace("#", ""), 16) : 0x5865f2;
      embed = new EmbedBuilder()
        .setColor(isNaN(color) ? 0x5865f2 : color)
        .setTitle(ruleRecord.title || `📜 ${interaction.guild.name} • Server Rules & Guidelines`)
        .setTimestamp();

      if (ruleRecord.header) {
        embed.setDescription(ruleRecord.header);
      }

      const fields = ruleRecord.rules.map((rule, idx) => ({
        name: `${idx + 1}. ${(rule.title || "Rule").replace(/^#+\s*/, "")}`,
        value: rule.content || rule.description || "Follow all community guidelines.",
        inline: false,
      }));

      embed.addFields(fields.slice(0, 25));
      if (ruleRecord.bottom) {
        embed.setFooter({ text: ruleRecord.bottom });
      } else {
        embed.setFooter({ text: "Please respect and follow all server rules" });
      }
    } else {
      embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📜 ${interaction.guild.name} • Server Rules`)
        .setDescription("Please respect and follow all server rules.");
    }

    const message = await targetChannel.send({ embeds: [embed] });

    ruleRecord.messageId = message.id;
    ruleRecord.channelId = targetChannel.id;
    writeJson("rules.json", all);

    return interaction.editReply(`✅ **Rules printed successfully in ${targetChannel}!** [Jump to Message](${message.url})`);
  } catch (err) {
    console.error("Could not print rules:", err);
    return interaction.editReply(`❌ Failed to print rules into ${targetChannel}. Check AURA's channel permissions.`);
  }
}

module.exports = {
  printRulesBoard,
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Create, edit, or delete server rules")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Publish rules in a channel")
        .addStringOption((opt) =>
          opt
            .setName("rules_text")
            .setDescription("Rules text in Markdown format (use ## for each rule)")
            .setMaxLength(4000)
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("color")
            .setDescription("Embed hex color, e.g. #5865F2")
            .setMaxLength(7)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit an existing rules message")
        .addStringOption((opt) =>
          opt.setName("message_id").setDescription("Message ID of the rules post").setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("rules_text").setDescription("New markdown rules text").setMaxLength(4000).setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("color").setDescription("New embed hex color").setMaxLength(7).setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a rules message and remove its record")
        .addStringOption((opt) =>
          opt.setName("message_id").setDescription("Message ID to delete").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List active rules messages posted by AURA"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("print")
        .setDescription("Print/post saved rules (e.g. created on the website) into a channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel (defaults to current channel or saved channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
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

    if (action === "print") {
      return printRulesBoard(interaction);
    }

    if (action === "create") {
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
      const text = interaction.options.getString("rules_text", true);
      const color = interaction.options.getString("color") || "#5865F2";

      const parsed = parseRulesText(text);
      const embed = formatRulesEmbed(parsed, interaction.guild.name, color);

      try {
        const message = await targetChannel.send({ embeds: [embed] });

        const rulePost = {
          guildId: interaction.guildId,
          channelId: targetChannel.id,
          messageId: message.id,
          rules: parsed.rules,
          header: parsed.header,
          bottom: parsed.bottom,
          rawText: text,
          color,
          createdAt: Date.now(),
        };

        const all = getSavedRules();
        all.push(rulePost);
        writeJson("rules.json", all);

        return interaction.editReply(`✅ Rules published in ${targetChannel}! [Jump to Message](${message.url})`);
      } catch (error) {
        console.error("Could not post rules:", error);
        return interaction.editReply("Could not publish rules. Check AURA's channel permissions.");
      }
    }

    if (action === "list") {
      const serverRules = getSavedRules().filter((r) => r.guildId === interaction.guildId);

      if (serverRules.length === 0) {
        return interaction.editReply("No rules posts found for this server.");
      }

      const lines = serverRules.map((r) => {
        return `• ID \`${r.messageId}\` in <#${r.channelId}> (<t:${Math.floor(r.createdAt / 1000)}:R>)`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📜 Server Rules Posts")
        .setDescription(lines.join("\n\n"));

      return interaction.editReply({ embeds: [embed] });
    }

    if (action === "edit") {
      const messageId = interaction.options.getString("message_id", true);
      const newText = interaction.options.getString("rules_text", true);
      const color = interaction.options.getString("color");

      const all = getSavedRules();
      const rulePost = all.find((r) => r.guildId === interaction.guildId && r.messageId === messageId);

      if (!rulePost) {
        return interaction.editReply("Could not find that rules record. Use `/rules list`.");
      }

      const channel = await fetchChannel(interaction.guild, rulePost.channelId);
      if (!channel) return interaction.editReply("Could not access the rules channel.");

      const msg = await fetchMessage(channel, messageId);
      if (!msg) return interaction.editReply("Could not find the rules message in Discord.");

      const parsed = parseRulesText(newText);
      rulePost.rules = parsed.rules;
      rulePost.header = parsed.header;
      rulePost.bottom = parsed.bottom;
      rulePost.rawText = newText;
      if (color) rulePost.color = color;

      const embed = formatRulesEmbed(parsed, interaction.guild.name, rulePost.color || "#5865F2");

      try {
        await msg.edit({ embeds: [embed] });
        writeJson("rules.json", all);
        return interaction.editReply(`✅ Rules updated! [Jump to Message](${msg.url})`);
      } catch (error) {
        console.error("Could not edit rules:", error);
        return interaction.editReply("Failed to edit rules message.");
      }
    }

    if (action === "delete") {
      const messageId = interaction.options.getString("message_id", true);
      const all = getSavedRules();
      const index = all.findIndex((r) => r.guildId === interaction.guildId && r.messageId === messageId);

      if (index === -1) {
        return interaction.editReply("Rules record not found.");
      }

      const record = all[index];
      const channel = await fetchChannel(interaction.guild, record.channelId);
      if (channel) {
        const msg = await fetchMessage(channel, messageId);
        if (msg) await msg.delete().catch(() => {});
      }

      all.splice(index, 1);
      writeJson("rules.json", all);

      return interaction.editReply("✅ Rules message deleted and removed from records.");
    }
  },
};
