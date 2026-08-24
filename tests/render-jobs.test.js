'use strict';

// ============================================================================
// tests/render-jobs.test.js — M8 aosw-js-render-jobs unit tests (node --test)
// ============================================================================
// Verifies the PURE stat-chip compute + HTML used to fill the #stat-actionable
// and #stat-gated chips in panel-status from /aos/api/jobs.
// (#stat-events is owned by render-timeline.js from /aos/api/events — see
// tests/render-timeline.test.js — to keep each counter fed by the endpoint that
// actually owns the number.) No DOM, no network.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const { countStats, renderJobsStats, statusTone } = require('./render-jobs.js');

const SAMPLE_JOBS = [
  { id: 1, display_id: '201', title: 'A', status: 'done', owner: 'teddy' },
  { id: 2, display_id: '202', title: 'B', status: 'running', owner: 'nicke' },
  { id: 3, display_id: '203', title: 'C', status: 'gated', owner: 'dobbie' },
  { id: 4, display_id: '204', title: 'D', status: 'pending', owner: 'kjell' },
  { id: 5, display_id: '205', title: 'E', status: 'error', owner: 'mirre' },
];

test('countStats buckets pending+running as actionable, gated separately', () => {
  const stats = countStats(SAMPLE_JOBS);
  assert.strictEqual(stats.actionable, 2); // 202 running + 204 pending
  assert.strictEqual(stats.gated, 1);      // 203
  assert.strictEqual(stats.total, SAMPLE_JOBS.length);
});

test('countStats handles empty array', () => {
  const stats = countStats([]);
  assert.strictEqual(stats.actionable, 0);
  assert.strictEqual(stats.gated, 0);
  assert.strictEqual(stats.total, 0);
});

test('countStats is null-safe / tolerates missing status', () => {
  const stats = countStats([{ id: 9, title: 'X' }]);
  assert.strictEqual(stats.actionable, 0);
  assert.strictEqual(stats.gated, 0);
  assert.strictEqual(stats.total, 1);
});

test('statusTone maps statuses to status-name chip tones', () => {
  assert.strictEqual(statusTone('done'), 'done');
  assert.strictEqual(statusTone('gated'), 'gated');
  assert.strictEqual(statusTone('running'), 'running');
  assert.strictEqual(statusTone('pending'), 'pending');
  assert.strictEqual(statusTone('error'), 'error');
  assert.strictEqual(statusTone('failed'), 'failed');
  assert.strictEqual(statusTone('wut'), 'default');
});

test('renderJobsStats emits a chips block with two job counters', () => {
  const html = renderJobsStats(SAMPLE_JOBS);
  assert.match(html, /Åtgärdbara jobb/);
  assert.match(html, /Gated jobb/);
  assert.match(html, />2<\/span>/);  // actionable value
  assert.match(html, />1<\/span>/);  // gated value
});
