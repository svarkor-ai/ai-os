// ============================================================================
// ui/render-timeline.js — Timeline / flow section (M11 aosw-js-render-timeline)
// ============================================================================
// AOS Workflow Dashboard. NEW 189-delta: renders the EVENT-STREAM view for
// #panel-timeline from /aosb/api/events.
//
// Contract (C8): this is an EVENT-STREAM view, NOT a per-job status-transition
// chain — there are no transition arrows or invented causal links. A stream
// event may reference a board job via `job_id`; when that job resolves in the
// jobs index we show a link+title, otherwise we render an explicit `.unlinked`
// marker. It NEVER fabricates a link it cannot prove.
//
// Also owns the #stat-events counter in #status-chips (each counter is fed by
// the endpoint that owns the number).
//
// Pure HTML + sort helpers are unit-tested under node; only initTimelineSection
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

const SOURCE_LABELS = { manual: 'Manuell', 'github-webhook': 'GitHub', system: 'System' };

/** Swedish source label; unknown sources pass through as-is. */
function sourceLabel(source) {
  return (source && SOURCE_LABELS[source]) || (source || 'Okänd källa');
}

/**
 * Sort an event array newest-first by `ts`. Events lacking a parseable ts sink
 * to the end. Returns a new array (never mutates input).
 * @param {Array<Object>} events
 * @returns {Array<Object>}
 */
function sortEventsNewestFirst(events) {
  const arr = Array.isArray(events) ? events.slice() : [];
  return arr.sort((a, b) => {
    const ta = Date.parse(a && a.ts);
    const tb = Date.parse(b && b.ts);
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;  // untimestamped -> end
    if (!Number.isFinite(tb)) return -1;
    return tb - ta; // newest first
  });
}

/**
 * Resolve an event's job link against the jobs index (keyed by display_id or id).
 * Returns {display_id,title} or null when it does not resolve.
 * @param {?(string|number)} jobRef
 * @param {Object} jobsIndex
 * @returns {{display_id:string,title:string}|null}
 */
function resolveJobLink(jobRef, jobsIndex) {
  if (jobRef == null || jobRef === '' || !jobsIndex) return null;
  const hit = jobsIndex[String(jobRef)] || jobsIndex[Number(jobRef)];
  return hit ? { display_id: String(hit.display_id || jobRef), title: hit.title || '' } : null;
}

/**
 * HTML for one timeline row.
 * @param {Object} ev - {id?, ts, source, title, body, job_id?}
 * @param {Object} jobsIndex
 * @returns {string}
 */
function timelineRowHTML(ev, jobsIndex) {
  const ts = (ev && ev.ts) || '';
  const source = (ev && ev.source) || '';
  const title = (ev && ev.title) || 'Händelse';
  const body = (ev && ev.body) || '';
  const link = resolveJobLink(ev && ev.job_id, jobsIndex);

  let meta = '<div class="timeline-row__meta">';
  if (link) {
    meta +=
      '<span class="timeline-row__job" title="Länkat jobb">' +
      '🧩 <code>' + escapeHtml(link.display_id) + '</code> ' + escapeHtml(link.title) +
      '</span>';
  } else {
    // C8: explicit marker — we cannot prove a link, so we say so instead of
    // inventing one. Present only when a job_id was attempted but unresolved.
    meta += '<span class="timeline-row__unlinked" title="Inget länkarvärt jobb kunde matchas">' +
      'ej länkad</span>';
  }
  meta += '</div>';

  return (
    '<li class="timeline-row">' +
    '<div class="timeline-row__head">' +
    (ts ? '<time class="timeline-row__ts" datetime="' + escapeHtml(ts) + '">' + escapeHtml(ts) + '</time>' : '') +
    '<span class="timeline-row__source">' + escapeHtml(sourceLabel(source)) + '</span>' +
    '<span class="timeline-row__title">' + escapeHtml(title) + '</span>' +
    '</div>' +
    '<div class="timeline-row__body">' + escapeHtml(body) + '</div>' +
    meta +
    '</li>'
  );
}

/**
 * Build a jobs index from a jobs payload for link resolution.
 * Keys both by display_id and numeric id.
 * @param {?Array<Object>} jobs
 * @returns {Object<string,{display_id:string,title:string}>}
 */
function buildJobsIndex(jobs) {
  const index = {};
  if (Array.isArray(jobs)) {
    for (const j of jobs) {
      if (!j) continue;
      if (j.id != null) index[String(j.id)] = { display_id: String(j.display_id || ''), title: j.title || '' };
      if (j.display_id) index[String(j.display_id)] = { display_id: String(j.display_id), title: j.title || '' };
    }
  }
  return index;
}

/**
 * Compose the timeline panel for a given state.
 * @param {?Array<Object>} events - null while loading
 * @param {boolean} [loading]
 * @param {?string} [error]
 * @param {Object} [jobsIndex]
 * @returns {string}
 */
function renderTimelinePanel(events, loading, error, jobsIndex) {
  const index = jobsIndex || {};
  if (loading) {
    return '<p class="section-status" role="status">Hämtar händelser…</p>' + loadingStateHTML(3);
  }
  if (error) return errorBandHTML('Kunde inte hämta händelser.', String(error));
  if (!events || !events.length) return emptyStateHTML('Inga händelser ännu. När boarden registrerar händelser visas de här.');
  const ordered = sortEventsNewestFirst(events);
  return (
    '<ol class="timeline" role="list">' +
    ordered.map((ev) => timelineRowHTML(ev, index)).join('') +
    '</ol>'
  );
}

/**
 * Browser-only bootstrap: fetch jobs (for link index) + events and render into
 * #timeline-section, then update #stat-events. GET only (I1). The events chip
 * element is injectable for tests (default: looked up from the document).
 * @param {object} api
 * @param {Element} container
 * @param {?Element} [eventsChip] - #stat-events
 */
function initTimelineSection(api, container, eventsChip) {
  if (!container) return;
  container.innerHTML = renderTimelinePanel(null, true, null);
  const fetcher = api || ((typeof window !== 'undefined') && window.Aos && window.Aos.api);
  const eventsPath = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.events)
    || '/aosb/api/events';
  const jobsPath = (typeof window !== 'undefined' && window.Aos && window.Aos.registry && window.Aos.registry.jobs)
    || '/aosb/api/jobs';

  const chip = eventsChip
    || ((typeof document !== 'undefined') ? document.getElementById('stat-events') : null);

  // Resolve both streams; jobs-index failure must not blank the timeline.
  const jobsP = (fetcher.getJson ? fetcher.getJson(jobsPath) : Promise.resolve(null))
    .catch(() => null);
  const eventsP = (fetcher.getJson ? fetcher.getJson(eventsPath) : Promise.reject(new Error('no api')));

  Promise.all([jobsP, eventsP])
    .then(([jobsPayload, eventsPayload]) => {
      const jobs = Array.isArray(jobsPayload) ? jobsPayload
        : (jobsPayload && Array.isArray(jobsPayload.jobs)) ? jobsPayload.jobs : [];
      const events = Array.isArray(eventsPayload) ? eventsPayload
        : (eventsPayload && Array.isArray(eventsPayload.events)) ? eventsPayload.events : [];
      const index = buildJobsIndex(jobs);
      container.innerHTML = renderTimelinePanel(events, false, null, index);
      if (chip) chip.textContent = String(events.length);
    })
    .catch((err) => {
      container.innerHTML = renderTimelinePanel(null, false, err && err.message, null);
    });
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.timeline = {
    sourceLabel, sortEventsNewestFirst, resolveJobLink, buildJobsIndex,
    timelineRowHTML, renderTimelinePanel, initTimelineSection,
  };
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sourceLabel, sortEventsNewestFirst, resolveJobLink, buildJobsIndex,
    timelineRowHTML, renderTimelinePanel, initTimelineSection,
  };
}
})(); // /IIFE
