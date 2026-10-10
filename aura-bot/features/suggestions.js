const fs = require("node:fs");
const path = require("node:path");

const dataFile = path.join(__dirname, "..", "data", "suggestion-settings.json");

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return { configs: {}, suggestions: {} };
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    // Handle backwards compatibility if file had { [guildId]: forumId }
    if (raw && typeof raw === "object" && !raw.configs) {
      const configs = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") {
          configs[k] = { channelId: v, isForum: true, autoThread: false };
        } else {
          configs[k] = v;
        }
      }
      return { configs, suggestions: {} };
    }
    return {
      configs: raw.configs || {},
      suggestions: raw.suggestions || {},
    };
  } catch (error) {
    console.error("Could not read suggestion settings:", error);
    return { configs: {}, suggestions: {} };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getSuggestionConfig(guildId) {
  return readData().configs[guildId] || null;
}

function getSuggestionForumId(guildId) {
  return getSuggestionConfig(guildId)?.channelId || null;
}

function setSuggestionConfig(guildId, config) {
  const data = readData();
  data.configs[guildId] = config;
  writeData(data);
}

function setSuggestionForumId(guildId, channelId) {
  setSuggestionConfig(guildId, { channelId, isForum: true, autoThread: false });
}

function saveSuggestion(guildId, suggestion) {
  const data = readData();
  data.suggestions[guildId] ||= {};
  data.suggestions[guildId][suggestion.id] = suggestion;
  writeData(data);
}

function getSuggestion(guildId, suggestionId) {
  const data = readData();
  return data.suggestions[guildId]?.[suggestionId] || null;
}

function updateSuggestion(guildId, suggestionId, updates) {
  const data = readData();
  if (!data.suggestions[guildId]?.[suggestionId]) return null;

  data.suggestions[guildId][suggestionId] = {
    ...data.suggestions[guildId][suggestionId],
    ...updates,
  };

  writeData(data);
  return data.suggestions[guildId][suggestionId];
}

function disableSuggestions(guildId) {
  const data = readData();
  if (data.configs[guildId]) {
    delete data.configs[guildId];
    writeData(data);
    return true;
  }
  return false;
}

module.exports = {
  getSuggestionConfig,
  getSuggestionForumId,
  setSuggestionConfig,
  setSuggestionForumId,
  saveSuggestion,
  getSuggestion,
  updateSuggestion,
  disableSuggestions,
};