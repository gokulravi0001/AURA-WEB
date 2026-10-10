const fs = require("node:fs");
const path = require("node:path");

const dataFile = path.join(__dirname, "..", "data", "word-building-data.json");

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return {};
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (error) {
    console.error("Could not read word-building data:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function saveWordBuildingChannel(guildId, channelId) {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    channelId,
    lastWord: current.lastWord || null,
    lastUserId: current.lastUserId || null,
    chainCount: current.chainCount || 0,
    highScore: current.highScore || 0,
    usedWords: current.usedWords || [],
  };

  writeData(data);
}

function getWordBuildingData(guildId) {
  return readData()[guildId] || null;
}

function setWordBuildingWord(guildId, word) {
  const data = readData();
  if (!data[guildId]) return false;

  const clean = word.toLowerCase().trim();
  data[guildId].lastWord = clean;
  data[guildId].lastUserId = null;
  data[guildId].usedWords = [clean];
  data[guildId].chainCount = 1;

  writeData(data);
  return true;
}

function resetWordBuilding(guildId) {
  const data = readData();
  if (!data[guildId]) return false;

  data[guildId].lastWord = null;
  data[guildId].lastUserId = null;
  data[guildId].usedWords = [];
  data[guildId].chainCount = 0;

  writeData(data);
  return true;
}

function disableWordBuilding(guildId) {
  const data = readData();
  if (!data[guildId]) return false;
  delete data[guildId];
  writeData(data);
  return true;
}

async function sendTemporaryMessage(channel, content, delay = 5000) {
  const sent = await channel.send(content).catch(() => null);
  if (sent) {
    setTimeout(() => sent.delete().catch(() => {}), delay);
  }
}

function registerWordBuildingEvents(bot) {
  bot.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const data = readData();
    const game = data[message.guild.id];

    if (!game || message.channel.id !== game.channelId) return;

    const word = message.content.trim().toLowerCase();

    // 1. Must be pure alphabetical word
    if (!/^[a-z]+$/.test(word) || word.length < 2) {
      await message.delete().catch(() => {});
      await sendTemporaryMessage(
        message.channel,
        `❌ ${message.author}, send a single valid English word with at least 2 letters.`,
      );
      return;
    }

    // 2. Cannot take two turns in a row
    if (game.lastUserId === message.author.id) {
      await message.delete().catch(() => {});
      await sendTemporaryMessage(
        message.channel,
        `❌ ${message.author}, wait for another member to take the next turn!`,
      );
      return;
    }

    // 3. Word already used in this chain
    const usedWords = game.usedWords || [];
    if (usedWords.includes(word)) {
      await message.delete().catch(() => {});
      await sendTemporaryMessage(
        message.channel,
        `❌ **"${word}"** has already been used in this chain. Try another word!`,
      );
      return;
    }

    // 4. Must start with the last letter of the previous word
    if (game.lastWord) {
      const requiredLetter = game.lastWord.slice(-1);

      if (!word.startsWith(requiredLetter)) {
        await message.delete().catch(() => {});
        await sendTemporaryMessage(
          message.channel,
          `❌ ${message.author}, your word must start with **${requiredLetter.toUpperCase()}** (last letter of **${game.lastWord}**).`,
        );
        return;
      }
    }

    // Word is valid!
    game.lastWord = word;
    game.lastUserId = message.author.id;
    game.chainCount = (game.chainCount || 0) + 1;

    if (game.chainCount > (game.highScore || 0)) {
      game.highScore = game.chainCount;
    }

    usedWords.push(word);
    // Keep max 250 used words in memory to prevent boundless array growth
    if (usedWords.length > 250) {
      usedWords.splice(0, usedWords.length - 250);
    }
    game.usedWords = usedWords;

    writeData(data);
    await message.react("🔗").catch(() => {});
  });
}

module.exports = {
  saveWordBuildingChannel,
  getWordBuildingData,
  setWordBuildingWord,
  resetWordBuilding,
  disableWordBuilding,
  registerWordBuildingEvents,
};