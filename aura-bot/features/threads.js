const { readJson, writeJson } = require("../utils/jsonStore");

function readData() {
  return readJson("thread-settings.json", {});
}

function writeData(data) {
  writeJson("thread-settings.json", data);
}

function getThreadSettings(guildId) {
  const data = readData();
  const raw = data[guildId];
  if (!raw) return {};

  // Backwards compatibility if stored as single channelId string
  if (typeof raw === "string") {
    return {
      [raw]: { mode: "images_only", namePattern: "💬 {user}'s Thread" },
    };
  }

  return raw;
}

function addThreadChannel(guildId, channelId, mode = "images_only", namePattern = null) {
  const data = readData();
  const current = getThreadSettings(guildId);

  current[channelId] = {
    mode: mode || "images_only",
    namePattern: namePattern || "💬 {user}'s Thread",
  };

  data[guildId] = current;
  writeData(data);
}

function removeThreadChannel(guildId, channelId = null) {
  const data = readData();
  if (!data[guildId]) return false;

  if (channelId) {
    const current = getThreadSettings(guildId);
    if (!current[channelId]) return false;
    delete current[channelId];
    data[guildId] = current;
    writeData(data);
    return true;
  } else {
    delete data[guildId];
    writeData(data);
    return true;
  }
}

function messageHasPicture(message) {
  const hasImageAttachment = message.attachments.some((attachment) => {
    if (attachment.contentType?.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i.test(
      attachment.name || "",
    );
  });

  const hasImageEmbed = message.embeds.some(
    (embed) => embed.image?.url || embed.thumbnail?.url,
  );

  return hasImageAttachment || hasImageEmbed;
}

function registerThreadEvents(client) {
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const guildSettings = getThreadSettings(message.guild.id);
    const channelConfig = guildSettings[message.channel.id];

    if (!channelConfig) return;

    // Check mode
    if (channelConfig.mode === "images_only" && !messageHasPicture(message)) {
      return;
    }

    const displayName = (message.member?.displayName || message.author.username)
      .replace(/[\r\n]/g, " ")
      .slice(0, 50);

    const pattern = channelConfig.namePattern || "💬 {user}'s Thread";
    const threadName = pattern.replace("{user}", displayName).replace("{username}", message.author.username).slice(0, 100);

    try {
      await message.startThread({
        name: threadName,
        autoArchiveDuration: 1440,
      });
    } catch (error) {
      console.error("[Threads] Could not create thread:", error);
    }
  });
}

module.exports = {
  getThreadSettings,
  addThreadChannel,
  removeThreadChannel,
  registerThreadEvents,
};