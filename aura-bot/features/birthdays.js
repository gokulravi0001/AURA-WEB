const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { fetchChannel } = require("../utils/helpers");
const { readJson, writeJson } = require("../utils/jsonStore");
const { postStickyMessage } = require("./stickyMessages");

const DEFAULT_TIME_ZONE = "Asia/Kolkata";

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

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
 * Universal, ultra-resilient birthday parser.
 * Handles DD/MM/YYYY, DD/MM, ISO YYYY-MM-DD, 2-digit years, month names ("24 May", "May 24th"),
 * backticks, markdown, prefixes ("bday: 24/05"), emojis, and calendar validation.
 */
function parseBirthday(input) {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Empty or invalid input" };
  }

  // 1. Sanitize text: strip markdown backticks, asterisks, brackets, quotes, common prefixes
  let cleaned = input
    .trim()
    .replace(/[`*~_()\[\]]/g, "")
    .replace(/^(my\s+)?(birthday|bday|dob)(\s+is|\s*:)?\s*/i, "")
    .replace(/^(born\s+on|born)\s*:?\s*/i, "")
    .trim();

  // Normalize ordinals: 1st -> 1, 2nd -> 2, 3rd -> 3, 24th -> 24
  cleaned = cleaned.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");

  const currentYear = new Date().getFullYear();

  // 2. Format A: Month Name based (e.g. "24 May 2005", "May 24 2005", "24 May", "May 24")
  const monthNameMatch1 = /^(\d{1,2})[\s\-/\.]*([a-zA-Z]+)(?:[\s\-/\.]+(\d{2,4}))?$/.exec(cleaned);
  const monthNameMatch2 = /^([a-zA-Z]+)[\s\-/\.]*(\d{1,2})(?:[\s\-/\.]+(\d{2,4}))?$/.exec(cleaned);

  if (monthNameMatch1 || monthNameMatch2) {
    const rawDay = monthNameMatch1 ? monthNameMatch1[1] : monthNameMatch2[2];
    const rawMonthStr = (monthNameMatch1 ? monthNameMatch1[2] : monthNameMatch2[1]).toLowerCase();
    const rawYear = monthNameMatch1 ? monthNameMatch1[3] : monthNameMatch2[3];

    const monthNum = MONTH_NAMES[rawMonthStr];
    if (monthNum) {
      let day = parseInt(rawDay, 10);
      let year = null;
      if (rawYear) {
        year = parseInt(rawYear, 10);
        if (year < 100) year = year < 30 ? 2000 + year : 1900 + year;
      }
      return validateAndBuildBirthday(day, monthNum, year, currentYear);
    }
  }

  // 3. Format B: ISO format YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[\s\-/\.]+(\d{1,2})[\s\-/\.]+(\d{1,2})$/.exec(cleaned);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return validateAndBuildBirthday(day, month, year, currentYear);
  }

  // 4. Format C: DD/MM/YYYY or DD/MM/YY (separated by /, -, ., or spaces)
  const fullNumericMatch = /^(\d{1,2})[\s\-/\.]+(\d{1,2})[\s\-/\.]+(\d{2,4})$/.exec(cleaned);
  if (fullNumericMatch) {
    const day = parseInt(fullNumericMatch[1], 10);
    const month = parseInt(fullNumericMatch[2], 10);
    let year = parseInt(fullNumericMatch[3], 10);
    if (year < 100) {
      year = year < 30 ? 2000 + year : 1900 + year;
    }
    return validateAndBuildBirthday(day, month, year, currentYear);
  }

  // 5. Format D: DD/MM (year omitted for privacy)
  const shortNumericMatch = /^(\d{1,2})[\s\-/\.]+(\d{1,2})$/.exec(cleaned);
  if (shortNumericMatch) {
    const day = parseInt(shortNumericMatch[1], 10);
    const month = parseInt(shortNumericMatch[2], 10);
    return validateAndBuildBirthday(day, month, null, currentYear);
  }

  return { valid: false, error: "Unrecognized date format" };
}

function validateAndBuildBirthday(day, month, year, currentYear) {
  if (month < 1 || month > 12) return { valid: false, error: "Month must be between 1 and 12" };
  if (day < 1 || day > 31) return { valid: false, error: "Day must be between 1 and 31" };

  if (year !== null) {
    if (year < 1910 || year > currentYear) {
      return { valid: false, error: `Year must be between 1910 and ${currentYear}` };
    }
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() !== month - 1 ||
      dateObj.getUTCDate() !== day
    ) {
      return { valid: false, error: "Invalid calendar date for specified month/year" };
    }

    const dStr = String(day).padStart(2, "0");
    const mStr = String(month).padStart(2, "0");
    return {
      valid: true,
      day,
      month,
      year,
      formatted: `${dStr}/${mStr}/${year}`,
    };
  }

  // Short format validation (use leap year 2024 to validate Feb 29)
  const dateObj = new Date(Date.UTC(2024, month - 1, day));
  if (dateObj.getUTCMonth() !== month - 1 || dateObj.getUTCDate() !== day) {
    return { valid: false, error: "Invalid calendar date for specified month" };
  }

  const dStr = String(day).padStart(2, "0");
  const mStr = String(month).padStart(2, "0");
  return {
    valid: true,
    day,
    month,
    year: null,
    formatted: `${dStr}/${mStr}`,
  };
}

/**
 * Validates date formatted as DD/MM or DD/MM/YYYY.
 */
function isValidBirthday(dateText) {
  return parseBirthday(dateText).valid;
}

function formatBirthdayString(dateText) {
  const result = parseBirthday(dateText);
  return result.valid ? result.formatted : dateText.trim();
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
    const bdayRole = settings.birthdayRoleId ? guild.roles.cache.get(settings.birthdayRoleId) : null;

    for (const [userId, birthday] of Object.entries(members)) {
      const parts = birthday.date.split("/");
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");

      const isToday = day === today.day && month === today.month;

      // Clean up birthday role from members whose birthday is NOT today
      if (!isToday && bdayRole && bdayRole.editable) {
        const mem = guild.members.cache.get(userId);
        if (mem && mem.roles.cache.has(bdayRole.id)) {
          await mem.roles.remove(bdayRole).catch(() => {});
        }
        continue;
      }

      if (!isToday) continue;
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
        if (bdayRole && bdayRole.editable && member) {
          await member.roles.add(bdayRole).catch(() => {});
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
    if (!message.guild || message.author?.bot) return;

    const settings = getBirthdaySettings(message.guild.id);
    if (!settings?.inputChannelId) return;

    if (message.channel.id !== settings.inputChannelId) return;

    const rawContent = message.content.trim();

    // 1. Support cancellation words: "remove", "delete", "clear", "cancel"
    if (["remove", "delete", "clear", "cancel"].includes(rawContent.toLowerCase())) {
      await message.delete().catch(() => {});
      const removed = removeBirthday(message.guild.id, message.author.id);
      const conf = await message.channel.send(
        removed
          ? `🗑️ <@${message.author.id}>, your saved birthday has been removed.`
          : `ℹ️ <@${message.author.id}>, you didn't have a saved birthday to remove.`
      ).catch(() => null);

      if (conf) {
        setTimeout(() => conf.delete().catch(() => {}), 7000);
      }
      postStickyMessage(client, message.guild.id, message.channel.id).catch(() => {});
      return;
    }

    // 2. Parse date input
    const parsed = parseBirthday(rawContent);

    if (!parsed.valid) {
      // Auto-delete the unrecognized message to keep channel clean
      await message.delete().catch(() => {});

      const warnMsg = await message.channel
        .send(
          `⚠️ <@${message.author.id}>, please enter your birthday as **DD/MM** (e.g. \`24/05\`) or **DD/MM/YYYY** (e.g. \`24/05/2004\`), or type \`remove\` to clear.`
        )
        .catch(() => null);

      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
      }

      // Re-anchor sticky message at the bottom
      postStickyMessage(client, message.guild.id, message.channel.id).catch(() => {});
      return;
    }

    // 3. Valid date: Store birthday
    setBirthday(message.guild.id, message.author.id, parsed.formatted);

    // Auto-delete member submission message immediately
    await message.delete().catch(() => {});

    // Send confirmation in channel (auto-deleting after 8 seconds) so user sees it even if DMs are disabled
    const confMsg = await message.channel
      .send(`🎂 <@${message.author.id}>, your birthday has been saved as **${parsed.formatted}**! 🎉`)
      .catch(() => null);

    if (confMsg) {
      setTimeout(() => confMsg.delete().catch(() => {}), 8000);
    }

    // Send DM confirmation to member
    await message.author
      .send(`🎂 Your birthday has been saved as **${parsed.formatted}** in **${message.guild.name}**!`)
      .catch(() => {});

    // Re-anchor sticky message so it remains pinned at the bottom of the chat
    postStickyMessage(client, message.guild.id, message.channel.id).catch(() => {});
  });

  const runBirthdayCheck = () => {
    checkBirthdays(client).catch(console.error);
  };

  if (client.isReady()) {
    runBirthdayCheck();
  } else {
    client.once("ready", runBirthdayCheck);
    client.once("clientReady", runBirthdayCheck);
  }

  const timer = setInterval(runBirthdayCheck, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  getBirthday,
  getAllBirthdays,
  setBirthday,
  getBirthdaySettings,
  saveBirthdaySettings,
  removeBirthday,
  parseBirthday,
  isValidBirthday,
  formatBirthdayString,
  checkBirthdays,
  registerBirthdayEvents,
};