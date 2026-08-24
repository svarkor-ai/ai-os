// node --test tests/  — pure-logic tests for static/js/render.js against the
// real snapshot shape emitted by mc-boards-snapshot.py (VM350-side).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../static/js/render.js');

const tasks = [
  { display_id: '600',   parent_id: null,  status: 'queued',               project_slug: 'demo', seat: null,    title: 'Root goal', released: false, after: [], onfail: [], cycles: null },
  { display_id: '600.1', parent_id: '600', status: 'verified',             project_slug: 'demo', seat: 'sickan', title: 'T1 plan', released: false, after: [], onfail: [], cycles: null },
  { display_id: '600.2', parent_id: '600', status: 'completed_unverified', project_slug: 'demo', seat: 'bernie', title: 'T2 arch', released: true,  after: ['600.1'], onfail: [], cycles: null },
  { display_id: '600.3', parent_id: '600', status: 'queued',               project_slug: 'demo', seat: 'neo',    title: 'T3 review', released: true, after: ['600.2'], onfail: ['600.2'], cycles: 3 },
  { display_id: '600.4', parent_id: '600', status: 'queued',               project_slug: 'demo', seat: 'x',      title: 'T4 later', released: true, after: ['600.3'], onfail: [], cycles: null },
  { display_id: '700',   parent_id: null,  status: 'cancelled',            project_slug: 'other', seat: null,   title: 'Dead', released: false, after: [], onfail: [], cycles: null }
];

test('status vocab is the REAL board vocab (no fictional pending)', () => {
  assert.strictEqual(R.statusMeta('pending').tone, 'default'); // not a real status
  assert.strictEqual(R.statusLabel('queued'), 'I kö');
  assert.strictEqual(R.statusTone('verified'), 'verified');
  assert.strictEqual(R.isDone('completed_unverified'), true);
  assert.strictEqual(R.isDone('queued'), false);
  assert.strictEqual(R.isProgress('cancelled'), false);
});

test('buildTree nests children by display_id parent', () => {
  const roots = R.buildTree(tasks);
  const demoRoot = roots.find(n => n.task.display_id === '600');
  assert.ok(demoRoot);
  assert.strictEqual(demoRoot.children.length, 4);
  assert.deepStrictEqual(demoRoot.children.map(c => c.task.display_id), ['600.1', '600.2', '600.3', '600.4']);
});

test('groupByProject buckets by project_slug', () => {
  const g = R.groupByProject(tasks);
  assert.strictEqual(g.demo.length, 5);
  assert.strictEqual(g.other.length, 1);
});

test('projectProgress excludes cancelled from the denominator', () => {
  const p = R.projectProgress(tasks.filter(t => t.project_slug === 'demo'));
  // 600.1 verified + 600.2 completed_unverified = 2 done of 5 active
  assert.strictEqual(p.active, 5);
  assert.strictEqual(p.done, 2);
  assert.strictEqual(p.pct, 40);
});

test('queueNext: actionable only when after-targets are done AND released', () => {
  const q = R.queueNext(tasks);
  const ids = q.actionable.map(t => t.display_id);
  // 600.3 has after=[600.2] which is completed_unverified (done) and is released -> actionable
  assert.ok(ids.includes('600.3'));
  // 600.4 after=[600.3] which is still queued (not done) -> NOT actionable, in waiting
  assert.ok(!ids.includes('600.4'));
  assert.ok(q.waiting.map(t => t.display_id).includes('600.4'));
});

test('verificationTail splits awaiting vs verified vs cancelled', () => {
  const v = R.verificationTail(tasks);
  assert.deepStrictEqual(v.awaiting.map(t => t.display_id), ['600.2']);
  assert.deepStrictEqual(v.verified.map(t => t.display_id), ['600.1']);
  assert.deepStrictEqual(v.cancelled.map(t => t.display_id), ['700']);
});

test('dependencyEdges emits after + onfail edges with known flag', () => {
  const e = R.dependencyEdges(tasks);
  const after = e.filter(x => x.kind === 'after');
  const onfail = e.filter(x => x.kind === 'onfail');
  assert.strictEqual(after.length, 3);   // 600.2, 600.3, 600.4
  assert.strictEqual(onfail.length, 1);  // 600.3
  assert.ok(after.every(x => x.known === true));
});

test('renderers produce HTML and escape untrusted text', () => {
  const board = { id: 'demo', label: 'Demo', tasks: tasks.concat([
    { display_id: '999', parent_id: null, status: 'queued', project_slug: 'x', seat: null, title: '<script>alert(1)</script>', released: false, after: [], onfail: [], cycles: null }
  ]) };
  const html = R.renderProjects(board);
  assert.ok(html.includes('progress__bar'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(R.renderQueue(board).includes('Näst på tur'));
  assert.ok(R.renderVerification(board).includes('verifiering'));
  assert.ok(R.renderDependencies(board).includes('beroendekanter'));
});

test('empty and error states', () => {
  assert.ok(R.renderProjects({ tasks: [] }).includes('Inga jobb'));
  assert.ok(R.renderProjects({ error: 'boom', tasks: [] }).includes('kunde inte'));
});
