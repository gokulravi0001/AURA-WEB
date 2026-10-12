// =============================================================================
// AURA RED & PURPLE FLAME - INTERACTIVE CLIENT ENGINE (NEKOTINA STYLE)
// =============================================================================

// Background Animated Flame & Ember Particles
const canvas = document.getElementById("aura-canvas-fire");
const ctx = canvas ? canvas.getContext("2d") : null;

let particles = [];
let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener("resize", () => {
  if (!canvas) return;
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

class EmberParticle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = height + Math.random() * 40;
    this.vx = (Math.random() - 0.5) * 1.4;
    this.vy = -(Math.random() * 2.2 + 1.0);
    this.size = Math.random() * 3.8 + 1.2;
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
    const alpha = Math.sin(progress * Math.PI) * 0.75;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

    if (this.colorType < 0.55) {
      ctx.fillStyle = `rgba(255, 42, 85, ${alpha})`;
      ctx.shadowColor = "#ff2a55";
    } else if (this.colorType < 0.88) {
      ctx.fillStyle = `rgba(179, 0, 255, ${alpha})`;
      ctx.shadowColor = "#b300ff";
    } else {
      ctx.fillStyle = `rgba(255, 77, 136, ${alpha})`;
      ctx.shadowColor = "#ff4d88";
    }

    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }
}

if (ctx) {
  for (let i = 0; i < 75; i++) {
    const p = new EmberParticle();
    p.y = Math.random() * height;
    particles.push(p);
  }

  function animateEmber() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }
    requestAnimationFrame(animateEmber);
  }
  animateEmber();
}

// Toast helper
function showToast(message) {
  const toast = document.getElementById("toast-notify");
  if (!toast) return;
  toast.innerText = message || "🔥 Changes saved!";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

// =============================================================================
// NEKOTINA-STYLE MULTI-PAGE VIEW ROUTING
// =============================================================================
const views = {
  home: document.getElementById("view-home"),
  commands: document.getElementById("view-commands"),
  leaderboard: document.getElementById("view-leaderboard"),
  dashboard: document.getElementById("view-dashboard"),
  docs: document.getElementById("view-docs"),
};

const viewUrlMap = {
  home: "/",
  commands: "/commands",
  leaderboard: "/leaderboard",
  dashboard: "/dashboard",
  docs: "/docs",
};

const urlViewMap = {
  "/": "home",
  "/home": "home",
  "/commands": "commands",
  "/leaderboard": "leaderboard",
  "/dashboard": "dashboard",
  "/docs": "docs",
};

function navigateTo(viewName, e, updateUrl = true) {
  if (e && e.preventDefault) e.preventDefault();
  if (!views[viewName]) viewName = "home";

  // Hide all views, show targeted view
  Object.keys(views).forEach((vKey) => {
    if (views[vKey]) {
      views[vKey].classList.toggle("active-view", vKey === viewName);
    }
  });

  // Update navbar links active state
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === viewName);
  });

  // Push URL to browser history
  if (updateUrl && viewUrlMap[viewName]) {
    const targetUrl = viewUrlMap[viewName];
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ viewName }, "", targetUrl);
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "commands") loadCommands();
  if (viewName === "leaderboard") loadLeaderboard();
  if (viewName === "dashboard") loadGuildConfig();
}

function navigateToDashboardTab(paneId) {
  navigateTo("dashboard");
  const fullPaneId = paneId.startsWith("pane-") ? paneId : `pane-${paneId}`;
  switchDashPane(fullPaneId);
}

// Dashboard sidebar switcher
function switchDashPane(paneId) {
  document.querySelectorAll(".dash-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pane === paneId);
  });
  document.querySelectorAll(".config-pane").forEach((pane) => {
    pane.classList.toggle("active-pane", pane.id === paneId);
  });
}

// Handle browser Back / Forward buttons
window.addEventListener("popstate", () => {
  const currentPath = window.location.pathname;
  const targetView = urlViewMap[currentPath] || "home";
  navigateTo(targetView, null, false);
});

// =============================================================================
// AUTHENTICATION & DISCORD OAUTH2 HANDLER
// =============================================================================
function openAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.add("open");
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("open");
}

async function loginWithDiscord() {
  try {
    const callbackUri = `${window.location.origin}/api/auth/discord/callback`;
    const res = await fetch(`/api/auth/discord/url?redirectUri=${encodeURIComponent(callbackUri)}`);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      openAuthModal();
      showToast("⚠️ CLIENT_SECRET required for OAuth2. Direct sync available below.");
    }
  } catch (err) {
    console.error("OAuth2 error:", err);
    openAuthModal();
  }
}

let currentSelectedGuild = null;

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();

    if (data.loggedIn && data.selectedGuild) {
      currentSelectedGuild = data.selectedGuild;
      updateUserGuildUI(data);
    } else {
      // Auto-connect default guild
      await handleLogin(true);
    }
    loadGuildConfig();
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function updateUserGuildUI(data) {
  const guild = data.selectedGuild;
  const user = data.user;

  document.getElementById("nav-guild-name").innerText = guild.name;
  document.getElementById("nav-user-label").innerText = `Admin: ${user.username}`;
  document.getElementById("dash-banner-name").innerText = `Currently Managing: ${guild.name}`;
  document.getElementById("dash-banner-id").innerText = `Guild ID: ${guild.id}`;
  document.getElementById("login-guild-id").value = guild.id;

  if (user.avatar) {
    const iconEl = document.getElementById("nav-guild-icon");
    if (iconEl) iconEl.innerHTML = `<img src="${user.avatar}" alt="Avatar">`;
  }

  if (data.guilds && data.guilds.length > 0) {
    renderGuildSelectorList(data.guilds);
  }
}

function renderGuildSelectorList(guilds) {
  const listContainer = document.getElementById("auth-guild-list");
  const itemsContainer = document.getElementById("auth-guild-items");
  if (!listContainer || !itemsContainer) return;

  listContainer.style.display = "block";
  itemsContainer.innerHTML = guilds
    .map(
      (g) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.5); padding:0.6rem 0.8rem; border-radius:10px; border:1px solid rgba(255,42,85,0.25);">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <div style="width:28px; height:28px; border-radius:50%; background:#ff2a55; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; overflow:hidden;">
            ${g.icon ? `<img src="${g.icon}" style="width:100%;height:100%;object-fit:cover;">` : g.name.charAt(0)}
          </div>
          <div>
            <div style="font-weight:700; color:#fff; font-size:0.85rem;">${g.name}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); font-family:var(--font-mono);">${g.id}</div>
          </div>
        </div>
        <button onclick="selectGuild('${g.id}')" class="btn-aura-outline" style="padding:0.3rem 0.7rem; font-size:0.75rem;">
          Manage ⚡
        </button>
      </div>
    `
    )
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
      document.getElementById("dash-banner-name").innerText = `Currently Managing: ${data.selectedGuild.name}`;
      document.getElementById("dash-banner-id").innerText = `Guild ID: ${data.selectedGuild.id}`;
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
      document.getElementById("dash-banner-name").innerText = `Currently Managing: ${data.selectedGuild.name}`;
      document.getElementById("dash-banner-id").innerText = `Guild ID: ${data.selectedGuild.id}`;
      closeAuthModal();
      if (!silent) showToast(`🔥 Connected to ${data.selectedGuild.name}!`);
      loadGuildConfig();
      loadLeaderboard();
    }
  } catch (err) {
    console.error("Login failed:", err);
  }
}

// =============================================================================
// LIVE SERVER CONFIGURATION (READ / WRITE TO DISCORD BOT)
// =============================================================================
async function loadGuildConfig() {
  try {
    const res = await fetch("/api/guild/settings");
    const data = await res.json();

    if (data.greetings) {
      if (document.getElementById("cfg-welcome-title"))
        document.getElementById("cfg-welcome-title").value = data.greetings.welcomeTitle || "Welcome to {server}!";
      if (document.getElementById("cfg-welcome-msg"))
        document.getElementById("cfg-welcome-msg").value = data.greetings.welcomeMessage || "Welcome {user} to {server}!";
      if (document.getElementById("cfg-welcome-color"))
        document.getElementById("cfg-welcome-color").value = data.greetings.welcomeColor || "#ff2a55";
    }

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

    if (data.rules && document.getElementById("cfg-rules-textarea")) {
      const rulesArr = Array.isArray(data.rules) ? data.rules : [];
      document.getElementById("cfg-rules-textarea").value = rulesArr.join("\n");
    }

    if (data.tempVoice) {
      if (document.getElementById("cfg-voice-trigger-id"))
        document.getElementById("cfg-voice-trigger-id").value = data.tempVoice.triggerChannelId || "";
      if (document.getElementById("cfg-voice-category-id"))
        document.getElementById("cfg-voice-category-id").value = data.tempVoice.categoryId || "";
      if (document.getElementById("cfg-voice-default-name"))
        document.getElementById("cfg-voice-default-name").value = data.tempVoice.defaultName || "🔊 {user}'s Room";
    }

    if (data.tickets) {
      if (document.getElementById("cfg-ticket-category-id"))
        document.getElementById("cfg-ticket-category-id").value = data.tickets.categoryId || "";
      if (document.getElementById("cfg-ticket-staff-roles"))
        document.getElementById("cfg-ticket-staff-roles").value = (data.tickets.staffRoleIds || []).join(", ");
      if (document.getElementById("cfg-ticket-log-id"))
        document.getElementById("cfg-ticket-log-id").value = data.tickets.logChannelId || "";
    }

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
    if (data.success) showToast("✅ Welcome announcement saved to server!");
  } catch (err) {
    console.error("Save greetings error:", err);
  }
}

async function saveSecurityConfig() {
  const antiRaid = document.getElementById("cfg-toggle-antiraid").checked;
  const antiNuke = document.getElementById("cfg-toggle-antinuke").checked;
  const antiSpam = document.getElementById("cfg-toggle-antispam").checked;
  const activeLockdown = document.getElementById("cfg-toggle-lockdown").checked;

  try {
    const res = await fetch("/api/guild/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        antiRaid: { enabled: antiRaid, joinThreshold: 5, action: "lockdown" },
        antiNuke: { enabled: antiNuke, maxChannelDeletes: 2, maxRoleDeletes: 2 },
        antiSpam: { enabled: antiSpam, maxMentions: 4, maxMessagesPerWindow: 5 },
        activeLockdown,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(activeLockdown ? "🚨 SERVER LOCKDOWN ACTIVATED!" : "🛡️ Security settings updated in Discord!");
    }
  } catch (err) {
    console.error("Save security error:", err);
  }
}

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
    if (data.success) showToast("🔊 Temp voice generator configuration saved!");
  } catch (err) {
    console.error("Save voice error:", err);
  }
}

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
    if (data.success) showToast("🎫 Support ticket settings saved!");
  } catch (err) {
    console.error("Save tickets error:", err);
  }
}

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
    if (data.success) showToast("🎥 Media Fixer video links saved!");
  } catch (err) {
    console.error("Save media error:", err);
  }
}

async function saveRulesConfig() {
  const text = document.getElementById("cfg-rules-textarea").value;
  try {
    const res = await fetch("/api/guild/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: text }),
    });
    const data = await res.json();
    if (data.success) showToast("📜 Server rules published to Discord!");
  } catch (err) {
    console.error("Save rules error:", err);
  }
}

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
    showToast("📡 Audit log and minigame channels saved!");
  } catch (err) {
    console.error("Save channels error:", err);
  }
}

// =============================================================================
// XP LEADERBOARD
// =============================================================================
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/levels");
    const data = await res.json();

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">No ranked members recorded for this server yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data
      .map((u, idx) => {
        let badgeClass = "rank-other";
        if (idx === 0) badgeClass = "rank-1";
        else if (idx === 1) badgeClass = "rank-2";
        else if (idx === 2) badgeClass = "rank-3";

        return `
        <tr>
          <td><span class="rank-badge ${badgeClass}">#${idx + 1}</span></td>
          <td>
            <div class="leaderboard-user-cell">
              <img src="${u.avatar}" class="leaderboard-avatar" alt="Avatar" onerror="this.src='aura-logo.png'">
              <div>
                <strong style="color:#fff; display:block; font-size:0.95rem;">${u.username}</strong>
                <span style="color:var(--text-dim); font-size:0.75rem; font-family:var(--font-mono);">ID: ${u.userId}</span>
              </div>
            </div>
          </td>
          <td><strong style="color:#ff3366;">Level ${u.level}</strong></td>
          <td style="color:#c77dff; font-weight:700;">${(u.xp || 0).toLocaleString()} XP</td>
          <td style="color:var(--text-muted);">${u.messages || 0}</td>
        </tr>
      `;
      })
      .join("");
  } catch (err) {
    console.error("Leaderboard load failed:", err);
  }
}

// =============================================================================
// COMMANDS CATALOG (30 COMMANDS)
// =============================================================================
let allCommands = [];

async function loadCommands() {
  const container = document.getElementById("commands-container");
  if (!container) return;

  try {
    const res = await fetch("/api/commands");
    allCommands = await res.json();
    renderCommands(allCommands);
  } catch (err) {
    console.error("Commands load failed:", err);
  }
}

function renderCommands(list) {
  const container = document.getElementById("commands-container");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:2rem;">No matching commands found.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (c) => `
    <div class="command-item-card">
      <div class="cmd-header">
        <span class="cmd-title">${c.name}</span>
        <span class="cmd-badge">${c.cat}</span>
      </div>
      <p class="cmd-desc">${c.desc}</p>
      <div class="cmd-syntax"><code>${c.options}</code></div>
    </div>
  `
    )
    .join("");
}

const cmdSearch = document.getElementById("cmd-search");
if (cmdSearch) {
  cmdSearch.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = allCommands.filter(
      (c) => c.name.toLowerCase().includes(val) || c.desc.toLowerCase().includes(val) || c.cat.toLowerCase().includes(val)
    );
    renderCommands(filtered);
  });
}

document.querySelectorAll(".cat-pill-btn").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill-btn").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const cat = pill.dataset.cat;
    if (cat === "all") renderCommands(allCommands);
    else renderCommands(allCommands.filter((c) => c.cat.toLowerCase() === cat.toLowerCase()));
  });
});

// Embed Studio Live Preview
const embedTitleInput = document.getElementById("embed-title-input");
const embedDescInput = document.getElementById("embed-desc-input");
const embedColorInput = document.getElementById("embed-color-input");

const previewTitle = document.getElementById("preview-title");
const previewDesc = document.getElementById("preview-desc");
const previewCard = document.getElementById("preview-card");

function updateEmbedPreview() {
  if (embedTitleInput && previewTitle) previewTitle.innerText = embedTitleInput.value || "AURA Announcement";
  if (embedDescInput && previewDesc) previewDesc.innerText = embedDescInput.value || "Preview text will render in real time.";
  if (embedColorInput && previewCard) previewCard.style.borderLeftColor = embedColorInput.value;
}

if (embedTitleInput) embedTitleInput.addEventListener("input", updateEmbedPreview);
if (embedDescInput) embedDescInput.addEventListener("input", updateEmbedPreview);
if (embedColorInput) embedColorInput.addEventListener("input", updateEmbedPreview);

// Overview Metrics
async function loadOverview() {
  try {
    const res = await fetch("/api/overview");
    const data = await res.json();
    if (document.getElementById("stat-servers"))
      document.getElementById("stat-servers").innerText = data.stats.guildsConfigured || "2";
    if (document.getElementById("stat-members"))
      document.getElementById("stat-members").innerText = (data.stats.membersTracked || 250).toLocaleString();
    if (document.getElementById("stat-commands"))
      document.getElementById("stat-commands").innerText = data.stats.totalCommands || "30";
  } catch (err) {
    console.error("Overview error:", err);
  }
}

// Initial Route Resolution on Page Load
function initPage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error")) {
    const err = params.get("error");
    if (err === "oauth_not_configured") showToast("⚠️ Configure CLIENT_SECRET in Render for Discord OAuth2.");
    else if (err === "oauth_failed") showToast("❌ Discord OAuth2 failed. Please try again.");
  }

  const currentPath = window.location.pathname;
  const initialView = urlViewMap[currentPath] || (window.location.hash ? window.location.hash.replace("#", "") : "home");
  navigateTo(initialView, null, false);

  checkAuth();
  loadOverview();
}

initPage();
