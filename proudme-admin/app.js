"use strict";

// Clickjacking guard. meta-CSP `frame-ancestors` is ignored per spec,
// only an HTTP header works, and GitHub Pages does not set one. Runs
// synchronously on script load before any user interaction is possible.
if (window.top !== window.self) {
  window.top.location = window.self.location;
}

// ProudMe Admin Dashboard, vanilla JS, no build step.
// Phase 1: auth state machine + idle timer + fetchAdmin helper.
//
// This is the CROSS-ORIGIN copy (GitHub Pages, proudme.org/proudme-admin):
// the API lives on Render, so the URL is hard-coded and every request relies
// on the backend's CORS allowlist including the proudme.org origin. The
// backend-served copy (server/public/admin/app.js) is same-origin and uses
// window.location.origin instead - that line is the ONLY divergence between
// the two app.js copies; keep it that way when syncing.
const BACKEND_URL = "https://proudme-backend.onrender.com";

// 30 minutes of no user interaction triggers auto-logout.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Stale-token safety: if a session sits unused for longer than the JWT
// expiry (24h hard cap from /login), treat it as gone so we never POST
// expired tokens at /logout. JWT_EXPIRY_MS mirrors server.js jwt.sign
// expiresIn '24h'.
const JWT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const SS_KEY = "proudme_admin_session";

// ---------- session storage helpers ---------------------------------------

function saveSession(token, userId, email) {
  const session = {
    token,
    userId,
    email,
    issuedAt: Date.now(),
  };
  sessionStorage.setItem(SS_KEY, JSON.stringify(session));
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token) return null;
    if (Date.now() - session.issuedAt > JWT_EXPIRY_MS) {
      sessionStorage.removeItem(SS_KEY);
      return null;
    }
    return session;
  } catch (_) {
    sessionStorage.removeItem(SS_KEY);
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SS_KEY);
}

// ---------- fetch helper --------------------------------------------------

async function fetchAdmin(path, opts) {
  opts = opts || {};
  const session = getSession();
  if (!session) {
    redirectToLogin();
    throw new Error("Not authenticated");
  }
  const url = BACKEND_URL + path;
  const headers = Object.assign(
    {
      "Authorization": "Bearer " + session.token,
      "Accept": "application/json",
    },
    opts.headers || {}
  );
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "omit",
    mode: "cors",
  });
  if (res.status === 401) {
    // Token expired or revoked. Force re-login.
    clearSession();
    redirectToLogin();
    throw new Error("Session expired");
  }
  if (res.status === 403) {
    // Logged in but not admin. Don't silently bounce; surface this.
    throw new Error("Forbidden: account is not in ADMIN_USER_IDS allowlist");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Request failed: " + res.status + " " + text.slice(0, 200));
  }
  // Some endpoints return text (e.g. /logout sends plain text). Try JSON first.
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

// ---------- redirects -----------------------------------------------------

function redirectToLogin() {
  // Stay inside /proudme-admin/, never bounce out to the marketing site.
  if (!window.location.pathname.endsWith("/index.html") &&
      !window.location.pathname.endsWith("/proudme-admin/") &&
      !window.location.pathname.endsWith("/proudme-admin")) {
    window.location.replace("index.html");
  }
}

function redirectToDashboard() {
  window.location.replace("dashboard.html");
}

// ---------- idle timer ----------------------------------------------------

// Tracked alongside the setTimeout because backgrounded tabs throttle
// setTimeout heavily (Chrome: aggressive after ~5 min, Safari sooner),
// so the timer can over-extend the session. visibilitychange below
// recovers the wall-clock truth on tab return.
let idleTimer = null;
let lastActivityAt = 0;

function resetIdleTimer() {
  lastActivityAt = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Idle expired: best-effort revoke, then bounce to login.
    logout(true);
  }, IDLE_TIMEOUT_MS);
}

function startIdleTimer() {
  const events = ["mousedown", "keydown", "touchstart", "scroll"];
  events.forEach((ev) =>
    window.addEventListener(ev, resetIdleTimer, { passive: true })
  );
  // If the tab was backgrounded long enough for the timer to be throttled
  // past the idle threshold, force-logout on return rather than letting
  // a stale session resume just because setTimeout never fired.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (lastActivityAt === 0) return;
    if (Date.now() - lastActivityAt > IDLE_TIMEOUT_MS) {
      logout(true);
    }
  });
  resetIdleTimer();
}

// ---------- auth actions --------------------------------------------------

async function login(username, password) {
  // Round 18.3: dashboard now uses dedicated /admin/login with a single
  // operator username + password (env-stored on Render), instead of the
  // regular /login email flow. The returned token carries isAdmin:true
  // and no userId. Idle timeout, sessionStorage, and the revoked-token
  // logout flow are unchanged.
  const res = await fetch(BACKEND_URL + "/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "omit",
    mode: "cors",
  });
  if (res.status === 429) {
    throw new Error("Too many sign-in attempts. Wait 15 minutes and try again.");
  }
  if (res.status === 503) {
    throw new Error("Admin login is not configured on the server.");
  }
  if (res.status === 400 || res.status === 401) {
    throw new Error("Username or password is incorrect.");
  }
  if (!res.ok) {
    throw new Error("Sign-in failed (" + res.status + "). Try again in a moment.");
  }
  const data = await res.json();
  if (!data || !data.token) {
    throw new Error("Sign-in succeeded but the response was malformed.");
  }

  // Save first so the admin-probe call below uses the new token. No
  // userId in admin-login tokens, so we stash the username as the
  // session label instead.
  saveSession(data.token, "admin", username);

  // Admin gate: confirm the token actually opens an /admin/* endpoint.
  // /admin/safety-events with limit=1 is the cheapest existing admin call.
  try {
    await fetchAdmin("/admin/safety-events?limit=1");
  } catch (err) {
    clearSession();
    if (String(err.message).includes("Forbidden")) {
      throw new Error("Account is valid but not authorized for admin access.");
    }
    throw err;
  }
}

async function logout(silent) {
  // Round 18.1 reviewer fix: shut down the status-polling interval
  // before we clear the JWT, otherwise the next tick fires a 401 that
  // triggers a redirectToLogin loop during the actual navigation.
  if (window.ProudMeAdminPanels && typeof window.ProudMeAdminPanels.stopAll === "function") {
    try { window.ProudMeAdminPanels.stopAll(); } catch (_) {}
  }
  const session = getSession();
  // Best effort: tell the server to blacklist this token. If we're already
  // expired or the network's down, we still clear locally below.
  if (session) {
    try {
      await fetch(BACKEND_URL + "/logout", {
        method: "POST",
        headers: { "Authorization": "Bearer " + session.token },
        credentials: "omit",
        mode: "cors",
      });
    } catch (_) {
      // Swallow: local clear is the real safety.
    }
  }
  clearSession();
  if (!silent) {
    redirectToLogin();
  } else {
    // Idle expiry path: redirect with a hint so the operator knows why.
    sessionStorage.setItem("proudme_admin_idle_msg", "1");
    redirectToLogin();
  }
}

// ---------- page bootstraps -----------------------------------------------

function bootLoginPage() {
  // If already logged in with a fresh-looking session, skip the form.
  const existing = getSession();
  if (existing) {
    redirectToDashboard();
    return;
  }

  // Surface idle-timeout reason if we just redirected from the dashboard.
  if (sessionStorage.getItem("proudme_admin_idle_msg")) {
    sessionStorage.removeItem("proudme_admin_idle_msg");
    const err = document.getElementById("auth-error");
    if (err) err.textContent = "Signed out after 30 minutes of inactivity.";
  }

  const form = document.getElementById("login-form");
  const btn = document.getElementById("submit-btn");
  const errEl = document.getElementById("auth-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    if (!username || !password) {
      errEl.textContent = "Username and password are required.";
      return;
    }
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Signing in…";
    try {
      await login(username, password);
      redirectToDashboard();
    } catch (err) {
      errEl.textContent = err.message || "Sign-in failed.";
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

async function bootDashboardPage() {
  const session = getSession();
  if (!session) {
    redirectToLogin();
    return;
  }

  // Render the logged-in email (safe: came from the user's own form).
  const emailEl = document.getElementById("user-email");
  if (emailEl) emailEl.textContent = "· " + session.email;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logout(false));
  }

  startIdleTimer();

  // Auth probe: confirm /admin/* is reachable with this token. Only on
  // success do we mount the Phase 2+ panels (no point rendering audit
  // tables if the operator isn't in ADMIN_USER_IDS). /admin/system-status
  // doubles as the probe since it's the cheapest admin call and its
  // payload populates the System Status card on the same round-trip.
  const statusGrid = document.getElementById("status-grid");
  try {
    const data = await fetchAdmin("/admin/system-status");
    if (window.ProudMeAdminPanels) {
      window.ProudMeAdminPanels.mountAll(data);
    }
  } catch (err) {
    if (statusGrid) {
      statusGrid.replaceChildren();
      const tile = document.createElement("div");
      tile.className = "status-tile status-tile--err";
      tile.textContent = "✗ " + (err.message || "Probe failed.");
      statusGrid.appendChild(tile);
    }
    // Other panels stay unmounted on probe failure. Don't reveal what
    // would have been there if the operator isn't authorized.
  }
}

// ---------- entry point ---------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("auth-page")) {
    bootLoginPage();
  } else if (document.body.classList.contains("dash-page")) {
    bootDashboardPage();
  }
});

// Expose a minimal API for later phases. Each phase will add panel
// renderers that consume fetchAdmin() and append into dashboard.html.
window.ProudMeAdmin = {
  fetchAdmin,
  getSession,
  logout,
};
