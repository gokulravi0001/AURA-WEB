const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const { readJson, writeJson } = require("../utils/jsonStore");
const { isAdmin, fetchChannel, fetchMessage } = require("../utils/helpers");

function getData() {
  const data = readJson("reaction-roles.json", { panels: [] });
  if (!Array.isArray(data.panels)) data.panels = [];
  return data;
}

function normalizeEmoji(value) {
  if (!value) return "";
  const customEmoji = value.match(/^<a?:([^:]+):(\d+)>$/);
  return customEmoji ? `${customEmoji[1]}:${customEmoji[2]}` : value;
}

/**
 * Builds the reaction-role embed displaying ONLY the Title and Description.
 * Roles and reactions are managed strictly in the background and are NOT listed in the embed text.
 */
function makeEmbed(panel) {
  const embed = new EmbedBuilder().setColor(0x8a2be2);

  if (panel.title && panel.title.trim().length > 0) {
    embed.setTitle(panel.title.trim());
  } else {
    embed.setTitle("Reaction Roles");
  }

  if (panel.description && panel.description.trim().length > 0) {
    embed.setDescription(panel.description.trim());
  }

  return embed;
}

function addAccessRoleOptions(subcommand) {
  for (let i = 1; i <= 5; i++) {
    subcommand.addRoleOption((option) =>
      option
        .setName(`access_role_${i}`)
        .setDescription(`Allowed member role ${i}; leave empty if unused.`)
        .setRequired(false),
    );
  }
  return subcommand;
}

function getAccessRoleIds(interaction) {
  const ids = [];
  for (let i = 1; i <= 5; i++) {
    const role = interaction.options.getRole(`access_role_${i}`);
    if (role) ids.push(role.id);
  }
  return [...new Set(ids)];
}

async function canManageRole(interaction, role) {
  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.managed ||
    botMember.roles.highest.comparePositionTo(role) <= 0
  ) {
    await interaction.reply({
      content:
        "AURA cannot assign that role. Ensure AURA has **Manage Roles** and its highest role is placed **above** that role in Server Settings → Roles.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reaction-role")
    .setDescription("Create and manage reaction-role panels (displays only Title and Description)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => {
      subcommand
        .setName("create")
        .setDescription("Create a reaction-role embed panel showing only Title and Description")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where AURA should post the panel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Panel title")
            .setRequired(true)
            .setMaxLength(256),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Optional panel description")
            .setRequired(false)
            .setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("Optional initial emoji (added to background reactions)")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Optional initial role assigned to the emoji in background")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("one_choice")
            .setDescription("One-choice mode (removes other panel roles when one is selected)")
            .setRequired(false),
        );

      return addAccessRoleOptions(subcommand);
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add an emoji reaction and role in the background (does not alter embed text)")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("emoji").setDescription("Reaction emoji").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to assign in background").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Change the background role assigned to an existing emoji")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("emoji").setDescription("Reaction emoji").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("New role to assign in background").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove an emoji option from background reactions")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("emoji").setDescription("Reaction emoji to remove").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit-text")
        .setDescription("Change a panel's title and description")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID").setRequired(true))
        .addStringOption((opt) => opt.setName("title").setDescription("New panel title").setMaxLength(256).setRequired(true))
        .addStringOption((opt) => opt.setName("description").setDescription("New description").setMaxLength(2000).setRequired(false)),
    )
    .addSubcommand((subcommand) => {
      subcommand
        .setName("settings")
        .setDescription("Configure one-choice mode or restrict access to specific roles")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID").setRequired(true))
        .addBooleanOption((opt) => opt.setName("one_choice").setDescription("Enable or disable one-choice mode").setRequired(false))
        .addStringOption((opt) =>
          opt
            .setName("access")
            .setDescription("Access restrictions")
            .setRequired(false)
            .addChoices(
              { name: "Keep current access", value: "keep" },
              { name: "Allow everyone", value: "everyone" },
              { name: "Restrict to selected roles", value: "roles" },
            ),
        );

      return addAccessRoleOptions(subcommand);
    })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("refresh")
        .setDescription("Clean existing panels so they display only Title & Description")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Optional message ID of panel to refresh").setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a reaction role panel and remove its message")
        .addStringOption((opt) => opt.setName("message_id").setDescription("Panel Message ID to delete").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all reaction role panels and their background role mappings"),
    ),

  async execute(interaction, bot) {
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

    const action = interaction.options.getSubcommand();

    if (action === "create") {
      const channel = interaction.options.getChannel("channel", true);
      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description") || "";
      const emoji = interaction.options.getString("emoji")?.trim();
      const role = interaction.options.getRole("role");
      const oneChoice = interaction.options.getBoolean("one_choice") ?? false;

      if ((emoji && !role) || (!emoji && role)) {
        return interaction.reply({
          content: "❌ If providing an initial role, you must provide both `emoji` and `role`. Alternatively, leave both empty and add roles later using `/reaction-role add`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (role && !(await canManageRole(interaction, role))) return;

      const panel = {
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: "",
        title,
        description,
        oneChoice,
        accessRoleIds: getAccessRoleIds(interaction),
        roles: role && emoji ? [{ emoji, roleId: role.id }] : [],
      };

      try {
        const message = await channel.send({
          embeds: [makeEmbed(panel)],
        });

        panel.messageId = message.id;

        // Add reaction in the background
        if (emoji) {
          await message.react(emoji).catch(() => {});
        }

        const data = getData();
        data.panels.push(panel);
        writeJson("reaction-roles.json", data);

        return interaction.reply({
          content: `✅ Reaction-role panel created in ${channel}! [Jump to Message](${message.url})\n*(The embed displays strictly Title & Description; roles and reactions are handled in the background)*`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        console.error("Could not create reaction-role panel:", error);
        return interaction.reply({
          content: "Could not create panel. Check AURA's Send Messages, Embed Links, and Add Reactions permissions.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (action === "list") {
      const panels = getData().panels.filter(
        (p) => p.guildId === interaction.guildId,
      );

      if (panels.length === 0) {
        return interaction.reply({
          content: "There are no reaction-role panels in this server yet.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const lines = panels.map(
        (panel) =>
          `• ID \`${panel.messageId}\` in <#${panel.channelId}> — **${panel.title || "Roles"}**\n  ` +
          `Background Roles: ` +
          ((panel.roles || []).length > 0
            ? (panel.roles || []).map((item) => `${item.emoji} → <@&${item.roleId}>`).join(", ")
            : "None added yet (use `/reaction-role add`)"),
      );

      return interaction.reply({
        content: lines.join("\n\n").slice(0, 1900),
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = getData();

    if (action === "refresh") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const targetMessageId = interaction.options.getString("message_id");

      let panelsToRefresh = data.panels.filter((p) => p.guildId === interaction.guildId);
      if (targetMessageId) {
        panelsToRefresh = panelsToRefresh.filter((p) => p.messageId === targetMessageId);
        if (panelsToRefresh.length === 0) {
          return interaction.editReply({
            content: `❌ Could not find a panel with Message ID \`${targetMessageId}\`.`,
          });
        }
      }

      let refreshedCount = 0;
      for (const p of panelsToRefresh) {
        const ch = await fetchChannel(interaction.guild, p.channelId);
        if (!ch) continue;
        const msg = await fetchMessage(ch, p.messageId);
        if (!msg) continue;

        // Clean embed: displays only Title and Description
        await msg.edit({ embeds: [makeEmbed(p)] }).catch(() => {});

        // Ensure background reactions exist on message
        for (const item of p.roles || []) {
          await msg.react(item.emoji).catch(() => {});
        }

        refreshedCount++;
      }

      return interaction.editReply({
        content: `✅ Successfully refreshed **${refreshedCount}** panel(s)! The role list has been removed from the embed text, leaving only Title and Description, with reactions preserved in the background.`,
      });
    }

    const messageId = interaction.options.getString("message_id", true);
    const panelIndex = data.panels.findIndex(
      (item) => item.guildId === interaction.guildId && item.messageId === messageId,
    );

    if (panelIndex === -1) {
      return interaction.reply({
        content: `Could not find panel with Message ID \`${messageId}\`. Run \`/reaction-role list\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const panel = data.panels[panelIndex];
    const channel = await fetchChannel(interaction.guild, panel.channelId);

    if (action === "delete") {
      if (channel) {
        const message = await fetchMessage(channel, messageId);
        if (message) await message.delete().catch(() => {});
      }

      data.panels.splice(panelIndex, 1);
      writeJson("reaction-roles.json", data);

      return interaction.reply({
        content: `✅ Deleted reaction role panel \`${messageId}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!channel) {
      return interaction.reply({
        content: "Could not find the channel containing this panel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const message = await fetchMessage(channel, messageId);
    if (!message) {
      return interaction.reply({
        content: "Could not fetch the panel message from Discord.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === "settings") {
      const oneChoice = interaction.options.getBoolean("one_choice");
      const access = interaction.options.getString("access");
      const accessRoleIds = getAccessRoleIds(interaction);

      if (oneChoice !== null) panel.oneChoice = oneChoice;

      if (access === "everyone") {
        panel.accessRoleIds = [];
      } else if (access === "roles") {
        if (accessRoleIds.length === 0) {
          return interaction.reply({
            content: "Select at least one role when choosing 'Restrict to selected roles'.",
            flags: MessageFlags.Ephemeral,
          });
        }
        panel.accessRoleIds = accessRoleIds;
      }

      writeJson("reaction-roles.json", data);

      return interaction.reply({
        content:
          `✅ Settings updated. One choice: **${panel.oneChoice ? "On" : "Off"}**. ` +
          `Access: **${panel.accessRoleIds?.length ? "Selected roles" : "Everyone"}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === "edit-text") {
      panel.title = interaction.options.getString("title", true);
      panel.description = interaction.options.getString("description") || "";

      // Updates embed to show purely the new Title and Description
      await message.edit({ embeds: [makeEmbed(panel)] });
      writeJson("reaction-roles.json", data);

      return interaction.reply({
        content: "✅ Panel text updated. Embed shows only Title and Description.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const emoji = interaction.options.getString("emoji", true).trim();
    const key = normalizeEmoji(emoji);

    if (action === "add" || action === "edit") {
      const role = interaction.options.getRole("role", true);
      if (!(await canManageRole(interaction, role))) return;

      const existing = (panel.roles || []).find(
        (item) => normalizeEmoji(item.emoji) === key,
      );

      if (action === "add" && existing) {
        return interaction.reply({
          content: "That emoji is already on this panel. Use `/reaction-role edit` to change its role.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === "edit" && !existing) {
        return interaction.reply({
          content: "That emoji is not on this panel. Use `/reaction-role add` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (existing) {
        existing.roleId = role.id;
      } else {
        panel.roles ||= [];
        panel.roles.push({ emoji, roleId: role.id });
        // Reaction is added on message in background
        await message.react(emoji).catch(() => {});
      }

      // Ensure embed text displays strictly Title and Description without role list
      await message.edit({ embeds: [makeEmbed(panel)] });
      writeJson("reaction-roles.json", data);

      return interaction.reply({
        content: `✅ Background reaction role ${action === "add" ? "added" : "updated"} (${emoji} → <@&${role.id}>)!\n*(Embed displays strictly Title & Description; roles are handled in the background)*`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === "remove") {
      const index = (panel.roles || []).findIndex(
        (item) => normalizeEmoji(item.emoji) === key,
      );

      if (index === -1) {
        return interaction.reply({
          content: "That emoji is not configured on this panel.",
          flags: MessageFlags.Ephemeral,
        });
      }

      panel.roles.splice(index, 1);
      // Embed remains clean with only Title & Description
      await message.edit({ embeds: [makeEmbed(panel)] });

      // Clean reaction from message
      const reactionToRemove = message.reactions.cache.find(
        (r) => normalizeEmoji(r.emoji.name) === key || r.emoji.id === key.split(":")[1],
      );
      if (reactionToRemove) {
        await reactionToRemove.remove().catch(() => {});
      }

      writeJson("reaction-roles.json", data);

      return interaction.reply({
        content: "✅ Reaction role removed from background.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};