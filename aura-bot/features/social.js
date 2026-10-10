const { readJson, writeJson } = require("../utils/jsonStore");

const SOCIAL_FILE = "social-data.json";

function getSocialData() {
  return readJson(SOCIAL_FILE, {});
}

function saveSocialData(data) {
  writeJson(SOCIAL_FILE, data);
}

function getUserProfile(guildId, userId) {
  const data = getSocialData();
  const guildData = data[guildId] || {};
  const user = guildData[userId] || {};

  return {
    bio: user.bio || "No bio set yet. Use `/profile setbio` to add one!",
    rep: typeof user.rep === "number" ? user.rep : 0,
    lastRepGivenTimestamp: user.lastRepGivenTimestamp || 0,
    badges: Array.isArray(user.badges) ? user.badges : [],
  };
}

function setUserBio(guildId, userId, bio) {
  const data = getSocialData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = {};

  data[guildId][userId].bio = bio.slice(0, 250);
  saveSocialData(data);
  return data[guildId][userId].bio;
}

function giveRep(guildId, fromUserId, targetUserId) {
  if (fromUserId === targetUserId) {
    return { success: false, reason: "SELF_REP" };
  }

  const data = getSocialData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][fromUserId]) data[guildId][fromUserId] = {};
  if (!data[guildId][targetUserId]) data[guildId][targetUserId] = {};

  const now = Date.now();
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  const lastGiven = data[guildId][fromUserId].lastRepGivenTimestamp || 0;
  const timePassed = now - lastGiven;

  if (timePassed < COOLDOWN_MS) {
    return {
      success: false,
      reason: "COOLDOWN",
      remainingMs: COOLDOWN_MS - timePassed,
    };
  }

  data[guildId][fromUserId].lastRepGivenTimestamp = now;
  const currentRep = typeof data[guildId][targetUserId].rep === "number" ? data[guildId][targetUserId].rep : 0;
  data[guildId][targetUserId].rep = currentRep + 1;

  saveSocialData(data);
  return {
    success: true,
    newRep: data[guildId][targetUserId].rep,
  };
}

function getRepLeaderboard(guildId, limit = 10) {
  const data = getSocialData();
  const guildData = data[guildId] || {};

  const entries = Object.entries(guildData)
    .map(([userId, profile]) => ({
      userId,
      rep: typeof profile.rep === "number" ? profile.rep : 0,
    }))
    .filter((item) => item.rep > 0)
    .sort((a, b) => b.rep - a.rep)
    .slice(0, limit);

  return entries;
}

module.exports = {
  getUserProfile,
  setUserBio,
  giveRep,
  getRepLeaderboard,
};
