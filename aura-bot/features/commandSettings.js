const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("command-settings.json", {});
}

function writeData(data) {
  writeJson("command-settings.json", data);
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
