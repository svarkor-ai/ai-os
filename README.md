# AI OS — Tavlor (publik läs-vy)

A **public, read-only** dashboard that visualises BOTH Mission Control boards in one page:

- **Orkestrator** (:8310) and **Svarkor** (:8320) — switch with the board toggle.
- Per-project **task trees** (parent → child) with status colours and a workflow
  progress bar (what's done / what's left).
- The **dependency graph**: `[after:]` (efter) and `[onfail:]` (vid fel) edges parsed from
  task titles, drawn as a layered DAG plus an edge list, with `[cycles:]` shown per node.
- **Queue-next** using the REAL board status vocabulary (`queued / claimed / running /
  blocked / waiting_approval / owner_approved / completed_unverified / verified / deployed /
  cancelled` — there is no `pending`): a task is "näst på tur" only when it is `queued`,
  `[released]`, and all its `[after:]` targets have reached a done state.
- The **verification tail**: `completed_unverified → verified/deployed` and `cancelled`.
- **Mobile-first**, responsive, no build step, no framework.

## Architecture — a static snapshot, no live proxy, no token in the browser

The page is a **static site**. It polls ONE static file, `boards.json`, and nothing else.
There is **no backend, no API call from the browser, and no token anywhere in the repo or
the page** — the earlier live-proxy (and its path-traversal bug) has been removed entirely.

`boards.json` is produced **server-side on VM350** by an orchestrator-managed emitter
(`infra/vm106/repo-visibility-hosting/mc-boards-snapshot.py` in the agent-town tree, NOT in
this repo). The emitter reads both boards under the VM350 admin tokens, then scrubs
defense-in-depth before anything is written:

1. **Excludes** whole sensitive projects (skola / np / sensor + the minors-denylist) — only
   an aggregate "N dolda (känsliga)" count is published, zero detail.
2. **Scrubs titles** through `infra/secret_scan.sh` (a tripped title is redacted to a generic
   label but the node still renders with its id / status / edges) and masks hostnames / IPs /
   file-paths / ports inline.
3. Carries **ONLY** the safe fields: `display_id, parent_id, status, project_slug, seat,
   after/onfail/cycles edges, released, timestamps, scrubbed title`. It never reads or emits
   `prompt / result_summary / result_payload / deploy_log / gate_criteria / model_policy /
   workdir / acceptance / deploy_spec / notes`.

The emitter writes `boards.json` into the served web root (LOCAL file for tests; atomic ssh
write to vm106 in production — the same pattern as the portfolio's `hosted-index.json`
sidecar). A cron/timer on VM350 refreshes it; the public page just re-fetches it.

## Files

```
index.html            static shell (root — required for a static app)
static/css/app.css     mobile-first styles + status colours + SVG graph
static/js/render.js     pure, DOM-free render library (unit-tested under node)
static/js/app.js        shell: fetch boards.json, board switch, tab switch, poll
hosting.yaml            vm106 hosting manifest (type: static)
tests/render.test.js    node --test suite for the pure render logic
```

## Run / verify locally

```bash
# 1) emit a scrubbed snapshot next to index.html (needs VM350 admin tokens):
BOARDS_SNAPSHOT_LOCAL=$PWD/boards.json \
  python3 /path/to/agent-town/infra/vm106/repo-visibility-hosting/mc-boards-snapshot.py

# 2) serve the static site and open it:
python3 -m http.server 8391   # -> http://127.0.0.1:8391/  (?board=svarkor&tab=beroenden)

# 3) tests + hosting validation:
node --test tests/
python3 /path/to/agent-town/infra/vm106/repo-visibility-hosting/validate-hosting.py .
```

## Repo

`github.com/svarkor-ai/ai-os` — `main` must always be the latest working, truthful state.
