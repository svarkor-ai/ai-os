// ============================================================================
// aosb-js-api.js — Shared GET-ONLY API client with PER-FLEET binding (M4 → C7)
// ============================================================================
// AOS Two-Fleet Dashboard. Centralises the READ endpoint registry and a read-only
// HTTP client so feature modules never hardcode URLs and never issue mutating
// requests. PORTED from svarkor-aios-workflow-phase2/static/js/utils/api.js,
// with the two-fleet deltas fixed in bernie 490.2 + neo 490.3 FIX#1:
//
//   * Prefix is /aosb/api/* (NOT /aos/api/*, NOT /api/mc/*) — no renderer or
//     client may reach a board origin directly (C7 / neo FIX#2).
//   * Fleet is a PROPERTY of the injected client (DI seam), not a global mutated
//     in place: Aos.setFleet(id) rebuilds the active client so its injected
//     fetcher appends `?fleet=<id>` to every registry path (C7).
//   * GENERATION GUARD (neo FIX#1): a slow in-flight response from fleet A that
//     resolves AFTER the user has switched to fleet B must NOT overwrite a panel
//     with stale A data. Aos.setFleet bumps `Aos.generation`; each client records
//     the generation when a request STARTS and drops the payload if the generation
//     has moved on by the time it resolves — the stale promise simply never
//     settles, so no stale render and no spurious error toast for a fleet that is
//     no longer active.
//
// READ-ONLY INVARIANT (I1): this client exposes ONLY read verbs (get/getJson).
// No POST/PATCH/PUT/DELETE whatever — the dashboard is a view-only phase 2.
//
// Loaded before all ui modules as a plain <script> (no ES modules); it is also
// CommonJS-requireable under `node --test` so the pure contract is unit-tested
// without a browser.
// ============================================================================

'use strict';

// Central registry of READ endpoints, aligned to the served backend contract
// (M2 aosb-proxy, prefix /aosb/api/*; ALLOWED = {jobs, agents, events, overview,
// approvals, artifacts}). Absolute paths (no host) so it works behind whatever
// reverse proxy serves the app. Fleet is appended as `?fleet=` by the injected
// fetcher, NOT stored here (C7). Every value MUST stay under /aosb/api/ and
// inside the proxy whitelist; tests pin this.
const AosRegistry = {
  jobs: '/aosb/api/jobs',
  // The board has no /crew upstream: crew is served by the agents resource.
  crew: '/aosb/api/agents',
  // The board has no /status upstream: health/state is served by overview.
  status: '/aosb/api/overview',
  // Event-stream read endpoint (C7 registry delta retained).
  events: '/aosb/api/events',
};

// Back-compat alias; driver of truth is AosRegistry.
const AosEndpoints = AosRegistry;

/**
 * Error thrown by the client on any non-2xx response (C7).
 * Carries both the HTTP status and a human-readable message so feature modules
 * can render the four-states error (error-ui) and toast it (M7).
 */
function AosError(status, message) {
  this.name = 'AosError';
  this.status = status;
  this.message = message || `HTTP ${status}`;
}
AosError.prototype = Object.create(Error.prototype);
AosError.prototype.constructor = AosError;

/**
 * Build a read-only API client bound to a fetch-like `http` implementation.
 * The `http` param defaults to global fetch when running in a browser, which
 * lets tests inject a stub that never touches the network.
 *
 * OPTIONAL second arg `opts` (DI seam, mostly used by Aos.setFleet):
 *   opts.gen = () => number — a generator of the CURRENT fleet generation.
 *   When provided, the client snapshot-gen at request START and, if the
 *   generation has moved on by resolve time, the payload is DROPPED (the
 *   promise never settles) — neo FIX#1 cross-fleet stale-render guard.
 *
 * @param {Function} [http=globalThis.fetch] - (url) => Promise<Response>
 * @param {{gen?: ()=>number}} [opts]
 * @returns {{get,getJson}} a client with ONLY read methods
 */
function makeApiClient(http, opts) {
  const fetcher =
    http ||
    ((typeof globalThis !== 'undefined' && globalThis.fetch) ||
      (typeof window !== 'undefined' && window.fetch));

  const gen = (opts && opts.gen) || null;

  /**
   * Perform a GET against a read endpoint.
   * @param {string} path - path from `AosRegistry` (fleet already appended by the fetcher when bound).
   * @returns {Promise<Response>}
   * @throws {AosError} On 4xx/5xx HTTP status (C7)
   */
  async function get(path) {
    const requestGen = gen ? gen() : null;
    const res = await fetcher(path);
    if (requestGen !== null && gen() !== requestGen) {
      // A fleet switch happened while this was in flight — DROP the stale
      // response (never settle) so it cannot re-render a panel with the
      // wrong fleet's data (neo FIX#1).
      return new Promise(() => {});
    }
    if (!res.ok) throw new AosError(res.status, `Kunde inte hämta data (HTTP ${res.status})`);
    return res;
  }

  /**
   * GET and parse JSON in one call.
   * @param {string} path - path from `AosRegistry`
   * @returns {Promise<*>} parsed JSON body
   */
  async function getJson(path) {
    const res = await get(path);
    return res.json();
  }

  return Object.freeze({ get, getJson });
}

/**
 * Top-level read helper (C7): GET a registry path and return parsed JSON.
 * Thin wrapper over the shared client; throws AosError on non-2xx.
 */
async function aosGet(path) {
  const client = (typeof window !== 'undefined' && window.Aos && window.Aos.api)
    ? window.Aos.api
    : makeApiClient();
  return client.getJson(path);
}

/**
 * Polling helper (C7): call `fn` immediately, then every `intervalMs` (default 5s).
 */
function aosPoll(fn, intervalMs) {
  const delay = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000;
  if (typeof globalThis !== 'undefined' && typeof globalThis.setInterval === 'function') {
    return globalThis.setInterval(() => {
      Promise.resolve().then(fn).catch(() => {});
    }, delay);
  }
  return undefined;
}

/**
 * Re-point the active client to a fleet and return it (C7 + neo FIX#1).
 * A fleet is a PROPERTY of the injected client, never a global fetch mutation:
 * we bump `Aos.generation` (stale requests from the previous fleet are dropped),
 * record the active id, and build a fresh client whose fetcher appends
 * `?fleet=<id>`. Render modules and app.js must re-pass ANY init<X>Section(api,…)
 * with the returned client (M12 refreshAll re-pass).
 *
 * @param {string} id - 'A' | 'B' (only the proxy understands fleet aliases)
 * @param {Function} [http] - optional custom fetcher (DI for tests)
 * @returns {{get,getJson}} the NEW active client
 */
function _setFleet(id, http) {
  window.Aos = window.Aos || {};
  window.Aos.generation = (window.Aos.generation || 0) + 1; // bump => prior gen stale
  window.Aos.fleet = id;

  // Per-fleet fetcher: append ?fleet=<id> to whatever registry path is requested.
  // The fleet-append is a core property of the fleet-bound client (C7), so it
  // wraps ANY underlying http — default fetch or a test-injected stub — so the
  // board always sees ?fleet= and never a raw path.
  const base = http || globalThis.fetch;
  const fleetFetcher = (url) => {
    const sep = url.includes('?') ? '&' : '?';
    return base(url + sep + 'fleet=' + encodeURIComponent(id));
  };

  const api = makeApiClient(fleetFetcher, { gen: () => window.Aos.generation });
  window.Aos.api = api;
  return api;
}

// ---- Browser global binding (only when a window exists) --------------------
if (typeof window !== 'undefined') {
  window.Aos = window.Aos || {};
  window.Aos.registry = AosRegistry;
  window.Aos.Endpoints = AosRegistry;
  window.Aos.generation = window.Aos.generation || 0;
  window.Aos.fleet = window.Aos.fleet || null;
  window.Aos.api = makeApiClient();
  window.Aos.get = aosGet;
  window.Aos.poll = aosPoll;
  window.AosError = AosError;
  window.Aos.setFleet = _setFleet;
}

// ---- CommonJS export for node --test (ignored in the browser) --------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AosRegistry, AosEndpoints, makeApiClient, AosError, aosGet, aosPoll };
}
