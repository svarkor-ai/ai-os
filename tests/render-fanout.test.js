'use strict';

// ============================================================================
// tests/render-fanout.test.js — M12 aosw-js-render-fanout unit tests (node --test)
// ============================================================================
// Verifies the PURE render helpers for #panel-fanout — the NEW 189-delta
// board-level goal->child JOB TREE built from /aos/api/jobs.
// Contract (C9 Option A): board-level tree only this phase; display_id rendered
// AS-IS (I6) never recomputed; a seam note when the dispatch adapter is null.
// No DOM, no network.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const { buildTree, nodeHTML, renderFanoutPanel } =
  require('./render-fanout.js');

test('buildTree nests children under their parent by parent_id', () => {
  const jobs = [
    { id: 1, display_id: '201', title: 'Parent A', status: 'done', owner: 'teddy', parent_id: null },
    { id: 2, display_id: '202', title: 'Child A1', status: 'running', owner: 'nicke', parent_id: 1 },
    { id: 3, display_id: '203', title: 'Child A2', status: 'gated', owner: 'dobbie', parent_id: 1 },
    { id: 4, display_id: '204', title: 'Root B', status: 'pending', owner: 'kjell' },
  ];
  const roots = buildTree(jobs);
  assert.strictEqual(roots.length, 2); // two roots
  const parentA = roots.find((r) => r.job.display_id === '201');
  assert.strictEqual(parentA.children.length, 2);
  assert.strictEqual(parentA.children[0].job.display_id, '202');
  assert.strictEqual(parentA.children[1].job.display_id, '203');
});

test('buildTree keeps display_id AS-IS (I6) — never renumbers parents', () => {
  const jobs = [
    { id: 10, display_id: '245.3', title: 'R', status: 'done' },
    { id: 11, display_id: '245.3a', title: 'C', status: 'done', parent_id: 10 },
  ];
  const roots = buildTree(jobs);
  assert.strictEqual(roots[0].job.display_id, '245.3');     // untouched
  assert.strictEqual(roots[0].children[0].job.display_id, '245.3a'); // untouched
});

test('nodeHTML renders a node with id, status tone, owner, updated', () => {
  const node = { job: { id: 1, display_id: '201', title: 'Bygg', status: 'gated',
    owner: 'dobbie', updated_at: '2026-08-21T10:00:00Z' }, children: [] };
  const html = nodeHTML(node);
  assert.match(html, /201/);
  assert.match(html, /Bygg/);
  assert.match(html, /status-chip--gated/); // gated tone
  assert.match(html, /dobbie/);
});

test('renderFanoutPanel covers the four states and emits the seam note', () => {
  // loading
  assert.match(renderFanoutPanel(null, true, null, null, true), /Läser in/);
  // error
  assert.match(renderFanoutPanel(null, false, 'board nere', null, true), /Kunde inte hämta/);
  // empty
  assert.match(renderFanoutPanel([], false, null, null, true), /Inga jobb/);
  // success
  const ok = renderFanoutPanel(
    [{ id: 1, display_id: '201', title: 'Bygg', status: 'done', owner: 'teddy' }],
    false, null, null, true
  );
  assert.match(ok, /Bygg/);
  // seam note present because the dispatch adapter is null this phase (C9 Option A)
  assert.match(ok, /fanout-seam-note/);
});

test('renderFanoutPanel omits the seam note when an adapter is provided', () => {
  const ok = renderFanoutPanel(
    [{ id: 1, display_id: '201', title: 'Bygg', status: 'done' }],
    false, null, { adapter: true }, false
  );
  assert.ok(!ok.includes('fanout-seam-note'));
});
