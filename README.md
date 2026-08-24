# AI-OS Two-Fleet Dashboard

A single, read-only dashboard that shows BOTH physical agent fleets (vm104 + vm105),
each with its own Mission Control board, LIVE in one view — switch between boards with a
shell-level fleet toggle.

- **Reading:** B (owner-confirmed 2026-08-23) — two boards, not a consolidation.
- **Backend:** one thin GET-only proxy (`app/proxy.py`) that forwards
  `/aosb/api/{rest}?fleet={A|B}` to the selected board's `/api/mc/{rest}` with a
  per-fleet Bearer. Consumes + strips `fleet=` (never forwards it), unknown fleet → 400,
  write verb → literal 403, per-board 502/504, echoes only content-type.
- **Frontend:** zero-build vanilla JS, one fetch surface (`static/js/utils/api.js`),
  fleet-bound clients + generation guard, ported renderers + new queue-next/sortable/
  grouping modules, `app.js` shell with tablist + poll.
- **No secret in browser or repo:** per-fleet `FLEET_A/B_BASE_URL` + `FLEET_A/B_TOKEN`
  are env-only at the proxy. Never committed.

## Run (local, with the throwaway mock — no real token needed)

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

# terminal 1 — two mock boards on 18231 (fleetA) + 18232 (fleetB)
python      serve/mock_board.py

# terminal 2 — the dashboard proxy+app
FLEET_A_BASE_URL=http://127.0.0.1:18231 FLEET_A_TOKEN=fleetA \
FLEET_B_BASE_URL=http://127.0.0.1:18232 FLEET_B_TOKEN=fleetB \
uvicorn app.main:app --host 127.0.0.1 --port 8080
# open http://127.0.0.1:8080/ · toggle vm104 | vm105
```

Fall back to `ensure`:

```bash
sudo -u mcproxy-svarkor mc-job-svarkor show 514   # gate evidence
```

## Gate

`serve/mock_board.py` + `tests/` prove the invariants. `dobbie/verify.sh` in the phase2
tree is the executable acceptance gate (backend); the frontend node suite is under
`tests/*.test.js`. Re-gate the INTEGRATED tree before push — integration can break what
passed in isolation.

## Repo

`github.com/svarkor-ai/ai-os` ← this tree. master must always be the latest working,
truthful state (Alex's rule).
