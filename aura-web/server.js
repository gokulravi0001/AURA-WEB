const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "aura_flame_secret_key_849204",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, "public")));

const BOT_DATA_DIR = path.join(__dirname, "..", "aura-bot", "data");

function readBotData(filename, fallback = {}) {
  try {
    const fullPath = path.join(BOT_DATA_DIR, filename);
    if (!fs.existsSync(fullPath)) return fallback;
    const content = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return fallback;
  }
}

function writeBotData(filename, data) {
  try {
    const fullPath = path.join(BOT_DATA_DIR, filename);
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`Error writing ${filename}:`, err.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// AUTHENTICATION & MULTI-GUILD MANAGEMENT
// -----------------------------------------------------------------------------

// Active demo/configured guilds recognized by AURA
function getAvailableGuilds() {
  const levelData = readBotData("level-data.json", {});
  const greetingData = readBotData("greeting-settings.json", {});
  const securityData = readBotData("security-data.json", {});
  const countingData = readBotData("counting-data.json", {});

  const guildSet = new Set([
    ...Object.keys(levelData.settings || {}),
    ...Object.keys(levelData.users || {}),
    ...Object.keys(greetingData),
    ...Object.keys(securityData),
    ...Object.keys(countingData),
  ]);

  // If empty, provide standard fallback
  if (guildSet.size === 0) {
    guildSet.add("1547837282109624462");
  }

  return Array.from(guildSet).map((id, index) => ({
    id,
    name: index === 0 ? "AURA Main Community" : `Guild Server #${id.slice(-4)}`,
    icon: null,
    owner: true,
    permissions: "Administrator",
  }));
}

// Check current session
app.get("/api/auth/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      loggedIn: true,
      user: req.session.user,
      selectedGuild: req.session.selectedGuild || null,
      guilds: req.session.guilds || [],
    });
  }
  res.json({ loggedIn: false, guilds: [] });
});

// Guild Login / Simulation
// Allows any server owner or manager to select or input their guild ID and log in with their administrator profile
app.post("/api/auth/login", (req, res) => {
  const { guildId, username } = req.body;
  const available = getAvailableGuilds();

  const targetGuildId = (guildId && guildId.trim()) || available[0].id;
  const currentGuild = available.find((g) => g.id === targetGuildId) || {
    id: targetGuildId,
    name: `Server ${targetGuildId}`,
    owner: true,
    permissions: "Administrator",
  };

  const user = {
    id: "998877665544332211",
    username: (username && username.trim()) || "FlameAdmin",
    discriminator: "0001",
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
  };

  req.session.user = user;
  req.session.selectedGuild = currentGuild;
  req.session.guilds = [currentGuild, ...available.filter((g) => g.id !== currentGuild.id)];

  res.json({
    success: true,
    user,
    selectedGuild: currentGuild,
    guilds: req.session.guilds,
  });
});

// Switch active managed server
app.post("/api/auth/select-guild", (req, res) => {
  const { guildId } = req.body;
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized. Please log in first." });
  }

  const available = getAvailableGuilds();
  const currentGuild = available.find((g) => g.id === guildId) || {
    id: guildId,
    name: `Server ${guildId}`,
    owner: true,
    permissions: "Administrator",
  };

  req.session.selectedGuild = currentGuild;
  res.json({ success: true, selectedGuild: currentGuild });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// -----------------------------------------------------------------------------
// LIVE SERVER SETTINGS (READ & WRITE FROM WEB TO DISCORD BOT)
// -----------------------------------------------------------------------------

// Get settings for currently selected server
app.get("/api/guild/settings", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId || "1547837282109624462";

  const security = readBotData("security-data.json", {})[guildId] || {
    antiRaid: { enabled: true, joinThreshold: 5, action: "lockdown" },
    antiSpam: { enabled: true, maxMentions: 4, maxMessagesPerWindow: 5 },
    antiNuke: { enabled: true, maxChannelDeletes: 2, maxRoleDeletes: 2 },
    activeLockdown: false,
  };

  const greetings = readBotData("greeting-settings.json", {})[guildId] || {
    welcomeTitle: "Welcome to {server}!",
    welcomeMessage: "Welcome {user} to {server}! You are member #{count}.",
    welcomeColor: "#FF2A55",
    goodbyeTitle: "Farewell!",
    goodbyeMessage: "{user} has left the server.",
    goodbyeColor: "#9D00FF",
  };

  const levelData = readBotData("level-data.json", {});
  const levelSettings = (levelData.settings && levelData.settings[guildId]) || {
    announcementChannelId: null,
    roleRewards: {},
  };

  const counting = readBotData("counting-data.json", {})[guildId] || {
    mode: "allow_chat",
    number: 0,
    highScore: 0,
  };

  const rules = readBotData("rules.json", {});
  const guildRules = rules[guildId] || rules || [];

  const tempVoiceData = readBotData("temp-voice-data.json", {})[guildId] || {};
  const ticketData = readBotData("ticket-settings.json", {})[guildId] || {};
  const modData = readBotData("mod-data.json", {})[guildId] || {};

  res.json({
    guildId,
    security,
    greetings,
    levelSettings,
    counting,
    rules: guildRules,
    media,
    tempVoice: {
      triggerChannelId: tempVoiceData.triggerChannelId || "",
      categoryId: tempVoiceData.categoryId || "",
      defaultName: tempVoiceData.defaultName || "🔊 {user}'s Room",
    },
    tickets: {
      panelChannelId: ticketData.panelChannelId || "",
      categoryId: ticketData.categoryId || "",
      logChannelId: ticketData.logChannelId || "",
      staffRoleIds: ticketData.staffRoleIds || [],
    },
    moderation: {
      logChannelId: modData.logChannelId || "",
    },
  });
});

// Update Media Link-To-Video Fixer from web
app.post("/api/guild/media", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { enabled, instagram, tiktok, twitter, reddit } = req.body;

  const mediaStore = readBotData("media-fixer-settings.json", {});
  mediaStore[guildId] = {
    ...(mediaStore[guildId] || {}),
    enabled: enabled !== undefined ? enabled : true,
    instagram: instagram !== undefined ? instagram : true,
    tiktok: tiktok !== undefined ? tiktok : true,
    twitter: twitter !== undefined ? twitter : true,
    reddit: reddit !== undefined ? reddit : true,
  };

  writeBotData("media-fixer-settings.json", mediaStore);
  res.json({ success: true, message: "Media link embedder settings updated!", media: mediaStore[guildId] });
});

// Update Security settings from web
app.post("/api/guild/security", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { antiRaid, antiSpam, antiNuke, activeLockdown } = req.body;

  const securityData = readBotData("security-data.json", {});
  securityData[guildId] = {
    ...(securityData[guildId] || {}),
    antiRaid: antiRaid !== undefined ? antiRaid : (securityData[guildId]?.antiRaid || { enabled: true }),
    antiSpam: antiSpam !== undefined ? antiSpam : (securityData[guildId]?.antiSpam || { enabled: true }),
    antiNuke: antiNuke !== undefined ? antiNuke : (securityData[guildId]?.antiNuke || { enabled: true }),
    activeLockdown: activeLockdown !== undefined ? activeLockdown : false,
  };

  writeBotData("security-data.json", securityData);
  res.json({ success: true, message: "Security settings saved to Discord server!", security: securityData[guildId] });
});

// Update Greetings & Welcome embed from web
app.post("/api/guild/greetings", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { welcomeChannelId, goodbyeChannelId, welcomeTitle, welcomeMessage, welcomeColor, goodbyeTitle, goodbyeMessage, goodbyeColor } = req.body;

  const greetingData = readBotData("greeting-settings.json", {});
  greetingData[guildId] = {
    ...(greetingData[guildId] || {}),
    welcomeChannelId: welcomeChannelId || greetingData[guildId]?.welcomeChannelId || null,
    goodbyeChannelId: goodbyeChannelId || greetingData[guildId]?.goodbyeChannelId || null,
    welcomeTitle: welcomeTitle || "Welcome to {server}!",
    welcomeMessage: welcomeMessage || "Welcome {user} to the server!",
    welcomeColor: welcomeColor || "#FF2A55",
    goodbyeTitle: goodbyeTitle || "Goodbye!",
    goodbyeMessage: goodbyeMessage || "{user} left the server.",
    goodbyeColor: goodbyeColor || "#9D00FF",
  };

  writeBotData("greeting-settings.json", greetingData);
  res.json({ success: true, message: "Greeting settings updated for your server!", greetings: greetingData[guildId] });
});

// Add / Update Server Rules from web
app.post("/api/guild/rules", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { rules } = req.body;

  const rulesData = readBotData("rules.json", {});
  if (Array.isArray(rules)) {
    rulesData[guildId] = rules;
  } else if (typeof rules === "string") {
    rulesData[guildId] = rules.split("\n").map(r => r.trim()).filter(Boolean);
  }
  writeBotData("rules.json", rulesData);

  res.json({ success: true, message: "Server rules updated directly in Discord bot!", rules: rulesData[guildId] });
});

// Update Temp Voice settings from web
app.post("/api/guild/temp-voice", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { triggerChannelId, categoryId, defaultName } = req.body;

  const voiceData = readBotData("temp-voice-data.json", {});
  voiceData[guildId] = {
    ...(voiceData[guildId] || { rooms: {} }),
    triggerChannelId: triggerChannelId || null,
    categoryId: categoryId || null,
    defaultName: defaultName || "🔊 {user}'s Room",
  };
  writeBotData("temp-voice-data.json", voiceData);

  res.json({ success: true, message: "Dynamic temp voice hub settings saved!", tempVoice: voiceData[guildId] });
});

// Update Ticket settings from web
app.post("/api/guild/tickets", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { panelChannelId, categoryId, logChannelId, staffRoleIds } = req.body;

  const ticketData = readBotData("ticket-settings.json", {});
  ticketData[guildId] = {
    ...(ticketData[guildId] || {}),
    panelChannelId: panelChannelId || null,
    categoryId: categoryId || null,
    logChannelId: logChannelId || null,
    staffRoleIds: Array.isArray(staffRoleIds) ? staffRoleIds : (typeof staffRoleIds === "string" ? staffRoleIds.split(",").map(s => s.trim()).filter(Boolean) : []),
  };
  writeBotData("ticket-settings.json", ticketData);

  res.json({ success: true, message: "Support ticket configuration saved!", tickets: ticketData[guildId] });
});

// Update Moderation Log channel from web
app.post("/api/guild/moderation", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { logChannelId } = req.body;

  const modData = readBotData("mod-data.json", {});
  modData[guildId] = {
    ...(modData[guildId] || {}),
    logChannelId: logChannelId || null,
  };
  writeBotData("mod-data.json", modData);

  res.json({ success: true, message: "Moderation audit log channel saved!", moderation: modData[guildId] });
});

// Update Leveling Channel & Settings from web
app.post("/api/guild/levels", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { announcementChannelId } = req.body;

  const levelData = readBotData("level-data.json", { settings: {}, users: {} });
  levelData.settings = levelData.settings || {};
  levelData.settings[guildId] = {
    ...(levelData.settings[guildId] || {}),
    announcementChannelId: announcementChannelId || null,
  };
  writeBotData("level-data.json", levelData);

  res.json({ success: true, message: "Level celebration channel saved!", levelSettings: levelData.settings[guildId] });
});

// Update Counting Channel from web
app.post("/api/guild/counting", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, mode } = req.body;

  const countData = readBotData("counting-data.json", {});
  countData[guildId] = {
    ...(countData[guildId] || { number: 0, highScore: 0 }),
    channelId: channelId || null,
    mode: mode || "allow_chat",
  };
  writeBotData("counting-data.json", countData);

  res.json({ success: true, message: "Counting channel configuration saved!", counting: countData[guildId] });
});

// -----------------------------------------------------------------------------
// LIVE XP LEADERBOARD WITH REAL USERNAMES
// -----------------------------------------------------------------------------

app.get("/api/levels", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId;
  const levelData = readBotData("level-data.json", { users: {} });
  const usersTree = levelData.users || {};
  const allUsers = [];

  // If specific guild is chosen, show only that guild's members
  const guildsToInspect = guildId && usersTree[guildId] ? [guildId] : Object.keys(usersTree);

  for (const gId of guildsToInspect) {
    const guildObj = usersTree[gId];
    if (typeof guildObj === "object") {
      for (const userId in guildObj) {
        const u = guildObj[userId];
        if (u && typeof u === "object") {
          // Display actual recorded username, or formatted readable handle
          const username = u.username || `FlameMaster_${userId.slice(-4)}`;
          const avatar = u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

          allUsers.push({
            userId,
            username,
            avatar,
            guildId: gId,
            level: u.level || Math.floor(Math.sqrt((u.xp || 0) / 50)) || 1,
            xp: u.xp || 0,
            messages: u.messages || Math.floor((u.xp || 0) / 12) + 1,
          });
        }
      }
    }
  }

  // Sort descending by level then xp
  allUsers.sort((a, b) => (b.level === a.level ? b.xp - a.xp : b.level - a.level));

  res.json(allUsers.slice(0, 50));
});

// -----------------------------------------------------------------------------
// SYSTEM OVERVIEW & COMMANDS
// -----------------------------------------------------------------------------

app.get("/api/overview", (req, res) => {
  const levelData = readBotData("level-data.json", { users: {} });
  const countingData = readBotData("counting-data.json", {});
  const wordData = readBotData("word-building-data.json", {});
  const reactionRoles = readBotData("reaction-roles.json", {});
  const reminders = readBotData("reminders.json", []);
  const tickets = readBotData("ticket-settings.json", {});

  let totalMembersTracked = 0;
  for (const guild in levelData.users || {}) {
    totalMembersTracked += Object.keys(levelData.users[guild] || {}).length;
  }

  res.json({
    status: "online",
    botName: "AURA",
    tagline: "The Inferno of Discord Moderation, Leveling, and Social Energy",
    version: "2.5.0 Flame Edition",
    stats: {
      guildsConfigured: Object.keys(levelData.users || {}).length || 2,
      membersTracked: totalMembersTracked || 3,
      totalCommands: 30,
      activeReminders: Array.isArray(reminders) ? reminders.length : 0,
      activeTicketsPanels: Object.keys(tickets).length || 1,
      reactionRolePanels: Object.keys(reactionRoles).length || 1,
      countingHighScore: Object.values(countingData).reduce((max, c) => Math.max(max, c.highScore || 0), 0),
      wordChainMaxStreak: Object.values(wordData).reduce((max, w) => Math.max(max, w.highStreak || 0), 0),
    },
    features: [
      { id: "security", name: "Anti-Raid & Anti-Nuke", status: "Active", level: "Maximum Flame Shield" },
      { id: "levels", name: "Dynamic Leveling Engine", status: "Active", level: "XP & Roles Linked" },
      { id: "social", name: "Reputation & Profile Cards", status: "Active", level: "Interactive Cards" },
      { id: "voice", name: "Temp Voice Generation Hub", status: "Active", level: "Zero-Latency" },
      { id: "moderation", name: "Audit & Automated Mod", status: "Active", level: "Role Hierarchy Safe" },
      { id: "minigames", name: "Counting & Word Chain", status: "Active", level: "Community Active" },
      { id: "giveaways", name: "Giveaways & Interactive Polls", status: "Active", level: "Button Powered" },
      { id: "serverstats", name: "Dynamic Live Channel Stats", status: "Active", level: "Voice Counter Sync" },
    ],
  });
});

app.get("/api/commands", (req, res) => {
  const commands = [
    { name: "/security", cat: "Security", desc: "Anti-Raid, Anti-Nuke, Anti-Spam, Lockdown, and Whitelist control center.", options: "lockdown | antiraid | antinuke | antispam | whitelist | log" },
    { name: "/mod", cat: "Moderation", desc: "Full punishment & channel security suite with hierarchy safety.", options: "kick | ban | unban | timeout | warn | purge | lock | unlock | slowmode" },
    { name: "/profile", cat: "Social", desc: "Inspect aesthetic visual profile cards with badges, reputation, and bio.", options: "view [user] | setbio <bio>" },
    { name: "/rep", cat: "Social", desc: "Community peer reputation system with medals and anti-exploit cooldowns.", options: "give <user> | leaderboard | check [user]" },
    { name: "/afk", cat: "Social", desc: "Set auto-reply away notices when mentioned, auto-clears on return.", options: "set [status] | clear | check <user>" },
    { name: "/level", cat: "Leveling", desc: "XP progression engine, graphical rank cards, role rewards, and leaderboards.", options: "show [user] | leaderboard | rewards | setup | give-xp | set-channel" },
    { name: "/serverstats", cat: "Analytics", desc: "Generate graphic analytics dashboard or configure live voice counters.", options: "view [member] [format] | setup [boosts] | remove" },
    { name: "/voice", cat: "Voice Hub", desc: "Join-to-Create temporary automated voice channels with host control panel.", options: "setup | lock | unlock | hide | rename | limit | kick | claim" },
    { name: "/ticket", cat: "Support", desc: "Support ticket creator with button panels, transcript export, and staff roles.", options: "setup | close | transcript | claim | add | remove" },
    { name: "/poll", cat: "Engagement", desc: "Interactive button polls featuring live ASCII percentage graph updates.", options: "create <question> <options...> | end <id>" },
    { name: "/giveaway", cat: "Engagement", desc: "Interactive button giveaways with automatic winner countdown drawings.", options: "start <prize> <duration> | reroll | end | list" },
    { name: "/counting", cat: "Minigames", desc: "High-intensity collaborative counting channel with strict math mode.", options: "setup | stats | mode | reset | set" },
    { name: "/wordbuilding", cat: "Minigames", desc: "Shiritori word chain game where each word begins with the previous letter.", options: "setup | stats | reset" },
    { name: "/reaction-role", cat: "Community", desc: "Embedded role menus with buttons for self-assignable roles.", options: "panel | add | remove | list" },
    { name: "/announcement", cat: "Community", desc: "Formatted embeds with mentions (@everyone, @here, roles) and rich headers.", options: "post | edit" },
    { name: "/rules", cat: "Community", desc: "Maintain and publish persistent server rule boards.", options: "post | add | remove | clear" },
    { name: "/greetings", cat: "Community", desc: "Welcome and farewell embed alerts with customizable variables.", options: "welcome | goodbye" },
    { name: "/birthday", cat: "Social", desc: "Server birthday calendar alerts with custom celebration channels.", options: "set | list | setup" },
    { name: "/invites", cat: "Analytics", desc: "Track vanity and member invite statistics, ranks, and logs.", options: "check | leaderboard" },
    { name: "/sticky", cat: "Community", desc: "Sticky messages that persistently repost at the bottom of busy chats.", options: "add | remove | list" },
    { name: "/threads", cat: "Community", desc: "Auto-threading engine for media, discussions, and suggestion channels.", options: "setup | list" },
    { name: "/suggestion", cat: "Community", desc: "Dedicated suggestion box with upvote/downvote reactions.", options: "submit | setup" },
    { name: "/remind", cat: "Utility", desc: "Personal and server reminder scheduler with custom notifications.", options: "create | list | delete" },
    { name: "/bump", cat: "Engagement", desc: "Server bump reminders with reminder alerts for DISBOARD / top.gg.", options: "setup | check" },
    { name: "/utility", cat: "Utility", desc: "Member profile, server info, avatar lookup, and diagnostics.", options: "userinfo | serverinfo | avatar" },
    { name: "/ping", cat: "Utility", desc: "Heartbeat latency, REST roundtrip, memory heap, and uptime check.", options: "None" },
    { name: "/setup", cat: "Settings", desc: "Master administrative dashboard to toggle commands and audit permissions.", options: "overview | permissions | toggle" },
    { name: "/say", cat: "Utility", desc: "Broadcast announcements or bot dialogue through an embed or text.", options: "<message> [channel]" },
    { name: "/events", cat: "Community", desc: "Plan community events with automated RSVP alerts and reminders.", options: "create | list | cancel" },
  ];
  res.json(commands);
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`🔥 AURA Web Flame Dashboard is running on http://localhost:${portToTry}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${portToTry} is already in use. Trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}

startServer(Number(PORT));
