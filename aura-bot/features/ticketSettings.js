const fs = require("node:fs");
const path = require("node:path");

const dataFile = path.join(
  __dirname,
  "..",
  "data",
  "ticket-settings.json",
);

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return {};
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (error) {
    console.error("Could not read ticket settings:", error);
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getEnvStaffRoleIds() {
  return (process.env.TICKET_STAFF_ROLE_IDS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

function getTicketSettings(guildId) {
  const settings = readData()[guildId] || {};
  let staffRoleIds = settings.staffRoleIds || [];

  if (staffRoleIds.length === 0) {
    staffRoleIds = getEnvStaffRoleIds();
  }

  return {
    staffRoleIds,
    categoryId: settings.categoryId || null,
    panelChannelId: settings.panelChannelId || null,
    logChannelId: settings.logChannelId || null,
  };
}

function getTicketRoleIds(guildId) {
  return getTicketSettings(guildId).staffRoleIds;
}

function saveTicketRoleIds(guildId, roleIds) {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    ...current,
    staffRoleIds: [...new Set(roleIds)],
  };

  writeData(data);
}

function saveTicketCategoryId(guildId, categoryId) {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    ...current,
    categoryId,
  };

  writeData(data);
}

function saveTicketSettings(guildId, newSettings) {
  const data = readData();
  const current = data[guildId] || {};

  data[guildId] = {
    ...current,
    ...newSettings,
  };

  writeData(data);
}

module.exports = {
  getTicketSettings,
  getTicketRoleIds,
  saveTicketRoleIds,
  saveTicketCategoryId,
  saveTicketSettings,
};