// Canvas Animated Flame & Ember Particles
const canvas = document.getElementById("canvas-fire");
const ctx = canvas.getContext("2d");

let particles = [];
let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener("resize", () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

class FlameParticle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = height + Math.random() * 50;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = -(Math.random() * 2.5 + 1.2);
    this.size = Math.random() * 4.5 + 1.5;
    this.life = 0;
    this.maxLife = Math.random() * 120 + 80;
    this.colorType = Math.random();
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life++;

    if (this.life >= this.maxLife || this.y < -10) {
      this.reset();
    }
  }

  draw() {
    const progress = this.life / this.maxLife;
    const alpha = Math.sin(progress * Math.PI) * 0.7;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

    if (this.colorType < 0.5) {
      ctx.fillStyle = `rgba(255, 42, 85, ${alpha})`;
      ctx.shadowColor = "#ff2a55";
    } else if (this.colorType < 0.85) {
      ctx.fillStyle = `rgba(180, 0, 255, ${alpha})`;
      ctx.shadowColor = "#b400ff";
    } else {
      ctx.fillStyle = `rgba(255, 120, 0, ${alpha})`;
      ctx.shadowColor = "#ff7800";
    }

    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }
}

for (let i = 0; i < 90; i++) {
  const p = new FlameParticle();
  p.y = Math.random() * height;
  particles.push(p);
}

function animateParticles() {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();

// Toast helper
function showToast(message) {
  const toast = document.getElementById("toast-notify");
  if (!toast) return;
  toast.innerText = message || "🔥 Changes saved to Discord!";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

// Tab navigation
const dashTabs = document.querySelectorAll(".dash-tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

function switchTab(tabId) {
  dashTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === `pane-${tabId}`);
  });
}

dashTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Modal helpers
function openAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.add("open");
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("open");
}

// Authentication & Server Selection
let currentSelectedGuild = null;

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();

    if (data.loggedIn && data.selectedGuild) {
      currentSelectedGuild = data.selectedGuild;
      document.getElementById("nav-guild-name").innerText = data.selectedGuild.name;
      document.getElementById("nav-user-label").innerText = `Admin: ${data.user.username}`;
      document.getElementById("banner-server-title").innerText = `Currently Managing: ${data.selectedGuild.name}`;
      document.getElementById("banner-server-id").innerText = `Guild ID: ${data.selectedGuild.id}`;
      document.getElementById("login-guild-id").value = data.selectedGuild.id;
    } else {
      // Auto-login to default guild
      await handleLogin(true);
    }
    loadGuildConfig();
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

async function handleLogin(silent = false) {
  const username = document.getElementById("login-username").value || "ServerAdmin";
  const guildId = document.getElementById("login-guild-id").value || "1547837282109624462";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, guildId }),
    });
    const data = await res.json();

    if (data.success) {
      currentSelectedGuild = data.selectedGuild;
      document.getElementById("nav-guild-name").innerText = data.selectedGuild.name;
      document.getElementById("nav-user-label").innerText = `Admin: ${data.user.username}`;
      document.getElementById("banner-server-title").innerText = `Currently Managing: ${data.selectedGuild.name}`;
      document.getElementById("banner-server-id").innerText = `Guild ID: ${data.selectedGuild.id}`;
      closeAuthModal();
      if (!silent) showToast(`🔥 Connected to ${data.selectedGuild.name}!`);
      loadGuildConfig();
      loadLeaderboard();
    }
  } catch (err) {
    console.error("Login failed:", err);
  }
}

// Load Server Configuration for active server
async function loadGuildConfig() {
  try {
    const res = await fetch("/api/guild/settings");
    const data = await res.json();

    // Fill Greetings form
    if (data.greetings) {
      if (document.getElementById("cfg-welcome-title"))
        document.getElementById("cfg-welcome-title").value = data.greetings.welcomeTitle || "Welcome to {server}!";
      if (document.getElementById("cfg-welcome-msg"))
        document.getElementById("cfg-welcome-msg").value = data.greetings.welcomeMessage || "Welcome {user} to {server}!";
      if (document.getElementById("cfg-welcome-color"))
        document.getElementById("cfg-welcome-color").value = data.greetings.welcomeColor || "#ff2a55";
    }

    // Fill Security toggles
    if (data.security) {
      if (document.getElementById("cfg-toggle-antiraid"))
        document.getElementById("cfg-toggle-antiraid").checked = data.security.antiRaid?.enabled !== false;
      if (document.getElementById("cfg-toggle-antinuke"))
        document.getElementById("cfg-toggle-antinuke").checked = data.security.antiNuke?.enabled !== false;
      if (document.getElementById("cfg-toggle-antispam"))
        document.getElementById("cfg-toggle-antispam").checked = data.security.antiSpam?.enabled !== false;
      if (document.getElementById("cfg-toggle-lockdown"))
        document.getElementById("cfg-toggle-lockdown").checked = data.security.activeLockdown === true;
    }

    // Fill Media Fixer toggles
    if (data.media) {
      if (document.getElementById("cfg-media-ig"))
        document.getElementById("cfg-media-ig").checked = data.media.instagram !== false;
      if (document.getElementById("cfg-media-tiktok"))
        document.getElementById("cfg-media-tiktok").checked = data.media.tiktok !== false;
      if (document.getElementById("cfg-media-twt"))
        document.getElementById("cfg-media-twt").checked = data.media.twitter !== false;
      if (document.getElementById("cfg-media-reddit"))
        document.getElementById("cfg-media-reddit").checked = data.media.reddit !== false;
    }

    // Fill Rules textarea
    if (data.rules && document.getElementById("cfg-rules-textarea")) {
      const rulesArr = Array.isArray(data.rules) ? data.rules : [];
      document.getElementById("cfg-rules-textarea").value = rulesArr.join("\n");
    }

    // Fill Temp Voice
    if (data.tempVoice) {
      if (document.getElementById("cfg-voice-trigger-id"))
        document.getElementById("cfg-voice-trigger-id").value = data.tempVoice.triggerChannelId || "";
      if (document.getElementById("cfg-voice-category-id"))
        document.getElementById("cfg-voice-category-id").value = data.tempVoice.categoryId || "";
      if (document.getElementById("cfg-voice-default-name"))
        document.getElementById("cfg-voice-default-name").value = data.tempVoice.defaultName || "🔊 {user}'s Room";
    }

    // Fill Tickets
    if (data.tickets) {
      if (document.getElementById("cfg-ticket-category-id"))
        document.getElementById("cfg-ticket-category-id").value = data.tickets.categoryId || "";
      if (document.getElementById("cfg-ticket-staff-roles"))
        document.getElementById("cfg-ticket-staff-roles").value = (data.tickets.staffRoleIds || []).join(", ");
      if (document.getElementById("cfg-ticket-log-id"))
        document.getElementById("cfg-ticket-log-id").value = data.tickets.logChannelId || "";
    }

    // Fill Moderation & Minigames Hub
    if (data.moderation && document.getElementById("cfg-mod-log-id")) {
      document.getElementById("cfg-mod-log-id").value = data.moderation.logChannelId || "";
    }
    if (data.counting && document.getElementById("cfg-counting-channel-id")) {
      document.getElementById("cfg-counting-channel-id").value = data.counting.channelId || "";
    }
    if (data.levelSettings && document.getElementById("cfg-levels-channel-id")) {
      document.getElementById("cfg-levels-channel-id").value = data.levelSettings.announcementChannelId || "";
    }
  } catch (err) {
    console.error("Failed to load guild config:", err);
  }
}

// Save Media Fixer directly to Discord bot database
async function saveMediaSettings() {
  const instagram = document.getElementById("cfg-media-ig").checked;
  const tiktok = document.getElementById("cfg-media-tiktok").checked;
  const twitter = document.getElementById("cfg-media-twt").checked;
  const reddit = document.getElementById("cfg-media-reddit").checked;

  try {
    const res = await fetch("/api/guild/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagram, tiktok, twitter, reddit, enabled: true }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("🎥 Media Link-to-Video settings saved!");
    }
  } catch (err) {
    console.error("Failed to save media settings:", err);
  }
}

// Save Rules directly to Discord bot database
async function saveRulesConfig() {
  const text = document.getElementById("cfg-rules-textarea").value;
  try {
    const res = await fetch("/api/guild/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: text }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("📜 Server rules published directly to Discord bot!");
    }
  } catch (err) {
    console.error("Failed to save rules:", err);
  }
}

// Save Temp Voice directly to Discord bot database
async function saveTempVoiceConfig() {
  const triggerChannelId = document.getElementById("cfg-voice-trigger-id").value.trim();
  const categoryId = document.getElementById("cfg-voice-category-id").value.trim();
  const defaultName = document.getElementById("cfg-voice-default-name").value.trim();

  try {
    const res = await fetch("/api/guild/temp-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerChannelId, categoryId, defaultName }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("🔊 Temp voice generator configuration saved!");
    }
  } catch (err) {
    console.error("Failed to save voice config:", err);
  }
}

// Save Support Tickets directly to Discord bot database
async function saveTicketsConfig() {
  const categoryId = document.getElementById("cfg-ticket-category-id").value.trim();
  const staffRoleIds = document.getElementById("cfg-ticket-staff-roles").value.trim();
  const logChannelId = document.getElementById("cfg-ticket-log-id").value.trim();

  try {
    const res = await fetch("/api/guild/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, staffRoleIds, logChannelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("🎫 Support ticket settings saved!");
    }
  } catch (err) {
    console.error("Failed to save ticket config:", err);
  }
}

// Save Mod Log & Minigame Channels directly to Discord bot database
async function saveChannelsHubConfig() {
  const modLogId = document.getElementById("cfg-mod-log-id").value.trim();
  const countingId = document.getElementById("cfg-counting-channel-id").value.trim();
  const levelsId = document.getElementById("cfg-levels-channel-id").value.trim();

  try {
    if (modLogId) {
      await fetch("/api/guild/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logChannelId: modLogId }),
      });
    }
    if (countingId) {
      await fetch("/api/guild/counting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: countingId }),
      });
    }
    if (levelsId) {
      await fetch("/api/guild/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementChannelId: levelsId }),
      });
    }
    showToast("🛡️ Audit log and game channels saved!");
  } catch (err) {
    console.error("Failed to save channels config:", err);
  }
}

// Save Greetings directly to Discord bot database
async function saveGreetingsConfig() {
  const welcomeTitle = document.getElementById("cfg-welcome-title").value;
  const welcomeMessage = document.getElementById("cfg-welcome-msg").value;
  const welcomeColor = document.getElementById("cfg-welcome-color").value;

  try {
    const res = await fetch("/api/guild/greetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ welcomeTitle, welcomeMessage, welcomeColor }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("✅ Welcome Announcement saved to Discord server!");
    }
  } catch (err) {
    console.error("Failed to save greetings:", err);
  }
}

// Save Security & Lockdown directly to Discord bot database
async function saveSecurityConfig() {
  const antiRaidEnabled = document.getElementById("cfg-toggle-antiraid").checked;
  const antiNukeEnabled = document.getElementById("cfg-toggle-antinuke").checked;
  const antiSpamEnabled = document.getElementById("cfg-toggle-antispam").checked;
  const activeLockdown = document.getElementById("cfg-toggle-lockdown").checked;

  try {
    const res = await fetch("/api/guild/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        antiRaid: { enabled: antiRaidEnabled, joinThreshold: 5, action: "lockdown" },
        antiNuke: { enabled: antiNukeEnabled, maxChannelDeletes: 2, maxRoleDeletes: 2 },
        antiSpam: { enabled: antiSpamEnabled, maxMentions: 4, maxMessagesPerWindow: 5 },
        activeLockdown,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(activeLockdown ? "🚨 SERVER LOCKDOWN ACTIVATED!" : "🛡️ Security settings updated in Discord!");
    }
  } catch (err) {
    console.error("Failed to save security:", err);
  }
}

// Load Leaderboards with Usernames and Avatars
async function loadLeaderboard() {
  const tableBody = document.getElementById("leaderboard-body");
  if (!tableBody) return;

  try {
    const res = await fetch("/api/levels");
    const data = await res.json();

    if (data.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">No ranked members recorded for this server yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = data
      .map((user, idx) => {
        let badgeClass = "rank-other";
        if (idx === 0) badgeClass = "rank-1";
        else if (idx === 1) badgeClass = "rank-2";
        else if (idx === 2) badgeClass = "rank-3";

        return `
        <tr>
          <td><span class="rank-badge ${badgeClass}">#${idx + 1}</span></td>
          <td>
            <div class="leaderboard-user-cell">
              <img src="${user.avatar}" class="leaderboard-avatar" alt="Avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
              <div class="leaderboard-names">
                <span class="leaderboard-username">${user.username}</span>
                <span class="leaderboard-userid">ID: ${user.userId}</span>
              </div>
            </div>
          </td>
          <td><strong style="color:#ff4d6d;">Level ${user.level}</strong></td>
          <td style="color:#c77dff; font-weight:600;">${(user.xp || 0).toLocaleString()} XP</td>
          <td style="color:var(--text-muted);">${user.messages || 0}</td>
        </tr>
      `;
      })
      .join("");
  } catch (err) {
    console.error("Leaderboard load failed:", err);
  }
}

// Load Overview Metrics
async function loadOverview() {
  try {
    const res = await fetch("/api/overview");
    const data = await res.json();

    document.getElementById("metric-servers").innerText = data.stats.guildsConfigured || "2";
    document.getElementById("metric-members").innerText = (data.stats.membersTracked || 250).toLocaleString();
    document.getElementById("metric-commands").innerText = data.stats.totalCommands || "30";
    document.getElementById("metric-tickets").innerText = data.stats.activeTicketsPanels || "1";

    const featureContainer = document.getElementById("feature-grid-target");
    if (featureContainer && data.features) {
      featureContainer.innerHTML = data.features
        .map(
          (f) => `
        <div class="feature-box">
          <div class="feature-box-top">
            <h4 style="color:#fff;font-weight:700;">${f.name}</h4>
            <span class="feature-badge">${f.status}</span>
          </div>
          <p style="color:var(--text-muted);font-size:0.85rem;">System Shield: <span style="color:#ff758f;font-weight:600;">${f.level}</span></p>
        </div>
      `
        )
        .join("");
    }
  } catch (err) {
    console.error("Failed to load overview data:", err);
  }
}

// Command Catalog
let allCommands = [];

async function loadCommands() {
  try {
    const res = await fetch("/api/commands");
    allCommands = await res.json();
    renderCommands(allCommands);
  } catch (err) {
    console.error("Failed to load commands:", err);
  }
}

function renderCommands(list) {
  const container = document.getElementById("commands-container");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;">No flames matched your query.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (cmd) => `
    <div class="cmd-card">
      <div class="cmd-header">
        <span class="cmd-name">${cmd.name}</span>
        <span class="cmd-cat">${cmd.cat}</span>
      </div>
      <p class="cmd-desc">${cmd.desc}</p>
      <div class="cmd-options"><code>${cmd.options}</code></div>
    </div>
  `
    )
    .join("");
}

const searchInput = document.getElementById("cmd-search");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = allCommands.filter(
      (c) => c.name.toLowerCase().includes(val) || c.desc.toLowerCase().includes(val) || c.cat.toLowerCase().includes(val)
    );
    renderCommands(filtered);
  });
}

const filterPills = document.querySelectorAll(".pill-btn");
filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    filterPills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const cat = pill.dataset.cat;
    if (cat === "all") {
      renderCommands(allCommands);
    } else {
      renderCommands(allCommands.filter((c) => c.cat.toLowerCase() === cat.toLowerCase()));
    }
  });
});

// Interactive Discord Embed Preview
const titleInput = document.getElementById("embed-title-input");
const descInput = document.getElementById("embed-desc-input");
const colorInput = document.getElementById("embed-color-input");

const previewTitle = document.getElementById("preview-title");
const previewDesc = document.getElementById("preview-desc");
const previewCard = document.getElementById("preview-card");

function updatePreview() {
  if (titleInput && previewTitle) {
    previewTitle.innerText = titleInput.value || "AURA Embedded Broadcast";
  }
  if (descInput && previewDesc) {
    previewDesc.innerText = descInput.value || "Preview text will render in real-time as you type.";
  }
  if (colorInput && previewCard) {
    previewCard.style.borderLeftColor = colorInput.value;
  }
}

if (titleInput) titleInput.addEventListener("input", updatePreview);
if (descInput) descInput.addEventListener("input", updatePreview);
if (colorInput) colorInput.addEventListener("input", updatePreview);

// Initialize
checkAuth();
loadOverview();
loadCommands();
loadLeaderboard();
