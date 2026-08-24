// ============================================================================
// ui/error-ui.js — Shared state + error UI helpers (M7 aosb-js-error-ui)
// ============================================================================
// AOS Two-Fleet Dashboard. Provides the building blocks every data-driven section
// uses so the four-states floor (loading / empty / error / success) is
// consistently satisfied:
//   - escapeHtml()            XSS-safe text → safe HTML string
//   - loadingStateHTML(n)     skeleton rows for an in-flight fetch
//   - emptyStateHTML(msg)     friendly empty state (role="status")
//   - errorBandHTML()         prominent error band (role="alert") + Retry
//   - disabledControlHTML()   a clearly-marked DISABLED control placeholder
//   - announce(el, msg)       polite aria-live announcement
//   - mountErrorBand / showToast / showEmpty   DOM side-effect helpers
//
// PORTED VERBATIM from svarkor-aios-workflow-phase2/static/js/ui/error-ui.js
// (M7 aos-js-error-ui). C6c: on any AosError, M7 populates #toast-region with
// the real message AND calls Aos.showEmpty(panelId) per panel, clearing stale
// last-render — panels never retain stale rows on failure (I5). The fleet
// suffix lives inside the api client, so error handling is FLEET-AGNOSTIC: no
// fleet id or token appears here (C7 I1/I2 I3).
//
// All render helpers are PURE string generators → unit-tested under node.
// DOM side effects live in `mountErrorBand` / `announce` / `showToast` /
// `showEmpty` and only run in a browser. No fetch here: read-only I1 is
// enforced by api.js.
// ============================================================================

'use strict';

/**
 * Escape a string for safe insertion into HTML (XSS defence).
 * @param {*} value - any value, stringified
 * @returns {string} HTML-escaped string
 */
function escapeHtml(value) {
  const str = String(value == null ? '' : value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML for a loading skeleton (shows N placeholder rows / counters).
 * @param {number} [rows=3]
 * @returns {string}
 */
function loadingStateHTML(rows) {
  const n = Number.isInteger(rows) && rows > 0 ? rows : 3;
  let body = '';
  for (let i = 0; i < n; i++) {
    body += '<div class="skeleton-row" aria-hidden="true"></div>';
  }
  return (
    '<div class="loading-state" role="status" aria-label="Läser in data">' +
    '<span class="loading-state__spinner" aria-hidden="true"></span>' +
    '<p class="loading-state__text">Läser in data…</p>' +
    body +
    '</div>'
  );
}

/**
 * HTML for a friendly empty state.
 * @param {string} message - Swedish empty message
 * @returns {string}
 */
function emptyStateHTML(message) {
  return (
    '<div class="empty-state" role="status">' +
    '<span class="empty-state__icon" aria-hidden="true">🔍</span>' +
    '<p class="empty-state__message">' +
    escapeHtml(message || 'Inga data att visa.') +
    '</p>' +
    '</div>'
  );
}

/**
 * HTML for a prominent error band with a Retry action.
 * @param {string} title - short summary (Swedish)
 * @param {string} [detail] - technical detail (shown small, muted)
 * @returns {string}
 */
function errorBandHTML(title, detail) {
  return (
    '<div class="error-band" role="alert">' +
    '<div class="error-band__icon" aria-hidden="true">⚠️</div>' +
    '<div class="error-band__body">' +
    '<p class="error-band__title">' + escapeHtml(title || 'Kunde inte hämta data.') + '</p>' +
    (detail ? '<p class="error-band__detail">' + escapeHtml(detail) + '</p>' : '') +
    '<button type="button" class="error-band__retry" data-retry="true">Försök igen</button>' +
    '</div>' +
    '</div>'
  );
}

/**
 * HTML for a clearly-marked DISABLED control placeholder (read-only phase 2).
 * Actions are locked but visible so the UI is "ready". Rendered disabled so it
 * cannot fire — the client never binds a mutating handler to it.
 * @param {string} label - what the control WOULD do (visible on the button)
 * @param {string} [hint] - explanation that the action is locked
 * @returns {string}
 */
function disabledControlHTML(label, hint) {
  const hintText = hint || 'Åtgärden är låst i denna läs-vy (fas 2).';
  return (
    '<span class="disabled-control">' +
    '<button type="button" disabled class="disabled-control__btn" title="Låst (läs-vy)">' +
    '🔒 ' + escapeHtml(label) +
    '</button>' +
    '<p class="disabled-control__hint">' + escapeHtml(hintText) + '</p>' +
    '</span>'
  );
}

/**
 * Politely announce a message to assistive tech (aria-live).
 * No-op outside a browser or if the element is missing.
 * @param {Element} el
 * @param {string} msg
 */
function announce(el, msg) {
  if (typeof document === 'undefined' || !el) return;
  if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
  el.textContent = msg;
}

/**
 * Mount an error band into a container element (browser only).
 * Returns the injected root element or null.
 * @param {Element} container
 * @param {string} title
 * @param {string} [detail]
 * @returns {Element|null}
 */
function mountErrorBand(container, title, detail) {
  if (typeof document === 'undefined' || !container) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = errorBandHTML(title, detail);
  const band = tmp.firstElementChild;
  container.innerHTML = '';
  container.appendChild(band);
  return band;
}

/**
 * Show a transient toast in the global #toast-region (browser only).
 * Harmless no-op when the region is absent. Auto-dismisses after 6s.
 * @param {string} message - text (Swedish) to toast
 */
function showToast(message) {
  if (typeof document === 'undefined' || !message) return;
  const region = document.getElementById('toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 6000);
}

/**
 * Show a friendly empty state in a panel, clearing any stale rows first
 * (C6c — four-states floor: an empty panel is not a blank leftover).
 * Reuses the pure emptyStateHTML generator. Browser only.
 * @param {Element} container - the panel's mount node
 * @param {string} message - Swedish empty message
 * @returns {Element|null} injected empty-state root
 */
function showEmpty(container, message) {
  if (typeof document === 'undefined' || !container) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = emptyStateHTML(message);
  const empty = tmp.firstElementChild;
  container.innerHTML = '';
  container.appendChild(empty);
  return empty;
}

// ---- Browser global binding --------------------------------------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  const api = {
    escapeHtml, loadingStateHTML, emptyStateHTML, errorBandHTML,
    disabledControlHTML, announce, mountErrorBand, showToast, showEmpty,
  };
  window.Aos.ui = api;
  window.Aos.showToast = showToast;
  window.Aos.showEmpty = showEmpty;
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml, loadingStateHTML, emptyStateHTML, errorBandHTML,
    disabledControlHTML, announce, mountErrorBand, showToast, showEmpty,
  };
}
