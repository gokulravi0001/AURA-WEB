const fs = require("node:fs");
const path = require("node:path");

const dataFile = path.join(__dirname, "..", "data", "command-settings.json");

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return {};
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (error) {
    console.error("Could not read command settings:", error);
    throw new Error("Command settings could not be read.");
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getCommandSettings(guildId, commandNames) {
  const guildSettings = readData()[guildId] || {};
  return Object.fromEntries(commandNames.map((name) => [name, guildSettings[name] !== false]));
}

function isCommandEnabled(guildId, commandName) {
  return readData()[guildId]?.[commandName] !== false;
}

function saveCommandEnabled(guildId, commandName, enabled) {
  const data = readData();
  data[guildId] ||= {};
  data[guildId][commandName] = enabled;
  writeData(data);
}

module.exports = {
  getCommandSettings,
  isCommandEnabled,
  saveCommandEnabled,
};
