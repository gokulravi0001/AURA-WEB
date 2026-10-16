const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("counting-data.json", {});
}

function writeData(data) {
  writeJson("counting-data.json", data);
}

function saveCountingChannel(guildId, channelId, mode = "allow_chat") {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    channelId,
    number: current.number || 0,
    lastUserId: current.lastUserId || null,
    highScore: current.highScore || 0,
    mode: mode || current.mode || "allow_chat",
  };

  writeData(data);
}

function getCountingData(guildId) {
  return readData()[guildId] || null;
}

function setCountingNumber(guildId, number) {
  const data = readData();
  if (!data[guildId]) return false;

  data[guildId].number = number;
  data[guildId].lastUserId = null;
  if (number > (data[guildId].highScore || 0)) {
    data[guildId].highScore = number;
  }

  writeData(data);
  return true;
}

function resetCounting(guildId) {
  const data = readData();
  if (!data[guildId]) return false;

  data[guildId].number = 0;
  data[guildId].lastUserId = null;
  writeData(data);
  return true;
}

function setCountingMode(guildId, mode) {
  const data = readData();
  if (!data[guildId]) return false;

  data[guildId].mode = mode;
  writeData(data);
  return true;
}

function disableCounting(guildId) {
  const data = readData();
  if (!data[guildId]) return false;
  delete data[guildId];
  writeData(data);
  return true;
}

async function sendTemporaryMessage(channel, content, delay = 6000) {
  const sent = await channel.send(content).catch(() => null);
  if (sent) {
    setTimeout(() => sent.delete().catch(() => {}), delay);
  }
}

function registerCountingEvents(bot) {
  bot.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const data = readData();
    const game = data[message.guild.id];

    if (!game || message.channel.id !== game.channelId) return;

    const content = message.content.trim();
    const isPureNumber = /^\d+$/.test(content);
    const mode = game.mode || "allow_chat";

    // If chat is allowed and the message is not a number, simply ignore it
    if (mode === "allow_chat" && !isPureNumber) {
      return;
    }

    const expected = (game.number || 0) + 1;
    const submitted = Number(content);
    const isCorrect = isPureNumber && submitted === expected;
    const samePersonTwice = game.lastUserId === message.author.id;

    if (!isCorrect || samePersonTwice) {
      const oldStreak = game.number || 0;
      game.number = 0;
      game.lastUserId = null;
      writeData(data);

      await message.react("❌").catch(() => {});

      let reason = `Counted **${submitted || content}** instead of **${expected}**`;
      if (samePersonTwice) {
        reason = "Counted twice in a row (take turns with others!)";
      }

      await sendTemporaryMessage(
        message.channel,
        `❌ **Streak broken by ${message.author}!** ${reason}.\n` +
        `• Lost streak: **${oldStreak}** | All-time high: **${game.highScore || 0}**\n` +
        `Start again from **1**!`,
      );
      return;
    }

    game.number = expected;
    game.lastUserId = message.author.id;

    let isNewHigh = false;
    if (expected > (game.highScore || 0)) {
      game.highScore = expected;
      isNewHigh = true;
    }

    writeData(data);

    if (isNewHigh && expected > 5) {
      await message.react("🎉").catch(() => {});
    } else {
      await message.react("✅").catch(() => {});
    }
  });
}

module.exports = {
  saveCountingChannel,
  getCountingData,
  setCountingNumber,
  resetCounting,
  setCountingMode,
  disableCounting,
  registerCountingEvents,
};
