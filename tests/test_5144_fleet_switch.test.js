'use strict';
// ============================================================================
// TDD suite — MC 514.4 M5 fleet-switch core + M11 FIX#2 path-repoint contract
// ============================================================================
// Tests the PURE, node-requireable surface of fleet-switch.js and the FIX#2
// contract that the five ported renderers must satisfy (none may reference the
// board origin path /aos/api/). Written FIRST (RED), then the module made them
// pass (GREEN). DoD: node --check + this suite GREEN + grep shows zero /aos/api/
// in the renderers.
// ============================================================================

const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const FSW = require('./fleet-switch.js');

// ---- M5: pure deep-link / fleet meta contract ---------------------------------

test('M5: parseFleetParam accepts only A|B and defaults unknown to A', () => {
  assert.strictEqual(FSW.parseFleetParam('B'), 'B');
  assert.strictEqual(FSW.parseFleetParam('A'), 'A');
  assert.strictEqual(FSW.parseFleetParam(''), 'A');      // missing -> A
  assert.strictEqual(FSW.parseFleetParam(undefined), 'A');
  assert.strictEqual(FSW.parseFleetParam('C'), 'A');     // unknown -> A
  assert.strictEqual(FSW.parseFleetParam('b'), 'A');     // case-sensitive -> A
  assert.strictEqual(FSW.parseFleetParam('vm104'), 'A'); // host label != fleet id
});

test('M5: FleetMeta maps A->vm104 and B->vm105 (labels, not tokens)', () => {
  assert.strictEqual(FSW.FleetMeta.A.host, 'vm104');
  assert.strictEqual(FSW.FleetMeta.B.host, 'vm105');
  assert.strictEqual(Object.keys(FSW.FleetMeta).length, 2);
});

test('M5: resolveFleet rewrites invalid ?fleet= to the A default', () => {
  assert.strictEqual(FSW.resolveFleet({ fleet: 'B' }), 'B');
  assert.strictEqual(FSW.resolveFleet({ fleet: 'garbage' }), 'A');
  assert.strictEqual(FSW.resolveFleet({}), 'A');
});

test('M5: flushFleet(id) calls Aos.setFleet(id) then onChange(id) exactly once each, in order', () => {
  const calls = [];
  const sentinel = { client: true };
  const setFleetImpl = (id) => { calls.push('set:' + id); return sentinel; };
  const onChange = (id) => { calls.push('change:' + id); };
  const res = FSW.flushFleet('B', setFleetImpl, onChange);
  assert.deepStrictEqual(calls, ['set:B', 'change:B']);
  assert.strictEqual(res.active, 'B');
  assert.strictEqual(res.api, sentinel); // setFleetImpl's return flows back to caller
});

test('M5: flushFleet passes Aos.setFleet through the injected impl (no direct window dep in core)', () => {
  // flushFleet must not hard-depend on window — the DI impl is injected so node
  // can test it. We simulate the browser binding by providing a setFleetImpl.
  let captured = null;
  const setFleetImpl = (id) => { captured = id; return {}; };
  FSW.flushFleet('A', setFleetImpl, () => {});
  assert.strictEqual(captured, 'A');
});

test('M5: exposed surface includes initFleetSwitch, exposeFleet, parse helpers', () => {
  assert.strictEqual(typeof FSW.initFleetSwitch, 'function');
  assert.strictEqual(typeof FSW.exposeFleet, 'function');
});

// ---- M11 FIX#2: none of the five ported renderers may reference /aos/api/ ----

test('M11 FIX#2: five ported renderers contain ZERO /aos/api/ references', () => {
  const names = [
    'render-jobs.js', 'render-agents.js', 'render-fanout.js',
    'render-timeline.js', 'render-status.js',
  ];
  for (const name of names) {
    const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.ok(
      !/\/aos\/api\//.test(src),
      `${name} still hardcodes a /aos/api/ reference (FIX#2 violated)`,
    );
  }
});

test('M11 FIX#2: each ported renderer resolves its read through /aosb/api/ (registry/fallback)', () => {
  const names = [
    'render-jobs.js', 'render-agents.js', 'render-fanout.js',
    'render-timeline.js', 'render-status.js',
  ];
  for (const name of names) {
    const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.ok(
      /aosb\/api\//.test(src),
      `${name} has no /aosb/api/ path source (FIX#2 repoint expected)`,
    );
  }
});

test('M11 I7: ported renderers keep a literal path fallback but it is /aosb/api/, not a host origin', () => {
  const names = [
    'render-jobs.js', 'render-agents.js', 'render-fanout.js',
    'render-timeline.js', 'render-status.js',
  ];
  for (const name of names) {
    const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
    // No absolute origin (http:// or https://) may appear as a fetch target.
    assert.ok(
      !/https?:\/\//.test(src),
      `${name} embeds an absolute origin`,
    );
  }
});

test('M5+I1: fleet-switch core embeds no bearer credential value and no base_url assignment', () => {
  const src = fs.readFileSync(path.join(__dirname, 'fleet-switch.js'), 'utf8');
  // No credential VALUE, no base_url/key assignment — the only 'token'/'
  // base_url' text is in comments that state their absence (safe).
  assert.ok(!/base_url\s*[:=]/i.test(src), 'fleet-switch assigns base_url');
  assert.ok(!/Bearer\s+[A-Za-z0-9]/.test(src), 'fleet-switch embeds a bearer value');
  // The module must not reach a real credential: no Authorization header write.
  assert.ok(!/Authorization\s*:/.test(src), 'fleet-switch sets Authorization');
});
