// ============================================================================
// ui/render-jobs.js — Job stat chips (M8 aosw-js-render-jobs)
// ============================================================================
// AOS Workflow Dashboard. Computes + renders the read-only job counters for
// #panel-status:
//   - #stat-actionable (jobb som är pending/running — "åtgärdbara")
//   - #stat-gated     (jobb som väntar på grind)
// (#stat-events is owned by render-timeline.js from /aosb/api/events so each
// counter is fed by the endpoint that owns the number.)
//
// Pure compute + HTML are unit-tested under node; only `initJobsStats` touches
// the DOM (browser only, GET only via Aos.get — read-only invariant I1).
//
// Four-states floor: the chips are counters (loading shows "…", error keeps a
// dash). Full state handling lives in the render-* sections.
// ============================================================================
(function () {
'use strict';

// Module-scoped helper fallbacks so this file is require()able under node --test
// without a browser; in the browser they resolve to shared Aos.ui helpers.
let escapeHtml = (v) => String(v);
try {
  escapeHtml = require('./error-ui.js').escapeHtml;
} catch (e) { /* browser global scope */ }
if (typeof window !== 'undefined' && window.Aos && window.Aos.ui) {
  escapeHtml = window.Aos.ui.escapeHtml;
}

/**
 * Count jobs into the stat buckets used by the status chips.
 * Actionable = pending + running; gated = gated. total = every board job row.
 * @param {Array<{status?:string}>} jobs
 * @returns {{actionable:number, gated:number, total:number}}
 */
function countStats(jobs) {
  const arr = Array.isArray(jobs) ? jobs : [];
  let actionable = 0;
  let gated = 0;
  for (const j of arr) {
    const s = j && j.status;
    if (s === 'pending' || s === 'running') actionable++;
    else if (s === 'gated') gated++;
  }
  return { actionable, gated, total: arr.length };
}

/**
 * Map a job status to a status-chip tone. Returns the STATUS NAME so the class
 * aligns with dashboard.css's status-name tone classes (.status-chip--done,
 * --gated, --running, --pending, --error, --failed, --default) — matching the
 * 157 idiom and guaranteeing the chip actually gets a color.
 * @param {string} status
 * @returns {string}
 */
function statusTone(status) {
  switch (status) {
    case 'done': return 'done';
    case 'gated': return 'gated';
    case 'running': return 'running';
    case 'pending': return 'pending';
    case 'error': return 'error';
    case 'failed': return 'failed';
    default: return 'default';
  }
}

/**
 * HTML for the two job-count chips shown in #status-chips.
 * @param {Array<Object>} jobs
 * @returns {string}
 */
function renderJobsStats(jobs) {
  const stats = countStats(jobs);
  return (
    '<div class="stats-grid">' +
    '<div class="stat-card">' +
    '<span class="stat-card__value">' + escapeHtml(String(stats.actionable)) + '</span>' +
    '<span class="stat-card__label">Åtgärdbara jobb</span>' +
    '</div>' +
    '<div class="stat-card">' +
    '<span class="stat-card__value">' + escapeHtml(String(stats.gated)) + '</span>' +
    '<span class="stat-card__label">Gated jobb</span>' +
    '</div>' +
    '<div class="stat-card">' +
    '<span class="stat-card__value">' + escapeHtml(String(stats.total)) + '</span>' +
    '<span class="stat-card__label">Jobb totalt</span>' +
    '</div>' +
    '</div>'
  );
}

/**
 * Browser-only bootstrap: fetch jobs and update the stat chips in
 * #stat-actionable and #stat-gated (in panel-status). GET only (I1). Never
 * mutates. The chip elements are injectable for tests (default: looked up from
 * the document when running in a browser).
 * @param {object} api - Aos.api client (get/getJson)
 * @param {?Element} [actionableEl] - #stat-actionable
 * @param {?Element} [gatedEl] - #stat-gated
 */
function initJobsStats(api, actionableEl, gatedEl) {
  const actionable = actionableEl
    || ((typeof document !== 'undefined') ? document.getElementById('stat-actionable') : null);
  const gated = gatedEl
    || ((typeof document !== 'undefined') ? document.getElementById('stat-gated') : null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  if (!actionable && !gated) return;

  const setChips = (stats) => {
    if (actionable) actionable.textContent = String(stats.actionable);
    if (gated) gated.textContent = String(stats.gated);
  };

  // Default: dash while data loads (counters are cheap; no full skeleton here).
  setChips({ actionable: '…', gated: '…' });

  const path = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.jobs)
    || '/aosb/api/jobs';
  (fetcher.getJson ? fetcher.getJson(path) : Promise.reject(new Error('no api')))
    .then((payload) => {
      const jobs = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.jobs)) ? payload.jobs : [];
      setChips(countStats(jobs));
    })
    .catch(() => {
      // Read-only: keep the chips at a visible dash rather than a dead blank.
      setChips({ actionable: '—', gated: '—' });
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.jobs = { countStats, statusTone, renderJobsStats, initJobsStats };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countStats, statusTone, renderJobsStats, initJobsStats };
}
})(); // /IIFE
