const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");

// Attempt to load .env from aura-bot if available
try {
  const dotenvPath = path.join(__dirname, "..", "aura-bot", ".env");
  if (fs.existsSync(dotenvPath)) {
    const envContent = fs.readFileSync(dotenvPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key] && val) process.env[key] = val;
      }
    });
  }
} catch {
  // Ignore
}

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

const db = require("./db");
const { readBotData, writeBotData, getDbStatus, initDatabase } = db;
initDatabase().catch(console.error);

app.get("/api/db/status", (req, res) => {
  res.json(getDbStatus());
});

// -----------------------------------------------------------------------------
// BOT REST HELPER (FOR REAL-TIME DISCORD SERVER DISPATCHES)
// -----------------------------------------------------------------------------
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN || "";

async function sendDiscordChannelMessage(channelId, payload) {
  if (!DISCORD_BOT_TOKEN || !channelId) return null;
  try {
    const response = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (err) {
    console.error(`Discord REST message error in channel ${channelId}:`, err.response?.data || err.message);
    return null;
  }
}

async function addDiscordMessageReaction(channelId, messageId, emoji) {
  if (!DISCORD_BOT_TOKEN || !channelId || !messageId || !emoji) return false;
  try {
    const encodedEmoji = encodeURIComponent(emoji.trim());
    await axios.put(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
      {},
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );
    return true;
  } catch (err) {
    console.error(`Discord REST reaction error on message ${messageId}:`, err.response?.data || err.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// AUTHENTICATION & MULTI-GUILD MANAGEMENT
// -----------------------------------------------------------------------------
const DISCORD_CLIENT_ID = process.env.CLIENT_ID || "123456789012345678";
const DISCORD_CLIENT_SECRET = process.env.CLIENT_SECRET || "";
const DISCORD_REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/api/auth/discord/callback";

function hasAdminPermissions(permissions) {
  if (!permissions) return false;
  const permBigInt = BigInt(permissions);
  const ADMINISTRATOR = BigInt(0x8);
  const MANAGE_GUILD = BigInt(0x20);
  return (permBigInt & ADMINISTRATOR) === ADMINISTRATOR || (permBigInt & MANAGE_GUILD) === MANAGE_GUILD;
}

function getAvailableGuilds() {
  const levelData = readBotData("level-data.json", {});
  const greetingData = readBotData("greeting-settings.json", {});
  const securityData = readBotData("security-data.json", {});
  const countingData = readBotData("counting-data.json", {});
  const wordData = readBotData("word-building-data.json", {});
  const birthdayData = readBotData("birthdays.json", { settings: {} });

  const guildSet = new Set([
    ...Object.keys(levelData.settings || {}),
    ...Object.keys(levelData.users || {}),
    ...Object.keys(greetingData),
    ...Object.keys(securityData),
    ...Object.keys(countingData),
    ...Object.keys(wordData),
    ...Object.keys(birthdayData.settings || {}),
  ]);

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

// Session check
app.get("/api/auth/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      loggedIn: true,
      authMethod: req.session.authMethod || "direct",
      user: req.session.user,
      selectedGuild: req.session.selectedGuild || null,
      guilds: req.session.guilds || [],
    });
  }
  res.json({ loggedIn: false, guilds: [] });
});

// OAuth2 generator
app.get("/api/auth/discord/url", (req, res) => {
  let redirectUri = req.query.redirectUri;
  if (!redirectUri) {
    if (process.env.REDIRECT_URI) {
      redirectUri = process.env.REDIRECT_URI;
    } else {
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      redirectUri = `${proto}://${host}/api/auth/discord/callback`;
    }
  }

  const clientId = process.env.CLIENT_ID || DISCORD_CLIENT_ID;
  const scope = encodeURIComponent("identify guilds");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&prompt=consent`;
  res.json({ url, configured: Boolean(DISCORD_CLIENT_SECRET) });
});

// OAuth2 Callback
app.get("/api/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect("/login?error=missing_code");
  }

  if (!DISCORD_CLIENT_SECRET) {
    console.warn("⚠️ CLIENT_SECRET not configured.");
    return res.redirect("/login?error=oauth_not_configured");
  }

  try {
    let redirectUri = process.env.REDIRECT_URI;
    if (!redirectUri) {
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      redirectUri = `${proto}://${host}/api/auth/discord/callback`;
    }

    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID || DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const discordUser = userResponse.data;

    const guildsResponse = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const allUserGuilds = guildsResponse.data;

    const adminGuilds = allUserGuilds.filter((g) => g.owner || hasAdminPermissions(g.permissions));

    const userProfile = {
      id: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
        : "https://cdn.discordapp.com/embed/avatars/0.png",
    };

    req.session.authMethod = "oauth2";
    req.session.user = userProfile;
    req.session.guilds = adminGuilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      owner: g.owner,
      permissions: "Administrator",
    }));

    req.session.selectedGuild = req.session.guilds.length > 0 ? req.session.guilds[0] : null;

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Discord OAuth2 exchange error:", error.response?.data || error.message);
    res.redirect("/login?error=oauth_failed");
  }
});

// Direct Guild Login (Enter Server ID or username)
app.post("/api/auth/login", (req, res) => {
  const { guildId, username } = req.body;
  const available = getAvailableGuilds();

  const targetGuildId = (guildId && guildId.trim()) || available[0].id;
  const currentGuild = available.find((g) => g.id === targetGuildId) || {
    id: targetGuildId,
    name: `Server ${targetGuildId}`,
    icon: null,
    owner: true,
    permissions: "Administrator",
  };

  const user = {
    id: "998877665544332211",
    username: (username && username.trim()) || "FlameAdmin",
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
  };

  req.session.authMethod = "direct";
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

// Switch active guild
app.post("/api/auth/select-guild", (req, res) => {
  const { guildId } = req.body;
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized. Please log in first." });
  }

  const userGuilds = req.session.guilds || getAvailableGuilds();
  const currentGuild = userGuilds.find((g) => g.id === guildId) || {
    id: guildId,
    name: `Server ${guildId}`,
    icon: null,
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
// LIVE SERVER SETTINGS READ & WRITE
// -----------------------------------------------------------------------------
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
    channelId: null,
    mode: "allow_chat",
    number: 0,
    highScore: 0,
  };

  const wordData = readBotData("word-building-data.json", {})[guildId] || {
    channelId: null,
    lastWord: null,
    usedWords: [],
  };

  const birthdayData = readBotData("birthdays.json", { settings: {}, birthdays: {} });
  const birthdaySettings = (birthdayData.settings && birthdayData.settings[guildId]) || {
    inputChannelId: null,
    announcementChannelId: null,
  };

  const threadData = readBotData("thread-settings.json", {});
  const threadChannelId = typeof threadData[guildId] === "string" ? threadData[guildId] : (Object.keys(threadData[guildId] || {})[0] || "");

  const stickyMessages = readBotData("sticky-messages.json", {});
  const guildStickies = [];
  for (const [key, val] of Object.entries(stickyMessages)) {
    if (key.startsWith(`${guildId}:`)) {
      guildStickies.push({ channelId: key.split(":")[1], ...val });
    }
  }

  const rulesData = readBotData("rules.json", []);
  const guildRules = Array.isArray(rulesData) ? rulesData.filter((r) => r.guildId === guildId) : (rulesData[guildId] || []);

  const reactionRoles = readBotData("reaction-roles.json", { panels: [] });
  const guildReactionPanels = (reactionRoles.panels || []).filter((p) => p.guildId === guildId);

  const inviteSettings = readBotData("invite-settings.json", {});
  const inviteChannelId = inviteSettings[guildId] || "";

  const tempVoiceData = readBotData("temp-voice-data.json", {})[guildId] || {};
  const ticketData = readBotData("ticket-settings.json", {})[guildId] || {};
  const modData = readBotData("mod-data.json", {})[guildId] || {};
  const mediaData = readBotData("media-fixer-settings.json", {})[guildId] || {
    enabled: true,
    instagram: true,
    tiktok: true,
    twitter: true,
    reddit: true,
  };

  const serverstatsConfig = readBotData("serverstats-data.json", {})[guildId] || null;

  res.json({
    guildId,
    security,
    greetings,
    levelSettings,
    counting,
    wordChain: wordData,
    birthday: birthdaySettings,
    threadChannelId,
    stickies: guildStickies,
    rules: guildRules,
    reactionPanels: guildReactionPanels,
    inviteChannelId,
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
    media: mediaData,
    serverstats: serverstatsConfig,
  });
});

// 1. SET ANNOUNCEMENT (CHANNEL, TITLE, CONTENT, OPTIONAL IMAGE)
app.post("/api/guild/announcement", async (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, title, content, imageUrl, ping, color } = req.body;

  if (!channelId || !title || !content) {
    return res.status(400).json({ error: "Channel ID, Title, and Content are required." });
  }

  const hexColor = color ? parseInt(color.replace("#", ""), 16) : 0xff2a55;
  const embed = {
    title,
    description: content,
    color: isNaN(hexColor) ? 0xff2a55 : hexColor,
    timestamp: new Date().toISOString(),
  };
  if (imageUrl && imageUrl.trim()) {
    embed.image = { url: imageUrl.trim() };
  }

  let mentionContent = undefined;
  if (ping === "everyone") mentionContent = "@everyone";
  else if (ping === "here") mentionContent = "@here";
  else if (ping && ping.startsWith("<@&")) mentionContent = ping;

  const discordMsg = await sendDiscordChannelMessage(channelId, {
    content: mentionContent,
    embeds: [embed],
  });

  const announcements = readBotData("announcements.json", []);
  const newEntry = {
    guildId,
    channelId,
    messageId: discordMsg ? discordMsg.id : `web_${Date.now()}`,
    title,
    description: content,
    color: color || "#FF2A55",
    imageUrl: imageUrl || null,
    createdAt: Date.now(),
  };
  announcements.push(newEntry);
  writeBotData("announcements.json", announcements);

  res.json({
    success: true,
    message: discordMsg ? "Announcement posted directly to Discord server!" : "Announcement saved (Bot token needed for direct Discord message).",
    announcement: newEntry,
    discordSent: Boolean(discordMsg),
  });
});

// 2. SET RULES (COUNT OF RULES, TITLE & CONTENT FOR EACH, COLOR)
app.post("/api/guild/rules-structured", async (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, rules, headerTitle, color } = req.body;

  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: "At least one rule is required." });
  }

  const hexColor = color ? parseInt(color.replace("#", ""), 16) : 0x5865f2;
  const fields = rules.map((r, idx) => ({
    name: `${idx + 1}. ${r.title || `Rule #${idx + 1}`}`,
    value: r.content || "Follow Discord guidelines.",
    inline: false,
  }));

  const embed = {
    title: headerTitle || "📜 Server Rules & Guidelines",
    description: "Please read and adhere to our server rules at all times.",
    color: isNaN(hexColor) ? 0x5865f2 : hexColor,
    fields,
    timestamp: new Date().toISOString(),
  };

  let discordMsg = null;
  if (channelId) {
    discordMsg = await sendDiscordChannelMessage(channelId, { embeds: [embed] });
  }

  const rulesStore = readBotData("rules.json", []);
  let allRules = Array.isArray(rulesStore) ? rulesStore : [];

  const record = {
    guildId,
    channelId: channelId || null,
    messageId: discordMsg ? discordMsg.id : `web_rules_${Date.now()}`,
    title: headerTitle || "Server Rules",
    rules,
    color: color || "#5865F2",
    createdAt: Date.now(),
  };

  allRules = allRules.filter((r) => r.guildId !== guildId);
  allRules.push(record);
  writeBotData("rules.json", allRules);

  res.json({
    success: true,
    message: discordMsg ? "Rules published to Discord channel!" : "Rules saved in bot storage!",
    rules: record,
    discordSent: Boolean(discordMsg),
  });
});

// 3. SET REACTION ROLES (UP TO 25 FIELDS, UNIQUE / ONE-CHOICE, RESTRICTED ROLES)
app.post("/api/guild/reaction-roles", async (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, title, description, roles, oneChoice, accessRoleIds, color } = req.body;

  if (!channelId || !Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: "Channel ID and at least one reaction role are required." });
  }

  const trimmedRoles = roles.slice(0, 25);
  const hexColor = color ? parseInt(color.replace("#", ""), 16) : 0x8a2be2;

  const embed = {
    title: title || "Reaction Roles",
    description: description || "React with the emojis below to receive your roles!",
    color: isNaN(hexColor) ? 0x8a2be2 : hexColor,
    timestamp: new Date().toISOString(),
  };

  let discordMsg = await sendDiscordChannelMessage(channelId, { embeds: [embed] });

  if (discordMsg) {
    for (const r of trimmedRoles) {
      if (r.emoji) {
        await addDiscordMessageReaction(channelId, discordMsg.id, r.emoji);
      }
    }
  }

  const rrStore = readBotData("reaction-roles.json", { panels: [] });
  rrStore.panels = rrStore.panels || [];

  const panelData = {
    guildId,
    channelId,
    messageId: discordMsg ? discordMsg.id : `web_panel_${Date.now()}`,
    title: title || "Reaction Roles",
    description: description || "",
    oneChoice: Boolean(oneChoice),
    accessRoleIds: Array.isArray(accessRoleIds) ? accessRoleIds : (typeof accessRoleIds === "string" ? accessRoleIds.split(",").map((s) => s.trim()).filter(Boolean) : []),
    roles: trimmedRoles,
    createdAt: Date.now(),
  };

  rrStore.panels.push(panelData);
  writeBotData("reaction-roles.json", rrStore);

  res.json({
    success: true,
    message: discordMsg ? "Reaction role panel posted with emoji reactions!" : "Reaction role panel saved in bot storage!",
    panel: panelData,
    discordSent: Boolean(discordMsg),
  });
});

// 4. SET WELCOME & BYE EMBED
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
  res.json({ success: true, message: "Welcome and Farewell greeting settings updated!", greetings: greetingData[guildId] });
});

// 5. SET STICKY MESSAGE
app.post("/api/guild/sticky", async (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, text, asEmbed, title, color } = req.body;

  if (!channelId || !text) {
    return res.status(400).json({ error: "Channel ID and Sticky Text are required." });
  }

  const stickyStore = readBotData("sticky-messages.json", {});
  const key = `${guildId}:${channelId}`;

  let discordMsg = null;
  if (asEmbed) {
    const hexColor = color ? parseInt(color.replace("#", ""), 16) : 0xff2a55;
    discordMsg = await sendDiscordChannelMessage(channelId, {
      embeds: [
        {
          title: title || "📌 Sticky Notice",
          description: text,
          color: isNaN(hexColor) ? 0xff2a55 : hexColor,
          footer: { text: "Sticky Message • Stays at the bottom of the chat" },
        },
      ],
    });
  } else {
    discordMsg = await sendDiscordChannelMessage(channelId, {
      content: `📌 **Sticky Message:**\n${text}`,
    });
  }

  stickyStore[key] = {
    text,
    asEmbed: Boolean(asEmbed),
    title: title || null,
    color: color || null,
    messageId: discordMsg ? discordMsg.id : (stickyStore[key]?.messageId || null),
  };

  writeBotData("sticky-messages.json", stickyStore);
  res.json({
    success: true,
    message: discordMsg ? "Sticky message active and posted to channel!" : "Sticky message saved!",
    sticky: stickyStore[key],
    discordSent: Boolean(discordMsg),
  });
});

// 6. SET THREAD AUTO-CREATION CHANNEL
app.post("/api/guild/threads", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, mode, namePattern } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: "Channel ID is required." });
  }

  const threadStore = readBotData("thread-settings.json", {});
  const current = typeof threadStore[guildId] === "object" ? threadStore[guildId] : {};
  current[channelId] = {
    mode: mode || "images_only",
    namePattern: namePattern || "💬 {user}'s Thread",
  };
  threadStore[guildId] = current;
  writeBotData("thread-settings.json", threadStore);

  res.json({ success: true, message: "Auto-threading channel configuration saved!", threadSettings: current });
});

// 7. SET BIRTHDAY CHANNELS (INPUT CHANNEL & ANNOUNCE CHANNEL)
app.post("/api/guild/birthday", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { inputChannelId, announcementChannelId } = req.body;

  const birthdayStore = readBotData("birthdays.json", { settings: {}, birthdays: {} });
  birthdayStore.settings = birthdayStore.settings || {};
  birthdayStore.settings[guildId] = {
    inputChannelId: inputChannelId || null,
    announcementChannelId: announcementChannelId || null,
  };
  writeBotData("birthdays.json", birthdayStore);

  res.json({ success: true, message: "Birthday input and announcement channels saved!", settings: birthdayStore.settings[guildId] });
});

// GET REGISTERED & UPCOMING BIRTHDAYS (PAGINATED WITH NEAREST SORT)
app.get("/api/guild/birthdays", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId || "1547837282109624462";
  const birthdayStore = readBotData("birthdays.json", { settings: {}, birthdays: {} });
  const guildBirthdays = (birthdayStore.birthdays && birthdayStore.birthdays[guildId]) || {};
  const levelData = readBotData("level-data.json", { users: {} });
  const guildUsers = (levelData.users && levelData.users[guildId]) || {};
  const memberAvatars = readBotData("member-avatars.json", {});

  const now = new Date();
  const currentYear = now.getFullYear();

  function getDaysUntil(dateText) {
    if (!dateText) return 999;
    const parts = dateText.split("/");
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let bday = new Date(currentYear, month - 1, day);
    if (bday < now && bday.toDateString() !== now.toDateString()) {
      bday = new Date(currentYear + 1, month - 1, day);
    }
    return Math.ceil((bday - now) / (1000 * 60 * 60 * 24));
  }

  let list = Object.entries(guildBirthdays).map(([userId, item]) => {
    const userDoc = guildUsers[userId];
    const username = userDoc?.username || `User_${userId.slice(-4)}`;
    const avatar = userDoc?.avatar || memberAvatars[userId] || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;
    const daysUntil = getDaysUntil(item.date);
    return {
      userId,
      username,
      avatar,
      date: item.date,
      daysUntil,
      status: daysUntil === 0 ? "Today! 🎉" : (daysUntil === 1 ? "Tomorrow! 🎈" : `in ${daysUntil} days`),
    };
  });

  list.sort((a, b) => a.daysUntil - b.daysUntil);

  const search = (req.query.search || "").toLowerCase().trim();
  if (search) {
    list = list.filter((b) => b.username.toLowerCase().includes(search) || b.userId.includes(search) || b.date.includes(search));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limitParam = req.query.limit;
  const limit = limitParam === "all" ? list.length : (parseInt(limitParam, 10) || 15);
  const total = list.length;
  const totalPages = Math.ceil(total / (limit || 1)) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = list.slice(startIndex, startIndex + limit);

  res.json({
    birthdays: paginated,
    total,
    page,
    limit,
    totalPages,
    data: paginated,
  });
});

app.post("/api/guild/birthdays/add", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { userId, date } = req.body;
  if (!userId || !date) {
    return res.status(400).json({ error: "User ID and Date (DD/MM) are required." });
  }

  const birthdayStore = readBotData("birthdays.json", { settings: {}, birthdays: {} });
  birthdayStore.birthdays = birthdayStore.birthdays || {};
  birthdayStore.birthdays[guildId] = birthdayStore.birthdays[guildId] || {};
  birthdayStore.birthdays[guildId][userId] = {
    date: date.trim(),
    lastAnnouncedYear: null,
  };
  writeBotData("birthdays.json", birthdayStore);
  res.json({ success: true, message: `Birthday for <@${userId}> saved as ${date}!` });
});

app.delete("/api/guild/birthdays/:userId", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId || "1547837282109624462";
  const { userId } = req.params;

  const birthdayStore = readBotData("birthdays.json", { settings: {}, birthdays: {} });
  if (birthdayStore.birthdays && birthdayStore.birthdays[guildId] && birthdayStore.birthdays[guildId][userId]) {
    delete birthdayStore.birthdays[guildId][userId];
    writeBotData("birthdays.json", birthdayStore);
    return res.json({ success: true, message: "Birthday removed." });
  }
  res.status(404).json({ error: "Birthday not found." });
});

// 8. SET COUNTING & WORD CHAIN (CHANNELS & CUSTOM MODES)
app.post("/api/guild/minigames", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { countingChannelId, countingMode, wordChainChannelId, startingWord } = req.body;

  if (countingChannelId !== undefined) {
    const countData = readBotData("counting-data.json", {});
    countData[guildId] = {
      ...(countData[guildId] || { number: 0, highScore: 0 }),
      channelId: countingChannelId || null,
      mode: countingMode || "allow_chat",
    };
    writeBotData("counting-data.json", countData);
  }

  if (wordChainChannelId !== undefined) {
    const wordData = readBotData("word-building-data.json", {});
    const cleanWord = startingWord ? startingWord.toLowerCase().trim() : null;
    wordData[guildId] = {
      ...(wordData[guildId] || { chainCount: 0, highScore: 0, usedWords: [] }),
      channelId: wordChainChannelId || null,
      lastWord: cleanWord || wordData[guildId]?.lastWord || null,
    };
    writeBotData("word-building-data.json", wordData);
  }

  res.json({ success: true, message: "Counting and Word Chain minigame channels updated!" });
});

// 9. SET LEVEL UP (ANNOUNCEMENT CHANNEL & ROLE REWARDS)
app.post("/api/guild/levels", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { announcementChannelId, roleRewards } = req.body;

  const levelData = readBotData("level-data.json", { settings: {}, users: {} });
  levelData.settings = levelData.settings || {};
  levelData.settings[guildId] = {
    ...(levelData.settings[guildId] || {}),
    announcementChannelId: announcementChannelId || null,
  };
  if (roleRewards && typeof roleRewards === "object") {
    levelData.settings[guildId].roleRewards = roleRewards;
  }
  writeBotData("level-data.json", levelData);

  res.json({ success: true, message: "Level celebration channel & rewards saved!", levelSettings: levelData.settings[guildId] });
});

// 10. INVITE TRACKER CHANNEL
app.post("/api/guild/invites", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId } = req.body;

  const inviteSettings = readBotData("invite-settings.json", {});
  inviteSettings[guildId] = channelId || null;
  writeBotData("invite-settings.json", inviteSettings);

  res.json({ success: true, message: "Invite tracker alert channel saved!", inviteChannelId: inviteSettings[guildId] });
});

// 11. AUDIT LOGS (MODERATION & AUDIT LOGS)
app.post("/api/guild/logs", (req, res) => {
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

// 12. TEMP VOICE SETTINGS
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

// 13. SET EVENT ANNOUNCEMENT
app.post("/api/guild/events", async (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { channelId, title, description, startsAtIso, mentionRole } = req.body;

  if (!channelId || !title || !description || !startsAtIso) {
    return res.status(400).json({ error: "Channel ID, Title, Description, and Start Time are required." });
  }

  const startTimeMs = new Date(startsAtIso).getTime();
  const remindTimeMs = startTimeMs - 15 * 60 * 1000;

  const embed = {
    title: `📅 ${title}`,
    description,
    color: 0x8a2be2,
    fields: [
      { name: "Start Time", value: `<t:${Math.floor(startTimeMs / 1000)}:F>`, inline: true },
      { name: "Status", value: "🟢 Upcoming", inline: true },
    ],
    footer: { text: "Event Reminder will be sent 15 mins prior" },
    timestamp: new Date().toISOString(),
  };

  const mentionContent = mentionRole ? `<@&${mentionRole}>` : undefined;
  const discordMsg = await sendDiscordChannelMessage(channelId, {
    content: mentionContent,
    embeds: [embed],
  });

  const events = readBotData("events.json", []);
  const eventId = Math.random().toString(36).substring(2, 10);
  const newEvent = {
    id: eventId,
    guildId,
    channelId,
    messageId: discordMsg ? discordMsg.id : `web_event_${Date.now()}`,
    title,
    description,
    startsAt: startTimeMs,
    remindAt: remindTimeMs,
    reminderSent: false,
    mentionRole: mentionRole || null,
    status: "upcoming",
  };
  events.push(newEvent);
  writeBotData("events.json", events);

  res.json({
    success: true,
    message: discordMsg ? "Event announced in Discord channel!" : "Event scheduled in bot storage!",
    event: newEvent,
    discordSent: Boolean(discordMsg),
  });
});

// 14. SECURITY SETTINGS
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

// 15. SERVER STATS COUNTERS CONFIG
app.post("/api/guild/serverstats", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.body.guildId || "1547837282109624462";
  const { totalChannelId, humansChannelId, botsChannelId, categoryId } = req.body;

  const statsStore = readBotData("serverstats-data.json", {});
  statsStore[guildId] = {
    totalChannelId: totalChannelId || null,
    humansChannelId: humansChannelId || null,
    botsChannelId: botsChannelId || null,
    categoryId: categoryId || null,
  };
  writeBotData("serverstats-data.json", statsStore);

  res.json({ success: true, message: "Server stats voice counters saved!", serverstats: statsStore[guildId] });
});

// 16. PROFILE VIEW & STAT VIEW
app.get("/api/profile/:userId", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId || "1547837282109624462";
  const userId = req.params.userId;

  const levelData = readBotData("level-data.json", { users: {} });
  const userData = (levelData.users[guildId] && levelData.users[guildId][userId]) || null;

  const socialData = readBotData("social-data.json", {});
  const userSocial = (socialData[guildId] && socialData[guildId][userId]) || {};

  const voiceData = readBotData("voice-time.json", {});
  const userVoice = (voiceData[guildId] && voiceData[guildId].users && voiceData[guildId].users[userId]) || {};

  const inviteData = readBotData("invite-data.json", {});
  const guildInvites = inviteData[guildId] || [];
  const inviteCount = guildInvites.filter((inv) => inv.inviterId === userId && !inv.leftAt).length;

  const historyData = readBotData("stats-history.json", {});
  const userHistory = (historyData[guildId] && historyData[guildId].users && historyData[guildId].users[userId]) || [];

  const memberAvatars = readBotData("member-avatars.json", {});
  const avatar = userData?.avatar || memberAvatars[userId] || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

  res.json({
    userId,
    username: userData?.username || `User_${userId.slice(-4)}`,
    avatar,
    level: userData?.level || (userData?.xp ? Math.floor(Math.sqrt(userData.xp / 50)) : 1),
    xp: userData?.xp || 0,
    bio: userSocial.bio || "Member of the community",
    rep: userSocial.rep || 0,
    voiceMinutes: userVoice.voiceMemberMinutes || 0,
    invites: inviteCount,
    history: userHistory,
  });
});

// -----------------------------------------------------------------------------
// LIVE XP LEADERBOARD (EXACT DISCORD USERNAMES - NO NICKNAMES)
// -----------------------------------------------------------------------------
app.get("/api/levels", (req, res) => {
  const guildId = req.session?.selectedGuild?.id || req.query.guildId;
  const levelData = readBotData("level-data.json", { users: {} });
  const usersTree = levelData.users || {};
  const memberAvatars = readBotData("member-avatars.json", {});
  const allUsers = [];

  const guildsToInspect = guildId && usersTree[guildId] ? [guildId] : Object.keys(usersTree);

  for (const gId of guildsToInspect) {
    const guildObj = usersTree[gId];
    if (typeof guildObj === "object") {
      for (const userId in guildObj) {
        const u = guildObj[userId];
        if (u && typeof u === "object") {
          // Strictly exact username, never nicknames
          const exactUsername = u.username || `User_${userId.slice(-4)}`;
          const avatar = u.avatar || memberAvatars[userId] || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

          allUsers.push({
            userId,
            username: exactUsername,
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

  allUsers.sort((a, b) => (b.level === a.level ? b.xp - a.xp : b.level - a.level));

  const search = (req.query.search || "").toLowerCase().trim();
  if (search) {
    allUsers = allUsers.filter((u) => u.username.toLowerCase().includes(search) || u.userId.includes(search));
  }

  const total = allUsers.length;
  const page = parseInt(req.query.page, 10) || 1;
  const limitParam = req.query.limit;

  if (limitParam === "all" || req.query.raw === "true") {
    return res.json({
      users: allUsers,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      data: allUsers,
    });
  }

  const limit = parseInt(limitParam, 10) || 15;
  const totalPages = Math.ceil(total / (limit || 1)) || 1;
  const startIndex = (page - 1) * limit;
  const paginated = allUsers.slice(startIndex, startIndex + limit);

  res.json({
    users: paginated,
    total,
    page,
    limit,
    totalPages,
    data: paginated,
  });
});

// -----------------------------------------------------------------------------
// SYSTEM OVERVIEW & COMMANDS
// -----------------------------------------------------------------------------
app.get("/api/overview", (req, res) => {
  const levelData = readBotData("level-data.json", { users: {} });
  const countingData = readBotData("counting-data.json", {});
  const wordData = readBotData("word-building-data.json", {});
  const reactionRoles = readBotData("reaction-roles.json", { panels: [] });
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
    version: "3.0.0 Flame Edition",
    stats: {
      guildsConfigured: Object.keys(levelData.users || {}).length || 2,
      membersTracked: totalMembersTracked || 3,
      totalCommands: 30,
      activeReminders: Array.isArray(reminders) ? reminders.length : 0,
      activeTicketsPanels: Object.keys(tickets).length || 1,
      reactionRolePanels: (reactionRoles.panels || []).length || 1,
      countingHighScore: Object.values(countingData).reduce((max, c) => Math.max(max, c.highScore || 0), 0),
      wordChainMaxStreak: Object.values(wordData).reduce((max, w) => Math.max(max, w.highStreak || 0), 0),
    },
  });
});

app.get("/api/commands", (req, res) => {
  const commands = [
    { name: "/announcement", cat: "Community", desc: "Formatted embeds with mentions (@everyone, @here, roles) and rich headers.", options: "create | edit | delete | list" },
    { name: "/rules", cat: "Community", desc: "Maintain and publish persistent multi-rule server boards.", options: "create | edit | delete | list" },
    { name: "/reaction-role", cat: "Community", desc: "Reaction role menus with up to 25 roles per embed, unique choice and restricted roles.", options: "create | add | remove | list" },
    { name: "/greetings", cat: "Community", desc: "Welcome and farewell embed alerts with customizable variables.", options: "welcome | goodbye" },
    { name: "/sticky", cat: "Community", desc: "Sticky messages that persistently repost at the bottom of busy chats.", options: "add | remove | list" },
    { name: "/threads", cat: "Community", desc: "Auto-threading engine for media, discussions, and suggestion channels.", options: "setup | list" },
    { name: "/birthday", cat: "Social", desc: "Server birthday calendar alerts with custom celebration channels.", options: "set | list | setup" },
    { name: "/counting", cat: "Minigames", desc: "High-intensity collaborative counting channel with strict math mode.", options: "setup | stats | mode | reset | set" },
    { name: "/wordbuilding", cat: "Minigames", desc: "Shiritori word chain game where each word begins with the previous letter.", options: "setup | stats | reset" },
    { name: "/serverstats", cat: "Analytics", desc: "Dynamic live voice counters (Total, Humans, Bots, Boosts) updating in real-time.", options: "view | setup | remove" },
    { name: "/level", cat: "Leveling", desc: "XP progression engine, role rewards, and exact-username leaderboards.", options: "show | leaderboard | rewards | setup" },
    { name: "/invites", cat: "Analytics", desc: "Track vanity and member invite statistics, ranks, and logs.", options: "check | leaderboard" },
    { name: "/mod", cat: "Moderation", desc: "Punishment suite and audit log channels with hierarchy safety.", options: "kick | ban | timeout | warn | purge" },
    { name: "/voice", cat: "Voice Hub", desc: "Join-to-Create temporary automated voice channels with host control panel.", options: "setup | lock | unlock | hide | limit" },
    { name: "/events", cat: "Community", desc: "Plan community events with automated RSVP alerts and 15-min reminders.", options: "create | list | cancel" },
    { name: "/profile", cat: "Social", desc: "Inspect aesthetic visual profile cards with badges, reputation, and bio.", options: "view [user] | setbio <bio>" },
    { name: "/security", cat: "Security", desc: "Anti-Raid, Anti-Nuke, Anti-Spam, Lockdown, and Whitelist control center.", options: "lockdown | antiraid | antinuke | antispam" },
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
