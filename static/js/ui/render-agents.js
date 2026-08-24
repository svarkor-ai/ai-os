// ============================================================================
// ui/render-agents.js — Agents section (M9 aosw-js-render-agents)
// ============================================================================
// AOS Workflow Dashboard. Renders the crew agent cards for #panel-agents from
// /aosb/api/agents. Data contract (MC 244.8 fix): the board returns per agent
// {slug,name,kind,status,rig_slug,project_slug,last_seen_at,freshness} where
// last_seen_at is a UTC SQLite space-datetime "YYYY-MM-DD HH:MM:SS" and
// freshness in {online,stale,offline}. Card maps slug->seat, kind->role, adds a
// designed freshness chip, and a Swedish relative last-seen label. Legacy
// caller shape (name/role/seat/last_seen) is still accepted via fallbacks.
//
// Pure HTML helpers are unit-tested under node; only initAgentsSection touches
// the DOM (browser only, GET only via Aos.get — read-only invariant I1).
//
// Four-states floor: loading / empty / error / success.
// ============================================================================
(function () {
'use strict';

let escapeHtml = (v) => String(v);
let loadingStateHTML = (n) => '<div class="loading-state">' + String(n || 1) + '</div>';
let emptyStateHTML = (m) => `<div class="empty-state">${String(m || '')}</div>`;
let errorBandHTML = (t, d) => `<div role="alert">${String(t)}</div>`;
try {
  const ui = require('./aosb-js-error-ui.js');
  escapeHtml = ui.escapeHtml;
  loadingStateHTML = ui.loadingStateHTML;
  emptyStateHTML = ui.emptyStateHTML;
  errorBandHTML = ui.errorBandHTML;
} catch (e) { /* browser global scope */ }
if (typeof window !== 'undefined' && window.Aos && window.Aos.ui) {
  escapeHtml = window.Aos.ui.escapeHtml;
  loadingStateHTML = window.Aos.ui.loadingStateHTML;
  emptyStateHTML = window.Aos.ui.emptyStateHTML;
  errorBandHTML = window.Aos.ui.errorBandHTML;
}

/** @param {number} ms @returns {string} human Swedish duration, or '' if <0 */
function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' timme' : ' timmar');
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' dag' : ' dagar');
}

/**
 * Parse a board agent timestamp into epoch ms (or NaN).
 * The board stores last_seen_at as a UTC SQLite space-datetime
 * "YYYY-MM-DD HH:MM:SS"; JS Date.parse only understands the ISO "T" form and
 * interprets a bare date as LOCAL without a Z. Normalize both so the relative
 * age is computed against UTC (matching the board's own freshness logic).
 * @param {?string} v
 * @returns {number}
 */
function parseAgentTs(v) {
  if (!v) return NaN;
  let s = String(v).trim();
  // "YYYY-MM-DD HH:MM:SS" (UTC, no offset) -> "YYYY-MM-DDTHH:MM:SSZ"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  // Otherwise pass through as-is ("T" ISO with offset/Z, e.g. from older callers).
  return Date.parse(s);
}

/**
 * Swedish relative last-seen label from a board timestamp.
 * @param {?string} ts - "2026-08-22 06:12:00" (board) or ISO "T"/"Z" form
 * @param {number} [now] - epoch ms for deterministic tests
 * @returns {string}
 */
function lastSeenLabel(ts, now) {
  const t = typeof now === 'number' ? now : Date.now();
  const then = parseAgentTs(ts);
  if (!Number.isFinite(then)) return 'Aldrig sedd';
  const diff = t - then;
  if (diff < 30 * 1000) return 'Just nu';
  if (diff < 10 * 60 * 1000) return 'För mindre än 10 min sedan';
  const dur = humanDuration(diff);
  return dur ? ('Senast ' + dur + ' sedan') : 'Aldrig sedd';
}

/** Swedish label for a freshness tone. */
const FRESHNESS_LABELS = {
  online: 'Online',
  stale: 'Fördröjd',
  offline: 'Offline',
  unknown: 'Okänd',
};

/** Freshness fallback thresholds (s) mirroring the board's _agent_freshness. */
const HB_ONLINE_SECS = 120;
const HB_STALE_SECS = 600;

/**
 * Resolve a freshness tone for an agent card.
 * Prefers the board-derived `freshness` field; falls back to computing from
 * `last_seen_at`; unknown when nothing present.
 * @param {?string} freshness - board value (online|stale|offline)
 * @param {number} now - epoch ms
 * @param {?string} ts - last_seen_at
 * @returns {'online'|'stale'|'offline'|'unknown'}
 */
function resolveFreshness(freshness, now, ts) {
  if (freshness === 'online' || freshness === 'stale' || freshness === 'offline') {
    return freshness;
  }
  const then = parseAgentTs(ts);
  if (!Number.isFinite(then)) return 'unknown';
  const age = (now - then) / 1000;
  if (age <= HB_ONLINE_SECS) return 'online';
  if (age <= HB_STALE_SECS) return 'stale';
  return 'offline';
}

/**
 * Designed freshness chip (online/stale/offline/unknown). Right-aligned in the
 * card head via .freshness{margin-left:auto}; dot is decorative (aria-hidden).
 * @param {?string} freshness
 * @param {number} now
 * @param {?string} ts - last_seen_at for the fallback computation
 * @returns {string}
 */
function freshnessChip(freshness, now, ts) {
  const tone = resolveFreshness(freshness, now, ts);
  const label = FRESHNESS_LABELS[tone] || FRESHNESS_LABELS.unknown;
  return (
    '<span class="freshness freshness--' + tone + '">' +
    '<span class="freshness__dot" aria-hidden="true"></span>' +
    escapeHtml(label) +
    '</span>'
  );
}

/**
 * HTML for one agent card.
 * Data contract: the board /api/mc/agents returns {slug,name,kind,status,
 * rig_slug,project_slug,last_seen_at,freshness,...}. Legacy caller shape
 * (name/role/seat/last_seen) is still accepted via fallbacks.
 * @param {{name?:string, slug?:string, kind?:string, role?:string,
 *          seat?:string, last_seen_at?:string, last_seen?:string,
 *          freshness?:string}} agent
 * @param {number} [now]
 * @returns {string}
 */
function agentCardHTML(agent, now) {
  const t = typeof now === 'number' ? now : Date.now();
  const name = (agent && agent.name) || 'Okänd agent';
  const role = (agent && (agent.kind || agent.role)) || '—';
  const seat = (agent && (agent.slug || agent.seat || agent.name)) || '';
  const ts = (agent && (agent.last_seen_at || agent.last_seen)) || null;
  const last = lastSeenLabel(ts, t);
  return (
    '<article class="agent-card" aria-label="Agent: ' + escapeHtml(name) +
      '. Roll: ' + escapeHtml(role) + '" role="article">' +
    '<div class="agent-card__head">' +
    '<span class="agent-card__avatar" aria-hidden="true">' +
    escapeHtml(String(name).charAt(0).toUpperCase() || '?') + '</span>' +
    '<div class="agent-card__id">' +
    '<h3 class="agent-card__name">' + escapeHtml(name) + '</h3>' +
    (seat ? '<code class="agent-card__seat">' + escapeHtml(seat) + '</code>' : '') +
    '</div>' +
    freshnessChip(agent && agent.freshness, t, ts) +
    '</div>' +
    '<p class="agent-card__role">' + escapeHtml(role) + '</p>' +
    '<p class="agent-card__seen">' + escapeHtml(last) + '</p>' +
    '</article>'
  );
}

/**
 * Compose the agents panel for a given state.
 * @param {?Array<Object>} agents - null while loading
 * @param {boolean} [loading]
 * @param {?string} [error]
 * @returns {string}
 */
function renderAgentsPanel(agents, loading, error) {
  if (loading) return loadingStateHTML(3);
  if (error) return errorBandHTML('Kunde inte hämta agenter.', String(error));
  if (!agents || !agents.length) return emptyStateHTML('Inga agenter att visa ännu.');
  return '<div class="agents-grid" role="list">' +
    agents.map((a) => '<div role="listitem">' + agentCardHTML(a) + '</div>').join('') +
    '</div>';
}

/**
 * Browser-only bootstrap: fetch agents and render into container.
 * @param {object} api
 * @param {Element} container
 */
function initAgentsSection(api, container) {
  if (!container) return;
  container.innerHTML = renderAgentsPanel(null, true, null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  const path = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.crew)
    || '/aosb/api/agents';
  (fetcher.getJson ? fetcher.getJson(path) : Promise.reject(new Error('no api')))
    .then((payload) => {
      const agents = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.agents)) ? payload.agents : [];
      container.innerHTML = renderAgentsPanel(agents, false, null);
    })
    .catch((err) => {
      container.innerHTML = renderAgentsPanel(null, false, err && err.message);
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.agents = { agentCardHTML, renderAgentsPanel, lastSeenLabel, freshnessChip, initAgentsSection };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { agentCardHTML, renderAgentsPanel, lastSeenLabel, freshnessChip, initAgentsSection };
}
})(); // /IIFE
