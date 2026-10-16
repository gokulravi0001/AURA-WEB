// =============================================================================
// AURA RED & PURPLE FLAME - INTERACTIVE CLIENT ENGINE
// =============================================================================

// Background Animated Flame & Ember Particles
const canvas = document.getElementById("aura-canvas-fire");
const ctx = canvas ? canvas.getContext("2d") : null;

let particles = [];
let width = canvas ? (canvas.width = window.innerWidth) : 0;
let height = canvas ? (canvas.height = window.innerHeight) : 0;

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

// Toast Notification
function showToast(message) {
  const toast = document.getElementById("toast-notify");
  if (!toast) return;
  toast.innerText = message || "🔥 Changes saved successfully!";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3800);
}

// =============================================================================
// ROUTING & VIEW NAVIGATION
// =============================================================================
const views = {
  home: document.getElementById("view-home"),
  login: document.getElementById("view-login"),
  dashboard: document.getElementById("view-dashboard"),
  leaderboard: document.getElementById("view-leaderboard"),
  profile: document.getElementById("view-profile"),
  commands: document.getElementById("view-commands"),
  docs: document.getElementById("view-docs"),
};

const viewUrlMap = {
  login: "/",
  home: "/home",
  dashboard: "/dashboard",
  leaderboard: "/leaderboard",
  profile: "/profile",
  commands: "/commands",
  docs: "/docs",
};

const urlViewMap = {
  "/": "login",
  "/login": "login",
  "/home": "home",
  "/dashboard": "dashboard",
  "/leaderboard": "leaderboard",
  "/profile": "profile",
  "/commands": "commands",
  "/docs": "docs",
};

function navigateTo(viewName, e, updateUrl = true) {
  if (e && e.preventDefault) e.preventDefault();
  if (!views[viewName]) viewName = "home";

  Object.keys(views).forEach((vKey) => {
    if (views[vKey]) {
      views[vKey].classList.toggle("active-view", vKey === viewName);
    }
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === viewName);
  });

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

function switchDashPane(paneId) {
  document.querySelectorAll(".dash-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pane === paneId);
  });
  document.querySelectorAll(".config-pane").forEach((pane) => {
    pane.classList.toggle("active-pane", pane.id === paneId);
  });
  if (paneId === "pane-birthday") {
    loadBirthdays(1);
  }
}

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
      showToast("⚠️ CLIENT_SECRET required for Discord OAuth2. Direct sync available below.");
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
      loadGuildConfig();
      if (window.location.pathname === "/dashboard") {
        navigateTo("dashboard", null, false);
      }
    } else {
      // First a login page!
      navigateTo("login", null, false);
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function updateUserGuildUI(data) {
  const guild = data.selectedGuild;
  const user = data.user;

  const navGuildName = document.getElementById("nav-guild-name");
  const navUserLabel = document.getElementById("nav-user-label");
  const dashBannerName = document.getElementById("dash-banner-name");
  const dashBannerId = document.getElementById("dash-banner-id");
  const navLoginBtn = document.getElementById("nav-login-btn");

  if (navGuildName) navGuildName.innerText = guild.name;
  if (navUserLabel) navUserLabel.innerText = `Admin: ${user.username}`;
  if (dashBannerName) dashBannerName.innerText = `Currently Managing: ${guild.name}`;
  if (dashBannerId) dashBannerId.innerText = `Guild ID: ${guild.id}`;
  if (navLoginBtn) navLoginBtn.innerHTML = `<span>⚡</span> ${user.username}`;

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
      closeAuthModal();
      showToast(`🔥 Switched to ${data.selectedGuild.name}!`);
      loadGuildConfig();
      loadLeaderboard();
      navigateTo("dashboard");
    }
  } catch (err) {
    console.error("Select guild error:", err);
  }
}

async function performServerLogin(username, guildId, silent = false) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, guildId }),
    });
    const data = await res.json();
    if (data.success) {
      currentSelectedGuild = data.selectedGuild;
      updateUserGuildUI(data);
      if (!silent) {
        showToast(`🔥 Connected to ${data.selectedGuild.name}! Redirecting to dashboard...`);
        navigateTo("dashboard");
      }
      loadGuildConfig();
      loadLeaderboard();
    }
  } catch (err) {
    console.error("Login failed:", err);
  }
}

function handleDirectPageLogin() {
  const username = document.getElementById("login-username").value || "ServerAdmin";
  const guildId = document.getElementById("login-guild-id").value || "1547837282109624462";
  performServerLogin(username, guildId, false);
}

function handleModalLogin() {
  const username = document.getElementById("modal-login-username").value || "ServerAdmin";
  const guildId = document.getElementById("modal-login-guild-id").value || "1547837282109624462";
  closeAuthModal();
  performServerLogin(username, guildId, false);
}

// =============================================================================
// DYNAMIC RULES GENERATOR (ASK FOR HOW MANY RULES, TITLE & CONTENT FOR EACH)
// =============================================================================
let rulesList = [
  { title: "Be Respectful", content: "Treat all members and moderators with courtesy and kindness." },
  { title: "No Spam or Flooding", content: "Do not spam messages, emojis, or excessive mentions." },
  { title: "Follow Discord TOS", content: "All Discord Community Guidelines and Terms of Service apply." }
];

function renderRuleFields() {
  const container = document.getElementById("rules-fields-container");
  if (!container) return;

  container.innerHTML = rulesList
    .map(
      (rule, idx) => `
    <div class="rule-item-row" data-index="${idx}">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
        <span style="font-weight: 800; color: #ff3366; font-size: 0.95rem;">Rule #${idx + 1}</span>
        <button type="button" class="btn-remove-row" onclick="removeSingleRuleField(${idx})">✕ Remove</button>
      </div>
      <div class="form-group" style="margin-bottom: 0.6rem;">
        <label class="form-label" style="font-size: 0.8rem;">Rule Title</label>
        <input type="text" class="form-input rule-title-input" value="${escapeHtml(rule.title)}" placeholder="e.g. Respect Everyone">
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label" style="font-size: 0.8rem;">Rule Content / Description</label>
        <textarea class="form-textarea rule-content-input" rows="2" placeholder="Explain the rule in detail...">${escapeHtml(rule.content)}</textarea>
      </div>
    </div>
  `
    )
    .join("");

  const countInput = document.getElementById("rules-count-input");
  if (countInput) countInput.value = rulesList.length;
}

function generateRuleFields() {
  syncCurrentRulesFromInputs();
  const countInput = document.getElementById("rules-count-input");
  const targetCount = parseInt(countInput.value, 10) || 3;
  const clampedCount = Math.max(1, Math.min(25, targetCount));

  if (clampedCount > rulesList.length) {
    for (let i = rulesList.length; i < clampedCount; i++) {
      rulesList.push({ title: `Rule #${i + 1}`, content: "Follow server guidelines." });
    }
  } else if (clampedCount < rulesList.length) {
    rulesList = rulesList.slice(0, clampedCount);
  }
  renderRuleFields();
}

function addSingleRuleField() {
  syncCurrentRulesFromInputs();
  if (rulesList.length >= 25) {
    showToast("⚠️ Maximum 25 rules reached.");
    return;
  }
  rulesList.push({ title: `Rule #${rulesList.length + 1}`, content: "" });
  renderRuleFields();
}

function removeSingleRuleField(idx) {
  syncCurrentRulesFromInputs();
  rulesList.splice(idx, 1);
  if (rulesList.length === 0) {
    rulesList.push({ title: "Rule #1", content: "" });
  }
  renderRuleFields();
}

function syncCurrentRulesFromInputs() {
  const rows = document.querySelectorAll(".rule-item-row");
  rulesList = Array.from(rows).map((row) => {
    const title = row.querySelector(".rule-title-input")?.value || "";
    const content = row.querySelector(".rule-content-input")?.value || "";
    return { title, content };
  });
}

// =============================================================================
// REACTION ROLES BUILDER (MAX 25 FIELDS, UNIQUE CHOICE, RESTRICTED ACCESS)
// =============================================================================
let reactionRolesList = [
  { emoji: "🔥", roleId: "1555900628809809971", label: "Flame Member" },
  { emoji: "⚡", roleId: "1555902019716382731", label: "Ping Alerts" },
  { emoji: "🎮", roleId: "1555902019716382732", label: "Gamer Squad" }
];

function updateRRCounter() {
  const badge = document.getElementById("rr-counter-badge");
  if (badge) {
    badge.innerText = `${reactionRolesList.length} / 25 Max`;
    if (reactionRolesList.length >= 25) {
      badge.style.background = "rgba(255, 42, 85, 0.7)";
      badge.style.color = "#fff";
    } else {
      badge.style.background = "rgba(255, 42, 85, 0.25)";
      badge.style.color = "#ff6685";
    }
  }
}

function renderReactionRoleRows() {
  const container = document.getElementById("rr-items-container");
  if (!container) return;

  container.innerHTML = reactionRolesList
    .map(
      (item, idx) => `
    <div class="rr-item-card" data-index="${idx}">
      <div style="width: 70px;">
        <label class="form-label" style="font-size: 0.75rem;">Emoji</label>
        <input type="text" class="form-input rr-emoji-input" value="${escapeHtml(item.emoji)}" placeholder="🔥" style="text-align: center; font-size: 1.1rem; padding: 0.5rem;">
      </div>
      <div style="flex: 2;">
        <label class="form-label" style="font-size: 0.75rem;">Discord Role ID</label>
        <input type="text" class="form-input rr-role-id-input" value="${escapeHtml(item.roleId)}" placeholder="e.g. 1555900628809809971" style="font-family: var(--font-mono); font-size: 0.85rem;">
      </div>
      <div style="flex: 2;">
        <label class="form-label" style="font-size: 0.75rem;">Role Label / Name</label>
        <input type="text" class="form-input rr-label-input" value="${escapeHtml(item.label || '')}" placeholder="e.g. Flame Member">
      </div>
      <div style="padding-top: 1.4rem;">
        <button type="button" class="btn-remove-row" onclick="removeReactionRoleRow(${idx})">✕</button>
      </div>
    </div>
  `
    )
    .join("");

  updateRRCounter();
}

function addReactionRoleRow() {
  syncCurrentRRFromInputs();
  if (reactionRolesList.length >= 25) {
    showToast("⚠️ Maximum 25 reaction roles reached for this panel!");
    return;
  }
  reactionRolesList.push({ emoji: "⭐", roleId: "", label: "" });
  renderReactionRoleRows();
}

function removeReactionRoleRow(idx) {
  syncCurrentRRFromInputs();
  reactionRolesList.splice(idx, 1);
  renderReactionRoleRows();
}

function syncCurrentRRFromInputs() {
  const cards = document.querySelectorAll(".rr-item-card");
  reactionRolesList = Array.from(cards).map((card) => {
    const emoji = card.querySelector(".rr-emoji-input")?.value || "";
    const roleId = card.querySelector(".rr-role-id-input")?.value || "";
    const label = card.querySelector(".rr-label-input")?.value || "";
    return { emoji, roleId, label };
  });
}

// =============================================================================
// API SAVE DISPATCHERS (DIRECT DISCORD BOT STORAGE & REST SYNC)
// =============================================================================

// 1. SET ANNOUNCEMENT
async function saveAnnouncementConfig() {
  const channelId = document.getElementById("announce-channel-id")?.value.trim();
  const title = document.getElementById("announce-title")?.value.trim();
  const content = document.getElementById("announce-content")?.value.trim();
  const imageUrl = document.getElementById("announce-image-url")?.value.trim();
  const ping = document.getElementById("announce-ping")?.value;
  const color = document.getElementById("announce-color")?.value;

  if (!channelId || !title || !content) {
    showToast("⚠️ Please specify Channel ID, Title, and Content.");
    return;
  }

  try {
    const res = await fetch("/api/guild/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, title, content, imageUrl, ping, color }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🔥 Announcement published to Discord!");
    } else {
      showToast(`❌ Error: ${data.error || "Failed to publish."}`);
    }
  } catch (err) {
    console.error("Announcement error:", err);
    showToast("❌ Network error sending announcement.");
  }
}

// 2. SET RULES
async function saveStructuredRules() {
  syncCurrentRulesFromInputs();
  const channelId = document.getElementById("rules-channel-id")?.value.trim();
  const headerTitle = document.getElementById("rules-header-title")?.value.trim();
  const color = document.getElementById("rules-color")?.value;

  if (rulesList.length === 0) {
    showToast("⚠️ Please create at least one rule.");
    return;
  }

  try {
    const res = await fetch("/api/guild/rules-structured", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, rules: rulesList, headerTitle, color }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "📜 Rules published & saved!");
    } else {
      showToast(`❌ Error: ${data.error || "Failed to save rules."}`);
    }
  } catch (err) {
    console.error("Rules save error:", err);
    showToast("❌ Network error saving rules.");
  }
}

// 3. SET REACTION ROLES
async function saveReactionRolesPanel() {
  syncCurrentRRFromInputs();
  const channelId = document.getElementById("rr-channel-id")?.value.trim();
  const title = document.getElementById("rr-panel-title")?.value.trim();
  const description = document.getElementById("rr-panel-desc")?.value.trim();
  const color = document.getElementById("rr-panel-color")?.value;
  const oneChoice = document.getElementById("rr-one-choice")?.checked;
  const accessRolesRaw = document.getElementById("rr-access-roles")?.value.trim();

  if (!channelId) {
    showToast("⚠️ Please enter a Target Channel ID for reaction roles.");
    return;
  }
  if (reactionRolesList.length === 0) {
    showToast("⚠️ Please add at least one reaction role item.");
    return;
  }

  const accessRoleIds = accessRolesRaw
    ? accessRolesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const res = await fetch("/api/guild/reaction-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        title,
        description,
        color,
        oneChoice,
        accessRoleIds,
        roles: reactionRolesList,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🎭 Reaction role panel deployed!");
    } else {
      showToast(`❌ Error: ${data.error || "Failed to deploy panel."}`);
    }
  } catch (err) {
    console.error("Reaction role error:", err);
    showToast("❌ Network error deploying reaction roles.");
  }
}

// 4. SET WELCOME AND BYE EMBED
async function saveGreetingsConfig() {
  const welcomeChannelId = document.getElementById("cfg-welcome-channel-id")?.value.trim();
  const welcomeTitle = document.getElementById("cfg-welcome-title")?.value.trim();
  const welcomeMessage = document.getElementById("cfg-welcome-msg")?.value.trim();
  const welcomeColor = document.getElementById("cfg-welcome-color")?.value;

  const goodbyeChannelId = document.getElementById("cfg-bye-channel-id")?.value.trim();
  const goodbyeTitle = document.getElementById("cfg-bye-title")?.value.trim();
  const goodbyeMessage = document.getElementById("cfg-bye-msg")?.value.trim();
  const goodbyeColor = document.getElementById("cfg-bye-color")?.value;

  try {
    const res = await fetch("/api/guild/greetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        welcomeChannelId,
        welcomeTitle,
        welcomeMessage,
        welcomeColor,
        goodbyeChannelId,
        goodbyeTitle,
        goodbyeMessage,
        goodbyeColor,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "👋 Welcome & Bye settings saved!");
    }
  } catch (err) {
    console.error("Greetings error:", err);
    showToast("❌ Network error saving greetings.");
  }
}

// 5. SET STICKY
async function saveStickyConfig() {
  const channelId = document.getElementById("sticky-channel-id")?.value.trim();
  const text = document.getElementById("sticky-content")?.value.trim();
  const asEmbed = document.getElementById("sticky-as-embed")?.checked;
  const title = document.getElementById("sticky-title")?.value.trim();

  if (!channelId || !text) {
    showToast("⚠️ Target Channel ID and Sticky Content are required.");
    return;
  }

  try {
    const res = await fetch("/api/guild/sticky", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, text, asEmbed, title, color: "#ff2a55" }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "📌 Sticky message active and synced!");
    } else {
      showToast(`❌ Error: ${data.error || "Failed to set sticky."}`);
    }
  } catch (err) {
    console.error("Sticky error:", err);
    showToast("❌ Network error setting sticky message.");
  }
}

// 6. SET THREAD
async function saveThreadConfig() {
  const channelId = document.getElementById("thread-channel-id")?.value.trim();
  const mode = document.getElementById("thread-mode")?.value;
  const namePattern = document.getElementById("thread-name-pattern")?.value.trim();

  if (!channelId) {
    showToast("⚠️ Please enter a Target Channel ID for auto-threads.");
    return;
  }

  try {
    const res = await fetch("/api/guild/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, mode, namePattern }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🧵 Auto-thread settings saved!");
    }
  } catch (err) {
    console.error("Thread error:", err);
    showToast("❌ Network error saving thread settings.");
  }
}

// 7. SET BIRTHDAY CHANNELS
async function saveBirthdayConfig() {
  const inputChannelId = document.getElementById("bday-input-channel-id")?.value.trim();
  const announcementChannelId = document.getElementById("bday-announce-channel-id")?.value.trim();

  try {
    const res = await fetch("/api/guild/birthday", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputChannelId, announcementChannelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🎂 Birthday channels updated!");
    }
  } catch (err) {
    console.error("Birthday error:", err);
    showToast("❌ Network error saving birthday channels.");
  }
}

// 8. SET COUNTING & WORD CHAIN
async function saveMinigamesConfig() {
  const countingChannelId = document.getElementById("counting-channel-id")?.value.trim();
  const countingMode = document.getElementById("counting-mode")?.value;
  const wordChainChannelId = document.getElementById("wordchain-channel-id")?.value.trim();
  const startingWord = document.getElementById("wordchain-starting-word")?.value.trim();

  try {
    const res = await fetch("/api/guild/minigames", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countingChannelId, countingMode, wordChainChannelId, startingWord }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🔢 Minigames configuration saved!");
    }
  } catch (err) {
    console.error("Minigames error:", err);
    showToast("❌ Network error saving minigames.");
  }
}

// 9. SET SERVER STATS
async function saveServerStatsConfig() {
  const categoryId = document.getElementById("stats-category-id")?.value.trim();
  const totalChannelId = document.getElementById("stats-total-channel-id")?.value.trim();
  const humansChannelId = document.getElementById("stats-humans-channel-id")?.value.trim();
  const botsChannelId = document.getElementById("stats-bots-channel-id")?.value.trim();

  try {
    const res = await fetch("/api/guild/serverstats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, totalChannelId, humansChannelId, botsChannelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "📊 Server stats voice counters saved!");
    }
  } catch (err) {
    console.error("Serverstats error:", err);
    showToast("❌ Network error saving server stats.");
  }
}

// 10. SET LEVEL UP
async function saveLevelUpConfig() {
  const announcementChannelId = document.getElementById("lvl-channel-id")?.value.trim();
  const roleRewards = {};

  const r5 = document.getElementById("lvl-role-5")?.value.trim();
  const r10 = document.getElementById("lvl-role-10")?.value.trim();
  const r20 = document.getElementById("lvl-role-20")?.value.trim();
  const r50 = document.getElementById("lvl-role-50")?.value.trim();

  if (r5) roleRewards["5"] = r5;
  if (r10) roleRewards["10"] = r10;
  if (r20) roleRewards["20"] = r20;
  if (r50) roleRewards["50"] = r50;

  try {
    const res = await fetch("/api/guild/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementChannelId, roleRewards }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🆙 Level celebration channel & rewards saved!");
    }
  } catch (err) {
    console.error("Levels error:", err);
    showToast("❌ Network error saving level settings.");
  }
}

// 11. SET EVENT ANNOUNCEMENT
async function saveEventConfig() {
  const channelId = document.getElementById("event-channel-id")?.value.trim();
  const title = document.getElementById("event-title")?.value.trim();
  const description = document.getElementById("event-desc")?.value.trim();
  const eventTime = document.getElementById("event-time")?.value;
  const mentionRole = document.getElementById("event-ping-role")?.value.trim();

  if (!channelId || !title || !description || !eventTime) {
    showToast("⚠️ Channel ID, Title, Description, and Event Date/Time are required.");
    return;
  }

  const startsAtIso = new Date(eventTime).toISOString();

  try {
    const res = await fetch("/api/guild/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, title, description, startsAtIso, mentionRole }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "📅 Event scheduled and broadcasted!");
    } else {
      showToast(`❌ Error: ${data.error || "Failed to schedule event."}`);
    }
  } catch (err) {
    console.error("Event error:", err);
    showToast("❌ Network error scheduling event.");
  }
}

// 12. TEMP VOICE SET
async function saveTempVoiceConfig() {
  const triggerChannelId = document.getElementById("cfg-voice-trigger-id")?.value.trim();
  const categoryId = document.getElementById("cfg-voice-category-id")?.value.trim();
  const defaultName = document.getElementById("cfg-voice-default-name")?.value.trim();

  try {
    const res = await fetch("/api/guild/temp-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerChannelId, categoryId, defaultName }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🔊 Temp Voice hub configuration saved!");
    }
  } catch (err) {
    console.error("Voice error:", err);
    showToast("❌ Network error saving temp voice.");
  }
}

// 13. INVITE TRACKER
async function saveInvitesConfig() {
  const channelId = document.getElementById("cfg-invite-channel-id")?.value.trim();

  try {
    const res = await fetch("/api/guild/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "✉️ Invite tracker channel saved!");
    }
  } catch (err) {
    console.error("Invites error:", err);
    showToast("❌ Network error saving invite tracker.");
  }
}

// 14. AUDIT LOGS
async function saveLogsConfig() {
  const logChannelId = document.getElementById("cfg-mod-log-id")?.value.trim();

  try {
    const res = await fetch("/api/guild/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logChannelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "📋 Moderation audit log channel saved!");
    }
  } catch (err) {
    console.error("Logs error:", err);
    showToast("❌ Network error saving audit logs.");
  }
}

// 15. SECURITY SET
async function saveSecurityConfig() {
  const antiRaid = { enabled: Boolean(document.getElementById("cfg-toggle-antiraid")?.checked) };
  const antiNuke = { enabled: Boolean(document.getElementById("cfg-toggle-antinuke")?.checked) };
  const antiSpam = { enabled: Boolean(document.getElementById("cfg-toggle-antispam")?.checked) };
  const activeLockdown = Boolean(document.getElementById("cfg-toggle-lockdown")?.checked);

  try {
    const res = await fetch("/api/guild/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ antiRaid, antiNuke, antiSpam, activeLockdown }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🛡️ Security settings saved & applied to server!");
    }
  } catch (err) {
    console.error("Security error:", err);
    showToast("❌ Network error saving security.");
  }
}

// =============================================================================
// MEMBER PROFILE VIEW & STAT VIEW
// =============================================================================
async function lookupMemberProfile(targetUserId) {
  const userId = targetUserId || document.getElementById("profile-search-id")?.value.trim();
  if (!userId) {
    showToast("⚠️ Please enter a Discord User ID.");
    return;
  }

  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(userId)}`);
    const data = await res.json();

    const card = document.getElementById("profile-card-render");
    if (!card) return;

    document.getElementById("prof-avatar").src = data.avatar || "aura-logo.png";
    document.getElementById("prof-username").innerText = data.username;
    document.getElementById("prof-userid").innerText = `ID: ${data.userId}`;
    document.getElementById("prof-bio").innerText = data.bio || "Community Member";
    document.getElementById("prof-level").innerText = `Level ${data.level || 1}`;
    document.getElementById("prof-xp").innerText = `${(data.xp || 0).toLocaleString()} XP`;
    document.getElementById("prof-voice").innerText = `${data.voiceMinutes || 0} Mins`;
    document.getElementById("prof-rep").innerText = `+${data.rep || 0}`;
    document.getElementById("prof-invites").innerText = `${data.invites || 0} Invites`;

    card.style.display = "block";
    card.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("Profile lookup error:", err);
    showToast("❌ Could not load profile for this User ID.");
  }
}

function viewUserProfile(userId) {
  navigateTo("profile");
  const input = document.getElementById("profile-search-id");
  if (input) input.value = userId;
  lookupMemberProfile(userId);
}

// =============================================================================
// XP LEADERBOARD (EXACT DISCORD USERNAMES ONLY - NO NICKNAMES)
// =============================================================================
// =============================================================================
// XP LEADERBOARD (EXACT DISCORD USERNAMES ONLY - PAGINATED WITH SEARCH & OPTIONS)
// =============================================================================
let lbCurrentPage = 1;
let lbPageSize = 15;
let lbSearchQuery = "";
let lbDebounceTimer = null;

async function loadLeaderboard(targetPage = 1) {
  lbCurrentPage = targetPage;
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  try {
    const url = `/api/levels?page=${lbCurrentPage}&limit=${lbPageSize}&search=${encodeURIComponent(lbSearchQuery)}`;
    const res = await fetch(url);
    const data = await res.json();

    const users = Array.isArray(data) ? data : (data.users || data.data || []);
    const total = Array.isArray(data) ? users.length : (data.total || users.length);
    const totalPages = Array.isArray(data) ? 1 : (data.totalPages || 1);

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No ranked members found matching your search.</td></tr>`;
      renderLeaderboardPagination(lbCurrentPage, 1, 0);
      return;
    }

    const limitNum = lbPageSize === "all" ? users.length : Number(lbPageSize);
    const startIndex = (lbCurrentPage - 1) * limitNum;

    tbody.innerHTML = users
      .map((u, idx) => {
        const rankNum = startIndex + idx + 1;
        let badgeClass = "rank-other";
        if (rankNum === 1) badgeClass = "rank-1";
        else if (rankNum === 2) badgeClass = "rank-2";
        else if (rankNum === 3) badgeClass = "rank-3";

        return `
        <tr>
          <td><span class="rank-badge ${badgeClass}">#${rankNum}</span></td>
          <td>
            <div class="leaderboard-user-cell">
              <img src="${u.avatar}" class="leaderboard-avatar" alt="Avatar" onerror="this.src='aura-logo.png'">
              <div>
                <!-- STRICT EXACT DISCORD USERNAME AS REQUESTED -->
                <strong style="color:#fff; display:block; font-size:0.95rem;">${escapeHtml(u.username)}</strong>
                <span style="color:var(--text-dim); font-size:0.75rem; font-family:var(--font-mono);">${u.userId}</span>
              </div>
            </div>
          </td>
          <td><strong style="color:#ff3366;">Level ${u.level || 1}</strong></td>
          <td style="color:#c77dff; font-weight:700;">${(u.xp || 0).toLocaleString()} XP</td>
          <td style="color:var(--text-muted);">${u.messages || 0}</td>
          <td style="text-align: right;">
            <button class="btn-aura-outline" style="padding: 0.35rem 0.8rem; font-size: 0.75rem;" onclick="viewUserProfile('${u.userId}')">
              Stats ⚡
            </button>
          </td>
        </tr>
      `;
      })
      .join("");

    renderLeaderboardPagination(lbCurrentPage, totalPages, total);
  } catch (err) {
    console.error("Leaderboard load failed:", err);
  }
}

function renderLeaderboardPagination(currPage, totalPages, totalCount) {
  const info = document.getElementById("lb-pagination-info");
  const controls = document.getElementById("lb-pagination-controls");
  if (!info || !controls) return;

  if (totalCount === 0) {
    info.innerText = "Showing 0 of 0 ranked members";
    controls.innerHTML = "";
    return;
  }

  const limitNum = lbPageSize === "all" ? totalCount : Number(lbPageSize);
  const start = Math.min((currPage - 1) * limitNum + 1, totalCount);
  const end = Math.min(currPage * limitNum, totalCount);
  info.innerText = `Showing ${start} to ${end} of ${totalCount.toLocaleString()} ranked members`;

  if (totalPages <= 1) {
    controls.innerHTML = "";
    return;
  }

  let html = "";
  html += `<button class="pagination-btn" onclick="loadLeaderboard(1)" ${currPage === 1 ? "disabled" : ""} title="First Page">«</button>`;
  html += `<button class="pagination-btn" onclick="loadLeaderboard(${currPage - 1})" ${currPage === 1 ? "disabled" : ""} title="Previous Page">‹</button>`;

  const maxPills = 5;
  let startP = Math.max(1, currPage - 2);
  let endP = Math.min(totalPages, startP + maxPills - 1);
  if (endP - startP < maxPills - 1) {
    startP = Math.max(1, endP - maxPills + 1);
  }

  for (let p = startP; p <= endP; p++) {
    html += `<button class="pagination-btn ${p === currPage ? "active" : ""}" onclick="loadLeaderboard(${p})">${p}</button>`;
  }

  html += `<button class="pagination-btn" onclick="loadLeaderboard(${currPage + 1})" ${currPage === totalPages ? "disabled" : ""} title="Next Page">›</button>`;
  html += `<button class="pagination-btn" onclick="loadLeaderboard(${totalPages})" ${currPage === totalPages ? "disabled" : ""} title="Last Page">»</button>`;

  controls.innerHTML = html;
}

function changeLeaderboardPageSize() {
  const select = document.getElementById("lb-page-size");
  if (select) {
    lbPageSize = select.value === "all" ? "all" : parseInt(select.value, 10);
    loadLeaderboard(1);
  }
}

function onLeaderboardSearch() {
  clearTimeout(lbDebounceTimer);
  lbDebounceTimer = setTimeout(() => {
    const input = document.getElementById("lb-search-input");
    lbSearchQuery = input ? input.value.trim() : "";
    loadLeaderboard(1);
  }, 250);
}

// =============================================================================
// REGISTERED & UPCOMING BIRTHDAYS EXPLORER (PAGINATED WITH SORT & ADD/REMOVE)
// =============================================================================
let bdayCurrentPage = 1;
let bdayPageSize = 10;
let bdaySearchQuery = "";
let bdayDebounceTimer = null;

async function loadBirthdays(targetPage = 1) {
  bdayCurrentPage = targetPage;
  const tbody = document.getElementById("birthdays-table-body");
  if (!tbody) return;

  try {
    const url = `/api/guild/birthdays?page=${bdayCurrentPage}&limit=${bdayPageSize}&search=${encodeURIComponent(bdaySearchQuery)}`;
    const res = await fetch(url);
    const data = await res.json();

    const list = data.birthdays || data.data || [];
    const total = data.total !== undefined ? data.total : list.length;
    const totalPages = data.totalPages || 1;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No registered birthdays found. Click "+ Add Birthday" to add one!</td></tr>`;
      renderBirthdayPagination(bdayCurrentPage, 1, 0);
      return;
    }

    tbody.innerHTML = list
      .map(
        (b) => `
      <tr>
        <td>
          <div class="leaderboard-user-cell">
            <img src="${b.avatar}" class="leaderboard-avatar" alt="Avatar" onerror="this.src='aura-logo.png'">
            <div>
              <strong style="color:#fff; display:block; font-size:0.9rem;">${escapeHtml(b.username)}</strong>
              <span style="color:var(--text-dim); font-size:0.75rem; font-family:var(--font-mono);">${b.userId}</span>
            </div>
          </div>
        </td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:#c77dff;">${escapeHtml(b.date)}</span></td>
        <td>
          <span style="background:rgba(255,105,180,0.15); color:#ff69b4; border:1px solid rgba(255,105,180,0.3); padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">
            ${escapeHtml(b.status)}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn-remove-row" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="deleteBirthday('${b.userId}')" title="Delete Birthday">✕</button>
        </td>
      </tr>
    `
      )
      .join("");

    renderBirthdayPagination(bdayCurrentPage, totalPages, total);
  } catch (err) {
    console.error("Birthdays load error:", err);
  }
}

function renderBirthdayPagination(currPage, totalPages, totalCount) {
  const info = document.getElementById("bday-pagination-info");
  const controls = document.getElementById("bday-pagination-controls");
  if (!info || !controls) return;

  if (totalCount === 0) {
    info.innerText = "Showing 0 of 0 birthdays";
    controls.innerHTML = "";
    return;
  }

  const limitNum = bdayPageSize === "all" ? totalCount : Number(bdayPageSize);
  const start = Math.min((currPage - 1) * limitNum + 1, totalCount);
  const end = Math.min(currPage * limitNum, totalCount);
  info.innerText = `Showing ${start} to ${end} of ${totalCount} birthdays`;

  if (totalPages <= 1) {
    controls.innerHTML = "";
    return;
  }

  let html = "";
  html += `<button class="pagination-btn" onclick="loadBirthdays(1)" ${currPage === 1 ? "disabled" : ""}>«</button>`;
  html += `<button class="pagination-btn" onclick="loadBirthdays(${currPage - 1})" ${currPage === 1 ? "disabled" : ""}>‹</button>`;

  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="pagination-btn ${p === currPage ? "active" : ""}" onclick="loadBirthdays(${p})">${p}</button>`;
  }

  html += `<button class="pagination-btn" onclick="loadBirthdays(${currPage + 1})" ${currPage === totalPages ? "disabled" : ""}>›</button>`;
  html += `<button class="pagination-btn" onclick="loadBirthdays(${totalPages})" ${currPage === totalPages ? "disabled" : ""}>»</button>`;

  controls.innerHTML = html;
}

function changeBirthdayPageSize() {
  const select = document.getElementById("bday-page-size");
  if (select) {
    bdayPageSize = select.value === "all" ? "all" : parseInt(select.value, 10);
    loadBirthdays(1);
  }
}

function onBirthdaySearch() {
  clearTimeout(bdayDebounceTimer);
  bdayDebounceTimer = setTimeout(() => {
    const input = document.getElementById("bday-search-input");
    bdaySearchQuery = input ? input.value.trim() : "";
    loadBirthdays(1);
  }, 250);
}

function openAddBirthdayModal() {
  const modal = document.getElementById("add-bday-modal");
  if (modal) modal.classList.add("open");
}

function closeAddBirthdayModal() {
  const modal = document.getElementById("add-bday-modal");
  if (modal) modal.classList.remove("open");
}

async function submitNewBirthday() {
  const userId = document.getElementById("modal-bday-userid")?.value.trim();
  const date = document.getElementById("modal-bday-date")?.value.trim();

  if (!userId || !date) {
    showToast("⚠️ User ID and Date (DD/MM) are required.");
    return;
  }

  try {
    const res = await fetch("/api/guild/birthdays/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "🎂 Birthday saved!");
      closeAddBirthdayModal();
      loadBirthdays(1);
    } else {
      showToast(`❌ Error: ${data.error}`);
    }
  } catch (err) {
    showToast("❌ Network error adding birthday.");
  }
}

async function deleteBirthday(userId) {
  if (!confirm(`Are you sure you want to remove birthday for user ID ${userId}?`)) return;
  try {
    const res = await fetch(`/api/guild/birthdays/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) {
      showToast("🗑️ Birthday removed.");
      loadBirthdays(bdayCurrentPage);
    }
  } catch (err) {
    showToast("❌ Could not remove birthday.");
  }
}

// =============================================================================
// GUILD CONFIG LOADER (SYNCS INITIAL STATE INTO ALL FORM FIELDS)
// =============================================================================
async function loadGuildConfig() {
  try {
    const res = await fetch("/api/guild/settings");
    const data = await res.json();

    // 1. Announcements
    if (data.announcements && data.announcements.length > 0) {
      const last = data.announcements[data.announcements.length - 1];
      if (document.getElementById("announce-channel-id")) document.getElementById("announce-channel-id").value = last.channelId || "";
      if (document.getElementById("announce-title")) document.getElementById("announce-title").value = last.title || "";
      if (document.getElementById("announce-content")) document.getElementById("announce-content").value = last.description || "";
    }

    // 2. Rules
    if (data.rules) {
      if (Array.isArray(data.rules) && data.rules.length > 0) {
        const ruleDoc = data.rules[0];
        if (ruleDoc.rules && Array.isArray(ruleDoc.rules)) {
          rulesList = ruleDoc.rules;
        }
        if (ruleDoc.channelId && document.getElementById("rules-channel-id")) {
          document.getElementById("rules-channel-id").value = ruleDoc.channelId;
        }
        if (ruleDoc.title && document.getElementById("rules-header-title")) {
          document.getElementById("rules-header-title").value = ruleDoc.title;
        }
      }
      renderRuleFields();
    } else {
      renderRuleFields();
    }

    // 3. Reaction Roles
    if (data.reactionPanels && data.reactionPanels.length > 0) {
      const panel = data.reactionPanels[0];
      if (document.getElementById("rr-channel-id")) document.getElementById("rr-channel-id").value = panel.channelId || "";
      if (document.getElementById("rr-panel-title")) document.getElementById("rr-panel-title").value = panel.title || "";
      if (document.getElementById("rr-panel-desc")) document.getElementById("rr-panel-desc").value = panel.description || "";
      if (document.getElementById("rr-one-choice")) document.getElementById("rr-one-choice").checked = Boolean(panel.oneChoice);
      if (document.getElementById("rr-access-roles")) document.getElementById("rr-access-roles").value = (panel.accessRoleIds || []).join(", ");
      if (panel.roles && Array.isArray(panel.roles)) {
        reactionRolesList = panel.roles;
      }
      renderReactionRoleRows();
    } else {
      renderReactionRoleRows();
    }

    // 4. Greetings
    if (data.greetings) {
      if (document.getElementById("cfg-welcome-channel-id")) document.getElementById("cfg-welcome-channel-id").value = data.greetings.welcomeChannelId || "";
      if (document.getElementById("cfg-welcome-title")) document.getElementById("cfg-welcome-title").value = data.greetings.welcomeTitle || "Welcome to {server}!";
      if (document.getElementById("cfg-welcome-msg")) document.getElementById("cfg-welcome-msg").value = data.greetings.welcomeMessage || "Welcome {user} to {server}!";
      if (document.getElementById("cfg-welcome-color")) document.getElementById("cfg-welcome-color").value = data.greetings.welcomeColor || "#ff2a55";
      if (document.getElementById("cfg-bye-channel-id")) document.getElementById("cfg-bye-channel-id").value = data.greetings.goodbyeChannelId || "";
      if (document.getElementById("cfg-bye-title")) document.getElementById("cfg-bye-title").value = data.greetings.goodbyeTitle || "Farewell From {server}";
      if (document.getElementById("cfg-bye-msg")) document.getElementById("cfg-bye-msg").value = data.greetings.goodbyeMessage || "{user} left the server.";
    }

    // 5. Sticky
    if (data.stickies && data.stickies.length > 0) {
      const sticky = data.stickies[0];
      if (document.getElementById("sticky-channel-id")) document.getElementById("sticky-channel-id").value = sticky.channelId || "";
      if (document.getElementById("sticky-content")) document.getElementById("sticky-content").value = sticky.text || "";
      if (document.getElementById("sticky-as-embed")) document.getElementById("sticky-as-embed").checked = sticky.asEmbed !== false;
    }

    // 6. Thread
    if (data.threadChannelId) {
      if (document.getElementById("thread-channel-id")) document.getElementById("thread-channel-id").value = data.threadChannelId;
    }

    // 7. Birthday
    if (data.birthday) {
      if (document.getElementById("bday-input-channel-id")) document.getElementById("bday-input-channel-id").value = data.birthday.inputChannelId || "";
      if (document.getElementById("bday-announce-channel-id")) document.getElementById("bday-announce-channel-id").value = data.birthday.announcementChannelId || "";
    }

    // 8. Minigames
    if (data.counting) {
      if (document.getElementById("counting-channel-id")) document.getElementById("counting-channel-id").value = data.counting.channelId || "";
      if (document.getElementById("counting-mode")) document.getElementById("counting-mode").value = data.counting.mode || "allow_chat";
    }
    if (data.wordChain) {
      if (document.getElementById("wordchain-channel-id")) document.getElementById("wordchain-channel-id").value = data.wordChain.channelId || "";
      if (document.getElementById("wordchain-starting-word")) document.getElementById("wordchain-starting-word").value = data.wordChain.lastWord || "flame";
    }

    // 9. Server Stats
    if (data.serverstats) {
      if (document.getElementById("stats-category-id")) document.getElementById("stats-category-id").value = data.serverstats.categoryId || "";
      if (document.getElementById("stats-total-channel-id")) document.getElementById("stats-total-channel-id").value = data.serverstats.totalChannelId || "";
      if (document.getElementById("stats-humans-channel-id")) document.getElementById("stats-humans-channel-id").value = data.serverstats.humansChannelId || "";
      if (document.getElementById("stats-bots-channel-id")) document.getElementById("stats-bots-channel-id").value = data.serverstats.botsChannelId || "";
    }

    // 10. Levels
    if (data.levelSettings) {
      if (document.getElementById("lvl-channel-id")) document.getElementById("lvl-channel-id").value = data.levelSettings.announcementChannelId || "";
      if (data.levelSettings.roleRewards) {
        if (document.getElementById("lvl-role-5")) document.getElementById("lvl-role-5").value = data.levelSettings.roleRewards["5"] || "";
        if (document.getElementById("lvl-role-10")) document.getElementById("lvl-role-10").value = data.levelSettings.roleRewards["10"] || "";
        if (document.getElementById("lvl-role-20")) document.getElementById("lvl-role-20").value = data.levelSettings.roleRewards["20"] || "";
        if (document.getElementById("lvl-role-50")) document.getElementById("lvl-role-50").value = data.levelSettings.roleRewards["50"] || "";
      }
    }

    // 11. Temp Voice
    if (data.tempVoice) {
      if (document.getElementById("cfg-voice-trigger-id")) document.getElementById("cfg-voice-trigger-id").value = data.tempVoice.triggerChannelId || "";
      if (document.getElementById("cfg-voice-category-id")) document.getElementById("cfg-voice-category-id").value = data.tempVoice.categoryId || "";
      if (document.getElementById("cfg-voice-default-name")) document.getElementById("cfg-voice-default-name").value = data.tempVoice.defaultName || "🔊 {user}'s Room";
    }

    // 12. Invites & Logs
    if (data.inviteChannelId && document.getElementById("cfg-invite-channel-id")) {
      document.getElementById("cfg-invite-channel-id").value = data.inviteChannelId;
    }
    if (data.moderation && document.getElementById("cfg-mod-log-id")) {
      document.getElementById("cfg-mod-log-id").value = data.moderation.logChannelId || "";
    }

    // 13. Security
    if (data.security) {
      if (document.getElementById("cfg-toggle-antiraid")) document.getElementById("cfg-toggle-antiraid").checked = data.security.antiRaid?.enabled !== false;
      if (document.getElementById("cfg-toggle-antinuke")) document.getElementById("cfg-toggle-antinuke").checked = data.security.antiNuke?.enabled !== false;
      if (document.getElementById("cfg-toggle-antispam")) document.getElementById("cfg-toggle-antispam").checked = data.security.antiSpam?.enabled !== false;
      if (document.getElementById("cfg-toggle-lockdown")) document.getElementById("cfg-toggle-lockdown").checked = Boolean(data.security.activeLockdown);
    }
  } catch (err) {
    console.error("Guild config load failed:", err);
  }
}

// =============================================================================
// DATABASE STATUS & SYNC MODAL
// =============================================================================
function openDbInfoModal() {
  const modal = document.getElementById("db-info-modal");
  if (modal) modal.classList.add("open");
  checkDbStatus();
}

function closeDbInfoModal() {
  const modal = document.getElementById("db-info-modal");
  if (modal) modal.classList.remove("open");
}

async function checkDbStatus() {
  try {
    const res = await fetch("/api/db/status");
    const data = await res.json();

    const pill = document.getElementById("nav-db-status");
    const statusText = document.getElementById("db-status-text");
    const modalStatus = document.getElementById("modal-db-status");
    const modalType = document.getElementById("modal-db-type");
    const modalEnv = document.getElementById("modal-db-env");

    if (data.connected) {
      if (statusText) statusText.innerText = "DB: MongoDB Connected";
      if (pill) {
        pill.title = "Connected to MongoDB Atlas (Live Cloud Sync Active)";
        const iconSpan = pill.querySelector("span:first-child");
        if (iconSpan) iconSpan.innerText = "🟢";
      }
      if (modalStatus) {
        modalStatus.innerText = "Connected (Live Cloud Sync)";
        modalStatus.style.color = "#00ffa6";
      }
    } else {
      if (statusText) statusText.innerText = data.uriConfigured ? "DB: Connecting..." : "DB: Local Store (Set MONGODB_URI)";
      if (pill) {
        pill.title = "Operating in local storage mode. Click to view how to connect MongoDB Atlas.";
        const iconSpan = pill.querySelector("span:first-child");
        if (iconSpan) iconSpan.innerText = "🟡";
      }
      if (modalStatus) {
        modalStatus.innerText = data.uriConfigured ? "Reconnecting to Atlas..." : "Local Storage (No MONGODB_URI set)";
        modalStatus.style.color = "#ffbb00";
      }
    }

    if (modalType) modalType.innerText = data.type || "Local Storage";
    if (modalEnv) modalEnv.innerText = data.hostEnvironment || (window.location.hostname.includes("render") ? "Render" : "Custom Host");
  } catch (err) {
    console.error("DB status check failed:", err);
  }
}

// =============================================================================
// COMMANDS CATALOG (30 COMMANDS - PAGINATED & FILTERED)
// =============================================================================
let allCommands = [];
let activeCmdCategory = "all";
let cmdSearchQuery = "";
let cmdCurrentPage = 1;
const cmdPageSize = 9;

async function loadCommands() {
  const container = document.getElementById("commands-container");
  if (!container) return;

  try {
    const res = await fetch("/api/commands");
    allCommands = await res.json();
    cmdCurrentPage = 1;
    applyCommandFilters();
  } catch (err) {
    console.error("Commands load failed:", err);
  }
}

function applyCommandFilters() {
  let filtered = allCommands;
  if (activeCmdCategory !== "all") {
    filtered = filtered.filter((c) => c.cat.toLowerCase() === activeCmdCategory.toLowerCase());
  }
  if (cmdSearchQuery) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(cmdSearchQuery) ||
        c.desc.toLowerCase().includes(cmdSearchQuery) ||
        (c.options && c.options.toLowerCase().includes(cmdSearchQuery))
    );
  }
  renderPaginatedCommands(filtered);
}

function renderPaginatedCommands(list) {
  const container = document.getElementById("commands-container");
  const info = document.getElementById("cmd-pagination-info");
  const controls = document.getElementById("cmd-pagination-controls");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:2rem;">No matching commands found.</p>`;
    if (info) info.innerText = "Showing 0 of 0 commands";
    if (controls) controls.innerHTML = "";
    return;
  }

  const total = list.length;
  const totalPages = Math.ceil(total / cmdPageSize);
  if (cmdCurrentPage > totalPages) cmdCurrentPage = totalPages;
  if (cmdCurrentPage < 1) cmdCurrentPage = 1;

  const startIdx = (cmdCurrentPage - 1) * cmdPageSize;
  const endIdx = Math.min(startIdx + cmdPageSize, total);
  const pageItems = list.slice(startIdx, endIdx);

  container.innerHTML = pageItems
    .map(
      (c) => `
    <div class="command-item-card">
      <div class="cmd-header">
        <span class="cmd-title">${escapeHtml(c.name)}</span>
        <span class="cmd-badge">${escapeHtml(c.cat)}</span>
      </div>
      <p class="cmd-desc">${escapeHtml(c.desc)}</p>
      <div class="cmd-syntax"><code>${escapeHtml(c.options || "")}</code></div>
    </div>
  `
    )
    .join("");

  if (info) {
    info.innerText = `Showing ${startIdx + 1} to ${endIdx} of ${total} commands`;
  }

  if (controls) {
    if (totalPages <= 1) {
      controls.innerHTML = "";
    } else {
      let html = "";
      html += `<button class="pagination-btn" onclick="goToCommandPage(1)" ${cmdCurrentPage === 1 ? "disabled" : ""}>«</button>`;
      html += `<button class="pagination-btn" onclick="goToCommandPage(${cmdCurrentPage - 1})" ${cmdCurrentPage === 1 ? "disabled" : ""}>‹</button>`;
      for (let p = 1; p <= totalPages; p++) {
        html += `<button class="pagination-btn ${p === cmdCurrentPage ? "active" : ""}" onclick="goToCommandPage(${p})">${p}</button>`;
      }
      html += `<button class="pagination-btn" onclick="goToCommandPage(${cmdCurrentPage + 1})" ${cmdCurrentPage === totalPages ? "disabled" : ""}>›</button>`;
      html += `<button class="pagination-btn" onclick="goToCommandPage(${totalPages})" ${cmdCurrentPage === totalPages ? "disabled" : ""}>»</button>`;
      controls.innerHTML = html;
    }
  }
}

function goToCommandPage(p) {
  cmdCurrentPage = p;
  applyCommandFilters();
}

const cmdSearch = document.getElementById("cmd-search");
if (cmdSearch) {
  cmdSearch.addEventListener("input", (e) => {
    cmdSearchQuery = e.target.value.toLowerCase().trim();
    cmdCurrentPage = 1;
    applyCommandFilters();
  });
}

document.querySelectorAll(".cat-pill-btn").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill-btn").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    activeCmdCategory = pill.dataset.cat || "all";
    cmdCurrentPage = 1;
    applyCommandFilters();
  });
});

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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const initialView = urlViewMap[currentPath] || (window.location.hash ? window.location.hash.replace("#", "") : "login");
  navigateTo(initialView, null, false);

  renderRuleFields();
  renderReactionRoleRows();
  checkAuth();
  checkDbStatus();
  loadOverview();
}

initPage();
