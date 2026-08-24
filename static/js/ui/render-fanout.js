// ============================================================================
// ui/render-fanout.js — Fan-out / job-tree section (M12 aosw-js-render-fanout)
// ============================================================================
// AOS Workflow Dashboard. NEW 189-delta: renders the board-level goal->child
// JOB TREE for #panel-fanout from /aosb/api/jobs. Nodes nest by parent_id.
//
// Contract (C9 Option A): this phase shows the board-level tree only — one
// parent (goal) per card line with its child cards indented beneath it. display_id
// is rendered AS-IS from the board (I6) — NEVER recomputed/renumbered client-side.
// When the dispatch adapter is null (this phase) we render a `.fanout-seam-note`
// explaining that per-dispatch sub-rows are not yet linked.
//
// Pure HTML + tree-build are unit-tested under node; only initFanoutSection
// touches the DOM (browser only, GET only — I1).
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

/** Map a job status to a status-chip tone (status-name tones from dashboard.css). */
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
 * Build the board-level job tree from a flat jobs array, nesting children under
 * their parent by parent_id. Roots = jobs with no parent_id or an unresolvable
 * parent. Returns an array of { job, children:[...] } nodes.
 * @param {Array<Object>} jobs
 * @returns {Array<{job:Object, children:Array}>}
 */
function buildTree(jobs) {
  const arr = Array.isArray(jobs) ? jobs : [];
  const byId = new Map();
  arr.forEach((j, i) => { if (j && j.id != null) byId.set(String(j.id), i); });

  const nodes = arr.map((j) => ({ job: j || {}, children: [] }));
  const roots = [];

  arr.forEach((j, i) => {
    const parentRef = j && j.parent_id;
    const parentIdx = parentRef != null && parentRef !== '' ? byId.get(String(parentRef)) : undefined;
    if (parentIdx != null && parentIdx !== i) {
      nodes[parentIdx].children.push(nodes[i]);
    } else {
      roots.push(nodes[i]);
    }
  });

  return roots;
}

/**
 * HTML for a single tree node (its children nested).
 * @param {{job:Object, children:Array}} node
 * @returns {string}
 */
function nodeHTML(node) {
  const j = node.job || {};
  const tone = statusTone(j.status);
  const updated = j.updated_at
    ? '<time class="fanout-node__updated" datetime="' + escapeHtml(j.updated_at) + '">' + escapeHtml(j.updated_at) + '</time>'
    : '';
  const owner = j.owner ? '<span class="fanout-node__owner">Ägare: ' + escapeHtml(j.owner) + '</span>' : '';
  const children = (node.children && node.children.length)
    ? '<div class="fanout-node__children">' + node.children.map(nodeHTML).join('') + '</div>'
    : '';

  return (
    '<div class="fanout-node">' +
    '<div class="fanout-node__head">' +
    '<span class="fanout-node__id"><code>' + escapeHtml(String(j.display_id != null ? j.display_id : '')) + '</code></span>' +
    '<span class="fanout-node__title">' + escapeHtml(j.title || 'Namnlöst jobb') + '</span>' +
    '<span class="status-chip status-chip--' + tone + '">' +
    '<span class="status-chip__dot" aria-hidden="true"></span>' + escapeHtml(j.status || 'okänd') +
    '</span>' +
    owner +
    updated +
    '</div>' +
    children +
    '</div>'
  );
}

/**
 * HTML for the C9 seam note — shown only when the dispatch adapter is null
 * (this phase renders board-level tree, not dispatch sub-rows).
 * @returns {string}
 */
function seamNoteHTML() {
  return (
    '<p class="fanout-seam-note">' +
    'Vyn visar boardens jobbträd (förälder- och barnjobb). Per-utskicksrader är ' +
    'inte länkade i denna fas — kopplingen till crew-utskick läggs till senare.</p>'
  );
}

/**
 * Compose the fan-out panel for a given state.
 * @param {?Array<Object>} jobs - null while loading
 * @param {boolean} [loading]
 * @param {?string} [error]
 * @param {?Object} [dispatchAdapter] - null this phase (C9 Option A)
 * @param {boolean} [showSeamNote] - convenience override for tests
 * @returns {string}
 */
function renderFanoutPanel(jobs, loading, error, dispatchAdapter, showSeamNote) {
  if (loading) {
    return '<p class="section-status" role="status">Hämtar jobbträd…</p>' + loadingStateHTML(3);
  }
  if (error) return errorBandHTML('Kunde inte hämta jobb.', String(error));

  const adapterPresent = Boolean(dispatchAdapter);
  const seam = showSeamNote === undefined
    ? !adapterPresent
    : Boolean(showSeamNote);

  if (!jobs || !jobs.length) {
    return emptyStateHTML('Inga jobb att visa ännu.') + (seam ? seamNoteHTML() : '');
  }
  const roots = buildTree(jobs);
  return (
    '<div class="fanout-tree" role="list">' +
    roots.map((n) => '<div role="listitem">' + nodeHTML(n) + '</div>').join('') +
    '</div>' +
    (seam ? seamNoteHTML() : '')
  );
}

/**
 * Browser-only bootstrap: fetch jobs and render into {fanout-section, fanout-stats}.
 * GET only (I1).
 * @param {object} api
 * @param {Element} container - #fanout-section
 * @param {Element} [statsContainer] - #fanout-stats (optional)
 */
// Optional in-process reference to the jobs stat renderer (render-jobs.js) so
// the stats bar fills under node --test too; unavailable there, we fall back to
// the browser global binding window.Aos.jobs.renderJobsStats.
let jobsStatsHTML = null;
try {
  jobsStatsHTML = require('./render-jobs.js').renderJobsStats;
} catch (e) { /* browser global scope */ }

function initFanoutSection(api, container, statsContainer, statsRenderer) {
  if (!container) return;
  container.innerHTML = renderFanoutPanel(null, true, null, null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  const path = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.jobs)
    || '/aosb/api/jobs';
  (fetcher.getJson ? fetcher.getJson(path) : Promise.reject(new Error('no api')))
    .then((payload) => {
      const jobs = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.jobs)) ? payload.jobs : [];
      container.innerHTML = renderFanoutPanel(jobs, false, null, null);
      if (statsContainer) {
        const fn = statsRenderer || jobsStatsHTML
          || ((typeof window !== 'undefined' && window.Aos && window.Aos.jobs) ? window.Aos.jobs.renderJobsStats : null);
        if (fn) statsContainer.innerHTML = fn(jobs);
      }
    })
    .catch((err) => {
      container.innerHTML = renderFanoutPanel(null, false, err && err.message, null);
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.fanout = {
    statusTone, buildTree, nodeHTML, seamNoteHTML, renderFanoutPanel, initFanoutSection,
  };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    statusTone, buildTree, nodeHTML, seamNoteHTML, renderFanoutPanel, initFanoutSection,
  };
}
})(); // /IIFE
