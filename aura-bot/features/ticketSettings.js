const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("ticket-settings.json", {});
}

function writeData(data) {
  writeJson("ticket-settings.json", data);
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