const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { readJson, writeJson } = require("../utils/jsonStore");
const { isAdmin } = require("../utils/helpers");

const MEDIA_FILE = "media-fixer-settings.json";

function getMediaStore() {
  return readJson(MEDIA_FILE, {});
}

function saveMediaStore(data) {
  writeJson(MEDIA_FILE, data);
}

function getMediaConfig(guildId) {
  const store = getMediaStore();
  return store[guildId] || {
    enabled: true,
    instagram: true, // Reels, Posts, Stories -> ddinstagram.com / eeinstagram.com
    tiktok: true,    // TikTok videos/slides -> vxtiktok.com
    twitter: true,   // Twitter/X videos & clips -> fxtwitter.com
    reddit: true,    // Reddit video clips -> rxddit.com
    deleteOriginal: false,
  };
}

function saveMediaConfig(guildId, config) {
  const store = getMediaStore();
  store[guildId] = { ...getMediaConfig(guildId), ...config };
  saveMediaStore(store);
  return store[guildId];
}

/**
 * Transforms supported link types into rich video/reel/clip embeds
 */
function fixMediaLinks(content) {
  if (!content || typeof content !== "string") return null;

  let transformed = content;
  let matchesFound = 0;
  const replacedLinks = [];

  // 1. Instagram Reels & Posts -> vxinstagram.com / ddinstagram fallback
  const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p|tv|share\/reel)\/([a-zA-Z0-9_\-]+)[^\s]*/gi;
  transformed = transformed.replace(igRegex, (match) => {
    matchesFound++;
    const fixed = match.replace(/https?:\/\/(?:www\.)?instagram\.com/, "https://vxinstagram.com");
    replacedLinks.push({ original: match, fixed, platform: "Instagram Reel", icon: "📸" });
    return fixed;
  });

  // 2. TikTok Videos & Reels -> tiktxk.com / vxtiktok.com
  const tiktokRegex = /https?:\/\/(?:(?:vt|vm)\.tiktok\.com\/[a-zA-Z0-9_\-]+\/?|(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/\d+)[^\s]*/gi;
  transformed = transformed.replace(tiktokRegex, (match) => {
    matchesFound++;
    const fixed = match.replace(/https?:\/\/(?:www\.)?tiktok\.com/, "https://tiktxk.com")
                       .replace(/https?:\/\/vt\.tiktok\.com/, "https://vt.tiktxk.com")
                       .replace(/https?:\/\/vm\.tiktok\.com/, "https://vm.tiktxk.com");
    replacedLinks.push({ original: match, fixed, platform: "TikTok Video", icon: "🎵" });
    return fixed;
  });

  // 3. Twitter / X Clips & Videos -> fixupx.com / fxtwitter.com
  const twtRegex = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)[^\s]*/gi;
  transformed = transformed.replace(twtRegex, (match) => {
    matchesFound++;
    const fixed = match.replace(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)/, "https://fixupx.com");
    replacedLinks.push({ original: match, fixed, platform: "X / Twitter Clip", icon: "🐦" });
    return fixed;
  });

  // 4. Reddit Video Clips -> rxddit.com
  const redditRegex = /https?:\/\/(?:www\.)?reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-zA-Z0-9_]+[^\s]*/gi;
  transformed = transformed.replace(redditRegex, (match) => {
    matchesFound++;
    const fixed = match.replace(/https?:\/\/(?:www\.)?reddit\.com/, "https://rxddit.com");
    replacedLinks.push({ original: match, fixed, platform: "Reddit Video Clip", icon: "🤖" });
    return fixed;
  });

  if (matchesFound === 0) return null;

  return {
    transformed,
    links: replacedLinks,
  };
}

/**
 * Event listener that intercepts messages with links and automatically
 * embeds them as playable videos / reels / GIFs
 */
function registerMediaFixerEvents(bot) {
  bot.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    // Verify if feature is enabled for guild
    const config = getMediaConfig(message.guild.id);
    if (!config.enabled) return;

    // Check if message contains media links
    const result = fixMediaLinks(message.content);
    if (!result || result.links.length === 0) return;

    try {
      const fixedUrl = result.links[0].fixed;
      const originalUrl = result.links[0].original;
      const platform = result.links[0].platform;

      // Clean clickable button to original post
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`Open on ${platform}`)
          .setStyle(ButtonStyle.Link)
          .setURL(originalUrl)
      );

      // In Discord, posting the standalone video proxy URL triggers Discord's
      // internal inline HTML5 video player instead of showing a raw markdown preview.
      await message.reply({
        content: `🎥 **${message.author}** shared a **${platform}**:\n${fixedUrl}`,
        components: [row],
        allowedMentions: { repliedUser: false },
      });

      // Suppress Discord's original un-embeddable link preview on the author's message
      if (typeof message.suppressEmbeds === "function") {
        await message.suppressEmbeds(true).catch(() => {});
      }
    } catch (err) {
      console.error("Error in Media Fixer event:", err);
    }
  });
}

module.exports = {
  getMediaConfig,
  saveMediaConfig,
  fixMediaLinks,
  registerMediaFixerEvents,
};
