// ============================================================================
// ui/render-status.js — Status section (M10 aosw-js-render-status)
// ============================================================================
// AOS Workflow Dashboard. Renders the #panel-status section: a read-only
// system/API health panel built from a list of probes (from /aosb/api/overview),
// plus the locked Q2 admin controls. GET only.
//
// Probe-state logic + HTML strings are PURE and unit-tested under node; only
// initStatusSection touches the DOM (browser only).
//
// Four-states floor: loading / empty / error / success.
// ============================================================================
(function () {
'use strict';

const DEFAULT_PROBES = [
  { name: 'MC API', ok: true },
  { name: 'Crew-register', ok: true },
];

let escapeHtml = (v) => String(v);
let emptyStateHTML = (m) => `<div class="empty-state">${String(m)}</div>`;
let errorBandHTML = (t, d) => `<div role="alert">${String(t)}</div>`;
let loadingStateHTML = (n) => `<div class="loading-state">${Number(n) || 1}</div>`;
let disabledControlHTML = (l, h) => `<button disabled>${String(l)}</button>`;
try {
  const ui = require('./aosb-js-error-ui.js');
  escapeHtml = ui.escapeHtml;
  emptyStateHTML = ui.emptyStateHTML;
  errorBandHTML = ui.errorBandHTML;
  loadingStateHTML = ui.loadingStateHTML;
  disabledControlHTML = ui.disabledControlHTML;
} catch (e) { /* browser global scope */ }
if (typeof window !== 'undefined' && window.Aos && window.Aos.ui) {
  escapeHtml = window.Aos.ui.escapeHtml;
  emptyStateHTML = window.Aos.ui.emptyStateHTML;
  errorBandHTML = window.Aos.ui.errorBandHTML;
  loadingStateHTML = window.Aos.ui.loadingStateHTML;
  disabledControlHTML = window.Aos.ui.disabledControlHTML;
}

/** Map an ok flag to {tone,label}. */
function probeState(ok) {
  return ok ? { tone: 'good', label: 'OK' } : { tone: 'bad', label: 'Nedsatt' };
}

/** HTML for a single probe row. */
function renderProbeRow(probe) {
  const st = probeState(Boolean(probe && probe.ok));
  return (
    '<li class="probe-row">' +
    '<span class="probe-row__name">' + escapeHtml((probe && probe.name) || 'Okänd tjänst') + '</span>' +
    '<span class="status-chip status-chip--' + st.tone + '">' +
    '<span class="status-chip__dot" aria-hidden="true"></span>' + escapeHtml(st.label) +
    '</span>' +
    (probe && probe.detail ? '<span class="probe-row__detail">' + escapeHtml(probe.detail) + '</span>' : '') +
    '</li>'
  );
}

/** HTML for the read-only admin control strip (locked Q2 actions). */
function renderLockedControls() {
  return (
    '<div class="status-controls" role="group" aria-label="Administrativa åtgärder (låsta i läs-vy)">' +
    '<h3 class="status-controls__title">Kontrollpanel</h3>' +
    '<p class="status-controls__intro">Admin-åtgärder är disponerade men låsta i denna läs-vy (fas 2).</p>' +
    '<div class="status-controls__grid">' +
    disabledControlHTML('Nollställ alla jobb') +
    disabledControlHTML('Kör om debugger seed') +
    disabledControlHTML('Starta om agents') +
    disabledControlHTML('Rensa cachen') +
    '</div>' +
    '</div>'
  );
}

/**
 * Compose the status panel for a given state.
 * @param {?Array<{name:string,ok:boolean}>} probes - null while loading
 * @param {boolean} [loading]
 * @param {?string} [error]
 * @returns {string}
 */
function renderStatusPanel(probes, loading, error) {
  if (loading) {
    return (
      '<div class="status-loading">' +
      '<p class="section-status" role="status">Läser in status…</p>' +
      loadingStateHTML(2) +
      '</div>'
    );
  }
  if (error) return errorBandHTML('Kunde inte hämta status.', String(error));
  return (
    '<div class="status-panel">' +
    '<section class="probe-section" aria-labelledby="probe-heading">' +
    '<h3 id="probe-heading" class="section-heading">Systemstatus</h3>' +
    '<ul class="probe-list">' +
    (probes && probes.length ? probes.map(renderProbeRow).join('') : emptyStateHTML('Inga systemtjänster att visa.')) +
    '</ul>' +
    '</section>' +
    renderLockedControls() +
    '</div>'
  );
}

/** Browser-only bootstrap: fetch status probes and render into container. */
function initStatusSection(api, container) {
  if (!container) return;
  container.innerHTML = renderStatusPanel(null, true, null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  const path = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.status)
    || '/aosb/api/overview';
  (fetcher.getJson ? fetcher.getJson(path) : Promise.reject(new Error('no api')))
    .then((payload) => {
      const probes = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.probes)) ? payload.probes : DEFAULT_PROBES;
      container.innerHTML = renderStatusPanel(probes, false, null);
    })
    .catch((err) => {
      // Read-only: on backend absence still render panel + locked controls.
      container.innerHTML = renderStatusPanel(DEFAULT_PROBES, false, err && err.message);
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.status = {
    DEFAULT_PROBES, probeState, renderProbeRow, renderLockedControls,
    renderStatusPanel, initStatusSection,
  };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_PROBES, probeState, renderProbeRow, renderLockedControls,
    renderStatusPanel, initStatusSection,
  };
}
})(); // /IIFE
