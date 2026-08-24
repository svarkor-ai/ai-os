'use strict';
// ============================================================================
// aosb-js-fleet-switch (M5) — active-board selector + deep-link default
// ============================================================================
// SINGLE CONCERN: the active-board selector. It renders vm104|vm105 pills,
// reads ?fleet= on load for the deep-link default, and on change calls
// Aos.setFleet(activeId) then onChange() (app.js refreshAll). It must NOT
// fetch/poll on its own (I1/I4), and must not embed a token or a base_url —
// the per-fleet endpoint is carried by the M4 injected api client (C7/FIX#2).
//
// CONTRACT C6f (owner M5): the switch ONLY re-points the fetch surface (via
// M4.setFleet) and triggers a refresh — renders/fetches/polls nothing itself.
// Deep-link `?fleet=A|B`; unknown default -> A. Side-by-side is OPTION B,
// deferred, buildable later without reshaping the client.
//
// DESIGN: like M4, the file is dual-environment. The pure, DOM-free core
// (FleetMeta / parseFleetParam / resolveFleet / flushFleet) is CommonJS-
// requireable under node --test; the DOM render + browser binding live behind
// a `typeof window !== 'undefined'` guard so node can unit-test the logic
// without a browser. Browser-side it is a plain IIFE-registered script.
// ============================================================================

// Fleet meta map: label source is a small constant, NOT the token (C6f). The
// proxy understands only fleet aliases A|B; the host labels are what the pills
// show. Kept as plain data so node tests can pin it exactly.
const FleetMeta = {
  A: { host: 'vm104', label: 'Fleet A' },
  B: { host: 'vm105', label: 'Fleet B' },
};

const DEFAULT_FLEET = 'A';
const VALID_FLEETS = ['A', 'B'];

/**
 * Normalise a raw `?fleet=` query value into a valid fleet id.
 * Only 'A' | 'B' are valid; anything else (missing, unknown, host label,
 * lowercase) resolves to the A default (C6f).
 * @param {string|undefined} raw
 * @returns {'A'|'B'}
 */
function parseFleetParam(raw) {
  if (VALID_FLEETS.indexOf(raw) !== -1) return raw;
  return DEFAULT_FLEET;
}

/**
 * Resolve a parsed query object ({fleet: 'B'} | {}) into a valid fleet id.
 * Thin wrapper so the browser can feed location-search parse output straight in.
 * @param {{fleet?: string}} params
 * @returns {'A'|'B'}
 */
function resolveFleet(params) {
  return parseFleetParam(params && typeof params.fleet === 'string' ? params.fleet : undefined);
}

/**
 * Core fleet-switch mechanic (C6f): re-point the fetch surface, then notify.
 * Order: Aos.setFleet(id) FIRST (so the new fleet-bound client exists and all
 * in-flight reads self-cancel via the M4 generation guard), THEN onChange(id)
 * (app.js refreshAll re-passes the new client into every renderer). Pure of
 * window access so node can DI a setFleetImpl.
 *
 * @param {'A'|'B'} id
 * @param {(id:string)=>object} setFleetImpl - wraps Aos.setFleet(id)
 * @param {(id:string)=>void} onChange - app.js refreshAll notification
 * @returns {{active:string, api:object}} the new active fleet id + api client
 */
function flushFleet(id, setFleetImpl, onChange) {
  const api = setFleetImpl(id);
  onChange(id);
  return { active: id, api };
}

// ============================================================================
// Browser binding / DOM — runs only when a real document exists.
// ============================================================================
let isBrowserBound = false;

/**
 * Render the two fleet pills into `root` and wire change handling (M5).
 * Reads the deep-link default from the current URL's `?fleet=`.
 *
 * @param {Element} root - the .fleet-switch container in the topbar
 * @param {{onChange:(id:string)=>void}} opts - onChange = app.refreshAll
 * @returns {{active:string, buttons:Object<string,Element>}} for tests/QA
 */
function initFleetSwitch(root, opts) {
  if (typeof document === 'undefined' || !root) return undefined;
  const onChange = (opts && opts.onChange) || function () {};

  // Deep-link default from the active URL (C6f): ?fleet= wins, else A.
  const params = new URLSearchParams(window.location.search);
  const active = resolveFleet(params.get('fleet'));

  // Render the pills from FleetMeta (labels, never tokens).
  const buttons = {};
  Object.keys(FleetMeta).forEach((id) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fleet-pill';
    btn.id = 'fleet-' + id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(id === active));
    btn.setAttribute('aria-controls', 'panel-' + (id === 'A' ? 'a' : 'b'));
    btn.dataset.fleet = id;

    const label = document.createElement('span');
    label.className = 'fleet-pill__label';
    label.textContent = FleetMeta[id].label;
    const host = document.createElement('span');
    host.className = 'fleet-pill__host';
    host.textContent = FleetMeta[id].host;
    btn.appendChild(label);
    btn.appendChild(host);

    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return; // no-op on same fleet
      const nxt = flushFleet(id, (fid) => window.Aos.setFleet(fid), onChange);
      setActivePill(buttons, nxt.active);
    });

    buttons[id] = btn;
    root.appendChild(btn);
  });

  setActivePill(buttons, active);
  isBrowserBound = true;
  return { active, buttons };
}

/** Visually mark a single pill active (aria-selected + .is-active class). */
function setActivePill(buttons, id) {
  if (!buttons) return;
  Object.keys(buttons).forEach((key) => {
    const on = key === id;
    buttons[key].classList.toggle('is-active', on);
    buttons[key].setAttribute('aria-selected', String(on));
  });
}

/**
 * Report the active fleet id (M5): reads window.Aos.fleet (set by M4.setFleet).
 * @returns {'A'|'B'|null}
 */
function exposeFleet() {
  if (typeof window === 'undefined' || !window.Aos) return null;
  return window.Aos.fleet || null;
}

// ---- Browser global binding (only when a window exists) --------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.fleetSwitch = {
    initFleetSwitch: initFleetSwitch,
    exposeFleet: exposeFleet,
    parseFleetParam: parseFleetParam,
    resolveFleet: resolveFleet,
  };
}

// ---- CommonJS export for node --test (ignored in the browser) ---------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FleetMeta,
    DEFAULT_FLEET,
    VALID_FLEETS,
    parseFleetParam,
    resolveFleet,
    flushFleet,
    initFleetSwitch,
    exposeFleet,
  };
}
