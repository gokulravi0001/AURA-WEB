const { readJson } = require("../utils/jsonStore");

function normalizeReaction(reaction) {
  if (reaction.emoji.id) {
    return `${reaction.emoji.name}:${reaction.emoji.id}`;
  }
  return reaction.emoji.name;
}

function normalizeConfiguredEmoji(value) {
  if (!value) return "";
  const customEmoji = value.match(/^<a?:([^:]+):(\d+)>$/);
  return customEmoji ? `${customEmoji[1]}:${customEmoji[2]}` : value;
}

async function handleReaction(reaction, user, adding) {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const data = readJson("reaction-roles.json", { panels: [] });
    const panel = (data.panels || []).find(
      (item) => item.messageId === reaction.message.id,
    );

    if (!panel) return;

    const selected = panel.roles.find(
      (item) =>
        normalizeConfiguredEmoji(item.emoji) === normalizeReaction(reaction),
    );

    if (!selected) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // If access roles are configured, member must have at least one
    const accessRoleIds = panel.accessRoleIds || [];
    const hasAccess =
      accessRoleIds.length === 0 ||
      accessRoleIds.some((roleId) => member.roles.cache.has(roleId));

    if (!hasAccess) {
      // Remove reaction if user doesn't have access
      if (adding) {
        await reaction.users.remove(user.id).catch(() => {});
      }
      try {
        await user.send(
          `You need an authorized role to select options from that reaction-role panel in **${guild.name}**.`,
        );
      } catch {
        // DMs disabled
      }
      return;
    }

    const selectedRole = await guild.roles.fetch(selected.roleId).catch(() => null);
    if (!selectedRole || !selectedRole.editable) return;

    if (adding) {
      // One-choice mode: remove other panel roles and clear their reactions
      if (panel.oneChoice) {
        for (const option of panel.roles) {
          if (option.roleId === selected.roleId) continue;

          if (member.roles.cache.has(option.roleId)) {
            await member.roles.remove(option.roleId).catch(() => {});
          }

          // Remove the user's reaction from Discord for the unselected option
          const otherKey = normalizeConfiguredEmoji(option.emoji);
          const otherReaction = reaction.message.reactions.cache.find(
            (r) => normalizeReaction(r) === otherKey,
          );
          if (otherReaction) {
            await otherReaction.users.remove(user.id).catch(() => {});
          }
        }
      }

      await member.roles.add(selectedRole).catch(console.error);
    } else {
      await member.roles.remove(selectedRole).catch(console.error);
    }
  } catch (error) {
    console.error("Could not process reaction role:", error);
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