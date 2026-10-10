const fs = require("node:fs");
const path = require("node:path");
const { EmbedBuilder } = require("discord.js");
const { fetchChannel } = require("../utils/helpers");

const dataFile = path.join(__dirname, "..", "data", "invite-data.json");
const settingsFile = path.join(__dirname, "..", "data", "invite-settings.json");

const inviteCache = new Map();
const joinQueues = new Map();

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return {};
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    // Ensure structure supports both joins array and bonus map
    return raw && typeof raw === "object" ? raw : {};
  } catch (error) {
    console.error("Could not read invite data:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function readSettings() {
  try {
    if (!fs.existsSync(settingsFile)) return {};
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch (error) {
    console.error("Could not read invite announcement settings:", error);
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

function getInviteAnnouncementChannel(guildId) {
  return readSettings()[guildId] || null;
}

function setInviteAnnouncementChannel(guildId, channelId) {
  const settings = readSettings();
  settings[guildId] = channelId;
  writeSettings(settings);
}

function removeInviteAnnouncementChannel(guildId) {
  const settings = readSettings();
  if (!settings[guildId]) return false;
  delete settings[guildId];
  writeSettings(settings);
  return true;
}

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return;

    inviteCache.set(
      guild.id,
      new Map(
        invites.map((invite) => [
          invite.code,
          {
            uses: invite.uses || 0,
            inviterId: invite.inviter?.id || null,
          },
        ]),
      ),
    );
  } catch (error) {
    // Missing permissions or bot lacks invite access
  }
}

function getGuildJoins(guildId) {
  const data = readData();
  const raw = data[guildId];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.joins || [];
}

function getGuildBonus(guildId, userId) {
  const data = readData();
  const raw = data[guildId];
  if (!raw || Array.isArray(raw)) return 0;
  return Number(raw.bonus?.[userId] || 0);
}

function setGuildBonus(guildId, userId, amount) {
  const data = readData();
  let raw = data[guildId];

  if (!raw || Array.isArray(raw)) {
    data[guildId] = {
      joins: Array.isArray(raw) ? raw : [],
      bonus: {},
    };
    raw = data[guildId];
  }

  raw.bonus ||= {};
  raw.bonus[userId] = amount;
  writeData(data);
}

function saveJoin(guildId, memberId, inviterId, inviteCode) {
  const data = readData();
  let raw = data[guildId];

  if (!raw || Array.isArray(raw)) {
    data[guildId] = {
      joins: Array.isArray(raw) ? raw : [],
      bonus: {},
    };
    raw = data[guildId];
  }

  raw.joins.push({
    memberId,
    inviterId: inviterId || null,
    inviteCode: inviteCode || null,
    joinedAt: new Date().toISOString(),
    leftAt: null,
  });

  writeData(data);
}

function getInviteStats(guildId, inviterId) {
  const joins = getGuildJoins(guildId);
  const records = joins.filter((record) => record.inviterId === inviterId);
  const bonus = getGuildBonus(guildId, inviterId);

  const stillHere = records.filter((r) => !r.leftAt).length;
  const left = records.filter((r) => r.leftAt).length;
  const net = stillHere + bonus;

  return {
    total: records.length,
    stillHere,
    left,
    bonus,
    net,
  };
}

async function announceJoin(guild, member, inviterId, inviteCode, isVanity = false) {
  const channelId = getInviteAnnouncementChannel(guild.id);
  if (!channelId) return;

  const channel = await fetchChannel(guild, channelId);
  if (!channel?.isTextBased()) return;

  const inviter = inviterId
    ? await guild.members.fetch(inviterId).catch(() => null)
    : null;

  const embed = new EmbedBuilder()
    .setColor(inviter ? 0x57f287 : 0xfee75c)
    .setTitle("👋 Member Joined")
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  if (isVanity) {
    embed.setDescription(`Welcome ${member}! Joined using the **Server Vanity URL**.`);
  } else if (inviter) {
    const stats = getInviteStats(guild.id, inviterId);
    embed.setDescription(`Welcome ${member}! Invited by **${inviter.user.tag}** (<@${inviterId}>).`);
    embed.addFields(
      { name: "Invite Code", value: `\`${inviteCode}\``, inline: true },
      { name: "Inviter Total", value: `${stats.total} (${stats.net} net)`, inline: true },
    );
  } else {
    embed.setDescription(`Welcome ${member}! Could not determine which invite was used.`);
  }

  await channel.send({
    embeds: [embed],
    allowedMentions: { users: inviterId ? [member.id, inviterId] : [member.id] },
  }).catch(() => {});
}

async function trackMemberJoin(member) {
  const guild = member.guild;

  if (member.user.bot) {
    // Bot joins via OAuth
    saveJoin(guild.id, member.id, null, "OAuth_Bot");
    return;
  }

  const previousInvites = inviteCache.get(guild.id);

  try {
    const currentInvites = await guild.invites.fetch().catch(() => null);
    let usedInvite = null;
    let isVanity = false;

    if (currentInvites && previousInvites) {
      const changedInvites = currentInvites.filter((invite) => {
        const previous = previousInvites.get(invite.code);
        return previous && (invite.uses || 0) > previous.uses;
      });

      if (changedInvites.size === 1) {
        usedInvite = changedInvites.first();
      }
    }

    // Check vanity URL
    if (!usedInvite && guild.vanityURLCode) {
      try {
        const vanity = await guild.fetchVanityData().catch(() => null);
        if (vanity) isVanity = true;
      } catch {}
    }

    if (currentInvites) {
      inviteCache.set(
        guild.id,
        new Map(
          currentInvites.map((invite) => [
            invite.code,
            {
              uses: invite.uses || 0,
              inviterId: invite.inviter?.id || null,
            },
          ]),
        ),
      );
    }

    const inviterId =
      usedInvite?.inviter?.id === member.id
        ? null
        : usedInvite?.inviter?.id || null;

    const inviteCode = usedInvite?.code || (isVanity ? guild.vanityURLCode : null);

    saveJoin(guild.id, member.id, inviterId, inviteCode);
    await announceJoin(guild, member, inviterId, inviteCode, isVanity);
  } catch (error) {
    console.error("Could not check which invite was used:", error);
    saveJoin(guild.id, member.id, null, null);
    await announceJoin(guild, member, null, null);
  }
}

function markMemberLeft(member) {
  const data = readData();
  let raw = data[member.guild.id];
  const joins = Array.isArray(raw) ? raw : (raw?.joins || []);

  for (let index = joins.length - 1; index >= 0; index--) {
    const record = joins[index];
    if (record.memberId === member.id && !record.leftAt) {
      record.leftAt = new Date().toISOString();
      writeData(data);
      return;
    }
  }
}

function getInviteLeaderboard(guildId, limit = 15) {
  const joins = getGuildJoins(guildId);
  const data = readData();
  const bonuses = (!Array.isArray(data[guildId]) && data[guildId]?.bonus) || {};

  const totals = new Map();

  for (const record of joins) {
    if (!record.inviterId) continue;

    const current = totals.get(record.inviterId) || {
      inviterId: record.inviterId,
      total: 0,
      stillHere: 0,
      bonus: Number(bonuses[record.inviterId] || 0),
    };

    current.total++;
    if (!record.leftAt) {
      current.stillHere++;
    }

    totals.set(record.inviterId, current);
  }

  // Include users with only bonus invites
  for (const [userId, bonusCount] of Object.entries(bonuses)) {
    if (!totals.has(userId) && bonusCount !== 0) {
      totals.set(userId, {
        inviterId: userId,
        total: 0,
        stillHere: 0,
        bonus: Number(bonusCount),
      });
    }
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      net: item.stillHere + item.bonus,
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, limit);
}

// Admin bonus controls
function addBonusInvites(guildId, userId, amount) {
  const current = getGuildBonus(guildId, userId);
  setGuildBonus(guildId, userId, current + amount);
}

function removeBonusInvites(guildId, userId, amount) {
  const current = getGuildBonus(guildId, userId);
  setGuildBonus(guildId, userId, current - amount);
}

function resetUserInvites(guildId, userId) {
  const data = readData();
  if (Array.isArray(data[guildId])) {
    data[guildId] = data[guildId].filter((r) => r.inviterId !== userId);
  } else if (data[guildId]?.joins) {
    data[guildId].joins = data[guildId].joins.filter((r) => r.inviterId !== userId);
    if (data[guildId].bonus) delete data[guildId].bonus[userId];
  }
  writeData(data);
}

function resetAllInvites(guildId) {
  const data = readData();
  if (data[guildId]) {
    delete data[guildId];
    writeData(data);
    return true;
  }
  return false;
}

function registerInviteEvents(client) {
  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }
  });

  client.on("guildCreate", (guild) => {
    cacheGuildInvites(guild).catch(() => {});
  });

  client.on("inviteCreate", (invite) => {
    if (!invite.guild) return;
    const cached = inviteCache.get(invite.guild.id);
    if (!cached) return;
    cached.set(invite.code, {
      uses: invite.uses || 0,
      inviterId: invite.inviter?.id || null,
    });
  });

  client.on("inviteDelete", (invite) => {
    if (!invite.guild) return;
    inviteCache.get(invite.guild.id)?.delete(invite.code);
  });

  client.on("guildMemberAdd", (member) => {
    const guildId = member.guild.id;
    const previous = joinQueues.get(guildId) || Promise.resolve();

    const next = previous
      .then(() => trackMemberJoin(member))
      .catch((error) => console.error("Invite tracking error:", error));

    joinQueues.set(guildId, next);
    next.finally(() => {
      if (joinQueues.get(guildId) === next) {
        joinQueues.delete(guildId);
      }
    });
  });

  client.on("guildMemberRemove", (member) => {
    markMemberLeft(member);
  });
}

module.exports = {
  getInviteStats,
  getInviteLeaderboard,
  getInviteAnnouncementChannel,
  setInviteAnnouncementChannel,
  removeInviteAnnouncementChannel,
  addBonusInvites,
  removeBonusInvites,
  resetUserInvites,
  resetAllInvites,
  registerInviteEvents,
};