// test_m4_api.test.js — TDD test for aosb-js-api (M4, C7 + neo FIX#1 generation guard)
// Run: node --test test_m4_api.test.js  (requires aosb-js-api.js + einheit runner)
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Present a browser-like global so Aos.setFleet / browser binding path runs.
global.window = global.window || {};
global.window.Aos = global.window.Aos || {};

const Aos = require('./aosb-js-api.js'); // CommonJS export {AosRegistry, makeApiClient, AosError, aosGet, aosPoll, setFleet?, ...}

// ---------------- C7 /aosb registry prefix ----------------
test('C7: registry paths live under /aosb/api/ (not /aos/api/, not /api/mc/)', () => {
  for (const k of ['jobs', 'crew', 'status', 'events']) {
    const p = Aos.AosRegistry[k];
    assert.ok(p.startsWith('/aosb/api/'), `${k} -> ${p} must start /aosb/api/`);
    assert.ok(!p.includes('/aos/api/') && !p.includes('/api/mc/'), `${k} must not be an old/board path`);
  }
});

// ---------------- fleet binding: ?fleet= appended by the injected fetcher (C7) ----------------
test('C7: setFleet returns a client whose fetcher appends ?fleet=<id> to the registry path', async () => {
  let seenUrl = null;
  const stub = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ jobs: [] }) }; };

  // Reset the browser global between tests so Aos.setFleet is deterministic.
  window.Aos.api = undefined;
  window.Aos.generation = 0;

  // Aos.setFleet must exist on the loaded binding (window.Aos).
  assert.strictEqual(typeof window.Aos.setFleet, 'function', 'Aos.setFleet must be bound');

  const client = await window.Aos.setFleet('B', stub); // inject stub fetcher to capture the URL
  await client.getJson('/aosb/api/jobs');
  assert.ok(seenUrl.includes('?fleet=B'), `expected ?fleet=B in url, got: ${seenUrl}`);
  assert.ok(seenUrl.startsWith('/aosb/api/jobs'), `unexpected base path: ${seenUrl}`);
  assert.strictEqual(window.Aos.fleet, 'B', 'active fleet id recorded');
});

// ---------------- makeApiClient DI + AosError (reused semantics) ----------------
test('C7: non-2xx -> AosError with real status', async () => {
  const stub = async () => ({ ok: false, status: 403 });
  const client = Aos.makeApiClient(stub);
  await assert.rejects(client.get('/aosb/api/jobs'), (err) => err && err.status === 403 && err.name === 'AosError');
});

test('C7: makeApiClient returns only get/getJson on the frozen client', () => {
  const client = Aos.makeApiClient(async () => ({ ok: true, json: async () => ({}) }));
  assert.deepStrictEqual(Object.keys(client), ['get', 'getJson']);
});

// ---------------- neo FIX#1: generation guard ----------------
test('FIX#1: stale fleet-A response resolving after a switch to B is dropped (never re-renders)', async () => {
  // Two manually-controlled resolvers so we can race them.
  const resolvers = {};
  const awaitable = (tag) => new Promise((resolve) => { resolvers[tag] = resolve; });
  const stubFor = (tag) => async (url) => {
    // resolve only when the test releases it
    return awaitable(tag).then(() => ({ ok: true, json: async () => ({ tag }) }));
  };

  window.Aos.api = undefined;
  window.Aos.generation = 0;

  const clientA = await window.Aos.setFleet('A', stubFor('A')); // pass custom http for DI
  const promiseA = clientA.getJson('/aosb/api/jobs');            // in-flight A

  const clientB = await window.Aos.setFleet('B', stubFor('B'));  // switches active fleet -> generation bump
  const promiseB = clientB.getJson('/aosb/api/jobs');            // in-flight B

  // Resolve the STALE A response first.
  resolvers.A({ ok: true, json: async () => ({ tag: 'A' }) });
  resolvers.B({ ok: true, json: async () => ({ tag: 'B' }) });

  const settledA = await Promise.race([promiseA.then(() => 'A-RESOLVED'), Promise.resolve('pending')]);
  // The generation guard should NOT deliver stale-A to the caller.
  assert.strictEqual(settledA, 'pending', 'stale fleet-A response must be swallowed, not delivered');
});

test('FIX#1: the current fleet response still resolves normally', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ ok: 1 }) });
  window.Aos.api = undefined;
  window.Aos.generation = 0;
  const client = await window.Aos.setFleet('A', stub);
  const body = await client.getJson('/aosb/api/jobs');
  assert.deepStrictEqual(body, { ok: 1 });
});
