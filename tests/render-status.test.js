'use strict';

// ============================================================================
// tests/render-status.test.js — M10 aosw-js-render-status unit tests (node --test)
// ============================================================================
// Verifies the PURE render helpers for #panel-status (probe rows + locked
// controls) built from /aos/api/overview. No DOM, no network.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const { renderStatusPanel, renderLockedControls, renderProbeRow, probeState } =
  require('./render-status.js');

test('probeState maps ok flag to tone + Swedish label', () => {
  assert.deepStrictEqual(probeState(true), { tone: 'good', label: 'OK' });
  assert.deepStrictEqual(probeState(false), { tone: 'bad', label: 'Nedsatt' });
});

test('renderProbeRow renders name, tone chip and optional detail', () => {
  const row = renderProbeRow({ name: 'MC API', ok: true, detail: 'svar på 45 ms' });
  assert.match(row, /MC API/);
  assert.match(row, /status-chip--good/);
  assert.match(row, /svar på 45 ms/);
  const bad = renderProbeRow({ name: 'Databas', ok: false });
  assert.match(bad, /status-chip--bad/);
  assert.match(bad, /Nedsatt/);
});

test('renderProbeRow escapes hostile name/detail', () => {
  const row = renderProbeRow({ name: '<b>x</b>', ok: true, detail: '<script>alert(1)</script>' });
  assert.ok(!row.includes('<script>'));
  assert.match(row, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('renderLockedControls emits four disabled admin actions', () => {
  const html = renderLockedControls();
  assert.match(html, /Nollställ alla jobb/);
  assert.match(html, /Kör om debugger seed/);
  assert.match(html, /Starta om agents/);
  assert.match(html, /Rensa cachen/);
  // Every action must be disabled in the read-only phase-2 view: exactly four
  // <button> elements, each carrying the disabled attribute.
  assert.strictEqual((html.match(/<button/g) || []).length, 4);
  assert.strictEqual((html.match(/<button[^>]*disabled/g) || []).length, 4);
});

test('renderStatusPanel covers the four states', () => {
  // loading
  assert.match(renderStatusPanel(null, true, null), /Läser in status/);
  // error
  assert.match(renderStatusPanel(null, false, 'board nere'), /Kunde inte hämta status/);
  // empty probes vector
  assert.match(renderStatusPanel([], false, null), /Inga systemtjänster/);
  // success
  const ok = renderStatusPanel([{ name: 'MC API', ok: true }], false, null);
  assert.match(ok, /MC API/);
  assert.match(ok, /Systemstatus/);
});
