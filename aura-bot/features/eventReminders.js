const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel } = require("../utils/helpers");

async function checkEventReminders(bot) {
  const events = readJson("events.json", []);
  let changed = false;

  for (const event of events) {
    if (
      event.status !== "upcoming" ||
      event.reminderSent ||
      Date.now() < event.remindAt ||
      Date.now() >= event.startsAt
    ) {
      continue;
    }

    const guild = bot.guilds.cache.get(event.guildId) || await bot.guilds.fetch(event.guildId).catch(() => null);
    if (!guild) continue;

    const channel = await fetchChannel(guild, event.channelId);
    if (!channel || !channel.isTextBased()) continue;

    try {
      const mentionText = event.mentionRole ? `<@&${event.mentionRole}> ` : "";
      await channel.send({
        content: `⏰ ${mentionText}**Reminder:** The event **${event.title}** starts in 15 minutes! (<t:${Math.floor(event.startsAt / 1000)}:R>)`,
      });
      event.reminderSent = true;
      changed = true;
    } catch (error) {
      console.error("Could not send event reminder:", error);
    }
  }

  if (changed) {
    writeJson("events.json", events);
  }
}

function startEventReminderChecker(bot) {
  bot.once("clientReady", () => {
    checkEventReminders(bot);
    const timer = setInterval(() => checkEventReminders(bot), 30 * 1000);
    if (typeof timer.unref === "function") timer.unref();
  });
}

module.exports = { startEventReminderChecker };