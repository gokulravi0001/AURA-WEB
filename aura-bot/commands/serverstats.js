const fs = require("node:fs");
const path = require("node:path");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const { getMemberStats, getMemberRank } = require("../features/levels");
const { getVoiceTime, getVoiceRank } = require("../features/voiceTime");
const { getUserXpHistory } = require("../features/statsHistory");
const {
  setupServerStatsChannels,
  updateServerStatsChannels,
  removeServerStatsChannels,
  getServerStatsConfig,
} = require("../features/serverstats");
const { isAdmin } = require("../utils/helpers");

const inviteDataFile = path.join(
  __dirname,
  "..",
  "data",
  "invite-data.json",
);

function getInviteCounts(guildId, userId) {
  try {
    if (!fs.existsSync(inviteDataFile)) {
      return { server: 0, member: 0 };
    }

    const data = JSON.parse(fs.readFileSync(inviteDataFile, "utf8"));
    const joins = data[guildId] || [];

    return {
      server: joins.filter((join) => join.inviterId).length,
      member: joins.filter((join) => join.inviterId === userId).length,
    };
  } catch (error) {
    console.error("Could not read invite data:", error);
    return { server: 0, member: 0 };
  }
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function drawFlame(ctx, x, baseY, width, height, color, opacity = 0.2) {
  ctx.save();
  ctx.globalAlpha = opacity;

  const gradient = ctx.createLinearGradient(x, baseY - height, x, baseY);
  gradient.addColorStop(0, "#ffea8a");
  gradient.addColorStop(0.3, color);
  gradient.addColorStop(1, "#8b2cff");

  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.bezierCurveTo(
    x - width * 0.12,
    baseY - height * 0.25,
    x + width * 0.42,
    baseY - height * 0.48,
    x + width * 0.48,
    baseY - height,
  );
  ctx.bezierCurveTo(
    x + width * 0.67,
    baseY - height * 0.62,
    x + width * 1.14,
    baseY - height * 0.39,
    x + width,
    baseY,
  );
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.restore();
}

function drawFireBackground(ctx, width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#120914");
  background.addColorStop(0.45, "#24102f");
  background.addColorStop(1, "#100b20");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const purpleGlow = ctx.createRadialGradient(970, 90, 10, 970, 90, 520);
  purpleGlow.addColorStop(0, "rgba(155, 70, 255, 0.34)");
  purpleGlow.addColorStop(1, "rgba(155, 70, 255, 0)");

  ctx.fillStyle = purpleGlow;
  ctx.fillRect(0, 0, width, height);

  const redGlow = ctx.createRadialGradient(80, 720, 10, 80, 720, 430);
  redGlow.addColorStop(0, "rgba(255, 38, 83, 0.26)");
  redGlow.addColorStop(1, "rgba(255, 38, 83, 0)");

  ctx.fillStyle = redGlow;
  ctx.fillRect(0, 0, width, height);

  const flames = [
    [0, height, 150, 150, "#ff315c", 0.26],
    [100, height, 125, 115, "#ff563d", 0.18],
    [265, height, 145, 175, "#a84dff", 0.19],
    [460, height, 125, 115, "#ff315c", 0.16],
    [670, height, 150, 165, "#c239ff", 0.17],
    [875, height, 135, 120, "#ff443d", 0.18],
    [1050, height, 150, 175, "#ae39ff", 0.22],
    [0, 600, 105, 160, "#ff315c", 0.13],
    [1095, 570, 105, 160, "#bb35ff", 0.15],
  ];

  for (const [x, baseY, flameWidth, flameHeight, color, opacity] of flames) {
    drawFlame(ctx, x, baseY, flameWidth, flameHeight, color, opacity);
  }

  const embers = [
    [80, 630],
    [195, 745],
    [345, 690],
    [540, 760],
    [730, 650],
    [930, 735],
    [1070, 655],
    [410, 580],
    [825, 555],
    [1010, 470],
  ];

  for (const [x, y] of embers) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9a72";
    ctx.shadowColor = "#ff315c";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawStatCard(ctx, x, y, label, value, color) {
  ctx.fillStyle = "rgba(17, 9, 27, 0.86)";
  ctx.fillRect(x, y, 255, 105);

  ctx.fillStyle = color;
  ctx.fillRect(x, y, 255, 5);

  ctx.fillStyle = "#d9c9e8";
  ctx.font = "bold 14px Arial";
  ctx.fillText(label, x + 18, y + 34);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText(Number(value).toLocaleString(), x + 18, y + 78);

  ctx.strokeStyle = `${color}99`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 255, 105);
}

function drawLineChart(ctx, points, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 23px Arial";
  ctx.fillText("XP TREND  •  LAST 30 DAYS", x, y - 28);

  ctx.strokeStyle = "rgba(230, 205, 255, 0.16)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const gridY = y + (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, gridY);
    ctx.lineTo(x + width, gridY);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = "#d1c1df";
    ctx.font = "18px Arial";
    ctx.fillText(
      "Your XP graph starts collecting data now. Check back tomorrow!",
      x + 16,
      y + height / 2,
    );
    return;
  }

  const values = points.map((point) => point.xp);
  let minXp = Math.min(...values);
  let maxXp = Math.max(...values);

  if (minXp === maxXp) {
    minXp = Math.max(0, minXp - 50);
    maxXp += 50;
  }

  const padding = Math.max(10, (maxXp - minXp) * 0.12);
  minXp = Math.max(0, minXp - padding);
  maxXp += padding;

  const chartPoints = points.map((point, index) => ({
    x:
      points.length === 1
        ? x + width / 2
        : x + (index / (points.length - 1)) * width,
    y: y + height - ((point.xp - minXp) / (maxXp - minXp)) * height,
  }));

  const areaGradient = ctx.createLinearGradient(0, y, 0, y + height);
  areaGradient.addColorStop(0, "rgba(255, 55, 103, 0.35)");
  areaGradient.addColorStop(1, "rgba(142, 53, 255, 0.02)");

  ctx.beginPath();
  ctx.moveTo(chartPoints[0].x, y + height);

  for (const point of chartPoints) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.lineTo(chartPoints[chartPoints.length - 1].x, y + height);
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  const lineGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  lineGradient.addColorStop(0, "#ff3864");
  lineGradient.addColorStop(1, "#bd66ff");

  ctx.beginPath();
  chartPoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });

  ctx.strokeStyle = lineGradient;
  ctx.lineWidth = 5;
  ctx.shadowColor = "#d34cff";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const point of chartPoints) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  ctx.fillStyle = "#bcaacb";
  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(points[0].date, x, y + height + 24);

  ctx.textAlign = "right";
  ctx.fillText(points[points.length - 1].date, x + width, y + height + 24);
  ctx.textAlign = "left";
}

async function makeStatsImage(guild, member, stats) {
  const canvas = createCanvas(1200, 850);
  const ctx = canvas.getContext("2d");

  drawFireBackground(ctx, 1200, 850);

  // Server logo.
  const serverIconUrl = guild.iconURL({ extension: "png", size: 128 });

  if (serverIconUrl) {
    try {
      const serverIcon = await loadImage(serverIconUrl);

      ctx.save();
      ctx.beginPath();
      ctx.arc(105, 100, 48, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(serverIcon, 57, 52, 96, 96);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(105, 100, 51, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff4d7d";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#b94bff";
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } catch {
      // The rest of the stats card still renders if the logo can't load.
    }
  }

  // Header.
  ctx.fillStyle = "#ff668a";
  ctx.font = "bold 18px Arial";
  ctx.fillText("AURA  •  SERVER OVERVIEW", 180, 70);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px Arial";
  ctx.fillText(
    guild.name.length > 30 ? `${guild.name.slice(0, 27)}...` : guild.name,
    180,
    115,
  );

  ctx.fillStyle = "#d2c0df";
  ctx.font = "18px Arial";
  ctx.fillText("Server stats and member profile", 180, 148);

  // Server overview cards.
  drawStatCard(ctx, 60, 190, "MEMBERS", stats.members, "#ff4d73");
  drawStatCard(ctx, 340, 190, "TRACKED INVITE JOINS", stats.invites, "#bd65ff");
  drawStatCard(ctx, 620, 190, "TEXT CHANNELS", stats.textChannels, "#ff755e");
  drawStatCard(ctx, 900, 190, "BOOSTS", stats.boosts, "#a56aff");

  // Personal profile card.
  ctx.fillStyle = "rgba(17, 9, 27, 0.88)";
  ctx.fillRect(60, 335, 330, 390);
  ctx.strokeStyle = "rgba(201, 83, 255, 0.75)";
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 335, 330, 390);

  try {
    const avatar = await loadImage(
      member.user.displayAvatarURL({ extension: "png", size: 128 }),
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(225, 405, 55, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 170, 350, 110, 110);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(225, 405, 58, 0, Math.PI * 2);
    ctx.strokeStyle = "#bd65ff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff3864";
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  } catch {
    // Keep rendering if the member avatar can't load.
  }

  const displayName =
    member.displayName.length > 22
      ? `${member.displayName.slice(0, 19)}...`
      : member.displayName;

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 25px Arial";
  ctx.fillText(displayName, 225, 490);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ff668a";
  ctx.font = "bold 18px Arial";
  ctx.fillText(`LEVEL  ${stats.level}`, 90, 535);

  ctx.fillStyle = "#e2d5eb";
  ctx.font = "16px Arial";
  ctx.fillText(`Total XP: ${stats.xp.toLocaleString()}`, 90, 566);
  ctx.fillText(`Members invited: ${stats.memberInvites}`, 90, 594);
  ctx.fillText(
    `Text rank: ${stats.textRank ? `#${stats.textRank}` : "Unranked"}`,
    90,
    622,
  );
  ctx.fillText(
    `Voice rank: ${stats.voiceRank ? `#${stats.voiceRank}` : "Unranked"}`,
    90,
    650,
  );
  ctx.fillText(
    `Voice time: ${formatTime(stats.memberVoiceMinutes)}`,
    90,
    678,
  );
  ctx.fillText(
    `Stage time: ${formatTime(stats.memberStageMinutes)}`,
    90,
    706,
  );

  if (member.joinedTimestamp) {
    ctx.fillStyle = "#bcaacb";
    ctx.font = "14px Arial";
    ctx.fillText(
      `Joined ${new Date(member.joinedTimestamp).toLocaleDateString()}`,
      90,
      720,
    );
  }

  // Trading-style XP chart.
  ctx.fillStyle = "rgba(17, 9, 27, 0.88)";
  ctx.fillRect(420, 335, 720, 390);
  ctx.strokeStyle = "rgba(255, 70, 125, 0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(420, 335, 720, 390);

  drawLineChart(ctx, stats.history, 470, 410, 610, 235);

  const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

  ctx.fillStyle = "#e2d5eb";
  ctx.font = "15px Arial";
  ctx.fillText(
    `Text/forums: ${stats.textChannels}  •  Voice: ${stats.voiceChannels}  •  Stage: ${stats.stageChannels}`,
    60,
    780,
  );

  ctx.fillStyle = "#bcaacb";
  ctx.font = "14px Arial";
  ctx.fillText(
    `Server created <t:${createdTimestamp}:D>  •  XP graph records daily history from now on`,
    60,
    815,
  );

  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("Show server stats and a member's personal stats")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View server and member stats (image or embed)")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member whose personal stats you want to see")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("format")
            .setDescription("Display format")
            .setRequired(false)
            .addChoices(
              { name: "Image (Visual Dashboard)", value: "image" },
              { name: "Embed (Standard Discord Embed)", value: "embed" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Create live server stats voice channels")
        .addBooleanOption((opt) =>
          opt
            .setName("boosts")
            .setDescription("Include boosts channel")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete server stats voice channels"),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;

    if (!guild) {
      return interaction.editReply("Use this command inside your server.");
    }

    const subcommand = interaction.options.getSubcommand(false) || "view";
    if (subcommand === "setup") {
      if (!isAdmin(interaction.member)) {
        return interaction.editReply({ content: "You need admin permissions to set up server stats.", ephemeral: true });
      }
      const includeBoosts = interaction.options.getBoolean("boosts");
      try {
        await setupServerStatsChannels(guild, includeBoosts !== false);
        return interaction.editReply({ content: "✅ Server stats voice channels have been created.", ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.editReply({ content: `Error setting up server stats: ${e.message}`, ephemeral: true });
      }
    }
    if (subcommand === "remove") {
      if (!isAdmin(interaction.member)) {
        return interaction.editReply({ content: "You need admin permissions to remove server stats.", ephemeral: true });
      }
      await removeServerStatsChannels(guild);
      return interaction.editReply({ content: "✅ Server stats voice channels have been removed.", ephemeral: true });
    }

    // Normal stats display ("view" subcommand or fallback)
    const selectedUser = interaction.options.getUser("member") || interaction.user;
    const formatChoice = interaction.options.getString("format") || "image";

    const member =
      guild.members.cache.get(selectedUser.id) ||
      (await guild.members.fetch(selectedUser.id).catch(() => null));
    if (!member) {
      return interaction.editReply({ content: "I couldn't find that member in this server.", ephemeral: true });
    }

    const channels = guild.channels.cache;
    const textChannels = channels.filter((channel) =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
    ).size;
    const voiceChannels = channels.filter(
      (channel) => channel.type === ChannelType.GuildVoice
    ).size;
    const stageChannels = channels.filter(
      (channel) => channel.type === ChannelType.GuildStageVoice
    ).size;

    const levelStats = getMemberStats(guild.id, member.id);
    const memberVoiceTime = getVoiceTime(guild.id, member.id);
    const inviteCounts = getInviteCounts(guild.id, member.id);
    const history = getUserXpHistory(guild.id, member.id);

    const stats = {
      members: guild.memberCount,
      invites: inviteCounts.server,
      textChannels,
      voiceChannels,
      stageChannels,
      boosts: guild.premiumSubscriptionCount || 0,
      level: levelStats.level,
      xp: levelStats.xp,
      textRank: getMemberRank(guild.id, member.id),
      voiceRank: getVoiceRank(guild.id, member.id),
      memberInvites: inviteCounts.member,
      memberVoiceMinutes: memberVoiceTime.voiceMemberMinutes || 0,
      memberStageMinutes: memberVoiceTime.stageMemberMinutes || 0,
      history,
    };

    function sendEmbedFallback() {
      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setColor(0x8a2be2)
        .setTitle(`📊 ${guild.name} • Server & Member Statistics`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "👥 Server Members", value: `${guild.memberCount.toLocaleString()}`, inline: true },
          { name: "🚀 Server Boosts", value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`, inline: true },
          { name: "💬 Channels", value: `Text: ${textChannels} | Voice: ${voiceChannels} | Stage: ${stageChannels}`, inline: true },
          { name: "🎖️ Member Level", value: `Level **${stats.level}** (${stats.xp.toLocaleString()} XP)`, inline: true },
          { name: "🏆 Server Rank", value: stats.textRank ? `#${stats.textRank}` : "Unranked", inline: true },
          { name: "✉️ Invites Tracked", value: `Member: ${stats.memberInvites} | Server: ${stats.invites}`, inline: true },
          { name: "🎙️ Voice Time", value: `${formatTime(stats.memberVoiceMinutes)} (Rank: ${stats.voiceRank ? `#${stats.voiceRank}` : "Unranked"})`, inline: true },
          { name: "🎭 Stage Time", value: `${formatTime(stats.memberStageMinutes)}`, inline: true },
          { name: "📅 Member Joined", value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
        )
        .setFooter({ text: `Server Created: ${new Date(guild.createdTimestamp).toLocaleDateString()}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (formatChoice === "embed") {
      return sendEmbedFallback();
    }

    try {
      const image = await makeStatsImage(guild, member, stats);
      const attachment = new AttachmentBuilder(image, {
        name: "aura-server-stats.png",
      });

      return interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error("Could not create server stats image, falling back to embed:", error);
      return sendEmbedFallback();
    }
  },
};