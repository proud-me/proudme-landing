"use strict";

// Phase 2 audit panels: AI safety events + contact submissions.
// Each panel reuses the shared filter-chip + load-more pattern below.
// R50: the counselor dispatch queue panel was removed from the frontend;
// the backend dispatch engine and /admin/notification-dispatches endpoint
// remain untouched.

// ---------- CSV download helper (Phase 7) --------------------------------

async function downloadAdminCsv(endpoint, filters) {
  try {
    const q = new URLSearchParams();
    if (filters) {
      for (const k of Object.keys(filters)) {
        const v = filters[k];
        if (v != null && v !== "") q.set(k, String(v));
      }
    }
    q.set("format", "csv");
    q.set("limit", "200");
    const csvText = await window.ProudMeAdmin.fetchAdmin(endpoint + "?" + q.toString());
    // fetchAdmin returns text when content-type isn't application/json,
    // so for CSV we already have a string here. Wrap in a Blob and
    // simulate a download via a hidden anchor tag.
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Filename comes from the endpoint path; backend's Content-Disposition
    // is the authoritative source but a same-origin <a download> uses the
    // anchor attr when the response is fetched (not navigated to).
    const stamp = new Date().toISOString().slice(0, 10);
    const tail = endpoint.split("/").filter(Boolean).pop() || "export";
    a.download = `${tail}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  } catch (err) {
    alert("CSV download failed: " + (err.message || "unknown"));
  }
}

// Camp EMA study (2026-06-19): cohort research export. Separate from
// downloadAdminCsv because that helper hard-caps limit=200 (a roster page
// size) which would silently truncate a study pull; the study-data endpoint
// caps server-side at 50k rows instead, so we don't pass a limit here.
//   dataset "behaviors" -> 4 behaviors + reflections + AI feedback
//   dataset "chat"      -> Pebble chat (voice turns land here as text)
async function downloadStudyData(dataset, sinceISO) {
  try {
    const q = new URLSearchParams();
    q.set("dataset", dataset);
    q.set("format", "csv");
    if (sinceISO) q.set("since", sinceISO);
    const csvText = await window.ProudMeAdmin.fetchAdmin(
      "/admin/export/study-data?" + q.toString()
    );
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `study-${dataset}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  } catch (err) {
    alert("Study-data download failed: " + (err.message || "unknown"));
  }
}

// ---------- DOM helpers ---------------------------------------------------

// Creates an element with optional attrs, dataset, and children. Never
// accepts innerHTML from server data, only text nodes via the children
// array. Reviewer-noted constraint: SafetyEvent and ContactMessage
// rows include free-form fields (subject, body, categories[], etc.) that
// must render as text, not HTML.
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      if (k === "class") node.className = attrs[k];
      else if (k === "dataset") {
        for (const dk of Object.keys(attrs.dataset)) node.dataset[dk] = attrs.dataset[dk];
      } else if (k.startsWith("on") && typeof attrs[k] === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] != null) {
        node.setAttribute(k, attrs[k]);
      }
    }
  }
  if (children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

function fmtTs(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  // Central time is the canonical research clock per server.js cron + audit
  // (workdone Round 16 Item A). Render in CT so the dashboard matches the
  // counselor digest emails the operator sees.
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtCategories(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "—";
  return arr.join(", ");
}

function shortenId(id) {
  if (!id) return "—";
  const s = String(id);
  return s.length > 10 ? s.slice(-8) : s;
}

// Round 18.4: render snake_case backend enum values (e.g. "crisis_response",
// "skipped_no_recipient", "in_app") as proper sentence case ("Crisis response",
// "Skipped no recipient", "In-app") so the table cells match the rest of the
// dashboard's copy style instead of leaking raw DB enum strings.
function prettify(s) {
  if (s == null) return "—";
  const str = String(s);
  if (!str) return "—";
  return str
    .replace(/_/g, " ")
    .replace(/\b[a-z]/, (c) => c.toUpperCase());
}

// ---------- Shared panel scaffold -----------------------------------------

// Filter spec:
//   { key: "action", label: "Action", options: [{value, label}], group: "exclusive" }
// where the "All" option is appended automatically as value=null.
// Date range is rendered separately; userId is a free-text ObjectId field.

function createAuditPanel(spec) {
  const root = document.getElementById(spec.mountId);
  if (!root) return;

  const state = {
    filters: {},
    offset: 0,
    limit: 50,
    rows: [],
    loading: false,
    error: null,
    hasMore: false,
    // Monotonically incrementing request sequence. Each fetchPage() snapshots
    // it and bails if the global value has advanced past the snapshot, so a
    // slow earlier response can't overwrite a faster later one (operator
    // rapid-flipping filter chips).
    reqSeq: 0,
  };

  // --- header ---
  const headerBadge = el("span", { class: "panel-badge", hidden: "" });
  const headerActions = el("div", { class: "panel__actions" });
  if (spec.endpoint) {
    headerActions.appendChild(el("button", {
      class: "btn btn--ghost btn--small",
      type: "button",
      onClick: () => downloadAdminCsv(spec.endpoint, state.filters),
      title: "Download the current filter view as CSV",
    }, ["Download CSV"]));
  }
  headerActions.appendChild(el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    onClick: () => refresh(),
    // Round 18.4: hover tooltip explaining manual-only policy so the
    // operator does not wonder why this panel is not updating on its
    // own like System Status does.
    title: "Manual refresh only. System Status polls automatically every 30s; other panels stay manual to keep Render free-tier compute low.",
  }, ["Refresh"]));
  const header = el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, [spec.title]),
      headerBadge,
      // Round 18.4: small inline hint that this panel does not
      // auto-update. Keeps the operator from staring at stale data
      // wondering why nothing is moving.
      el("span", { class: "panel__hint" }, ["Manual refresh only"]),
    ]),
    headerActions,
  ]);

  function updateHeaderBadge() {
    if (!spec.headerBadge) return;
    const text = spec.headerBadge(state.rows);
    if (text) {
      headerBadge.textContent = text;
      headerBadge.removeAttribute("hidden");
    } else {
      headerBadge.setAttribute("hidden", "");
    }
  }

  // --- filters ---
  const filterRow = el("div", { class: "filters" });

  for (const filter of spec.filters) {
    const group = el("div", { class: "filter-group" }, [
      el("span", { class: "filter-group__label" }, [filter.label]),
    ]);
    const chips = el("div", { class: "chips" });
    const options = [{ value: null, label: "All" }, ...filter.options];
    for (const opt of options) {
      const chip = el("button", {
        class: "chip",
        type: "button",
        dataset: { value: opt.value == null ? "" : String(opt.value) },
        onClick: () => {
          state.filters[filter.key] = opt.value;
          for (const c of chips.querySelectorAll(".chip")) c.classList.remove("chip--active");
          chip.classList.add("chip--active");
          state.offset = 0;
          state.rows = [];
          fetchPage();
        },
      }, [opt.label]);
      if (opt.value == null) chip.classList.add("chip--active");
      chips.appendChild(chip);
    }
    group.appendChild(chips);
    filterRow.appendChild(group);
  }

  // Date range (since/until)
  const dateGroup = el("div", { class: "filter-group filter-group--date" }, [
    el("span", { class: "filter-group__label" }, ["Date range"]),
    el("div", { class: "date-range" }, [
      el("label", null, [
        el("span", { class: "date-range__label" }, ["From"]),
        (() => {
          const input = el("input", { type: "datetime-local" });
          input.addEventListener("change", () => {
            state.filters.since = input.value ? new Date(input.value).toISOString() : null;
            state.offset = 0;
            state.rows = [];
            fetchPage();
          });
          return input;
        })(),
      ]),
      el("label", null, [
        el("span", { class: "date-range__label" }, ["To"]),
        (() => {
          const input = el("input", { type: "datetime-local" });
          input.addEventListener("change", () => {
            state.filters.until = input.value ? new Date(input.value).toISOString() : null;
            state.offset = 0;
            state.rows = [];
            fetchPage();
          });
          return input;
        })(),
      ]),
    ]),
  ]);
  filterRow.appendChild(dateGroup);

  // userId filter (free text, validated client-side)
  const userIdGroup = el("div", { class: "filter-group filter-group--text" }, [
    el("span", { class: "filter-group__label" }, ["User ID"]),
    (() => {
      const input = el("input", {
        type: "text",
        placeholder: "24-char ObjectId",
        maxlength: "24",
        class: "filter-input",
      });
      const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(s);
      let debounce = null;
      input.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const v = input.value.trim();
          if (v === "") {
            state.filters.userId = null;
          } else if (!isObjectId(v)) {
            return; // wait for valid input, don't fetch garbage
          } else {
            state.filters.userId = v;
          }
          state.offset = 0;
          state.rows = [];
          fetchPage();
        }, 400);
      });
      return input;
    })(),
  ]);
  filterRow.appendChild(userIdGroup);

  // --- table ---
  const table = el("table", { class: "audit-table" });
  const thead = el("thead", null, [
    el("tr", null, spec.columns.map((c) => el("th", null, [c.label]))),
  ]);
  const tbody = el("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);

  // --- footer ---
  const footer = el("div", { class: "panel__foot" });
  const statusEl = el("span", { class: "audit-status" });
  const loadMoreBtn = el("button", {
    class: "btn btn--ghost",
    type: "button",
    onClick: () => {
      state.offset += state.limit;
      fetchPage(true);
    },
  }, ["Load more"]);
  footer.appendChild(statusEl);
  footer.appendChild(loadMoreBtn);

  // Mount
  root.classList.add("panel");
  root.appendChild(header);
  root.appendChild(filterRow);
  root.appendChild(el("div", { class: "table-wrap" }, [table]));
  root.appendChild(footer);

  // --- render helpers ---
  function renderRows() {
    tbody.replaceChildren();
    if (state.rows.length === 0 && !state.loading) {
      const td = el("td", { colspan: String(spec.columns.length), class: "audit-empty" }, [
        state.error ? "Error: " + state.error : `No ${spec.emptyLabel} match these filters.`,
      ]);
      tbody.appendChild(el("tr", null, [td]));
      return;
    }
    for (const row of state.rows) {
      const tr = el("tr", {
        class: "audit-row",
        tabindex: "0",
        role: "button",
        "aria-expanded": "false",
        "aria-label": "Expand row details",
      });
      for (const col of spec.columns) {
        const value = col.render ? col.render(row) : row[col.key];
        tr.appendChild(el("td", null, [value == null ? "—" : String(value)]));
      }
      const toggle = () => {
        const next = tr.nextSibling;
        if (next && next.classList && next.classList.contains("audit-detail")) {
          next.remove();
          tr.classList.remove("audit-row--expanded");
          tr.setAttribute("aria-expanded", "false");
        } else {
          tr.classList.add("audit-row--expanded");
          tr.setAttribute("aria-expanded", "true");
          tr.parentNode.insertBefore(renderDetail(row), tr.nextSibling);
        }
      };
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
      tbody.appendChild(tr);
    }
  }

  function renderDetail(row) {
    const fields = spec.detailFields(row);
    const dl = el("dl", { class: "audit-detail__list" });
    for (const [k, v] of fields) {
      dl.appendChild(el("dt", null, [k]));
      // Multi-line body fields render as <pre> so newlines survive.
      if (k === "Body" || k === "Message") {
        dl.appendChild(el("dd", null, [
          el("pre", { class: "audit-detail__pre" }, [v == null ? "—" : String(v)]),
        ]));
      } else {
        dl.appendChild(el("dd", null, [v == null ? "—" : String(v)]));
      }
    }
    const children = [dl];
    if (typeof spec.detailActions === "function") {
      const actions = spec.detailActions(row, { refresh });
      if (actions && actions.length > 0) {
        const actionRow = el("div", { class: "audit-detail__actions" });
        for (const a of actions) {
          actionRow.appendChild(el("button", {
            class: "btn btn--small " + (a.primary ? "btn--primary" : "btn--ghost"),
            type: "button",
            onClick: a.onClick,
          }, [a.label]));
        }
        children.push(actionRow);
      }
    }
    return el("tr", { class: "audit-detail" }, [
      el("td", { colspan: String(spec.columns.length) }, children),
    ]);
  }

  function renderStatus() {
    if (state.loading) {
      statusEl.textContent = "Loading…";
      loadMoreBtn.disabled = true;
      loadMoreBtn.style.display = "none";
      return;
    }
    if (state.error) {
      statusEl.textContent = "Error.";
      loadMoreBtn.disabled = false;
      loadMoreBtn.style.display = "none";
      return;
    }
    const showing = state.rows.length;
    const suffix = state.hasMore ? " (more available)" : "";
    statusEl.textContent = showing === 0 ? "" : `Showing ${showing}${suffix}`;
    loadMoreBtn.style.display = state.hasMore ? "" : "none";
    loadMoreBtn.disabled = false;
  }

  // --- fetch ---
  async function fetchPage(append) {
    const seq = ++state.reqSeq;
    state.loading = true;
    state.error = null;
    if (!append) {
      tbody.replaceChildren();
    }
    renderStatus();
    try {
      const q = new URLSearchParams();
      for (const k of Object.keys(state.filters)) {
        const v = state.filters[k];
        if (v != null && v !== "") q.set(k, String(v));
      }
      q.set("limit", String(state.limit));
      if (state.offset > 0) q.set("offset", String(state.offset));
      const data = await window.ProudMeAdmin.fetchAdmin(
        spec.endpoint + "?" + q.toString()
      );
      // Stale response, a newer fetchPage() has fired since we started.
      // Drop this result, the in-flight request will repaint.
      if (seq !== state.reqSeq) return;
      const newRows = data[spec.responseKey] || [];
      state.rows = append ? state.rows.concat(newRows) : newRows;
      state.hasMore = data.hasMore === true;
      state.loading = false;
      renderRows();
      renderStatus();
      updateHeaderBadge();
    } catch (err) {
      if (seq !== state.reqSeq) return;
      state.loading = false;
      state.error = err.message || "Request failed.";
      renderRows();
      renderStatus();
    }
  }

  function refresh() {
    state.offset = 0;
    state.rows = [];
    fetchPage();
  }

  // Initial load
  fetchPage();
}

// ---------- Panel specs ---------------------------------------------------

const SAFETY_PANEL = {
  mountId: "safety-panel",
  title: "AI Safety Audit",
  endpoint: "/admin/safety-events",
  responseKey: "events",
  emptyLabel: "safety events",
  filters: [
    {
      key: "action",
      label: "Action",
      options: [
        { value: "crisis_response", label: "Crisis" },
        { value: "harmful_redirect", label: "Redirect" },
        { value: "output_swapped", label: "Output swapped" },
        { value: "moderation_degraded", label: "Mod degraded" },
      ],
    },
    {
      key: "source",
      label: "Source",
      options: [
        { value: "input", label: "Input" },
        { value: "output", label: "Output" },
      ],
    },
    {
      key: "endpoint",
      label: "Endpoint",
      options: [
        { value: "chat_session", label: "Chat session" },
        { value: "chatbot", label: "Chatbot" },
        { value: "chatbot_screentime", label: "Screen-time" },
      ],
    },
  ],
  columns: [
    { key: "timestamp", label: "When (CT)", render: (r) => fmtTs(r.timestamp) },
    { key: "action", label: "Action", render: (r) => prettify(r.action) },
    { key: "source", label: "Source", render: (r) => prettify(r.source) },
    { key: "endpoint", label: "Endpoint", render: (r) => prettify(r.endpoint) },
    { key: "userId", label: "User", render: (r) => shortenId(r.userId) },
    { key: "categories", label: "Categories", render: (r) => fmtCategories(r.categories) },
  ],
  detailFields: (r) => [
    ["Full user ID", r.userId],
    ["Session ID", r.sessionId],
    ["Categories", fmtCategories(r.categories)],
    ["Timestamp (ISO)", r.timestamp],
  ],
};

// Contact-specific helpers. Defense against mailto header injection
// (Outlook desktop historically decodes %0A in `subject=` into a literal
// newline that some clients then parse as a header continuation, e.g.
// `\nBcc: attacker@example.com`). Body is intentionally newline-tolerant
// per RFC 6068 (multi-line bodies are the spec'd use case), so the body
// segment doesn't need control-char stripping, just encodeURIComponent.
function stripCtrl(s) {
  return String(s || "").replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ");
}

function buildReplyMailto(row) {
  const cleanTo = stripCtrl(row.fromEmail).slice(0, 320);
  const cleanSubject =
    "Re: " + stripCtrl(row.subject || row.topic || "ProudMe contact").slice(0, 200);
  const to = encodeURIComponent(cleanTo);
  const subject = encodeURIComponent(cleanSubject);
  const quoted = (row.body || "")
    .split("\n")
    .map((line) => "> " + line)
    .join("\n");
  const bodyText =
    "Hi" + (row.fromName ? " " + stripCtrl(row.fromName) : "") + ",\n\n\n\n" +
    "On " + new Date(row.createdAt).toString() + " you wrote:\n" +
    quoted;
  const body = encodeURIComponent(bodyText);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

async function setContactStatus(row, nextStatus, refresh) {
  try {
    await window.ProudMeAdmin.fetchAdmin("/admin/contact-messages/" + row._id, {
      method: "PATCH",
      body: { status: nextStatus },
    });
    refresh();
  } catch (err) {
    alert("Couldn't update status: " + (err.message || "request failed"));
  }
}

const CONTACT_PANEL = {
  mountId: "contact-panel",
  title: "Contact Submissions",
  endpoint: "/admin/contact-messages",
  responseKey: "messages",
  emptyLabel: "contact messages",
  filters: [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "new", label: "New" },
        { value: "read", label: "Read" },
        { value: "archived", label: "Archived" },
      ],
    },
    {
      key: "source",
      label: "Source",
      options: [
        { value: "landing", label: "Landing" },
        { value: "in_app", label: "In-app" },
      ],
    },
  ],
  columns: [
    { key: "createdAt", label: "Received (CT)", render: (r) => fmtTs(r.createdAt) },
    { key: "source", label: "Source", render: (r) => prettify(r.source) },
    { key: "fromName", label: "From", render: (r) => r.fromName || r.fromEmail || "—" },
    { key: "topic", label: "Topic", render: (r) => prettify(r.topic) },
    { key: "subject", label: "Subject", render: (r) => r.subject || "—" },
    { key: "status", label: "Status", render: (r) => prettify(r.status) },
  ],
  detailFields: (r) => [
    ["From email", r.fromEmail],
    ["From name", r.fromName],
    ["User ID", r.userId],
    ["Topic", r.topic],
    ["Subject", r.subject],
    ["Body", r.body],
    ["Email dispatched", r.emailDispatched ? "Yes" : "No"],
    ["Received (ISO)", r.createdAt],
    ["IP (forensics)", r.ip],
    ["User agent", r.userAgent],
  ],
  detailActions: (r, panel) => {
    const acts = [];
    if (r.status === "new") {
      acts.push({
        label: "Mark as read",
        primary: false,
        onClick: () => setContactStatus(r, "read", panel.refresh),
      });
    }
    if (r.status !== "archived") {
      acts.push({
        label: "Archive",
        primary: false,
        onClick: () => setContactStatus(r, "archived", panel.refresh),
      });
    }
    if (r.status === "archived") {
      acts.push({
        label: "Reopen",
        primary: false,
        onClick: () => setContactStatus(r, "read", panel.refresh),
      });
    }
    acts.push({
      label: "Reply via email",
      primary: true,
      onClick: () => {
        // Round 18.1 reviewer fix: window.location.href = "mailto:..."
        // unloads the dashboard while the OS handler fires, so the
        // operator loses their table state. window.open with target
        // _blank + noopener fires the mail handler without navigating
        // the current window. noopener also blocks Window.opener
        // back-references just in case anything weird is registered as
        // the mailto handler.
        window.open(buildReplyMailto(r), "_blank", "noopener");
      },
    });
    return acts;
  },
  headerBadge: (rows) => {
    const unread = rows.filter((r) => r.status === "new").length;
    return unread > 0 ? `${unread} new` : "";
  },
};

// ---------- System Status panel (Phase 3) --------------------------------

const STATUS_POLL_MS = 30 * 1000;

function fmtUptime(seconds) {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusTile(label, value, kind) {
  return el("div", { class: "status-tile" + (kind ? " status-tile--" + kind : "") }, [
    el("span", { class: "status-tile__label" }, [label]),
    el("span", { class: "status-tile__value" }, [value]),
  ]);
}

function renderStatus(data) {
  const grid = document.getElementById("status-grid");
  if (!grid) return;
  grid.replaceChildren();

  // Lead with the binary health signals operator wants at-a-glance.
  grid.appendChild(statusTile(
    "Mongo",
    data.mongoConnected ? "Connected" : "Disconnected",
    data.mongoConnected ? "ok" : "err"
  ));
  grid.appendChild(statusTile(
    "Last process error",
    data.lastProcessErrorAt ? new Date(data.lastProcessErrorAt).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "None",
    data.lastProcessErrorAt ? "warn" : "ok"
  ));
  grid.appendChild(statusTile("Uptime", fmtUptime(data.uptime), ""));
  grid.appendChild(statusTile("Version", data.renderVersion ? String(data.renderVersion).slice(0, 7) : "—", ""));

  // Counts.
  grid.appendChild(statusTile(
    "Registered users",
    data.registeredUsers == null ? "—" : String(data.registeredUsers),
    ""
  ));
  grid.appendChild(statusTile(
    "Safety events 24h",
    data.activeSafetyEvents24h == null ? "—" : String(data.activeSafetyEvents24h),
    data.activeSafetyEvents24h > 0 ? "warn" : ""
  ));
  // R50: "Queued dispatches" tile removed with the dispatch panel; the
  // status payload still returns queuedDispatches and it is intentionally
  // ignored here.
  grid.appendChild(statusTile(
    "Unread contact",
    data.unreadContactMessages == null ? "—" : String(data.unreadContactMessages),
    data.unreadContactMessages > 0 ? "warn" : ""
  ));
  const usage = data.dailyAiUsageToday || {};
  grid.appendChild(statusTile(
    "AI tokens today",
    typeof usage.totalTokens === "number" ? usage.totalTokens.toLocaleString() : "—",
    ""
  ));

  const refreshedEl = document.getElementById("status-refreshed");
  if (refreshedEl) {
    refreshedEl.textContent = "Updated " + fmtTs(data.serverTime || new Date().toISOString());
    refreshedEl.removeAttribute("hidden");
  }
}

let statusPollTimer = null;
// Monotonic request sequence so rapid hide/show flips can't have a
// later-issued fetch overwritten by an earlier resolved one. Same
// pattern as the audit panels' state.reqSeq.
let statusReqSeq = 0;

async function pollStatus() {
  const seq = ++statusReqSeq;
  try {
    const data = await window.ProudMeAdmin.fetchAdmin("/admin/system-status");
    if (seq !== statusReqSeq) return;
    renderStatus(data);
  } catch (err) {
    if (seq !== statusReqSeq) return;
    const grid = document.getElementById("status-grid");
    if (grid) {
      grid.replaceChildren();
      const tile = el("div", { class: "status-tile status-tile--err" }, [
        "Status fetch failed: " + (err.message || "unknown"),
      ]);
      grid.appendChild(tile);
    }
  }
}

// Named handler + idempotent registration so a future re-mountAll()
// (session refresh, etc.) can't stack visibilitychange listeners.
let visListenerBound = false;
function onStatusVisibilityChange() {
  if (document.visibilityState === "visible") pollStatus();
}

function startStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(() => {
    // Pause polling while backgrounded so we don't burn Render free-tier
    // budget on a tab nobody is looking at.
    if (document.visibilityState === "visible") pollStatus();
  }, STATUS_POLL_MS);
  if (!visListenerBound) {
    document.addEventListener("visibilitychange", onStatusVisibilityChange);
    visListenerBound = true;
  }
}

// Round 18.1 reviewer fix: app.js logout() previously cleared the
// session but never stopped this interval, so the timer kept firing
// /admin/system-status, kept getting 401 because the token was now
// revoked, and the fetchAdmin 401 handler kept calling
// redirectToLogin in a tight loop until navigation actually landed.
// Exposed on window.ProudMeAdmin so app.js can call it from logout().
function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  if (visListenerBound) {
    document.removeEventListener("visibilitychange", onStatusVisibilityChange);
    visListenerBound = false;
  }
  // Bump the seq so any in-flight pollStatus() resolves into the
  // discard branch (seq !== statusReqSeq) instead of touching the DOM
  // after logout.
  statusReqSeq++;
}

// ---------- Activity Analytics (Phase 4) ---------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
  }
  if (children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

// Bar chart for time-of-day. 24 bins, x-axis is the hour (0-23), y-axis
// is heartbeat count. Renders 4 y-axis tick lines for scale reference.
function renderTimeOfDayChart(container, histogram) {
  container.replaceChildren();
  const values = [];
  for (let h = 0; h < 24; h++) values.push(histogram[String(h)] || 0);
  const total = values.reduce((s, v) => s + v, 0);

  const W = 800;
  const H = 220;
  const padL = 36, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...values);

  // Round max up to next "nice" number for axis labels.
  const niceMax = (function () {
    if (max <= 5) return Math.ceil(max);
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const norm = max / mag;
    if (norm <= 1) return mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
  })();

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "Heartbeat count by hour of day",
    class: "chart-svg",
  });

  // Y-axis grid + labels (4 ticks).
  for (let i = 0; i <= 4; i++) {
    const y = padT + innerH - (innerH * i) / 4;
    const v = Math.round((niceMax * i) / 4);
    svg.appendChild(svgEl("line", {
      x1: padL, y1: y, x2: W - padR, y2: y,
      stroke: "rgba(60, 50, 147, 0.08)", "stroke-width": 1,
    }));
    svg.appendChild(svgEl("text", {
      x: padL - 6, y: y + 4, "text-anchor": "end",
      "font-size": 10, fill: "#8B88A8",
    }, [String(v)]));
  }

  // Bars.
  const barW = innerW / 24;
  for (let h = 0; h < 24; h++) {
    const v = values[h];
    const barH = (v / niceMax) * innerH;
    const x = padL + h * barW;
    const y = padT + innerH - barH;
    svg.appendChild(svgEl("rect", {
      x: x + 2, y: y, width: Math.max(0, barW - 4), height: barH,
      fill: "#5040AE", rx: 2, ry: 2,
    }, [svgEl("title", null, [`${h}:00 (CT) — ${v} heartbeat${v === 1 ? "" : "s"}`])]));
    // X labels every 4 hours.
    if (h % 4 === 0) {
      svg.appendChild(svgEl("text", {
        x: x + barW / 2, y: H - 8, "text-anchor": "middle",
        "font-size": 10, fill: "#8B88A8",
      }, [String(h)]));
    }
  }

  container.appendChild(svg);
  container.appendChild(el("p", { class: "chart-card__caption" }, [
    total === 0
      ? "No heartbeats yet. The Flutter app posts /session/heartbeat once per minute while foregrounded; this chart fills in after deploy."
      : `${total.toLocaleString()} heartbeats over the last 7 days.`,
  ]));
}

// Line chart for daily behavior compliance. 7 data points, x-axis is
// the date (M/D), y-axis is the percentage of registered users who
// logged at least one Behavior that day.
function renderComplianceChart(container, data) {
  container.replaceChildren();
  const points = data.last7Days || [];
  const today = data.todayCompliance || {};

  // Big-number callout on top.
  const pct = Math.round((today.rate || 0) * 100);
  const callout = el("div", { class: "chart-card__callout" }, [
    el("span", { class: "chart-card__callout-num" }, [`${pct}%`]),
    el("span", { class: "chart-card__callout-sub" }, [
      `${today.submitted || 0} of ${today.registered || 0} students logged behaviors today`,
    ]),
  ]);
  container.appendChild(callout);

  if (points.length < 2) {
    container.appendChild(el("p", { class: "chart-card__caption" }, [
      "Need at least 2 days of data to draw the trend line.",
    ]));
    return;
  }

  const W = 380;
  const H = 140;
  const padL = 30, padR = 12, padT = 14, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "Daily compliance rate, last 7 days",
    class: "chart-svg",
  });

  // Y-axis grid + labels at 0/50/100%.
  for (const p of [0, 50, 100]) {
    const y = padT + innerH - (innerH * p) / 100;
    svg.appendChild(svgEl("line", {
      x1: padL, y1: y, x2: W - padR, y2: y,
      stroke: "rgba(60, 50, 147, 0.08)", "stroke-width": 1,
    }));
    svg.appendChild(svgEl("text", {
      x: padL - 4, y: y + 3, "text-anchor": "end",
      "font-size": 9, fill: "#8B88A8",
    }, [p + "%"]));
  }

  // Polyline of rates.
  const stepX = innerW / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (innerH * (p.rate || 0));
    return { x, y, rate: p.rate, date: p.date };
  });
  svg.appendChild(svgEl("polyline", {
    fill: "none",
    stroke: "#5040AE",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    points: coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" "),
  }));
  // Dots + tooltips + x-labels.
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    svg.appendChild(svgEl("circle", {
      cx: c.x, cy: c.y, r: 3, fill: "#5040AE",
    }, [svgEl("title", null, [`${c.date} — ${Math.round(c.rate * 100)}%`])]));
    if (i === 0 || i === coords.length - 1 || i % 2 === 0) {
      const short = String(c.date).split("/").slice(0, 2).join("/");
      svg.appendChild(svgEl("text", {
        x: c.x, y: H - 6, "text-anchor": "middle",
        "font-size": 9, fill: "#8B88A8",
      }, [short]));
    }
  }

  container.appendChild(svg);
}

// Big stat card for session duration P50/P95.
function renderDurationCard(container, data) {
  container.replaceChildren();
  const d = data || {};
  const sessionCount = d.sessionCount || 0;
  const shortVisits = d.shortVisits || 0;
  if (sessionCount === 0 && shortVisits === 0) {
    container.appendChild(el("p", { class: "chart-card__caption chart-card__caption--big" }, [
      "No sessions captured yet. Heartbeats kick in after the Flutter app ships the /session/heartbeat call.",
    ]));
    return;
  }
  container.appendChild(el("div", { class: "duration-stats" }, [
    el("div", { class: "duration-stat" }, [
      el("span", { class: "duration-stat__num" }, [`${d.p50Minutes != null ? d.p50Minutes : "—"}`]),
      el("span", { class: "duration-stat__unit" }, ["min"]),
      el("span", { class: "duration-stat__label" }, ["P50 (median)"]),
    ]),
    el("div", { class: "duration-stat" }, [
      el("span", { class: "duration-stat__num" }, [`${d.p95Minutes != null ? d.p95Minutes : "—"}`]),
      el("span", { class: "duration-stat__unit" }, ["min"]),
      el("span", { class: "duration-stat__label" }, ["P95"]),
    ]),
  ]));
  const captionParts = [`${sessionCount.toLocaleString()} session${sessionCount === 1 ? "" : "s"}`];
  if (shortVisits > 0) {
    captionParts.push(`${shortVisits.toLocaleString()} brief visit${shortVisits === 1 ? "" : "s"}`);
  }
  container.appendChild(el("p", { class: "chart-card__caption" }, [
    captionParts.join(" + ") + " over the last 7 days. Brief visits = a single heartbeat (likely < 1 min, excluded from P50/P95 to avoid bias)."
  ]));
}

async function loadAnalytics() {
  const usageEl = document.getElementById("chart-tod");
  const durationEl = document.getElementById("chart-duration");
  const complianceEl = document.getElementById("chart-compliance");
  const windowLabel = document.getElementById("analytics-window-label");

  const setLoading = (containerEl) => {
    if (!containerEl) return;
    const body = containerEl.querySelector(".chart-card__body");
    if (body) {
      body.replaceChildren();
      body.classList.add("chart-card__body--placeholder");
      body.textContent = "Loading…";
    }
  };
  setLoading(usageEl);
  setLoading(durationEl);
  setLoading(complianceEl);

  const renderError = (containerEl, msg) => {
    if (!containerEl) return;
    const body = containerEl.querySelector(".chart-card__body");
    if (body) {
      body.replaceChildren();
      body.classList.remove("chart-card__body--placeholder");
      body.appendChild(el("p", { class: "chart-card__caption chart-card__caption--err" }, [msg]));
    }
  };
  const renderInto = (containerEl, fn) => {
    if (!containerEl) return;
    const body = containerEl.querySelector(".chart-card__body");
    if (body) {
      body.classList.remove("chart-card__body--placeholder");
      fn(body);
    }
  };

  const [usageR, complianceR] = await Promise.all([
    window.ProudMeAdmin.fetchAdmin("/admin/analytics/usage").then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e })
    ),
    window.ProudMeAdmin.fetchAdmin("/admin/analytics/compliance").then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e })
    ),
  ]);

  if (usageR.ok) {
    renderInto(usageEl, (body) => renderTimeOfDayChart(body, usageR.v.timeOfDayHistogram || {}));
    renderInto(durationEl, (body) => renderDurationCard(body, usageR.v.sessionDurationP50P95 || {}));
    if (windowLabel) windowLabel.textContent = "· last " + (usageR.v.windowDays || 7) + " days";
  } else {
    renderError(usageEl, "Failed to load usage analytics: " + (usageR.e.message || "unknown"));
    renderError(durationEl, "Failed to load usage analytics.");
  }

  if (complianceR.ok) {
    renderInto(complianceEl, (body) => renderComplianceChart(body, complianceR.v));
  } else {
    renderError(complianceEl, "Failed to load compliance analytics: " + (complianceR.e.message || "unknown"));
  }
}

function mountAnalytics() {
  const refreshBtn = document.getElementById("analytics-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAnalytics());
  loadAnalytics();
}

// ---------- Registered Students Roster (Phase 5) -------------------------

// Status badge logic. The plan asks for:
//   green  -> logged in today AND submitted behavior today
//   yellow -> logged in today, no behavior submitted
//   orange -> last active in last 7 days, not today
//   red    -> last active > 7 days ago, or never
// Plus a special "never" tile color (same as red) for users without
// any SessionEvent at all in the 90-day window.
function classifyStudent(row, nowMs) {
  const last = row.lastLoginAt ? new Date(row.lastLoginAt).getTime() : null;
  const submitted = !!row.todaySubmittedBehavior;
  if (last == null) return { kind: "never", label: "Never logged in" };
  const ageMs = nowMs - last;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;
  if (ageMs <= oneDayMs) {
    return submitted
      ? { kind: "ok", label: "Active today + submitted" }
      : { kind: "warn", label: "Active today, no submission" };
  }
  if (ageMs <= sevenDaysMs) return { kind: "stale", label: "Active in last 7 days" };
  return { kind: "cold", label: "Inactive > 7 days" };
}

function fmtRelative(iso, nowMs) {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = nowMs - t;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} min ago`;
  if (diff < oneDayMs) return `${Math.floor(diff / (60 * 60 * 1000))} h ago`;
  if (diff < 30 * oneDayMs) return `${Math.floor(diff / oneDayMs)} d ago`;
  return new Date(t).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
}

function fmtCreatedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "short", day: "numeric",
  });
}

const rosterState = {
  allRows: [],
  groupBy: "none", // "none" | "school"
  search: "",
  schoolFilter: "",
  gradeFilter: "",
  loading: false,
  error: null,
};

// Render the static panel chrome ONCE on mount. Re-renders only refresh
// the table body, the filter dropdowns, and the count chip in the header.
function mountRosterPanel() {
  const root = document.getElementById("roster-panel");
  if (!root) return;
  root.classList.add("panel");
  root.replaceChildren();

  const countChip = el("span", { class: "muted", id: "roster-count" });
  const csvBtn = el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    title: "Download students roster as CSV",
    // Round 18.1 reviewer fix: previously this exported the entire
    // roster every time, ignoring the school/grade chips the operator
    // had set on the visible table. Now we pipe the same filters the
    // backend can honor server-side (schoolName, gradeLevel) so an
    // operator looking at one school exports only that school. The
    // search box stays client-side, so a name filter still exports
    // beyond the visible filter; that is fine because it surfaces
    // every record matching the school+grade scope.
    onClick: () => downloadAdminCsv("/admin/users", {
      schoolName: rosterState.schoolFilter || undefined,
      gradeLevel: rosterState.gradeFilter || undefined,
    }),
  }, ["Download CSV"]);
  const refreshBtn = el("button", {
    class: "btn btn--ghost btn--small", type: "button",
    onClick: () => loadRoster(),
    title: "Manual refresh only. System Status polls automatically every 30s; analytics + roster panels stay manual to keep Render free-tier compute low.",
  }, ["Refresh"]);
  root.appendChild(el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, ["Students"]),
      countChip,
      el("span", { class: "panel__hint" }, ["Manual refresh only"]),
    ]),
    el("div", { class: "panel__actions" }, [csvBtn, refreshBtn]),
  ]));

  root.appendChild(el("div", { class: "roster-banner" }, [
    el("strong", null, ["Internal use only."]),
    " Most PII-rich surface in the dashboard. Don't screenshot. Email is hidden until you click Reveal.",
  ]));

  // Controls row.
  const searchInput = el("input", {
    type: "search",
    class: "filter-input roster-search",
    placeholder: "Search name or email",
    autocomplete: "off",
  });
  searchInput.addEventListener("input", () => {
    rosterState.search = String(searchInput.value || "").toLowerCase().trim();
    renderRosterTable();
  });
  const schoolSelect = el("select", { class: "filter-input", id: "roster-school" });
  schoolSelect.addEventListener("change", () => {
    rosterState.schoolFilter = schoolSelect.value;
    renderRosterTable();
  });
  const gradeSelect = el("select", { class: "filter-input", id: "roster-grade" });
  gradeSelect.addEventListener("change", () => {
    rosterState.gradeFilter = gradeSelect.value;
    renderRosterTable();
  });
  const groupToggle = el("div", { class: "chips" });
  for (const opt of [{ v: "none", l: "Flat list" }, { v: "school", l: "Group by school" }]) {
    const chip = el("button", {
      class: "chip" + (opt.v === "none" ? " chip--active" : ""),
      type: "button",
      onClick: () => {
        rosterState.groupBy = opt.v;
        for (const c of groupToggle.querySelectorAll(".chip")) c.classList.remove("chip--active");
        chip.classList.add("chip--active");
        renderRosterTable();
      },
    }, [opt.l]);
    groupToggle.appendChild(chip);
  }

  // Camp EMA study research export. A "since" date scopes the pull to a
  // study week (blank = all). Two datasets because behaviors and chat have
  // different columns and can't share one CSV: behaviors carries the four
  // goal entries + reflections + AI feedback; chat carries Pebble messages
  // (voice turns appear here as transcribed text, no audio).
  const studySince = el("input", {
    type: "date",
    class: "filter-input",
    title: "Only include data on/after this date (study week start, UTC-ish). Leave blank to export everything.",
  });
  const sinceIso = () => (studySince.value ? new Date(studySince.value).toISOString() : "");
  const studyBehaviorsBtn = el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    title: "All students: 4 behaviors + text reflections + AI feedback (CSV)",
    onClick: () => downloadStudyData("behaviors", sinceIso()),
  }, ["Behaviors CSV"]);
  const studyChatBtn = el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    title: "All students: Pebble chat transcripts (CSV). Voice turns appear as text. Chat auto-deletes after 30 days, so pull week-1 soon.",
    onClick: () => downloadStudyData("chat", sinceIso()),
  }, ["Chat CSV"]);

  root.appendChild(el("div", { class: "roster-controls" }, [
    el("div", { class: "roster-controls__row" }, [
      searchInput,
      schoolSelect,
      gradeSelect,
    ]),
    el("div", { class: "roster-controls__row" }, [
      el("span", { class: "filter-group__label" }, ["View"]),
      groupToggle,
    ]),
    el("div", { class: "roster-controls__row" }, [
      el("span", { class: "filter-group__label" }, ["Study export"]),
      el("span", { class: "panel__hint" }, ["Since"]),
      studySince,
      studyBehaviorsBtn,
      studyChatBtn,
    ]),
  ]));

  const tableWrap = el("div", { class: "table-wrap", id: "roster-table-wrap" });
  root.appendChild(tableWrap);

  // Side-drawer wiring (the markup lives in dashboard.html so the focus
  // trap and the backdrop can sit outside <main>).
  const drawer = document.getElementById("roster-drawer");
  const drawerBackdrop = document.getElementById("roster-drawer-backdrop");
  const drawerClose = document.getElementById("roster-drawer-close");
  const drawerPanel = drawer && drawer.querySelector(".roster-drawer__panel");
  let lastFocusBeforeDrawer = null;

  if (drawer && drawerBackdrop && drawerClose) {
    const closeDrawer = () => {
      drawer.setAttribute("hidden", "");
      // Restore focus to whatever element opened the drawer so the
      // operator's keyboard nav lands back on the table row instead
      // of the body element.
      if (lastFocusBeforeDrawer && typeof lastFocusBeforeDrawer.focus === "function") {
        try { lastFocusBeforeDrawer.focus(); } catch (_) {}
      }
    };
    drawerBackdrop.addEventListener("click", closeDrawer);
    drawerClose.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (drawer.hasAttribute("hidden")) return;
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }
      // Focus trap. aria-modal=true promises the AT a modal experience;
      // we have to actually deliver one by cycling Tab inside the drawer.
      if (e.key === "Tab" && drawerPanel) {
        const focusables = drawerPanel.querySelectorAll(
          'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }
  // Exposed on rosterState so openRosterDrawer can stash + restore focus.
  rosterState._setLastFocus = (el) => { lastFocusBeforeDrawer = el; };

  loadRoster();
}

async function loadRoster() {
  rosterState.loading = true;
  rosterState.error = null;
  renderRosterTable();
  try {
    // Limit 200 (server max) so we can run all filters client-side at
    // pilot scale. When the roster crosses 200 we'll wire server-side
    // search; for now this stays simple.
    const data = await window.ProudMeAdmin.fetchAdmin("/admin/users?limit=200");
    rosterState.allRows = data.users || [];
    rosterState.loading = false;
    rebuildSelects();
    renderRosterTable();
  } catch (err) {
    rosterState.loading = false;
    rosterState.error = err.message || "Roster fetch failed.";
    renderRosterTable();
  }
}

function rebuildSelects() {
  const schoolSelect = document.getElementById("roster-school");
  const gradeSelect = document.getElementById("roster-grade");
  if (!schoolSelect || !gradeSelect) return;
  const schools = Array.from(new Set(rosterState.allRows.map((r) => r.schoolName).filter(Boolean))).sort();
  const grades = Array.from(new Set(rosterState.allRows.map((r) => r.gradeLevel).filter(Boolean))).sort();
  const fill = (sel, items, label, current) => {
    sel.replaceChildren();
    sel.appendChild(el("option", { value: "" }, [`All ${label}`]));
    for (const it of items) {
      const opt = el("option", { value: it }, [it]);
      if (it === current) opt.selected = true;
      sel.appendChild(opt);
    }
  };
  fill(schoolSelect, schools, "schools", rosterState.schoolFilter);
  fill(gradeSelect, grades, "grades", rosterState.gradeFilter);
}

function filteredRows() {
  return rosterState.allRows.filter((r) => {
    if (rosterState.schoolFilter && r.schoolName !== rosterState.schoolFilter) return false;
    if (rosterState.gradeFilter && r.gradeLevel !== rosterState.gradeFilter) return false;
    if (rosterState.search) {
      const hay = `${r.firstName} ${r.lastName} ${r.email}`.toLowerCase();
      if (!hay.includes(rosterState.search)) return false;
    }
    return true;
  });
}

function renderRosterTable() {
  const wrap = document.getElementById("roster-table-wrap");
  const countChip = document.getElementById("roster-count");
  if (!wrap) return;
  wrap.replaceChildren();

  if (rosterState.loading) {
    wrap.appendChild(el("p", { class: "audit-empty" }, ["Loading…"]));
    if (countChip) countChip.textContent = "";
    return;
  }
  if (rosterState.error) {
    wrap.appendChild(el("p", { class: "audit-empty" }, ["Error: " + rosterState.error]));
    if (countChip) countChip.textContent = "";
    return;
  }

  const rows = filteredRows();
  if (countChip) {
    const total = rosterState.allRows.length;
    countChip.textContent = rows.length === total
      ? `${total} registered`
      : `${rows.length} of ${total}`;
  }
  if (rows.length === 0) {
    wrap.appendChild(el("p", { class: "audit-empty" }, ["No students match these filters."]));
    return;
  }

  const nowMs = Date.now();

  if (rosterState.groupBy === "school") {
    const groups = new Map();
    for (const r of rows) {
      const key = r.schoolName || "(no school)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const sortedKeys = Array.from(groups.keys()).sort();
    for (const k of sortedKeys) {
      wrap.appendChild(el("h3", { class: "roster-group-head" }, [
        k, " ",
        el("span", { class: "muted" }, [`(${groups.get(k).length})`]),
      ]));
      wrap.appendChild(buildRosterTable(groups.get(k), nowMs));
    }
  } else {
    wrap.appendChild(buildRosterTable(rows, nowMs));
  }
}

function buildRosterTable(rows, nowMs) {
  const table = el("table", { class: "audit-table roster-table" });
  table.appendChild(el("thead", null, [
    el("tr", null, [
      el("th", null, ["Name"]),
      el("th", null, ["School"]),
      el("th", null, ["Grade"]),
      el("th", null, ["Joined"]),
      el("th", null, ["Last active"]),
      el("th", null, ["Today"]),
    ]),
  ]));
  const tbody = el("tbody");
  for (const r of rows) {
    const cls = classifyStudent(r, nowMs);
    const tr = el("tr", {
      class: "audit-row roster-row",
      tabindex: "0",
      role: "button",
      "aria-label": `Open details for ${r.firstName} ${r.lastName}`,
    });
    tr.appendChild(el("td", null, [
      el("span", { class: "status-dot status-dot--" + cls.kind, title: cls.label }),
      ` ${r.firstName} ${r.lastName}`,
    ]));
    tr.appendChild(el("td", null, [r.schoolName || "—"]));
    tr.appendChild(el("td", null, [r.gradeLevel || "—"]));
    tr.appendChild(el("td", null, [fmtCreatedAt(r.createdAt)]));
    tr.appendChild(el("td", null, [fmtRelative(r.lastLoginAt, nowMs)]));
    tr.appendChild(el("td", null, [r.todaySubmittedBehavior ? "✓" : "—"]));
    const open = () => openRosterDrawer(r);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function openRosterDrawer(row) {
  const drawer = document.getElementById("roster-drawer");
  const body = document.getElementById("roster-drawer-body");
  const titleEl = document.getElementById("roster-drawer-title");
  const closeBtn = document.getElementById("roster-drawer-close");
  if (!drawer || !body) return;
  if (titleEl) titleEl.textContent = `${row.firstName} ${row.lastName}`;
  // Stash the currently-focused element so closeDrawer can restore it.
  if (rosterState._setLastFocus) {
    rosterState._setLastFocus(document.activeElement);
  }
  body.replaceChildren();

  const nowMs = Date.now();
  const cls = classifyStudent(row, nowMs);

  // Status header.
  body.appendChild(el("div", { class: "drawer-status" }, [
    el("span", { class: "status-dot status-dot--" + cls.kind }),
    el("span", null, [cls.label]),
  ]));

  // Email row with Reveal gate.
  const emailRow = el("div", { class: "drawer-row" }, [
    el("span", { class: "drawer-row__label" }, ["Email"]),
    el("span", { class: "drawer-row__value drawer-row__value--gated" }, [
      "·".repeat(8) + "@" + "·".repeat(8),
    ]),
  ]);
  const valueEl = emailRow.querySelector(".drawer-row__value");
  const revealBtn = el("button", {
    class: "btn btn--ghost btn--small drawer-reveal",
    type: "button",
    onClick: () => {
      valueEl.textContent = row.email || "—";
      valueEl.classList.remove("drawer-row__value--gated");
      revealBtn.remove();
    },
  }, ["Reveal"]);
  emailRow.appendChild(revealBtn);
  body.appendChild(emailRow);

  const dl = el("dl", { class: "drawer-dl" });
  const fields = [
    // Username (the `name` field) is the login handle the camp needs to
    // hand back to each kid. Not gated like email: it's a login id, not PII.
    ["Username", row.name],
    ["School", row.schoolName],
    ["Grade", row.gradeLevel],
    ["Birth month", row.birthMonth],
    ["Birth year", row.birthYear],
    ["Gender", row.gender],
    ["Height (cm)", row.heightCm == null ? "—" : String(row.heightCm)],
    ["Weight (kg)", row.weightKg == null ? "—" : String(row.weightKg)],
    ["Email verified", row.isVerifiedEmail ? "yes" : "no"],
    ["Parental consent", row.parentalConsentGiven ? "yes" : "no"],
    ["Consent recorded", row.parentalConsentAt ? fmtTs(row.parentalConsentAt) : "—"],
    ["Joined (CT)", fmtCreatedAt(row.createdAt)],
    ["Last active", fmtRelative(row.lastLoginAt, nowMs)],
    ["Today's behavior log", row.todaySubmittedBehavior ? "submitted" : "not submitted"],
    ["User ID", row._id],
  ];
  for (const [k, v] of fields) {
    dl.appendChild(el("dt", null, [k]));
    dl.appendChild(el("dd", null, [v == null || v === "" ? "—" : String(v)]));
  }
  body.appendChild(dl);

  // Camp EMA study: set-password tool. Passwords are bcrypt-hashed (can't be
  // read back) and the /forgot-password code emails an address that isn't the
  // kid's, so the operator sets a known password here and records it. The
  // input is type=text on purpose: the operator MUST see and write down the
  // value to hand to the camp; this is an intentional shared credential behind
  // the admin allowlist, not a secret to mask.
  body.appendChild(el("hr", { class: "drawer-rule" }));
  body.appendChild(el("h3", { class: "drawer-section-title" }, ["Set password"]));
  body.appendChild(el("p", { class: "drawer-note" }, [
    "Passwords can't be looked up. Set a known one, then write down the username + password for the camp. The kid logs in on the new device with the same username.",
  ]));
  const pwInput = el("input", {
    type: "text",
    class: "filter-input",
    placeholder: "New password (8+ chars, a letter + a digit)",
    autocomplete: "off",
  });
  const pwStatus = el("div", { class: "drawer-note", hidden: "" }, [""]);
  const pwBtn = el("button", {
    class: "btn btn--small",
    type: "button",
    onClick: async () => {
      const newPassword = String(pwInput.value || "");
      // Mirror the backend PASSWORD_POLICY so the operator gets instant
      // feedback instead of a round-trip 400.
      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
        pwStatus.textContent = "Password must be at least 8 characters and include a letter and a digit.";
        pwStatus.removeAttribute("hidden");
        return;
      }
      pwBtn.disabled = true;
      pwStatus.textContent = "Setting…";
      pwStatus.removeAttribute("hidden");
      try {
        const resp = await window.ProudMeAdmin.fetchAdmin(
          "/admin/users/" + row._id + "/set-password",
          { method: "POST", body: { newPassword } }
        );
        const uname = (resp && resp.username) || row.name || "(unknown)";
        pwStatus.textContent =
          "Done. Username: " + uname + "  ·  Password: " + newPassword +
          "  — write these down now; the password cannot be recovered later.";
      } catch (err) {
        pwStatus.textContent = "Failed: " + (err.message || "unknown");
      } finally {
        pwBtn.disabled = false;
      }
    },
  }, ["Set password"]);
  body.appendChild(el("div", { class: "drawer-setpw" }, [pwInput, " ", pwBtn]));
  body.appendChild(pwStatus);

  // Phase 6: per-student timeline section.
  body.appendChild(el("hr", { class: "drawer-rule" }));
  body.appendChild(el("h3", { class: "drawer-section-title" }, ["Timeline"]));

  const timelineState = {
    kinds: { behavior: true, chat: true, safety: true },
  };
  const timelineFilters = el("div", { class: "chips drawer-timeline-filters" });
  for (const k of ["behavior", "chat", "safety"]) {
    const chip = el("button", {
      class: "chip chip--active",
      type: "button",
      dataset: { kind: k },
      onClick: () => {
        timelineState.kinds[k] = !timelineState.kinds[k];
        chip.classList.toggle("chip--active");
        renderTimeline();
      },
    }, [k.charAt(0).toUpperCase() + k.slice(1)]);
    timelineFilters.appendChild(chip);
  }
  body.appendChild(timelineFilters);

  const timelineList = el("ol", { class: "timeline-list" });
  body.appendChild(timelineList);

  // Round 18.1 reviewer fix: a truncation hint footer the timeline
  // fetch will fill in if the backend reports truncated:true. Without
  // this hint a heavy user with >500 events sees a hard cutoff and no
  // affordance that older data exists. The footer stays hidden until
  // we know.
  const timelineHint = el("div", { class: "timeline-hint", hidden: "" }, [""]);
  body.appendChild(timelineHint);

  let allEvents = [];
  const renderTimeline = () => {
    timelineList.replaceChildren();
    const filtered = allEvents.filter((ev) => timelineState.kinds[ev.kind]);
    if (filtered.length === 0) {
      timelineList.appendChild(el("li", { class: "timeline-empty" }, [
        allEvents.length === 0 ? "No timeline events for this student yet." : "No events match the selected kinds.",
      ]));
      return;
    }
    const nowMs = Date.now();
    for (const ev of filtered) {
      const li = el("li", { class: "timeline-event timeline-event--" + ev.kind });
      li.appendChild(el("span", { class: "timeline-event__badge timeline-event__badge--" + ev.kind }, [ev.kind]));
      li.appendChild(el("div", { class: "timeline-event__body" }, [
        el("div", { class: "timeline-event__when" }, [fmtTs(ev.timestamp), " · ", fmtRelative(ev.timestamp, nowMs)]),
        el("div", { class: "timeline-event__summary" }, [summarizeTimelineEvent(ev)]),
      ]));
      timelineList.appendChild(li);
    }
  };

  // Load on open.
  timelineList.appendChild(el("li", { class: "timeline-empty" }, ["Loading timeline…"]));
  window.ProudMeAdmin.fetchAdmin("/admin/users/" + row._id + "/timeline")
    .then((data) => {
      allEvents = (data && data.events) || [];
      // Round 18.1 reviewer fix: surface the backend's truncated flag
      // (Phase 6 cap is 500 events). Without this the operator gets
      // no signal that older data exists for a chatty user.
      if (data && data.truncated) {
        timelineHint.replaceChildren(
          document.createTextNode(
            "Showing the most recent " + (data.cap || allEvents.length) +
            " events. Older history exists but is not shown."
          )
        );
        timelineHint.removeAttribute("hidden");
      } else {
        timelineHint.setAttribute("hidden", "");
      }
      renderTimeline();
    })
    .catch((err) => {
      timelineList.replaceChildren();
      timelineList.appendChild(el("li", { class: "timeline-empty timeline-empty--err" }, [
        "Timeline fetch failed: " + (err.message || "unknown"),
      ]));
    });

  drawer.removeAttribute("hidden");
  // Move focus into the drawer so screen reader users land in the
  // modal context (close button is the most predictable target).
  if (closeBtn && typeof closeBtn.focus === "function") {
    try { closeBtn.focus(); } catch (_) {}
  }
}

function summarizeTimelineEvent(ev) {
  const d = ev.data || {};
  if (ev.kind === "behavior") {
    const status = d.goalStatus ? ` · ${d.goalStatus}` : "";
    return `${d.goalType || "?"}: logged ${d.behaviorValue ?? "—"} of ${d.goalValue ?? "—"}${status}`;
  }
  if (ev.kind === "chat") {
    return `Chat session "${d.title || "(untitled)"}" · ${d.messageCount || 0} message${d.messageCount === 1 ? "" : "s"}`;
  }
  if (ev.kind === "safety") {
    const cats = (d.categories || []).join(", ");
    return `${d.action} (${d.source}/${d.endpoint})${cats ? " · " + cats : ""}`;
  }
  return JSON.stringify(d);
}

// ---------- EMA survey enrollment + compliance (R47) ----------------------

function emaPct(n) {
  return n == null ? "—" : n + "%";
}

// One search-result row with Enroll / Unenroll actions.
// R49.1: a copy-able camper ID. This is the same value that flows to Qualtrics
// as the survey PID, so showing it next to each account lets the operator match
// a survey-export PID back to a camper (Ctrl+F the roster, or copy it). It is
// the ProudMe account id, not the login email (kept out of Qualtrics for PII).
function pidChip(id) {
  if (!id) return el("span", { class: "muted" }, ["no device/account id"]);
  const value = String(id);
  const btn = el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    title: "Copy PID to clipboard",
    onClick: () => {
      try {
        navigator.clipboard.writeText(value);
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.textContent = "Copy"; }, 1200);
      } catch (_) {
        btn.textContent = "Copy failed";
      }
    },
  }, ["Copy"]);
  return el("span", { class: "pid-chip" }, [
    el("code", { title: "Participant ID - matches the Qualtrics export PID column" }, [value]),
    " ",
    btn,
  ]);
}

function emaEnrollRow(user) {
  const status = el("span", { class: "muted ema-row__status" }, [""]);
  const doEnroll = async (enrolled) => {
    status.textContent = "Saving…";
    try {
      const r = await window.ProudMeAdmin.fetchAdmin("/admin/ema/enroll", {
        method: "POST",
        body: { userId: user._id, enrolled },
      });
      status.textContent = r && r.emaEnrolled ? "✓ Enrolled" : "Not enrolled";
    } catch (err) {
      status.textContent = "Error: " + (err.message || "failed");
    }
  };
  // R49: send a one-off survey-test PUSH to this camper's registered device so
  // the PI can verify the push -> Qualtrics path end-to-end (separate from the
  // in-app "sample survey prompt" which only tests LOCAL notifications).
  const doPush = async () => {
    status.textContent = "Sending…";
    try {
      await window.ProudMeAdmin.fetchAdmin("/admin/push/survey-test", {
        method: "POST",
        body: { userId: user._id },
      });
      status.textContent = "✓ Test push sent";
    } catch (err) {
      // fetchAdmin embeds the raw JSON error body in the message; pull out the
      // human-readable reason so common cases (no device registered yet, push
      // not configured) read cleanly instead of "Request failed: 404 {…}".
      let msg = err && err.message ? err.message : "failed";
      const m = msg.match(/"message":"([^"]+)"/);
      if (m) msg = m[1];
      status.textContent = "⚠ " + msg;
    }
  };
  const name =
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "(no name)";
  return el("div", { class: "ema-row" }, [
    el("div", { class: "ema-row__main" }, [
      el("strong", null, [name]),
      el("span", { class: "muted" }, [" · " + (user.email || "—")]),
      user.gradeLevel ? el("span", { class: "muted" }, [" · grade " + user.gradeLevel]) : null,
      el("div", { class: "ema-row__pid" }, ["PID: ", pidChip(user._id)]),
    ]),
    el("div", { class: "ema-row__actions" }, [
      el("button", { class: "btn btn--primary btn--small", type: "button", onClick: () => doEnroll(true) }, ["Enroll"]),
      el("button", { class: "btn btn--ghost btn--small", type: "button", onClick: () => doEnroll(false) }, ["Unenroll"]),
      el("button", { class: "btn btn--ghost btn--small", type: "button", onClick: doPush }, ["Send test push"]),
      status,
    ]),
  ]);
}

function mountEmaEnrollPanel() {
  const root = document.getElementById("ema-enroll-panel");
  if (!root) return;
  root.classList.add("panel");
  root.replaceChildren();

  root.appendChild(el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, ["Survey Enrollment"]),
      el("span", { class: "panel__hint" }, ["Only enrolled participants receive prompts"]),
    ]),
  ]));
  root.appendChild(el("div", { class: "dash-banner" }, [
    el("strong", null, ["Enroll the camp roster here. "]),
    "Creating an app account does NOT enroll a child in the survey. Search to add one at a time, or paste a roster below.",
  ]));

  // Single search + enroll.
  const searchInput = el("input", { type: "search", class: "filter-input", placeholder: "Search name or email", autocomplete: "off" });
  const results = el("div", { class: "ema-results" }, [el("p", { class: "muted" }, ["Type a name or email, then Search."])]);
  const runSearch = async () => {
    const q = String(searchInput.value || "").trim();
    if (!q) { results.replaceChildren(el("p", { class: "muted" }, ["Type a name or email, then Search."])); return; }
    results.replaceChildren(el("p", { class: "muted" }, ["Searching…"]));
    try {
      const data = await window.ProudMeAdmin.fetchAdmin("/admin/users?q=" + encodeURIComponent(q) + "&limit=25");
      const users = (data && data.users) || [];
      if (users.length === 0) { results.replaceChildren(el("p", { class: "muted" }, ["No matching accounts."])); return; }
      results.replaceChildren.apply(results, users.map(emaEnrollRow));
    } catch (err) {
      results.replaceChildren(el("p", { class: "muted" }, ["Search failed: " + (err.message || "unknown")]));
    }
  };
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  root.appendChild(el("div", { class: "ema-search-row" }, [
    searchInput,
    el("button", { class: "btn btn--ghost btn--small", type: "button", onClick: runSearch }, ["Search"]),
  ]));
  root.appendChild(results);

  // Bulk enroll.
  const bulkArea = el("textarea", { class: "filter-input ema-bulk", rows: "4", placeholder: "Paste emails (one per line or comma-separated)" });
  const bulkOut = el("div", { class: "ema-bulk-out muted" });
  const runBulk = async (enrolled) => {
    const emails = String(bulkArea.value || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (emails.length === 0) { bulkOut.replaceChildren(document.createTextNode("Paste at least one email.")); return; }
    bulkOut.replaceChildren(document.createTextNode("Submitting " + emails.length + " email(s)…"));
    try {
      const r = await window.ProudMeAdmin.fetchAdmin("/admin/ema/enroll-bulk", { method: "POST", body: { emails, enrolled } });
      const bad = (r.results || []).filter((x) => !x.ok);
      // R49.1c: build the children array first. Passing a literal `null` to the
      // native replaceChildren stringifies it to the text "null" (unlike the
      // el() helper, which skips null children). That stray "null" showed under
      // "Enrolled N of N" whenever every pasted email matched.
      const out = [
        el("div", null, [(enrolled ? "Enrolled " : "Unenrolled ") + (r.updated || 0) + " of " + r.requested + "."]),
      ];
      if (bad.length) {
        out.push(el("div", { class: "muted" }, ["Not matched: " + bad.map((x) => x.email).join(", ")]));
      }
      bulkOut.replaceChildren.apply(bulkOut, out);
    } catch (err) {
      bulkOut.replaceChildren(document.createTextNode("Bulk failed: " + (err.message || "unknown")));
    }
  };
  root.appendChild(el("div", { class: "ema-bulk-block" }, [
    el("h3", { class: "chart-card__title" }, ["Bulk enroll a roster"]),
    bulkArea,
    el("div", { class: "ema-bulk-actions" }, [
      el("button", { class: "btn btn--primary btn--small", type: "button", onClick: () => runBulk(true) }, ["Enroll all"]),
      el("button", { class: "btn btn--ghost btn--small", type: "button", onClick: () => runBulk(false) }, ["Unenroll all"]),
    ]),
    bulkOut,
  ]));
}

// Per-participant prompt log (expanded inline from the compliance roster).
function emaUserDetail(u) {
  const wrap = el("div", { class: "ema-user-detail" });
  if (!u || !u.scheduleGenerated) {
    wrap.appendChild(el("p", { class: "muted" }, ["No schedule generated yet (the participant has not opened the app during a study window)."]));
    return wrap;
  }
  const t = el("table", { class: "audit-table" });
  t.appendChild(el("thead", null, [el("tr", null, [
    el("th", null, ["Period"]), el("th", null, ["Day"]), el("th", null, ["Block"]),
    el("th", null, ["Scheduled"]), el("th", null, ["Responded"]), el("th", null, ["On time"]),
  ])]));
  const tb = el("tbody");
  (u.prompts || []).forEach((p) => {
    tb.appendChild(el("tr", null, [
      el("td", null, ["P" + (p.period + 1)]),
      el("td", null, [String(p.dayNum)]),
      el("td", null, [String(p.blockNum)]),
      el("td", null, [fmtTs(p.scheduledAt)]),
      el("td", null, [p.respondedAt ? fmtTs(p.respondedAt) : "—"]),
      el("td", null, [p.respondedAt ? (p.withinWindow ? "Yes" : "Late") : "—"]),
    ]));
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

// R50: study-window chip. Dates are fixed protocol dates, hardcoded on
// purpose (no API cost). Day math uses Chicago-local Y-M-D strings to
// avoid UTC drift (the R46.3 timezone lesson): lexicographic compare of
// ISO dates is correct, and diffs run on midnight-UTC parses of the
// already-localized date strings so DST can't skew them.
const EMA_WINDOWS = [
  { label: "Pre-test", start: "2026-06-11", end: "2026-06-14" },
  { label: "Post-test", start: "2026-07-30", end: "2026-08-02" },
];

function chicagoToday() {
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function emaDayDiff(a, b) {
  // Pure-date diff in days; both args are Chicago-local YYYY-MM-DD.
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function emaShortDate(s) {
  return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function emaWindowState(today) {
  for (const w of EMA_WINDOWS) {
    if (today >= w.start && today <= w.end) {
      return {
        active: true,
        text: w.label + " window · Day " + (emaDayDiff(w.start, today) + 1) + " of " + (emaDayDiff(w.start, w.end) + 1),
      };
    }
  }
  for (const w of EMA_WINDOWS) {
    if (today < w.start) {
      const n = emaDayDiff(today, w.start);
      return {
        active: false,
        text: w.label + " starts " + (n === 1 ? "tomorrow" : "in " + n + " days") + " (" + emaShortDate(w.start) + ")",
      };
    }
  }
  return { active: false, text: "Both study windows complete" };
}

function mountEmaCompliancePanel() {
  const root = document.getElementById("ema-compliance-panel");
  if (!root) return;
  root.classList.add("panel");
  root.replaceChildren();

  const statGrid = el("div", { class: "status-grid" });
  const blockWrap = el("div", { class: "table-wrap" });
  const rosterWrap = el("div", { class: "table-wrap" });
  const refreshBtn = el("button", { class: "btn btn--ghost btn--small", type: "button", title: "Manual refresh" }, ["Refresh"]);

  // R49.1b: broadcast a survey-test push to all enrolled campers who have a
  // registered device. A camper only has one after installing + opening Build 25
  // (which registers the APNs token); earlier builds register nothing, so they
  // are skipped. The result spells out reachable-vs-enrolled so it is obvious
  // when "0 sent" just means nobody has updated yet.
  const pushAllBtn = el("button", {
    class: "btn btn--ghost btn--small",
    type: "button",
    title: "Send a survey-test push to every enrolled camper who has a registered device (Build 25+).",
    onClick: async () => {
      if (!window.confirm("Send a TEST survey push to ALL enrolled campers who have a registered device?\n\nCampers on builds before Build 25 have no device registered yet and are skipped.")) {
        return;
      }
      const prev = pushAllBtn.textContent;
      pushAllBtn.textContent = "Sending…";
      pushAllBtn.disabled = true;
      try {
        const r = await window.ProudMeAdmin.fetchAdmin("/admin/push/survey-test-all", { method: "POST", body: {} });
        const enrolled = (r && r.enrolled) || 0;
        const withDevice = (r && r.withDevice) || 0;
        const sent = (r && r.sent) || 0;
        const failed = (r && r.failed) || 0;
        if (withDevice === 0) {
          window.alert("No enrolled camper has a registered device yet.\n\nThey need Build 25 installed + opened on an iPhone (notifications allowed) before a push can reach them.\n\nEnrolled: " + enrolled);
        } else {
          window.alert("Test push sent to " + sent + " of " + withDevice + " devices (failed: " + failed + ").\n\nEnrolled campers: " + enrolled + "\nWith a registered device: " + withDevice);
        }
      } catch (err) {
        let msg = err && err.message ? err.message : "failed";
        const m = msg.match(/"message":"([^"]+)"/);
        if (m) msg = m[1];
        window.alert("Broadcast failed: " + msg);
      } finally {
        pushAllBtn.textContent = prev;
        pushAllBtn.disabled = false;
      }
    },
  }, ["Test push → all enrolled"]);

  const windowChip = el("span", { class: "ema-window-chip" });
  const updateWindowChip = () => {
    const s = emaWindowState(chicagoToday());
    windowChip.textContent = s.text;
    windowChip.classList.toggle("ema-window-chip--active", s.active);
  };
  updateWindowChip();

  root.appendChild(el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, ["Survey Compliance"]),
      windowChip,
      el("span", { class: "panel__hint" }, ["Rates are vs prompts already due"]),
    ]),
    el("div", { class: "panel__actions" }, [pushAllBtn, refreshBtn]),
  ]));
  root.appendChild(statGrid);
  root.appendChild(el("h3", { class: "chart-card__title" }, ["By block"]));
  root.appendChild(blockWrap);
  root.appendChild(el("h3", { class: "chart-card__title" }, ["Enrolled participants"]));
  root.appendChild(rosterWrap);

  const load = async () => {
    // Recompute the window chip on every manual refresh so a dashboard
    // left open across midnight CT rolls the day counter forward.
    updateWindowChip();
    statGrid.replaceChildren(el("div", { class: "status-tile status-tile--placeholder" }, ["Loading…"]));
    blockWrap.replaceChildren();
    rosterWrap.replaceChildren();
    try {
      const c = await window.ProudMeAdmin.fetchAdmin("/admin/ema/compliance");
      const o = c.overall || {};
      statGrid.replaceChildren(
        statusTile("Enrolled", c.enrolledUsers == null ? "—" : String(c.enrolledUsers), ""),
        statusTile("Prompts due", o.due == null ? "—" : String(o.due), ""),
        statusTile("Responded", o.responded == null ? "—" : String(o.responded), ""),
        statusTile("Response rate", emaPct(o.responseRate), o.responseRate != null && o.responseRate < 50 ? "warn" : "ok"),
        statusTile("On-time rate", emaPct(o.onTimeRate), ""),
      );
      const bt = el("table", { class: "audit-table" });
      bt.appendChild(el("thead", null, [el("tr", null, [
        el("th", null, ["Period"]), el("th", null, ["Block"]), el("th", null, ["Due"]), el("th", null, ["Responded"]), el("th", null, ["Rate"]),
      ])]));
      const bb = el("tbody");
      (c.byBlock || []).forEach((b) => {
        bb.appendChild(el("tr", null, [
          el("td", null, ["Period " + (b.period + 1)]),
          el("td", null, ["Block " + b.blockNum]),
          el("td", null, [String(b.due)]),
          el("td", null, [String(b.responded)]),
          el("td", null, [emaPct(b.responseRate)]),
        ]));
      });
      if (!(c.byBlock || []).length) {
        bb.appendChild(el("tr", null, [el("td", { colspan: "5", class: "muted" }, ["No prompts have come due yet."])]));
      }
      bt.appendChild(bb);
      blockWrap.replaceChildren(bt);
    } catch (err) {
      statGrid.replaceChildren(el("div", { class: "status-tile status-tile--err" }, ["✗ " + (err.message || "failed")]));
    }
    try {
      const data = await window.ProudMeAdmin.fetchAdmin("/admin/ema/enrolled");
      const rows = (data && data.enrolled) || [];
      const t = el("table", { class: "audit-table" });
      t.appendChild(el("thead", null, [el("tr", null, [
        el("th", null, ["Name"]), el("th", null, ["Email"]), el("th", null, ["Grade"]),
        el("th", null, ["Resp/Due"]), el("th", null, ["Rate"]), el("th", null, [""]),
      ])]));
      const tb = el("tbody");
      if (rows.length === 0) {
        tb.appendChild(el("tr", null, [el("td", { colspan: "6", class: "muted" }, ["No participants enrolled yet."])]));
      }
      rows.forEach((r) => {
        const detail = el("tr", { class: "audit-detail", hidden: "" }, [el("td", { colspan: "6" }, ["Loading…"])]);
        const detailCell = detail.firstChild;
        let loaded = false;
        const viewBtn = el("button", { class: "btn btn--ghost btn--small", type: "button", onClick: async () => {
          if (detail.hasAttribute("hidden")) {
            detail.removeAttribute("hidden");
            if (!loaded) {
              loaded = true;
              try {
                const u = await window.ProudMeAdmin.fetchAdmin("/admin/ema/" + r.userId);
                detailCell.replaceChildren(emaUserDetail(u));
              } catch (err) {
                detailCell.replaceChildren(el("span", { class: "muted" }, ["Failed: " + (err.message || "")]));
              }
            }
          } else {
            detail.setAttribute("hidden", "");
          }
        } }, ["View"]);
        tb.appendChild(el("tr", null, [
          el("td", null, [
            el("div", null, [r.name || "(no name)"]),
            el("div", { class: "ema-row__pid" }, ["PID: ", pidChip(r.userId)]),
          ]),
          el("td", null, [r.email || "—"]),
          el("td", null, [r.gradeLevel || "—"]),
          el("td", null, [r.responded + "/" + r.due]),
          el("td", null, [emaPct(r.responseRate)]),
          el("td", null, [viewBtn]),
        ]));
        tb.appendChild(detail);
      });
      t.appendChild(tb);
      rosterWrap.replaceChildren(t);
    } catch (err) {
      rosterWrap.replaceChildren(el("p", { class: "muted" }, ["Enrolled list failed: " + (err.message || "unknown")]));
    }
  };
  refreshBtn.addEventListener("click", load);
  load();
}

// ---------- New-signups growth (R47) --------------------------------------

function mountSignupsPanel() {
  const root = document.getElementById("signups-panel");
  if (!root) return;
  root.classList.add("panel");
  root.replaceChildren();
  const body = el("div", { class: "signups-body" }, [el("p", { class: "muted" }, ["Loading…"])]);
  const refreshBtn = el("button", { class: "btn btn--ghost btn--small", type: "button" }, ["Refresh"]);
  root.appendChild(el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, ["New Signups"]),
      el("span", { class: "panel__hint" }, ["Accounts created per day (last 30)"]),
    ]),
    el("div", { class: "panel__actions" }, [refreshBtn]),
  ]));
  root.appendChild(body);
  const load = async () => {
    body.replaceChildren(el("p", { class: "muted" }, ["Loading…"]));
    try {
      const data = await window.ProudMeAdmin.fetchAdmin("/admin/analytics/signups?days=30");
      const daily = (data && data.daily) || [];
      const max = daily.reduce((m, d) => Math.max(m, d.count), 0) || 1;
      const grid = el("div", { class: "status-grid" }, [
        statusTile("Total (30d)", String(data.totalInWindow || 0), ""),
        statusTile("Days with signups", String(daily.length), ""),
      ]);
      const bars = el("div", { class: "signups-bars" });
      if (daily.length === 0) {
        bars.appendChild(el("p", { class: "muted" }, ["No signups in the last 30 days."]));
      }
      daily.forEach((d) => {
        bars.appendChild(el("div", { class: "signups-bar-row" }, [
          el("span", { class: "signups-bar-row__date muted" }, [d.date]),
          el("span", { class: "signups-bar-row__track" }, [
            el("span", { class: "signups-bar-row__fill", style: "width:" + Math.round((d.count / max) * 100) + "%" }, []),
          ]),
          el("span", { class: "signups-bar-row__count" }, [String(d.count)]),
        ]));
      });
      body.replaceChildren(grid, bars);
    } catch (err) {
      body.replaceChildren(el("p", { class: "muted" }, ["Signups failed: " + (err.message || "unknown")]));
    }
  };
  refreshBtn.addEventListener("click", load);
  load();
}

// ---------- R48: weekly/monthly goal adherence -----------------------------
// Per-camper count of days each behavior's daily goal was met, for the current
// week and month. The objective adherence number behind the kids' consistency
// goals; this is the PI-facing deliverable.

var ADH_LABELS = {
  activity: "Activity",
  eating: "Eating (F&V)",
  sleep: "Sleep",
  screentime: "Screen time",
};

function adhCellKind(hit, elapsed) {
  if (!elapsed) return "";
  var p = hit / elapsed;
  if (p >= 0.7) return "ok";
  if (p >= 0.4) return "warn";
  return "bad";
}

function mountAdherencePanel() {
  const root = document.getElementById("adherence-panel");
  if (!root) return;
  root.classList.add("panel");
  root.replaceChildren();

  let mode = "weekly";
  let cache = null;

  const weekBtn = el("button", { class: "btn btn--small", type: "button" }, ["Week"]);
  const monthBtn = el("button", { class: "btn btn--ghost btn--small", type: "button" }, ["Month"]);
  const refreshBtn = el("button", { class: "btn btn--ghost btn--small", type: "button" }, ["Refresh"]);
  const body = el("div", { class: "adherence-body" }, [el("p", { class: "muted" }, ["Loading…"])]);

  root.appendChild(el("header", { class: "panel__head" }, [
    el("div", { class: "panel__title" }, [
      el("h2", null, ["Goal Adherence"]),
      el("span", { class: "panel__hint" }, ["Days each camper hit their daily goal"]),
    ]),
    el("div", { class: "panel__actions" }, [weekBtn, monthBtn, refreshBtn]),
  ]));
  root.appendChild(body);

  const render = () => {
    if (!cache) return;
    const period = mode === "monthly" ? cache.month : cache.week;
    const elapsed = (period && period.daysElapsed) || 0;
    const behaviors = cache.behaviors || ["activity", "eating", "sleep", "screentime"];
    const tiles = el("div", { class: "status-grid" }, [
      statusTile("View", mode === "monthly" ? "Monthly" : "Weekly", ""),
      statusTile(
        mode === "monthly" ? "Month" : "Week",
        mode === "monthly"
          ? (cache.month && cache.month.label) || "—"
          : ((cache.week && cache.week.start) || "—") + " – " + ((cache.week && cache.week.end) || "—"),
        ""
      ),
      statusTile("Days elapsed", elapsed + " of " + ((period && period.totalDays) || "—"), ""),
      statusTile("Campers", String(cache.count || 0), ""),
    ]);

    const head = el("tr", null, [el("th", null, ["Camper"])].concat(
      behaviors.map((b) => el("th", null, [ADH_LABELS[b] || b]))
    ));
    const campers = cache.campers || [];
    const rows = campers.map((c) => {
      const data = (mode === "monthly" ? c.monthly : c.weekly) || {};
      const cells = behaviors.map((b) => {
        const hit = data[b] || 0;
        return el("td", { class: "adh-cell adh-cell--" + (adhCellKind(hit, elapsed) || "none") }, [
          hit + "/" + elapsed,
        ]);
      });
      return el("tr", null, [
        el("td", { class: "adh-name" }, [c.name || c.email || "—"]),
      ].concat(cells));
    });
    const tbody = el("tbody", null, rows.length
      ? rows
      : [el("tr", null, [el("td", { class: "muted", colspan: String(behaviors.length + 1) }, ["No campers yet."])])]);
    const table = el("table", { class: "audit-table adherence-table" }, [
      el("thead", null, [head]),
      tbody,
    ]);
    body.replaceChildren(tiles, el("div", { class: "adherence-scroll" }, [table]));
  };

  const setMode = (m) => {
    mode = m;
    weekBtn.className = "btn btn--small" + (m === "weekly" ? "" : " btn--ghost");
    monthBtn.className = "btn btn--small" + (m === "monthly" ? "" : " btn--ghost");
    render();
  };

  const load = async () => {
    body.replaceChildren(el("p", { class: "muted" }, ["Loading…"]));
    try {
      cache = await window.ProudMeAdmin.fetchAdmin("/admin/analytics/adherence");
      render();
    } catch (err) {
      body.replaceChildren(el("p", { class: "muted" }, ["Adherence failed: " + (err.message || "unknown")]));
    }
  };

  weekBtn.addEventListener("click", () => setMode("weekly"));
  monthBtn.addEventListener("click", () => setMode("monthly"));
  refreshBtn.addEventListener("click", load);
  load();
}

// ---------- Boot ----------------------------------------------------------

window.ProudMeAdminPanels = {
  mountAll: function (initialStatusData) {
    if (initialStatusData) {
      renderStatus(initialStatusData);
    } else {
      pollStatus();
    }
    startStatusPolling();
    mountAnalytics();
    createAuditPanel(SAFETY_PANEL);
    createAuditPanel(CONTACT_PANEL);
    mountRosterPanel();
    mountEmaEnrollPanel();
    mountEmaCompliancePanel();
    mountAdherencePanel();
    mountSignupsPanel();
  },
  // Round 18.1 reviewer fix: surface stopStatusPolling so app.js
  // logout() can shut the interval down before clearing the JWT.
  stopAll: function () {
    stopStatusPolling();
  },
};
