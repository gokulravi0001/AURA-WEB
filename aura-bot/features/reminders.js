const { readJson, writeJson } = require("../utils/jsonStore");
const { fetchChannel } = require("../utils/helpers");

function getReminders() {
  const data = readJson("reminders.json", []);
  return Array.isArray(data) ? data : [];
}

function addReminder(reminder) {
  const list = getReminders();
  list.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    ...reminder,
  });
  writeJson("reminders.json", list);
}

function getUserReminders(userId) {
  return getReminders().filter((r) => r.userId === userId);
}

function cancelReminder(reminderId, userId = null) {
  const list = getReminders();
  const index = list.findIndex((r) => r.id === reminderId && (!userId || r.userId === userId));
  if (index === -1) return false;

  list.splice(index, 1);
  writeJson("reminders.json", list);
  return true;
}

async function checkReminders(bot) {
  const reminders = getReminders();
  const stillWaiting = [];

  for (const reminder of reminders) {
    if (reminder.remindAt > Date.now()) {
      stillWaiting.push(reminder);
      continue;
    }

    try {
      const channel = await fetchChannel(bot, reminder.channelId);

      if (channel && channel.isTextBased()) {
        const text = reminder.message
          ? `<@${reminder.userId}> ⏰ **Reminder:** ${reminder.message}`
          : `<@${reminder.userId}> ⏰ It's time to **/bump** the server!`;

        await channel.send(text);
      }
    } catch (error) {
      console.error("Could not send reminder:", error);
    }
  }

  writeJson("reminders.json", stillWaiting);
}

function startReminderChecker(bot) {
  bot.once("clientReady", () => {
    checkReminders(bot);
    const timer = setInterval(() => checkReminders(bot), 15 * 1000);
    if (typeof timer.unref === "function") timer.unref();
  });
}

module.exports = {
  getReminders,
  addReminder,
  getUserReminders,
  cancelReminder,
  startReminderChecker,
};