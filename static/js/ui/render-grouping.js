// ============================================================================
// render-grouping.js (M10) — project-first job grouping for the ACTIVE fleet
// ============================================================================
// SINGLE CONCERN: group the job queue into per-project tabs with counts, so a
// fleet owner can reason about workload by project. Reads /jobs (GET only, I1)
// and OPTIONALLY /events for the per-Topic cut — both are read-only; this
// module NEVER writes to the board (I1).
//
// CONTRACT C13 (owner M10): the primary grouping key is the CONFIRMED
// /jobs.project_slug. A per-Topic secondary view is derived ONLY from a
// /events topic_slug when present. Rows that carry NO topic_slug are rendered
// as an explicit "unlinked" group rather than being dropped or guessed at
// (I7 / C13). Grouping exists purely to READ jobs into useful buckets; it
// never fabricates a topic.
//
// DESIGN: the pure, DOM-free core (groupByProject / groupByTopic / countJobs /
// renderGrouping) is CommonJS-requireable under node --test; the DOM bootstrap
// sits behind typeof window. escapeHtml falls back to identity under node.
// IIFE for browser, exports for node.
// ============================================================================
(function () {
'use strict';

let escapeHtml = (v) => String(v);
try {
  escapeHtml = require('./aosb-js-error-ui.js').escapeHtml;
} catch (e) { /* browser global scope or node without sibling */ }
if (typeof window !== 'undefined' && window.Aos && window.Aos.ui) {
  escapeHtml = window.Aos.ui.escapeHtml;
}

// UNLINKED is the explicit bucket for rows that carry no /events topic_slug.
const UNLINKED = '__unlinked__';

function countJobs(jobs) {
  return Array.isArray(jobs) ? jobs.length : 0;
}

// Group by the CONFIRMED /jobs.project_slug (C13). Returns an object map of
// project_slug -> number of jobs. Rows without a project_slug fall into the
// UNLINKED bucket so nothing is silently dropped.
function groupByProject(jobs) {
  const map = {};
  const arr = Array.isArray(jobs) ? jobs : [];
  arr.forEach((j) => {
    j = j || {};
    const key = j.project_slug ? String(j.project_slug) : UNLINKED;
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

// Group by the OPTIONAL /events topic_slug (C13). A row with NO topic_slug
// lands in the UNLINKED bucket (I7 / C13). Returns a FLAT topic_slug -> count
// map; the per-PROJECT project_slug key is owned by groupByProject (jobs), and
// topics are NEVER derived from /jobs — only from an /events topic_slug.
function groupByTopic(events) {
  const map = {};
  const arr = Array.isArray(events) ? events : [];
  arr.forEach((e) => {
    e = e || {};
    const topic = e.topic_slug ? String(e.topic_slug) : UNLINKED;
    map[topic] = (map[topic] || 0) + 1;
  });
  return map;
}

function groupLabel(key) {
  return key === UNLINKED ? 'Ej kopplade' : escapeHtml(key);
}

function projectTabsHTML(group) {
  const keys = Object.keys(group);
  if (keys.length === 0) {
    return '<div class="grouping__empty">Inget att gruppera.</div>';
  }
  return keys.map((key) =>
    '<button type="button" class="grouping__tab" data-project="' + escapeHtml(key) + '">' +
    groupLabel(key) + ' <span class="grouping__count">' + group[key] + '</span></button>'
  ).join('');
}

function renderGrouping(group) {
  return '<div class="grouping" role="tablist" aria-label="Gruppera jobb efter projekt">' +
    projectTabsHTML(group) + '</div>';
}

function topicListHTML(topicMap) {
  const topics = Object.keys(topicMap || {});
  if (topics.length === 0) {
    return '<div class="grouping__empty">Inga ämnen att lista.</div>';
  }
  return '<ul class="grouping__topics">' + topics.map((topic) =>
    '<li class="grouping__topic ' + (topic === UNLINKED ? 'grouping__topic--unlinked' : '') + '">' +
    groupLabel(topic) + ' <span class="grouping__count">' + topicMap[topic] + '</span></li>'
  ).join('') + '</ul>';
}

function initGroupingSection(api, container) {
  if (!api || !container) return;

  function render() {
    container.innerHTML = loadingHTML;
    let data;
    try {
      data = api.get('/jobs');
    } catch (e) {
      container.innerHTML = errorHTML(e);
      return;
    }
    const jobs = Array.isArray(data && data.jobs) ? data.jobs : [];
    const group = groupByProject(jobs);
    container.innerHTML = renderGrouping(group);
    bindTabs();
  }

  function bindTabs() {
    const tabs = container.querySelectorAll('.grouping__tab');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('grouping__tab--active'); });
        btn.classList.add('grouping__tab--active');
        renderTopicsFor(btn.getAttribute('data-project'));
      });
    });
  }

  // Per-project topic cut (C13): topics come ONLY from /events topic_slug; the
  // unlinkable bucket is rendered through topicListHTML, never a fabricated label.
  function renderTopicsFor(project) {
    let events = [];
    try {
      const edata = api.get('/events');
      events = Array.isArray(edata && edata.events) ? edata.events : (Array.isArray(edata) ? edata : []);
    } catch (e) { /* per-Topic cut is optional */ }
    const topics = groupByTopic(events);
    container.innerHTML =
      '<h3 class="grouping__project-title">' + groupLabel(project) + '</h3>' +
      topicListHTML(topics);
  }

  render();
  return { refresh: render };
}

const loadingHTML = '<div class="grouping__loading" role="status">Läser in grupper…</div>';
function errorHTML(e) {
  return '<div class="grouping__error" role="alert">Kunde inte gruppera jobb. ' +
    escapeHtml(e && e.message ? e.message : '') + '</div>';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UNLINKED: UNLINKED,
    countJobs: countJobs,
    groupByProject: groupByProject,
    groupByTopic: groupByTopic,
    renderGrouping: renderGrouping,
    topicListHTML: topicListHTML,
    initGroupingSection: initGroupingSection
  };
}

if (typeof window !== 'undefined' && window.Aos) {
  window.Aos.registerModule('grouping', initGroupingSection);
  window.Aos.registry = window.Aos.registry || {};
  window.Aos.registry.grouping = '/aosb/api/jobs';
}
})();
