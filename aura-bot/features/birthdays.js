const { EmbedBuilder } = require("discord.js");
const { fetchChannel } = require("../utils/helpers");
const { readJson, writeJson } = require("../utils/jsonStore");

const DEFAULT_TIME_ZONE = "Asia/Kolkata";

function readData() {
  const data = readJson("birthdays.json", { settings: {}, birthdays: {} });
  return {
    settings: data.settings || {},
    birthdays: data.birthdays || {},
  };
}

function writeData(data) {
  writeJson("birthdays.json", data);
}

function getBirthdaySettings(guildId) {
  return readData().settings[guildId] || null;
}

function saveBirthdaySettings(guildId, settings) {
  const data = readData();
  data.settings[guildId] = {
    ...(data.settings[guildId] || {}),
    ...settings,
  };
  writeData(data);
}

function getBirthday(guildId, userId) {
  return readData().birthdays[guildId]?.[userId] || null;
}

function getAllBirthdays(guildId) {
  return readData().birthdays[guildId] || {};
}

function setBirthday(guildId, userId, dateText) {
  const data = readData();
  data.birthdays[guildId] ||= {};
  data.birthdays[guildId][userId] = {
    date: dateText,
    lastAnnouncedYear: null,
  };
  writeData(data);
  return true;
}

function removeBirthday(guildId, userId) {
  const data = readData();
  if (!data.birthdays[guildId]?.[userId]) {
    return false;
  }
  delete data.birthdays[guildId][userId];
  writeData(data);
  return true;
}

/**
 * Validates date formatted as DD/MM or DD/MM/YYYY.
 */
function isValidBirthday(dateText) {
  if (!dateText || typeof dateText !== "string") return false;
  const trimmed = dateText.trim().replace(/[-.]/g, "/");

  // 1. DD/MM/YYYY
  const matchFull = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (matchFull) {
    const day = Number(matchFull[1]);
    const month = Number(matchFull[2]);
    const year = Number(matchFull[3]);
    const currentYear = new Date().getFullYear();

    if (year < 1920 || year > currentYear) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  // 2. DD/MM (year omitted for privacy)
  const matchShort = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (matchShort) {
    const day = Number(matchShort[1]);
    const month = Number(matchShort[2]);

    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    // Use leap year 2024 to validate valid calendar day
    const date = new Date(Date.UTC(2024, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  return false;
}

function formatBirthdayString(dateText) {
  const parts = dateText.trim().replace(/[-.]/g, "/").split("/");
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  if (parts.length === 3) {
    return `${day}/${month}/${parts[2]}`;
  }
  return `${day}/${month}`;
}

function getTodayInTimeZone(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((p) => [p.type, p.value]),
  );

  return {
    day: values.day,
    month: values.month,
    year: Number(values.year),
  };
}

async function checkBirthdays(client) {
  const data = readData();
  let changed = false;

  for (const [guildId, members] of Object.entries(data.birthdays)) {
    const settings = data.settings[guildId];
    if (!settings?.announcementChannelId) continue;

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const channel = await fetchChannel(guild, settings.announcementChannelId);
    if (!channel?.isTextBased()) continue;

    const today = getTodayInTimeZone(settings.timeZone || DEFAULT_TIME_ZONE);

    for (const [userId, birthday] of Object.entries(members)) {
      const parts = birthday.date.split("/");
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");

      if (day !== today.day || month !== today.month) continue;
      if (birthday.lastAnnouncedYear === today.year) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      const displayName = member ? member.displayName : `Member`;

      const embed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle("🎂 Happy Birthday!")
        .setDescription(`🎉 Everyone wish **${displayName}** (<@${userId}>) a fantastic birthday today! May you have a wonderful year ahead! 🎈`)
        .setThumbnail(member ? member.user.displayAvatarURL({ size: 256 }) : null)
        .setTimestamp();

      try {
        await channel.send({
          content: `🎉 Happy Birthday <@${userId}>!`,
          embeds: [embed],
        });

        birthday.lastAnnouncedYear = today.year;
        changed = true;

        // Assign birthday role if configured
        if (settings.birthdayRoleId && member) {
          const bdayRole = guild.roles.cache.get(settings.birthdayRoleId);
          if (bdayRole && bdayRole.editable) {
            await member.roles.add(bdayRole).catch(() => {});
          }
        }
      } catch (error) {
        console.error(`Could not announce birthday for ${userId}:`, error);
      }
    }
  }

  if (changed) {
    writeData(data);
  }
}

function registerBirthdayEvents(client) {
  // Listen for message submissions in submission channel
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const settings = getBirthdaySettings(message.guild.id);
    if (!settings?.inputChannelId) return;

    if (message.channel.id !== settings.inputChannelId) return;

    const dateText = message.content.trim();
    if (!isValidBirthday(dateText)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel
        .send(
          `⚠️ <@${message.author.id}>, please use format **DD/MM** (e.g. \`24/05\`) or **DD/MM/YYYY** (e.g. \`24/05/2005\`).`
        )
        .catch(() => {});
      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
      }
      return;
    }

    const formatted = formatBirthdayString(dateText);
    setBirthday(message.guild.id, message.author.id, formatted);

    await message.delete().catch(() => {});

    // Send confirmation in channel (auto-deleting after 8 seconds) so user sees it even if DMs are disabled
    const confMsg = await message.channel
      .send(`🎂 <@${message.author.id}>, your birthday has been saved as **${formatted}**! 🎉`)
      .catch(() => {});
    if (confMsg) {
      setTimeout(() => confMsg.delete().catch(() => {}), 8000);
    }

    await message.author
      .send(`🎂 Your birthday has been saved as **${formatted}** for **${message.guild.name}**!`)
      .catch(() => {});
  });

  client.once("clientReady", () => {
    checkBirthdays(client).catch(console.error);

    const timer = setInterval(() => {
      checkBirthdays(client).catch(console.error);
    }, 60 * 1000);

    if (typeof timer.unref === "function") timer.unref();
  });
}

module.exports = {
  getBirthday,
  getAllBirthdays,
  setBirthday,
  getBirthdaySettings,
  saveBirthdaySettings,
  removeBirthday,
  isValidBirthday,
  formatBirthdayString,
  checkBirthdays,
  registerBirthdayEvents,
};