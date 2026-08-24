// ============================================================================
// render-queue-next.js (M8) — "next up" card for the ACTIVE fleet (NEW)
// ============================================================================
// SINGLE CONCERN: render the next actionable job card. It reads /jobs (GET
// only, I1 read-only), picks the FIRST actionable job by board order, and
// renders a single card. When nothing is actionable it shows an explicit
// "Inga jobb i kö" empty state (I5/I7) — never a blank leftover (C6c).
//
// CONTRACT C11 (owner M8): render display_id/status/title/requested_by/
// project_slug/result_summary ONLY — all VERIFIED fields. It must NOT sort or
// group (that is M9/M10's job) and MUST show an explicit empty state.
// ACTIONABLE = pending | running (matches #stat-actionable in render-jobs.js's
// countStats). No fabricated data; no topic (I7 — job card never pretends a
// topic it cannot prove).
//
// DESIGN: like render-jobs.js (its sibling idiom) the pure, DOM-free core
// (pickNextActionable / renderQueueNext) is CommonJS-requireable under node
// --test; DOM bootstrap lives behind `typeof window` guard. escapeHtml falls
// back to identity under node. File is an IIFE for the browser, exports for
// node.
// ============================================================================
(function () {
'use strict';

// escapeHtml fallback so this file is require()able under node --test without a
// browser; in the browser it resolves to the shared Aos.ui helper (M7).
let escapeHtml = (v) => String(v);
try {
  escapeHtml = require('./aosb-js-error-ui.js').escapeHtml;
} catch (e) { /* browser global scope or node without sibling */ }
if (typeof window !== 'undefined' && window.Aos && window.Aos.ui) {
  escapeHtml = window.Aos.ui.escapeHtml;
}

// Statuses that count as "åtgärdbara" (actionable) for the next-up card.
// Mirrors #stat-actionable in render-jobs.js countStats (pending+running).
const ACTIONABLE_STATUS = ['pending', 'running'];

/**
 * Pick the NEXT actionable job in board order, or null when there is none.
 * "Actionable" = status in ACTIONABLE_STATUS (pending|running). Reads only
 * VERIFIED fields (C11). First match wins (board order as delivered).
 * @param {Array<{status?:string}>} jobs
 * @returns {?Object}
 */
function pickNextActionable(jobs) {
  const arr = Array.isArray(jobs) ? jobs : [];
  for (const j of arr) {
    if (j && ACTIONABLE_STATUS.indexOf(j.status) !== -1) return j;
  }
  return null;
}

/**
 * HTML for the next-up card, or the explicit empty state when nothing queued.
 * @param {Array<Object>} jobs
 * @returns {string}
 */
function renderQueueNext(jobs) {
  const job = pickNextActionable(jobs);
  if (!job) {
    return (
      '<div class="queue-next queue-next--empty">' +
      '<p class="queue-next__none">Inga jobb i kö just nu.</p>' +
      '<p class="queue-next__hint">Nästa åtgärdbara jobb visas här när det finns.</p>' +
      '</div>'
    );
  }
  const title = String(job.title || '');
  const id = String(job.display_id || '');
  const status = String(job.status || '');
  const requestor = String(job.requested_by || '');
  const project = String(job.project_slug || '');
  const summary = String(job.result_summary || '');
  return (
    '<div class="queue-next">' +
    '<p class="queue-next__label">Nästa i kö</p>' +
    '<h2 class="queue-next__title">' + escapeHtml(title || id) + '</h2>' +
    '<div class="queue-next__meta">' +
    (id ? '<div class="queue-next__id">' + escapeHtml(id) + '</div>' : '') +
    '<span class="queue-next__status">' + escapeHtml(status) + '</span>' +
    (project ? '<div><dt>Projekt</dt><dd>' + escapeHtml(project) + '</dd></div>' : '') +
    (requestor ? '<div><dt>Framförd av</dt><dd>' + escapeHtml(requestor) + '</dd></div>' : '') +
    (summary ? '<div><dt>Sammanfattning</dt><dd>' + escapeHtml(summary) + '</dd></div>' : '') +
    '</div>' +
    '</div>'
  );
}

/**
 * Browser-only bootstrap: fetch /jobs and mount the next-up card into
 * container. GET only (I1); never mutates. Internally renders the four-states
 * floor: '…' placeholder → success card / explicit empty → error band.
 * @param {object} api - Aos.api client (getJson)
 * @param {?(HTMLElement|string)} container - element or id to mount into
 * @returns {Promise<void>}
 */
function initQueueNextSection(api, container) {
  const root = typeof container === 'string'
    ? ((typeof document !== 'undefined') ? document.getElementById(container) : null)
    : container
    || ((typeof document !== 'undefined') ? document.getElementById('queue-next-section') : null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  if (!root) return Promise.resolve();

  const mount = (html) => { root.innerHTML = html; };
  const setLoading = () => {
    const w = window.Aos && window.Aos.ui;
    mount(w && w.loadingStateHTML ? w.loadingStateHTML() : '<p class="queue-next">…</p>');
  };

  setLoading();
  const path = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.jobs)
    || '/aosb/api/jobs';

  return (fetcher && fetcher.getJson ? fetcher.getJson(path) : Promise.reject(new Error('no api')))
    .then((payload) => {
      const jobs = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.jobs)) ? payload.jobs : [];
      mount(renderQueueNext(jobs));
    })
    .catch((err) => {
      const w = window.Aos && window.Aos.ui;
      if (w && w.mountErrorBand) {
        w.mountErrorBand(root, {
          title: 'Kunde inte hämta nästa jobb.',
          detail: err && err.message ? String(err.message) : undefined,
        });
      } else {
        mount('<div class="error-band"><p class="error-band__title">Kunde inte hämta nästa jobb.</p></div>');
      }
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.queueNext = { ACTIONABLE_STATUS, pickNextActionable, renderQueueNext, initQueueNextSection };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ACTIONABLE_STATUS, pickNextActionable, renderQueueNext, initQueueNextSection };
}
})(); // /IIFE
