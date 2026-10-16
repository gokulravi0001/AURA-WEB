require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  MessageFlags,
} = require("discord.js");

const pingCommand = require("./commands/ping");
const sayCommand = require("./commands/say");
const bumpCommand = require("./commands/bump");
const remindCommand = require("./commands/remind");
const helpCommand = require("./commands/help");
const setupCommand = require("./commands/setup");
const ticketCommand = require("./commands/ticket");
const reactionRolesCommand = require("./commands/reactionRoles");
const announcementCommand = require("./commands/announcement");
const rulesCommand = require("./commands/rules");
const eventCommand = require("./commands/events");
const birthdayCommand = require("./commands/birthday");
const stickyCommand = require("./commands/sticky");
const levelCommand = require("./commands/level");
const threadsCommand = require("./commands/threads");
const suggestionCommand = require("./commands/suggestion");
const invitesCommand = require("./commands/invites");
const serverStatsCommand = require("./commands/serverstats");
const greetingsCommand = require("./commands/greetings");
const countingCommand = require("./commands/counting");
const wordBuildingCommand = require("./commands/wordBuilding");
const voiceCommand = require("./commands/voice");
const profileCommand = require("./commands/profile");
const repCommand = require("./commands/rep");
const afkCommand = require("./commands/afk");
const pollCommand = require("./commands/poll");
const giveawayCommand = require("./commands/giveaway");
const modCommand = require("./commands/mod");
const utilityCommand = require("./commands/utility");
const securityCommand = require("./commands/security");
const mediaCommand = require("./commands/media");

const { registerTempVoiceEvents } = require("./features/tempVoice");
const { registerCountingEvents } = require("./features/counting");
const { registerWordBuildingEvents } = require("./features/wordBuilding");
const { startEventReminderChecker } = require("./features/eventReminders");
const { registerBirthdayEvents } = require("./features/birthdays");
const { registerStickyEvents } = require("./features/stickyMessages");
const { registerLevelEvents } = require("./features/levels");
const { registerThreadEvents } = require("./features/threads");
const { registerInviteEvents } = require("./features/invites");
const { registerMemberEvents } = require("./features/memberMessages");
const { registerTicketEvents } = require("./features/tickets");
const { startReminderChecker } = require("./features/reminders");
const { registerReactionRoleEvents } = require("./features/reactionRoles");
const { registerVoiceTimeTracking } = require("./features/voiceTime");
const { registerStatsHistoryTracking } = require("./features/statsHistory");
const { isCommandEnabled } = require("./features/commandSettings");
const { registerAfkEvents } = require("./features/afk");
const { registerPollEvents } = require("./features/polls");
const { registerGiveawayEvents } = require("./features/giveaways");
const { registerSecurityEvents } = require("./features/security");
const { registerServerStatsEvents } = require("./features/serverstats");
const { registerMediaFixerEvents } = require("./features/mediaFixer");

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  WELCOME_CHANNEL_ID,
  GOODBYE_CHANNEL_ID,
  TICKET_STAFF_ROLE_IDS,
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.warn("⚠️ Warning: DISCORD_TOKEN or CLIENT_ID is not set in your .env file.");
}

const config = {
  welcomeChannelId: WELCOME_CHANNEL_ID || null,
  goodbyeChannelId: GOODBYE_CHANNEL_ID || null,
  ticketStaffRoleIds: (TICKET_STAFF_ROLE_IDS || "")
    .split(",")
    .map((roleId) => roleId.trim())
    .filter(Boolean),
};

const commands = [
  pingCommand,
  sayCommand,
  bumpCommand,
  remindCommand,
  helpCommand,
  setupCommand,
  ticketCommand,
  reactionRolesCommand,
  announcementCommand,
  rulesCommand,
  eventCommand,
  birthdayCommand,
  stickyCommand,
  levelCommand,
  threadsCommand,
  suggestionCommand,
  invitesCommand,
  serverStatsCommand,
  greetingsCommand,
  countingCommand,
  wordBuildingCommand,
  voiceCommand,
  profileCommand,
  repCommand,
  afkCommand,
  pollCommand,
  giveawayCommand,
  modCommand,
  utilityCommand,
  securityCommand,
  mediaCommand,
];

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
});

const { initDatabase } = require("./utils/database");

async function main() {
  await initDatabase();

  const commandPayload = commands.map((command) => command.data.toJSON());

  if (DISCORD_TOKEN && CLIENT_ID) {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    try {
      // Clear global commands to ensure zero duplicate command collisions
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
      console.log("Cleared old global commands to guarantee clean, duplicate-free guild registration.");

      if (GUILD_ID) {
        await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: commandPayload },
        );
        console.log(`Registered ${commandPayload.length} unified guild slash commands for guild ${GUILD_ID}.`);
      }
    } catch (err) {
      console.error("Could not register slash commands:", err);
    }
  }

  registerMemberEvents(bot);
  registerTicketEvents(bot);
  registerReactionRoleEvents(bot);
  registerBirthdayEvents(bot);
  registerStickyEvents(bot);
  registerLevelEvents(bot);
  registerThreadEvents(bot);
  registerInviteEvents(bot);
  registerVoiceTimeTracking(bot);
  registerStatsHistoryTracking(bot);
  registerCountingEvents(bot);
  registerWordBuildingEvents(bot);
  registerTempVoiceEvents(bot);
  registerAfkEvents(bot);
  registerPollEvents(bot);
  registerGiveawayEvents(bot);
  registerSecurityEvents(bot);
  registerServerStatsEvents(bot);
  registerMediaFixerEvents(bot);

  startReminderChecker(bot);
  startEventReminderChecker(bot);

  bot.once("clientReady", async () => {
    console.log(`AURA is online as ${bot.user.tag} (Serving ${bot.guilds.cache.size} guilds)`);

    // Instantly synchronize all 30 slash commands to every guild the bot is currently in so they appear immediately in Discord autocomplete
    if (DISCORD_TOKEN && CLIENT_ID) {
      const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
      for (const [guildId, guild] of bot.guilds.cache) {
        try {
          await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commandPayload });
          console.log(`✅ Instantly synchronized ${commandPayload.length} slash commands to guild: ${guild.name} (${guildId})`);
        } catch (err) {
          console.error(`Failed to sync commands to ${guild.name}:`, err);
        }
      }
    }
  });

  bot.on("guildCreate", async (guild) => {
    if (DISCORD_TOKEN && CLIENT_ID) {
      try {
        const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: commandPayload });
        console.log(`✅ Synchronized slash commands for newly joined guild: ${guild.name} (${guild.id})`);
      } catch (err) {
        console.error(`Failed to register slash commands for new guild ${guild.name}:`, err);
      }
    }
  });

  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find(
      (item) => item.data.name === interaction.commandName,
    );

    if (!command) return;

    try {
      if (interaction.guildId && !isCommandEnabled(interaction.guildId, interaction.commandName)) {
        await interaction.reply({
          content: `The \`/${interaction.commandName}\` command has been disabled in this server by an administrator.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await command.execute(interaction, bot, config);
    } catch (error) {
      console.error(`Command /${interaction.commandName} execution error:`, error);

      const reply = {
        content: "Something went wrong while running that command.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  });

  if (DISCORD_TOKEN) {
    await bot.login(DISCORD_TOKEN);
  }
}

main().catch((error) => {
  console.error("AURA failed to start:", error);
  process.exitCode = 1;
});
