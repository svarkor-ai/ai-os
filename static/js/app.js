// ============================================================================
// app.js (M12) — dashboard shell: tab navigation + render-module orchestrator
// ============================================================================
// SINGLE CONCERN: the application shell. It (1) manages the read-only tab
// navigation (Flöde / Jobb / Agenter / Status), (2) mounts every render module
// onto a `[data-module]` mount element by looking up that module on window.Aos,
// and (3) re-invokes each render init with the ACTIVE fleet-bound api client
// (window.Aos.api, set by M4 Aos.setFleet) whenever the fleet is switched or a
// panel is shown. It issues NO fetch of its own (I1): every data read is made
// by a render module through the api client that app.js passes in.
//
// CONTRACT M12: the shell never builds URLs, never fetches, never mutates the
// board (I1). After Aos.setFleet(id) the shell re-invokes each init with the
// NEW client so every panel shows the selected fleet's data. The DOM declares
// its mounts via `data-module="<name>"`; app.js resolves <name> on window.Aos
// and calls init(api, mountEl). Modularity is structural: each render module
// stays an independently testable unit (M8/M9/M10), the shell is just shared
// plumbing — no networking, no state, no board writes.
//
// DESIGN: browser IIFE (window.Aos.app). Every function is defined at the top
// and DOM access is guarded by `typeof window` / `document`, so the WHOLE
// public surface is CommonJS-requireable under node --test (a no-DOM node run
// simply no-ops the enforcing calls). The boot binding is browser-only.
// ============================================================================
(function () {
'use strict';

// ---- Mount map --------------------------------------------------------------
// The DOM declares mounts as <section data-module="<name>">; app.js resolves
// <name> on window.Aos (a render module binding itself to Aos.{name}).
var TABS = { flode: 'panel-timeline', jobb: 'panel-fanout', agenter: 'panel-agents', status: 'panel-status' };

function mountKeys() {
  if (typeof window === 'undefined' || !window.document) return [];
  var els = window.document.querySelectorAll('[data-module]');
  var keys = [];
  for (var i = 0; i < els.length; i++) keys.push(els[i].getAttribute('data-module'));
  return keys;
}

// Derive which tab governs a given mount element by climbing to its page__panel.
function panelOf(el) {
  if (!el || typeof window === 'undefined' || !window.document) return '';
  var n = el;
  while (n && n !== window.document.body) {
    if (n.getAttribute && n.getAttribute('data-panel')) return n.getAttribute('data-panel');
    n = n.parentNode;
  }
  return '';
}

function badgeCount(n) {
  return (typeof n === 'number' && n > 0) ? n : 0;
}

// Mount a single module onto its element with the CURRENT active api.
function mountOne(name, el, api) {
  if (typeof window === 'undefined') return;
  var Aos = window.Aos || {};
  var fn = Aos[name];
  if (typeof fn !== 'function') {
    el.setAttribute('data-mount-error', 'missing:' + name);
    return;
  }
  var result = fn(api, el);
  if (result && typeof result.refresh === 'function') {
    el.__aosRefresh = result.refresh;
  }
}

// Mount every [data-module] element.
function mountAll(api) {
  if (typeof window === 'undefined' || !window.document) return;
  var els = window.document.querySelectorAll('[data-module]');
  for (var i = 0; i < els.length; i++) {
    mountOne(els[i].getAttribute('data-module'), els[i], api);
  }
}

function showTab(name) {
  if (typeof window === 'undefined' || !window.document) return;
  var panelId = TABS[name] || name;
  var panel = window.document.getElementById(panelId);
  if (!panel) return;

  var panels = window.document.querySelectorAll('.page__panel');
  for (var i = 0; i < panels.length; i++) panels[i].hidden = true;
  panel.hidden = false;

  var tabs = window.document.querySelectorAll('.topnav__tab');
  for (var j = 0; j < tabs.length; j++) {
    tabs[j].classList.toggle('is-active', tabs[j].getAttribute('id') === 'tab-' + name);
    tabs[j].setAttribute('aria-selected', tabs[j].getAttribute('id') === 'tab-' + name ? 'true' : 'false');
  }

  refreshPanel(name);
}

function refreshPanel(name) {
  if (typeof window === 'undefined' || !window.document) return;
  var Aos = window.Aos || {};
  var panelId = TABS[name] || name;
  var panel = window.document.getElementById(panelId);
  if (!panel) return;
  var els = panel.querySelectorAll('[data-module]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.__aosRefresh) el.__aosRefresh();
    else mountOne(el.getAttribute('data-module'), el, Aos.api);
  }
}

// Named public refresh: re-invokes EVERY [data-module] with the current client.
function refreshAll() {
  if (typeof window === 'undefined' || !window.document) return;
  var Aos = window.Aos || {};
  var els = window.document.querySelectorAll('[data-module]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.__aosRefresh) el.__aosRefresh();
    else mountOne(el.getAttribute('data-module'), el, Aos.api);
  }
}

function bindTabs() {
  if (typeof window === 'undefined' || !window.document) return;
  var tabs = window.document.querySelectorAll('.topnav__tab');
  for (var i = 0; i < tabs.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        showTab((btn.getAttribute('id') || '').replace(/^tab-/, ''));
      });
    })(tabs[i]);
  }
}

function boot() {
  if (typeof window === 'undefined' || !window.document) return;
  var Aos = window.Aos = window.Aos || {};

  // Fleet switch drives refreshAll on change (M5 + C6f): re-invokes each mount
  // with the NEW fleet-bound client.
  if (Aos.fleetSwitch && typeof Aos.fleetSwitch.initFleetSwitch === 'function') {
    Aos.fleetSwitch.initFleetSwitch(
      window.document.querySelector('.fleet-switch'),
      { onChange: refreshAll }
    );
  } else {
    Aos.api = Aos.api || (Aos.setFleet ? Aos.setFleet('A') : Aos.api);
  }

  bindTabs();
  refreshAll();
}

var EXPORTS = {
  boot: boot,
  showTab: showTab,
  refreshAll: refreshAll,
  refreshPanel: refreshPanel,
  mountAll: mountAll,
  mountKeys: mountKeys,
  panelOf: panelOf,
  badgeCount: badgeCount,
};

if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.app = EXPORTS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXPORTS;
}
})();
