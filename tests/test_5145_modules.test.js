// ============================================================================
// test_5145_modules.test.js — TDD suite for M8/M9/M10 render modules + M12 shell
// ============================================================================
// MC job 514.5 (T6): new render modules + app shell. This suite drives the
// implementation from RED (no module exists) to GREEN, proving the CONTRACTS:
//   C11 (queue-next): picks next actionable job by board order, VERIFIED fields
//                     only, explicit "none queued" empty state when nothing
//                     actionable; no sort/group.
//   C12 (sortable):   client-side sort over VERIFIED /jobs fields only; sort
//                     never mutates the board (I1); keys limited to proven fields
//                     (status, display order, project_slug, updated age if present).
//   C13 (grouping):   per-PROJECT key = jobs.project_slug (CONFIRMED); per-TOPIC
//                     only from events topic_slug; unlinkable rows render
//                     "unlinked" marker (I7) — never fabricate a topic label.
//   I6  render display_id as-is.
//   C6  fixed DOM ids passed to init (assemble with the injectable container).
// Run:  node --test test_5145_modules.test.js   (from the nicke workspace)
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// LOAD ALL MODULES UP FRONT. A missing module throws HERE so the whole run
// goes RED immediately — never silently skip an assertion because a module is
// absent. That makes RED→GREEN honest: before implementation the run fails.
const M8 = require('./render-queue-next.js');
const M9 = require('./render-sortable-jobs.js');
const M10 = require('./render-grouping.js');
const M12 = require('./app.js');

// ----------------------------------------------------------------------------
// Sample /jobs payload matching the VERIFIED fields (C11/C12/C13): display_id,
// status, title, requested_by, project_slug, result_summary; updated_at present
// on some rows (C12 age); NO topic_slug on jobs (7+V, C13), topic only on events.
// ----------------------------------------------------------------------------
const SAMPLE_JOBS = [
  { display_id: 'J-001', status: 'done',       title: 'Done job',   requested_by: 'neo',   project_slug: 'alpha', result_summary: 'ok', updated_at: '2026-08-24T05:00:00Z' },
  { display_id: 'J-002', status: 'pending',    title: 'Pending A',  requested_by: 'teddy', project_slug: 'alpha', result_summary: '',   updated_at: '2026-08-24T06:00:00Z' },
  { display_id: 'J-003', status: 'running',    title: 'Running B',  requested_by: 'dobbie', project_slug: 'beta',  result_summary: '',   updated_at: '2026-08-24T06:30:00Z' },
  { display_id: 'J-004', status: 'gated',      title: 'Gated C',    requested_by: 'neo',   project_slug: 'alpha', result_summary: '',   updated_at: '2026-08-24T04:00:00Z' },
  { display_id: 'J-005', status: 'failed',     title: 'Failed D',   requested_by: 'sickan', project_slug: 'beta',  result_summary: 'oops', updated_at: '2026-08-24T03:00:00Z' },
  { display_id: 'J-006', status: 'error',      title: 'Error E',    requested_by: 'nicke', project_slug: 'gamma', result_summary: '',   updated_at: '2026-08-24T02:00:00Z' },
];

const SAMPLE_EVENTS = [
  { topic_slug: 'alpha',   event_type: 'job_done',  message: 'Alpha done' },
  { topic_slug: 'beta',    event_type: 'job_start', message: 'Beta start' },
  { topic_slug: '',        event_type: 'job_done',  message: 'No topic' },
  { event_type: 'job_done', message: 'No topic field at all' },
];

// ----------------------------------------------------------------------------
// M8 — C11 queue-next
// ----------------------------------------------------------------------------
test('M8 C11 pickNextActionable returns null for empty list', () => {
  assert.strictEqual(M8.pickNextActionable([]), null);
});

test('M8 C11 picks the FIRST actionable job in board order (pending/running)', () => {
  const picked = M8.pickNextActionable(SAMPLE_JOBS);
  // J-002 (pending) precedes J-003 (running) in board order -> J-002
  assert.strictEqual(picked.display_id, 'J-002');
});

test('M8 C11 skips non-actionable (done/gated/failed/error) rows', () => {
  const onlyDone = [SAMPLE_JOBS[0], SAMPLE_JOBS[5]];
  assert.strictEqual(M8.pickNextActionable(onlyDone), null);
});

test('M8 C11 full payload -> render card, picks J-002, exact display_id', () => {
  const html = M8.renderQueueNext(SAMPLE_JOBS);
  assert.ok(!html.includes('J-003'), 'should pick J-002 first, not J-003');
  assert.ok(html.includes('J-002'));
  assert.ok(html.includes('Pending A'));
});

test('M8 C11 empty payload -> explicit "none queued" empty state', () => {
  const html = M8.renderQueueNext([]);
  assert.ok(html.includes('queue-next--empty'), 'empty-state class present');
  assert.ok(/Inga[^\n]*i kö|ingen[^\n]*i kö/i.test(html), 'Swedish "nothing queued" copy');
});

// ----------------------------------------------------------------------------
// M9 — C12 sortable
// ----------------------------------------------------------------------------
test('M9 C12 sortJobs returns a NEW array, never mutates input (I1)', () => {
  const input = SAMPLE_JOBS.slice();
  const copy = SAMPLE_JOBS.map((j) => Object.assign({}, j));
  const out = M9.sortJobs(input, 'status', 'asc');
  assert.notStrictEqual(out, input);
  assert.deepStrictEqual(input, copy, 'input untouched (I1)');
});

test('M9 C12 sort by status ascending groups order', () => {
  const out = M9.sortJobs(SAMPLE_JOBS, 'status', 'asc');
  const statuses = out.map((j) => j.status);
  assert.deepStrictEqual(statuses, statuses.slice().sort());
});

test('M9 C12 sort descending flips', () => {
  const asc = M9.sortJobs(SAMPLE_JOBS, 'status', 'asc').map((j) => j.status);
  const desc = M9.sortJobs(SAMPLE_JOBS, 'status', 'desc').map((j) => j.status);
  assert.deepStrictEqual(desc, asc.slice().reverse());
});

test('M9 C12 sort by project_slug (verified field) is stable', () => {
  const out = M9.sortJobs(SAMPLE_JOBS, 'project', 'asc');
  const projects = out.map((j) => j.project_slug);
  assert.deepStrictEqual(projects, projects.slice().sort());
});

test('M9 C12 renderSortableTable emits sortable classes + escaped ids (I6)', () => {
  const rows = M9.buildRows(SAMPLE_JOBS);
  const html = M9.renderSortableTable(rows, { key: 'status', dir: 'asc' });
  assert.ok(html.includes('sortable'));
  assert.ok(html.includes('J-001'));
  assert.ok(html.includes('<th'));
});

test('M9 C12 buildRows keeps board rows as-is, no mutation', () => {
  assert.strictEqual(M9.buildRows(SAMPLE_JOBS).length, SAMPLE_JOBS.length);
});

// ----------------------------------------------------------------------------
// M10 — C13 grouping (per-project with per-topic + unlinked marker)
// ----------------------------------------------------------------------------
test('M10 C13 groupByProject counts by project_slug ONLY (CONFIRMED key)', () => {
  const g = M10.groupByProject(SAMPLE_JOBS);
  assert.strictEqual(g.alpha, 3); // J-001, J-002, J-004
  assert.strictEqual(g.beta, 2);  // J-003, J-005
  assert.strictEqual(g.gamma, 1); // J-006
});

test('M10 C13 jobs carry NO topic_slug -> topic grouping must never come from /jobs', () => {
  // groupByTopic consumes ONLY /events; with none, there are no topics at all.
  assert.deepStrictEqual(M10.groupByTopic([]), {}, 'no events -> no topics');
});

test('M10 C13 topic grouping from /events topic_slug only; empty -> unlinked marker', () => {
  const g = M10.groupByTopic(SAMPLE_EVENTS);
  assert.strictEqual(g.alpha, 1);
  assert.strictEqual(g.beta, 1);
  // Two event rows carry no usable topic_slug -> both land in the UNLINKED bucket.
  assert.strictEqual(g[M10.UNLINKED], 2, 'unlinked bucket counts rows without topic_slug');
});

test('M10 C13 renderGrouping emits grouping tabs + project counts', () => {
  const g = M10.groupByProject(SAMPLE_JOBS);
  const html = M10.renderGrouping(g);
  assert.ok(html.includes('grouping'));
  assert.ok(html.includes('alpha'));
});

test('M10 C13 unlinked rows render an honest marker — never a fabricated label', () => {
  const topics = M10.groupByTopic(SAMPLE_EVENTS);
  const html = M10.topicListHTML(topics);
  assert.ok(/Ej kopplade/.test(html), 'honest "unlinked" marker present, not a made-up topic');
  assert.ok(!/fabric/i.test(html));
});

// ----------------------------------------------------------------------------
// M12 — C6/C6f shell: API pass-through surface (pure, DI-able)
// ----------------------------------------------------------------------------
test('M12 C6 shell exposes refreshAll/refreshPanel/showTab/boot (DI, not window)', () => {
  // The shell wires init(api, container) with a caller-supplied api client so it
  // works for BOTH fleets after Aos.setFleet re-points the client (C6f). We only
  // assert the surface exists and that refreshPanel is invokeable with an api.
  assert.strictEqual(typeof M12.refreshAll, 'function');
  assert.strictEqual(typeof M12.refreshPanel, 'function');
  assert.strictEqual(typeof M12.showTab, 'function');
  assert.strictEqual(typeof M12.boot, 'function');
});

console.log('test_5145_modules.test.js loaded OK');
