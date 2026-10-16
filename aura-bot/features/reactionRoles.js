const { readJson } = require("../utils/jsonStore");
const { PermissionFlagsBits } = require("discord.js");

function normalizeReaction(reaction) {
  if (reaction.emoji.id) {
    return `${reaction.emoji.name}:${reaction.emoji.id}`;
  }
  return reaction.emoji.name;
}

function normalizeConfiguredEmoji(value) {
  if (!value) return "";
  const customEmoji = value.match(/^<a?:([^:]+):(\d+)>$/);
  return customEmoji ? `${customEmoji[1]}:${customEmoji[2]}` : value.trim();
}

function emojisMatch(reactionEmoji, configuredEmojiStr) {
  if (!reactionEmoji || !configuredEmojiStr) return false;

  const conf = configuredEmojiStr.trim();
  const customMatch = conf.match(/^<a?:([^:]+):(\d+)>$/);
  const confId = customMatch ? customMatch[2] : (conf.match(/:(\d+)$/)?.[1] || null);
  const confName = customMatch ? customMatch[1] : conf.replace(/^<a?:|>$|^:/g, "").split(":")[0];

  if (reactionEmoji.id && confId) {
    return reactionEmoji.id === confId;
  }
  if (reactionEmoji.id && !confId) {
    return reactionEmoji.id === conf;
  }

  const rName = reactionEmoji.name;
  if (rName === conf || rName === confName) return true;

  // Normalize Unicode variation selectors (e.g. \uFE0F)
  const cleanR = (rName || "").replace(/[\uFE00-\uFE0F]/g, "");
  const cleanConf = (conf || "").replace(/[\uFE00-\uFE0F]/g, "");
  return cleanR === cleanConf;
}

async function handleReaction(reaction, user, adding) {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

    const data = readJson("reaction-roles.json", { panels: [] });
    const panel = (data.panels || []).find(
      (item) => item.messageId === reaction.message.id,
    );

    if (!panel) return;

    // Find the configured role matching this emoji
    const selected = (panel.roles || []).find((item) =>
      emojisMatch(reaction.emoji, item.emoji),
    );

    if (!selected) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const botMember = guild.members.me;

    // If access roles are configured, member must have at least one
    const accessRoleIds = panel.accessRoleIds || [];
    const hasAccess =
      accessRoleIds.length === 0 ||
      accessRoleIds.some((roleId) => member.roles.cache.has(roleId));

    if (!hasAccess) {
      if (adding) {
        await reaction.users.remove(user.id).catch(() => {});
      }
      try {
        await user.send(
          `You need an authorized role to select options from that reaction-role panel in **${guild.name}**.`,
        );
      } catch {}
      return;
    }

    const selectedRole = await guild.roles.fetch(selected.roleId).catch(() => null);
    if (!selectedRole) {
      console.warn(`[ReactionRoles] Role ID ${selected.roleId} not found in guild ${guild.name}.`);
      return;
    }

    // Role hierarchy & permission verification
    const canManageRoles = botMember && botMember.permissions.has(PermissionFlagsBits.ManageRoles);
    const isRoleHigher = botMember && botMember.roles.highest.comparePositionTo(selectedRole) > 0;

    if (!canManageRoles || !isRoleHigher || selectedRole.managed) {
      console.warn(
        `[ReactionRoles] Cannot assign role "${selectedRole.name}" (${selectedRole.id}): ` +
        `Bot highest role is "${botMember?.roles?.highest?.name || "none"}", ` +
        `ManageRoles perm: ${canManageRoles}, isRoleHigher: ${isRoleHigher}. ` +
        `Move AURA's role HIGHER than "${selectedRole.name}" in Server Settings -> Roles.`
      );
      if (adding) {
        try {
          await user.send(
            `⚠️ AURA cannot give you the role **${selectedRole.name}** in **${guild.name}** because the bot's role is placed below **${selectedRole.name}** in Server Settings → Roles. Please tell a server administrator to drag AURA's role above it!`,
          );
        } catch {}
      }
      return;
    }

    if (adding) {
      // ONE-CHOICE MODE:
      // Remove other panel roles and clear their reactions from Discord
      if (panel.oneChoice) {
        // Collect all other roles on this panel to remove
        const otherOptions = (panel.roles || []).filter((opt) => opt.roleId !== selected.roleId);

        // Also check if there are other panels with the same title and oneChoice in this guild
        // (handles when user created multiple panels with the same title e.g. "CHOOSE YOUR COLOR")
        if (panel.title && panel.title.trim().length > 0) {
          const siblingPanels = (data.panels || []).filter(
            (p) =>
              p.guildId === panel.guildId &&
              p.oneChoice &&
              p.messageId !== panel.messageId &&
              p.title &&
              p.title.trim().toLowerCase() === panel.title.trim().toLowerCase(),
          );
          for (const sp of siblingPanels) {
            for (const opt of sp.roles || []) {
              if (opt.roleId !== selected.roleId && !otherOptions.some((o) => o.roleId === opt.roleId)) {
                otherOptions.push(opt);
              }
            }
          }
        }

        // 1. Remove the other roles from the member
        for (const opt of otherOptions) {
          if (member.roles.cache.has(opt.roleId)) {
            await member.roles.remove(opt.roleId).catch((err) => {
              console.warn(`[ReactionRoles] Could not remove old role ${opt.roleId}:`, err.message);
            });
          }
        }

        // 2. Clear previous reaction from the Discord message
        // Always fetch all reactions on the message so cache is fresh and complete
        await reaction.message.reactions.fetch().catch(() => {});

        for (const [, msgReaction] of reaction.message.reactions.cache) {
          // Skip the reaction that the user just clicked
          if (emojisMatch(msgReaction.emoji, selected.emoji)) {
            continue;
          }

          // If this reaction corresponds to one of the other options, remove user's reaction
          const isOtherOption = otherOptions.some((opt) => emojisMatch(msgReaction.emoji, opt.emoji));
          if (isOtherOption) {
            await msgReaction.users.remove(user.id).catch((err) => {
              console.warn(
                `[ReactionRoles] Could not remove reaction ${msgReaction.emoji.name} for user ${user.id}: ` +
                `Ensure AURA has "Manage Messages" permission in that channel! (${err.message})`,
              );
            });
          }
        }
      }

      // Add the newly selected role
      await member.roles.add(selectedRole).catch((err) => {
        console.error(`[ReactionRoles] Error adding role ${selectedRole.name}:`, err);
      });
    } else {
      // Removing reaction removes the role
      await member.roles.remove(selectedRole).catch((err) => {
        console.error(`[ReactionRoles] Error removing role ${selectedRole.name}:`, err);
      });
    }
  } catch (error) {
    console.error("[ReactionRoles] Could not process reaction role:", error);
  }
}

function registerReactionRoleEvents(bot) {
  bot.on("messageReactionAdd", (reaction, user) => {
    handleReaction(reaction, user, true);
  });

  bot.on("messageReactionRemove", (reaction, user) => {
    handleReaction(reaction, user, false);
  });
}

module.exports = { registerReactionRoleEvents };