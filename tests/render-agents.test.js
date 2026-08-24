'use strict';

// ============================================================================
// tests/render-agents.test.js — M9 aosw-js-render-agents unit tests (node --test)
// ============================================================================
// Verifies the PURE render helpers for #panel-agents (agent cards built from
// /aos/api/agents: name/role/seat/last_seen). No DOM, no network.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const { agentCardHTML, renderAgentsPanel, lastSeenLabel, freshnessChip } =
  require('./render-agents.js');

test('agentCardHTML renders an accessible card with name, role, seat, last_seen', () => {
  // A fixed "now" reference for deterministic relative-time output.
  const card = agentCardHTML(
    { name: 'nicke', role: 'Frontend/UX', seat: 'nicke', last_seen: '2026-08-21T12:00:00Z' },
    Date.parse('2026-08-21T12:00:00Z')
  );
  assert.match(card, /nicke/);
  assert.match(card, /Frontend\/UX/);
  assert.match(card, /role="article"/);
  // aria-label references seat + availability
  assert.match(card, /aria-label=/);
});

test('agentCardHTML escapes hostile fields (XSS)', () => {
  const card = agentCardHTML({
    name: '<img src=x onerror=alert(1)>',
    role: '"><script>bad()</script>',
    seat: 's',
    last_seen: null,
  }, Date.now());
  assert.ok(!card.includes('<script>'));
  assert.ok(!card.includes('<img src=x'));
  assert.match(card, /&lt;img src=x onerror/);
});

test('lastSeenLabel gives Swedish relative labels', () => {
  const now = Date.parse('2026-08-21T12:00:00Z');
  assert.strictEqual(lastSeenLabel('2026-08-21T11:55:00Z', now), 'För mindre än 10 min sedan');
  assert.strictEqual(lastSeenLabel('2026-08-21T12:00:00Z', now), 'Just nu');
  assert.strictEqual(lastSeenLabel(null, now), 'Aldrig sedd');
  assert.match(lastSeenLabel('2026-08-21T08:00:00Z', now), /timmar? sedan/);
  assert.match(lastSeenLabel('2026-08-20T12:00:00Z', now), /dag/i);
});

test('renderAgentsPanel covers the four states', () => {
  // loading
  const loading = renderAgentsPanel(null, true, null);
  assert.match(loading, /Läser in/);
  // empty
  const empty = renderAgentsPanel([], false, null);
  assert.match(empty, /Inga agenter/);
  // error
  const err = renderAgentsPanel(null, false, 'board nere');
  assert.match(err, /Kunde inte hämta/);
  // success
  const ok = renderAgentsPanel(
    [{ name: 'teddy', role: 'Kodare', seat: 'teddy', last_seen: null }], false, null
  );
  assert.match(ok, /teddy/);
});

// ============================================================================
// MC 244.8 — REAL board data-contract (slug/kind/last_seen_at/freshness)
// The board /api/mc/agents returns {agents:[{slug,name,kind,status,
// project_slug,rig_slug,current_job_id,last_seen_at,metadata_json,created_at,
// freshness}]} where freshness in {online,stale,offline} and last_seen_at is a
// SQLite space-datetime "YYYY-MM-DD HH:MM:SS" (UTC). These tests pin that the
// panel maps those real fields (not the guessed role/seat/last_seen shape).
// ============================================================================

test('agentCardHTML maps real board fields slug/kind/last_seen_at (no role/seat)', () => {
  const now = Date.parse('2026-08-22T06:12:00Z');
  const card = agentCardHTML(
    {
      slug: 'nicke',
      name: 'Nicke',
      kind: 'runner',
      status: 'online',
      rig_slug: 'vm105',
      project_slug: 'svarkor-aios-workflow-phase2',
      last_seen_at: '2026-08-22 06:12:00', // SQLite space-datetime (UTC)
      freshness: 'online',
    },
    now
  );
  // seat comes from slug, role from kind, freshness chip with real tone
  assert.match(card, />nicke<\/code>/);
  assert.match(card, /runner/);
  assert.match(card, /freshness--online/);
  assert.match(card, /Just nu/);
});

test('freshnessChip renders designed chip for each board freshness', () => {
  const now = Date.parse('2026-08-22T06:12:00Z');
  assert.match(freshnessChip('online', now, null), /freshness--online/);
  assert.match(freshnessChip('online', now, null), /Online/);
  assert.match(freshnessChip('stale', now, null), /freshness--stale/);
  assert.match(freshnessChip('stale', now, null), /Fördröjd/);
  assert.match(freshnessChip('offline', now, null), /freshness--offline/);
  assert.match(freshnessChip('offline', now, null), /Offline/);
  // a dot that is aria-hidden (decorative)
  assert.match(freshnessChip('online', now, null), /aria-hidden="true"/);
});

test('freshnessChip computes freshness from last_seen_at when board omits it', () => {
  const now = Date.parse('2026-08-22T06:12:00Z');
  // 30s ago -> online
  assert.match(freshnessChip(null, now, '2026-08-22 06:11:30'), /freshness--online/);
  // 5 min ago -> stale
  assert.match(freshnessChip(null, now, '2026-08-22 06:07:00'), /freshness--stale/);
  // 30 min ago -> offline
  assert.match(freshnessChip(null, now, '2026-08-22 05:42:00'), /freshness--offline/);
  // no timestamp at all -> unknown, never crashes
  assert.match(freshnessChip(null, now, null), /freshness--unknown/);
});

test('lastSeenLabel parses SQLite space-datetime (board contract)', () => {
  const now = Date.parse('2026-08-22T06:12:00Z');
  // "YYYY-MM-DD HH:MM:SS" from datetime('now') must not render "Aldrig sedd"
  assert.strictEqual(lastSeenLabel('2026-08-22 06:12:00', now), 'Just nu');
  // 9 min ago -> under-10-min branch (strictly less than 10 min)
  assert.strictEqual(lastSeenLabel('2026-08-22 06:03:00', now), 'För mindre än 10 min sedan');
  assert.match(lastSeenLabel('2026-08-22 06:02:00', now), /Senast 10 min sedan/);
  assert.strictEqual(lastSeenLabel(null, now), 'Aldrig sedd');
});

test('renderAgentsPanel shows real board agents with slug seat + freshness chip', () => {
  const ok = renderAgentsPanel(
    [
      { slug: 'teddy', name: 'Teddy', kind: 'backend', last_seen_at: '2026-08-22 06:11:00', freshness: 'online' },
      { slug: 'nicke', name: 'Nicke', kind: 'frontend', last_seen_at: '2026-08-22 05:40:00', freshness: 'offline' },
    ],
    false, null
  );
  assert.match(ok, /teddy/);
  assert.match(ok, /freshness--online/);
  assert.match(ok, /freshness--offline/);
  assert.match(ok, /role="list"/);
});
