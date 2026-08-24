'use strict';

// ============================================================================
// tests/render-timeline.test.js — M11 aosw-js-render-timeline unit tests (node --test)
// ============================================================================
// Verifies the PURE render helpers for #panel-timeline — the NEW 189-delta
// EVENT-STREAM view built from /aos/api/events.
//   Event row shape: { id?, ts, source, title, body, job_id? }.
// Contract (C8): event-stream only — NEVER a per-job status-transition chain,
// no invented links; events with no resolvable job link render an explicit
// `.unlinked` marker. No DOM, no network.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const {
  sortEventsNewestFirst, resolveJobLink, timelineRowHTML,
  renderTimelinePanel, sourceLabel,
} = require('./render-timeline.js');

const JOBS_INDEX = { 201: { display_id: '201', title: 'Bygg backend' } };

test('sourceLabel gives Swedish labels for known sources, passthrough otherwise', () => {
  assert.strictEqual(sourceLabel('manual'), 'Manuell');
  assert.strictEqual(sourceLabel('github-webhook'), 'GitHub');
  assert.strictEqual(sourceLabel('system'), 'System');
  assert.strictEqual(sourceLabel('something-random'), 'something-random');
});

test('sortEventsNewestFirst orders by ts descending, tolerates missing ts', () => {
  const evs = [
    { id: 1, ts: '2026-08-21T10:00:00Z', title: 'older' },
    { id: 2, ts: '2026-08-21T12:00:00Z', title: 'newer' },
    { title: 'no-ts' },
  ];
  const sorted = sortEventsNewestFirst(evs);
  assert.strictEqual(sorted[0].title, 'newer');
  assert.strictEqual(sorted[1].title, 'older');
  assert.strictEqual(sorted[2].title, 'no-ts'); // untimestamped sink to the end
});

test('resolveJobLink returns a display link when the job resolves, else null', () => {
  assert.deepStrictEqual(resolveJobLink('201', JOBS_INDEX),
    { display_id: '201', title: 'Bygg backend' });
  assert.strictEqual(resolveJobLink('999', JOBS_INDEX), null);
  assert.strictEqual(resolveJobLink(undefined, JOBS_INDEX), null);
});

test('timelineRowHTML renders ts, source badge, title, body, job meta', () => {
  const ev = { id: 7, ts: '2026-08-21T09:00:00Z', source: 'manual',
    title: 'Skapade jobb', body: 'Ett nytt jobb startades.' };
  const row = timelineRowHTML(ev, JOBS_INDEX);
  assert.match(row, /timeline-row/);
  assert.match(row, /Manuell/);
  assert.match(row, /Skapade jobb/);
  assert.match(row, /Ett nytt jobb startades/);
  assert.match(row, /09:00:00/); // ISO or HH:MM — our test uses ISO so time present
});

test('timelineRowHTML renders an explicit .unlinked marker when no job link resolves', () => {
  const ev = { id: 8, ts: '2026-08-21T09:00:00Z', source: 'github-webhook',
    title: 'Push', body: 'commit', job_id: '999' }; // 999 not in index
  const row = timelineRowHTML(ev, JOBS_INDEX);
  assert.match(row, /timeline-row__unlinked/);
  // milestone C8: never invent a link — no anchor is produced for a missing job
  assert.ok(!/href=/.test(row) || !/<a /.test(row));
});

test('renderTimelinePanel covers the four states', () => {
  // loading
  assert.match(renderTimelinePanel(null, true, null, {}), /Läser in/);
  // error
  assert.match(renderTimelinePanel(null, false, 'board nere', {}), /Kunde inte hämta/);
  // empty
  assert.match(renderTimelinePanel([], false, null, {}), /Inga händelser/);
  // success
  const ok = renderTimelinePanel(
    [{ id: 1, ts: '2026-08-21T09:00:00Z', source: 'system', title: 'Start', body: '…' }],
    false, null, JOBS_INDEX
  );
  assert.match(ok, /Start/);
});
