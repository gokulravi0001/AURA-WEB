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

// Tab navigation & URL Routing (Redirects each option to dedicated page/view)
const dashTabs = document.querySelectorAll(".dash-tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const navLinks = document.querySelectorAll(".nav-link");

const tabRouteMap = {
  "overview": "/",
  "commands": "/commands",
  "levels": "/leaderboard",
  "security": "/security",
  "server-config": "/server-config",
  "sandbox": "/embed-studio",
  "minigames": "/minigames"
};

const routeTabMap = {
  "/": "overview",
  "/overview": "overview",
  "/commands": "commands",
  "/leaderboard": "levels",
  "/security": "security",
  "/server-config": "server-config",
  "/embed-studio": "sandbox",
  "/minigames": "minigames"
};

function switchTab(tabId, updateUrl = true) {
  // Update sidebar buttons
  dashTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Update navbar links
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.route === tabId);
  });

  // Show corresponding tab pane
  tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === `pane-${tabId}`);
  });

  // Update browser URL without reloading if requested
  if (updateUrl && tabRouteMap[tabId]) {
    const targetUrl = tabRouteMap[tabId];
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ tabId }, "", targetUrl);
    }
  }

  // Auto-scroll down smoothly to dashboard view
  const dashSection = document.getElementById("dashboard");
  if (dashSection && tabId !== "overview") {
    dashSection.scrollIntoView({ behavior: "smooth" });
  }
}

// Handle Browser Back / Forward Buttons
window.addEventListener("popstate", () => {
  const currentPath = window.location.pathname;
  const tabId = routeTabMap[currentPath] || "overview";
  switchTab(tabId, false);
});

// Intercept top nav link clicks for seamless single-page routing
navLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const route = link.dataset.route;
    if (route) {
      switchTab(route, true);
    }
  });
});

dashTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab, true);
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

// Discord OAuth2 Login redirect
async function loginWithDiscord() {
  try {
    const callbackUri = `${window.location.origin}/api/auth/discord/callback`;
    const res = await fetch(`/api/auth/discord/url?redirectUri=${encodeURIComponent(callbackUri)}`);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      openAuthModal();
      showToast("⚠️ Please configure CLIENT_SECRET or use Direct Server ID sync.");
    }
  } catch (err) {
    console.error("OAuth2 error:", err);
    openAuthModal();
  }
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

      if (data.user.avatar && document.getElementById("nav-guild-icon")) {
        document.getElementById("nav-guild-icon").innerHTML = `<img src="${data.user.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.innerHTML='⚔️'">`;
      }

      // Render Admin Guilds in Auth Modal if available
      if (data.guilds && data.guilds.length > 0) {
        renderGuildSelectorList(data.guilds);
      }
    } else {
      // Auto-login to default guild
      await handleLogin(true);
    }
    loadGuildConfig();
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function renderGuildSelectorList(guilds) {
  const listContainer = document.getElementById("auth-guild-list");
  const itemsContainer = document.getElementById("auth-guild-items");
  if (!listContainer || !itemsContainer) return;

  listContainer.style.display = "block";
  itemsContainer.innerHTML = guilds
    .map((g) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.4); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(255,42,85,0.2);">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <div style="width:28px; height:28px; border-radius:50%; background:#ff2a55; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold;">
            ${g.icon ? `<img src="${g.icon}" style="width:100%;height:100%;border-radius:50%;">` : g.name.charAt(0)}
          </div>
          <div>
            <div style="font-weight:600; color:#fff; font-size:0.85rem;">${g.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">${g.id}</div>
          </div>
        </div>
        <button onclick="selectGuild('${g.id}')" class="btn-flame-outline" style="padding:0.3rem 0.7rem; font-size:0.75rem;">
          Manage ⚡
        </button>
      </div>
    `)
    .join("");
}

async function selectGuild(guildId) {
  try {
    const res = await fetch("/api/auth/select-guild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId }),
    });
    const data = await res.json();
    if (data.success) {
      currentSelectedGuild = data.selectedGuild;
      document.getElementById("nav-guild-name").innerText = data.selectedGuild.name;
      document.getElementById("banner-server-title").innerText = `Currently Managing: ${data.selectedGuild.name}`;
      document.getElementById("banner-server-id").innerText = `Guild ID: ${data.selectedGuild.id}`;
      document.getElementById("login-guild-id").value = data.selectedGuild.id;
      closeAuthModal();
      showToast(`🔥 Switched to ${data.selectedGuild.name}!`);
      loadGuildConfig();
      loadLeaderboard();
    }
  } catch (err) {
    console.error("Select guild error:", err);
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

// Initial Route Resolver
function initRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error")) {
    const err = params.get("error");
    if (err === "oauth_not_configured") {
      showToast("⚠️ Add CLIENT_SECRET to Render/Environment for Discord OAuth2.");
    } else if (err === "oauth_failed") {
      showToast("❌ Discord OAuth2 login failed. Please try again.");
    }
  }

  // Check URL path first, then fallback to hash or default to overview
  const currentPath = window.location.pathname;
  let targetTab = routeTabMap[currentPath];
  if (!targetTab && window.location.hash) {
    const hash = window.location.hash.replace("#", "");
    if (tabRouteMap[hash]) {
      targetTab = hash;
    }
  }

  if (targetTab && targetTab !== "overview") {
    switchTab(targetTab, false);
  }
}

// Initialize
initRoute();
checkAuth();
loadOverview();
loadCommands();
loadLeaderboard();
