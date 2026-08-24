// test_m7_states.test.js — TDD test for aosb-js-error-ui (M7, C6c four-states floor)
// Run: node --test test_m7_states.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// Pure render helpers need no DOM; port keeps them string generators (unit-tested).
const U = require('./aosb-js-error-ui.js');

// ---------------- escapeHtml (XSS) ----------------
test('C6c: escapeHtml neutralises HTML/script injection', () => {
  assert.strictEqual(U.escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(U.escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
  assert.strictEqual(U.escapeHtml(null), '');
});

// ---------------- loading state (skeleton) ----------------
test('C6c: loadingStateHTML renders a role=status skeleton with default 3 rows', () => {
  const html = U.loadingStateHTML();
  assert.ok(html.includes('role="status"'), 'must be an accessible status region');
  assert.strictEqual((html.match(/skeleton-row/g) || []).length, 3);
  assert.ok(html.includes('aria-label="Läser in data"'));
});

test('C6c: loadingStateHTML honours an explicit row count and clamps bad input', () => {
  assert.strictEqual((U.loadingStateHTML(5).match(/skeleton-row/g) || []).length, 5);
  assert.strictEqual((U.loadingStateHTML(-2).match(/skeleton-row/g) || []).length, 3);
  assert.strictEqual((U.loadingStateHTML('x').match(/skeleton-row/g) || []).length, 3);
});

// ---------------- empty state ----------------
test('C6c: emptyStateHTML is role=status, escapes the message, defaults text', () => {
  const html = U.emptyStateHTML('<img onerror=alert(1)>');
  assert.ok(html.includes('role="status"'));
  assert.ok(!html.includes('<img'), 'must escape injected markup');
  assert.ok(html.includes('&lt;img'));
  assert.ok(U.emptyStateHTML().includes('Inga data att visa.'));
});

// ---------------- error band ----------------
test('C6c: errorBandHTML is role=alert with Retry + optional escaped detail', () => {
  const html = U.errorBandHTML('Kunde inte hämta', "skräp<&>");
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Försök igen'), 'retry button present');
  assert.ok(!html.includes('skräp<&>'), 'detail escaped');
  assert.ok(html.includes('skräp&lt;&amp;&gt;'));
  assert.ok(!U.errorBandHTML('t').includes('error-band__detail'), 'no detail when omitted');
});

// ---------------- disabled control (read-only I1) ----------------
test('C6c: disabledControlHTML marks a read-only locked control', () => {
  const html = U.disabledControlHTML('Starta jobb');
  assert.ok(html.includes('disabled'), 'button must be disabled');
  assert.ok(html.includes('title="Låst (läs-vy)"'));
  assert.ok(html.includes('Åtgärden är låst'));
});

// ---------------- exports surface (interface) ----------------
test('M7: module exports the full Aos.ui surface', () => {
  for (const fn of ['escapeHtml', 'loadingStateHTML', 'emptyStateHTML',
    'errorBandHTML', 'disabledControlHTML', 'announce', 'mountErrorBand',
    'showToast', 'showEmpty']) {
    assert.strictEqual(typeof U[fn], 'function', `${fn} must be exported`);
  }
});
