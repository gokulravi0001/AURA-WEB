const {
  AuditLogEvent,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel } = require("../utils/helpers");

const SECURITY_FILE = "security-data.json";

function getSecurityStore() {
  return readJson(SECURITY_FILE, {});
}

function saveSecurityStore(data) {
  writeJson(SECURITY_FILE, data);
}

function getGuildSecurity(guildId) {
  const store = getSecurityStore();
  return (
    store[guildId] || {
      logChannelId: null,
      antiRaid: {
        enabled: true,
        joinThreshold: 5, // 5 joins in 10s
        timeWindowSec: 10,
        action: "lockdown", // "alert", "kick", "lockdown"
        minAccountAgeDays: 3,
      },
      antiSpam: {
        enabled: true,
        maxMentions: 4,
        maxMessagesPerWindow: 5,
        windowSec: 3,
      },
      antiNuke: {
        enabled: true,
        maxChannelDeletes: 2, // in 30s
        maxRoleDeletes: 2, // in 30s
        maxBans: 3, // in 30s
        windowSec: 30,
      },
      whitelist: [], // user IDs or role IDs exempt from anti-nuke
      activeLockdown: false,
    }
  );
}

function saveGuildSecurity(guildId, config) {
  const store = getSecurityStore();
  store[guildId] = config;
  saveSecurityStore(store);
  return config;
}

// In-memory rate trackers
const joinBuckets = new Map(); // guildId -> [timestamps]
const messageBuckets = new Map(); // `${guildId}:${userId}` -> [timestamps]
const actionBuckets = new Map(); // `${guildId}:${userId}:${action}` -> [timestamps]

function isWhitelisted(guild, userId) {
  if (guild.ownerId === userId) return true;
  const config = getGuildSecurity(guild.id);
  if (config.whitelist.includes(userId)) return true;

  const member = guild.members.cache.get(userId);
  if (member && member.roles.cache.some((r) => config.whitelist.includes(r.id))) {
    return true;
  }
  return false;
}

async function sendSecurityLog(guild, embed) {
  const config = getGuildSecurity(guild.id);
  if (!config.logChannelId) return;

  const channel = await fetchChannel(guild, config.logChannelId);
  if (channel && channel.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function executeEmergencyLockdown(guild, lock) {
  const config = getGuildSecurity(guild.id);
  config.activeLockdown = lock;
  saveGuildSecurity(guild.id, config);

  const channels = guild.channels.cache.filter(
    (c) => c.isTextBased() && !c.isThread(),
  );

  let modifiedCount = 0;
  for (const [, ch] of channels) {
    try {
      await ch.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: lock ? false : null,
      });
      modifiedCount++;
    } catch {
      // Ignore channels bot cannot manage
    }
  }

  const embed = new EmbedBuilder()
    .setColor(lock ? 0xed4245 : 0x57f287)
    .setTitle(lock ? "🚨 EMERGENCY SERVER LOCKDOWN ACTIVATED" : "🟢 SERVER LOCKDOWN LIFTED")
    .setDescription(
      lock
        ? `AURA has locked **${modifiedCount}** channels to protect against raid/nuke activity. Regular members cannot send messages.`
        : `Normal chat permissions have been restored across **${modifiedCount}** channels.`,
    )
    .setTimestamp();

  await sendSecurityLog(guild, embed);
  return modifiedCount;
}

async function punishNuker(guild, executorId, reason) {
  if (isWhitelisted(guild, executorId)) return;

  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    // 1. Strip all roles to neutralize permissions
    const adminRoles = member.roles.cache.filter((r) => r.id !== guild.id);
    if (adminRoles.size > 0) {
      await member.roles.remove(adminRoles, `[AURA Anti-Nuke] ${reason}`).catch(() => {});
    }

    // 2. Ban offender
    if (member.bannable) {
      await guild.bans.create(executorId, {
        reason: `[AURA Anti-Nuke Triggered] ${reason}`,
        deleteMessageSeconds: 86400,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚨 ANTI-NUKE TRIGGERED: OFFENDER NEUTRALIZED")
      .setDescription(
        `**Offender:** <@${executorId}> (\`${executorId}\`)\n` +
        `**Reason:** ${reason}\n` +
        `**Action Taken:** All roles stripped & Account banned from server.`,
      )
      .setTimestamp();

    await sendSecurityLog(guild, embed);

    // Notify server owner directly
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
      await owner.send({
        content: `🚨 **EMERGENCY ANTI-NUKE ALERT IN ${guild.name}**\nAURA neutralized a potential nuke by <@${executorId}>: *${reason}*. Offender has been banned.`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("Anti-Nuke punishment error:", err);
  }
}

function registerSecurityEvents(bot) {
  // 1. Anti-Join Raid Protection
  bot.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    const config = getGuildSecurity(guild.id);
    if (!config.antiRaid?.enabled) return;

    const now = Date.now();
    const windowMs = (config.antiRaid.timeWindowSec || 10) * 1000;

    const bucket = joinBuckets.get(guild.id) || [];
    const recent = bucket.filter((t) => now - t <= windowMs);
    recent.push(now);
    joinBuckets.set(guild.id, recent);

    if (recent.length >= (config.antiRaid.joinThreshold || 5)) {
      // Trigger Raid Mode!
      if (!config.activeLockdown) {
        if (config.antiRaid.action === "lockdown") {
          await executeEmergencyLockdown(guild, true);
        }

        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🚨 RAID DETECTED: AUTO-DEFENSE ENGAGED")
          .setDescription(
            `Detected **${recent.length}** joins in under ${config.antiRaid.timeWindowSec}s.\n` +
            `**Defense Action:** \`${config.antiRaid.action.toUpperCase()}\``,
          )
          .setTimestamp();

        await sendSecurityLog(guild, embed);
      }

      // If action is kick, kick recent raiders
      if (config.antiRaid.action === "kick" && member.kickable) {
        const accountAgeDays = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < (config.antiRaid.minAccountAgeDays || 3)) {
          await member.kick("[AURA Anti-Raid] Suspicious alt account during raid").catch(() => {});
        }
      }
    }
  });

  // 2. Anti-Spam & Anti-Mass Mention
  bot.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const guild = message.guild;
    const config = getGuildSecurity(guild.id);
    if (!config.antiSpam?.enabled) return;

    if (isWhitelisted(guild, message.author.id)) return;

    const member = message.member;
    if (!member || member.permissions.has(PermissionFlagsBits.Administrator)) return;

    // A. Check Mass Mentions
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > (config.antiSpam.maxMentions || 4) || (message.mentions.everyone && !member.permissions.has(PermissionFlagsBits.MentionEveryone))) {
      await message.delete().catch(() => {});

      if (member.moderatable) {
        await member.timeout(3600000, "[AURA Anti-Spam] Mass mention detected").catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⚠️ Anti-Spam: Mass Mention Throttled")
        .setDescription(
          `**User:** ${message.author} (\`${message.author.id}\`)\n` +
          `**Channel:** ${message.channel}\n` +
          `**Mentions Count:** ${mentionCount}\n` +
          `**Action:** Message deleted & 1-hour timeout applied.`,
        )
        .setTimestamp();

      await sendSecurityLog(guild, embed);
      return;
    }

    // B. Check Rapid Spam Rate
    const key = `${guild.id}:${message.author.id}`;
    const now = Date.now();
    const windowMs = (config.antiSpam.windowSec || 3) * 1000;

    const bucket = messageBuckets.get(key) || [];
    const recent = bucket.filter((t) => now - t <= windowMs);
    recent.push(now);
    messageBuckets.set(key, recent);

    if (recent.length > (config.antiSpam.maxMessagesPerWindow || 5)) {
      await message.delete().catch(() => {});
      if (member.moderatable) {
        await member.timeout(600000, "[AURA Anti-Spam] Fast message spam").catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("⚠️ Anti-Spam: Fast Message Spam Throttled")
        .setDescription(
          `**User:** ${message.author} (\`${message.author.id}\`)\n` +
          `**Action:** Timed out for 10 minutes for flood spam.`,
        )
        .setTimestamp();

      await sendSecurityLog(guild, embed);
    }
  });

  // 3. Anti-Nuke: Channel Delete Protection
  bot.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const guild = channel.guild;
    const config = getGuildSecurity(guild.id);
    if (!config.antiNuke?.enabled) return;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelDelete,
        limit: 1,
      });
      const entry = logs.entries.first();
      if (!entry || !entry.executor) return;

      const executor = entry.executor;
      if (executor.id === bot.user.id || isWhitelisted(guild, executor.id)) return;

      const key = `${guild.id}:${executor.id}:channelDelete`;
      const now = Date.now();
      const windowMs = (config.antiNuke.windowSec || 30) * 1000;

      const bucket = actionBuckets.get(key) || [];
      const recent = bucket.filter((t) => now - t <= windowMs);
      recent.push(now);
      actionBuckets.set(key, recent);

      if (recent.length >= (config.antiNuke.maxChannelDeletes || 2)) {
        await punishNuker(
          guild,
          executor.id,
          `Mass Channel Deletion (${recent.length} channels in ${config.antiNuke.windowSec}s)`,
        );
      }
    } catch (err) {
      console.error("Error checking channelDelete audit log:", err);
    }
  });

  // 4. Anti-Nuke: Role Delete Protection
  bot.on("roleDelete", async (role) => {
    const guild = role.guild;
    const config = getGuildSecurity(guild.id);
    if (!config.antiNuke?.enabled) return;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.RoleDelete,
        limit: 1,
      });
      const entry = logs.entries.first();
      if (!entry || !entry.executor) return;

      const executor = entry.executor;
      if (executor.id === bot.user.id || isWhitelisted(guild, executor.id)) return;

      const key = `${guild.id}:${executor.id}:roleDelete`;
      const now = Date.now();
      const windowMs = (config.antiNuke.windowSec || 30) * 1000;

      const bucket = actionBuckets.get(key) || [];
      const recent = bucket.filter((t) => now - t <= windowMs);
      recent.push(now);
      actionBuckets.set(key, recent);

      if (recent.length >= (config.antiNuke.maxRoleDeletes || 2)) {
        await punishNuker(
          guild,
          executor.id,
          `Mass Role Deletion (${recent.length} roles in ${config.antiNuke.windowSec}s)`,
        );
      }
    } catch (err) {
      console.error("Error checking roleDelete audit log:", err);
    }
  });

  // 5. Anti-Nuke: Mass Ban Protection
  bot.on("guildBanAdd", async (ban) => {
    const guild = ban.guild;
    const config = getGuildSecurity(guild.id);
    if (!config.antiNuke?.enabled) return;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 1,
      });
      const entry = logs.entries.first();
      if (!entry || !entry.executor) return;

      const executor = entry.executor;
      if (executor.id === bot.user.id || isWhitelisted(guild, executor.id)) return;

      const key = `${guild.id}:${executor.id}:ban`;
      const now = Date.now();
      const windowMs = (config.antiNuke.windowSec || 30) * 1000;

      const bucket = actionBuckets.get(key) || [];
      const recent = bucket.filter((t) => now - t <= windowMs);
      recent.push(now);
      actionBuckets.set(key, recent);

      if (recent.length >= (config.antiNuke.maxBans || 3)) {
        await punishNuker(
          guild,
          executor.id,
          `Mass Member Banning (${recent.length} bans in ${config.antiNuke.windowSec}s)`,
        );
      }
    } catch (err) {
      console.error("Error checking guildBanAdd audit log:", err);
    }
  });
}

module.exports = {
  getGuildSecurity,
  saveGuildSecurity,
  executeEmergencyLockdown,
  registerSecurityEvents,
};
