// ============================================================================
// render-sortable-jobs.js (M9) — client-side sortable table over /jobs (NEW)
// ============================================================================
// SINGLE CONCERN: render a sortable table of job rows for the ACTIVE fleet.
// Reads /jobs (GET only, I1), renders a table, and lets the user toggle sort
// by column. Sorting happens ONLY on the client — NEVER mutates the board and
// NEVER writes anything back (I1 read-only).
//
// CONTRACT C12 (owner M9): sort is limited to VERIFIED /jobs fields:
//   status, display_id (board display order), project_slug, and age derived
//   from updated_at WHEN present (rows without a timestamp sort last / stable).
// A missing sort-value must not crash — it falls into a stable bucket (I7).
//
// DESIGN: like its siblings, the pure, DOM-free core (SORT_KEYS / buildRows /
// sortJobs / renderSortableTable) is CommonJS-requireable under node --test;
// the DOM bootstrap lives behind typeof window. escapeHtml falls back to
// identity under node. IIFE for browser, exports for node.
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

// Verified sortable keys (C12): status, board display order, project, age.
const SORT_KEYS = {
  status: { label: 'Status',  get: (j) => j && j.status ? String(j.status) : '' },
  id:     { label: 'ID',      get: (j) => j && j.display_id ? String(j.display_id) : '' },
  project:{ label: 'Projekt', get: (j) => j && j.project_slug ? String(j.project_slug) : '' },
  age:    { label: 'Ålder',   get: (j) => j && j.updated_at ? String(j.updated_at) : '' },
};

function buildRows(jobs) {
  const arr = Array.isArray(jobs) ? jobs : [];
  return arr.map((j) => {
    j = j || {};
    return {
      display_id: String(j.display_id || ''),
      status: String(j.status || ''),
      title: String(j.title || ''),
      requested_by: String(j.requested_by || ''),
      project_slug: String(j.project_slug || ''),
      result_summary: String(j.result_summary || ''),
      updated_at: j.updated_at ? String(j.updated_at) : '',
    };
  });
}
function sortJobs(jobs, key, dir) {
  const arr = Array.isArray(jobs) ? jobs.slice() : [];
  const spec = SORT_KEYS[key] || SORT_KEYS.id;
  const get = spec.get;
  const ascending = dir !== 'desc';
  arr.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === vb) return 0;
    if (va === '') return 1;
    if (vb === '') return -1;
    const cmp = va < vb ? -1 : (va > vb ? 1 : 0);
    return ascending ? cmp : -cmp;
  });
  return arr;
}
function sortableTh(keySpec, key, aria) {
  return '<th scope="col" aria-sort="' + aria + '">' +
    '<button type="button" class="sortable__btn" data-sort="' + key + '">' +
    escapeHtml(keySpec.label) + '</button></th>';
}
function renderSortableTable(rows, sort) {
  const activeKey = sort && sort.key ? sort.key : 'id';
  const dir = sort && sort.dir === 'desc' ? 'desc' : 'asc';
  const head =
    '<thead class="sortable__head"><tr>' +
    sortableTh(SORT_KEYS.id, 'id', activeKey === 'id' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') +
    '<th scope="col">Titel</th>' +
    sortableTh(SORT_KEYS.status, 'status', activeKey === 'status' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') +
    sortableTh(SORT_KEYS.project, 'project', activeKey === 'project' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') +
    sortableTh(SORT_KEYS.age, 'age', activeKey === 'age' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') +
    '<th scope="col">Framförd av</th>' +
    '</tr></thead>';
  let body;
  if (Array.isArray(rows) && rows.length === 0) {
    body = '<tbody class="sortable__body"><tr class="sortable__empty"><td colspan="6">Inga jobb att visa.</td></tr></tbody>';
  } else {
    body = '<tbody class="sortable__body">' + rows.map((r) =>
      '<tr>' +
      '<td class="sortable__id">' + escapeHtml(r.display_id) + '</td>' +
      '<td>' + escapeHtml(r.title) + '</td>' +
      '<td><span class="sortable__status">' + escapeHtml(r.status) + '</span></td>' +
      '<td>' + escapeHtml(r.project_slug) + '</td>' +
      '<td>' + escapeHtml(r.updated_at) + '</td>' +
      '<td>' + escapeHtml(r.requested_by) + '</td>' +
      '</tr>').join('') + '</tbody>';
  }

  return '<div class="sortable-wrap"><table class="sortable">' + head + body + '</table></div>';
}

function initSortableJobsSection(api, container) {
  if (!api || !container) return;
  let sort = { key: 'id', dir: 'asc' };

  function render() {
    container.innerHTML = loadingStateHTML('sortable');
    const ctl = { setResult: function (m) { container.innerHTML = mountErrorBand(m); } };
    container.textContent = '';

    let data;
    try {
      data = api.get('/jobs');
    } catch (e) {
      ctl.setResult('Kunde inte hämta jobb. ' + (e && e.message ? e.message : ''));
      return;
    }
    const jobs = Array.isArray(data && data.jobs) ? data.jobs : [];
    const rows = buildRows(jobs);
    const sorted = sortJobs(rows, sort.key, sort.dir);
    container.innerHTML = renderSortableTable(sorted, sort);
    bindSort();
  }

  function bindSort() {
    const btns = container.querySelectorAll('.sortable__btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-sort');
        if (sort.key === key) {
          sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sort.key = key;
          sort.dir = 'asc';
        }
        render();
      });
    });
  }

  render();
  return { refresh: render };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sortJobs: sortJobs,
    buildRows: buildRows,
    renderSortableTable: renderSortableTable,
    initSortableJobsSection: initSortableJobsSection
  };
}

if (typeof window !== 'undefined' && window.Aos) {
  window.Aos.registerModule('sortableJobs', initSortableJobsSection);
  window.Aos.registry = window.Aos.registry || {};
  window.Aos.registry.sortableJobs = '/aosb/api/jobs';
}
})();
