"""Throwaway two-origin mock boards for the AI-OS two-fleet dashboard (MC 514).

Two independent mock boards (fleet A and fleet B) serving GET-only data under
/api/mc/* mirroring the real MV board read surface the proxy forwards to.
Each origin is tagged with a literal dataset tag (fleetA / fleetB) so the
acceptance gate can distinguish which board the proxy reached, and so the
two-fleet selector can be visually separated. Never a write path.

Launch modes:
  * No env set (development): `python3 serve/mock_board.py` spawns BOTH boards
    on 127.0.0.1:18231 (A) and 127.0.0.1:18232 (B). The module also exposes the
    two FastAPI apps `app_a` / `app_b` for direct import in tests.
  * MOCK_PORT set (gate/verify.sh convention): serves exactly ONE board on the
    given port, its jobs dataset tagged with the literal MOCK_TAG value. Only
    MOCK_PORT needs to be set; MOCK_TAG defaults by port. Extra launch env
    variables the gate passes are accepted and ignored, so the gate's launch
    line works verbatim.
"""
import datetime
import os
import time
import uvicorn
from fastapi import FastAPI, Request


def _stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _tagged(jobs, tag):
    """Return job records each carrying the literal dataset tag."""
    return [dict(j, fleet_tag=tag) for j in jobs]


def _board(name, jobs, agents, probes):
    app = FastAPI(title=name)

    @app.get("/health")
    async def health():
        return {"status": "ok", "instance": name}

    @app.get("/api/mc/jobs")
    async def jobs_endpoint(request: Request):
        return {"jobs": jobs}

    @app.get("/api/mc/agents")
    async def agents_endpoint(request: Request):
        return {"agents": agents}

    @app.get("/api/mc/overview")
    async def overview(request: Request):
        return {"probes": probes}

    @app.get("/api/mc/events")
    async def events(request: Request):
        return {"events": [{"kind": name, "at": _stamp()}]}

    @app.get("/api/mc/artifacts")
    async def artifacts(request: Request):
        return {"artifacts": []}

    @app.get("/api/mc/approvals")
    async def approvals(request: Request):
        return {"approvals": []}

    return app


def build_board(alias, tag, *, name=None):
    """Build the FastAPI app for one fleet, tagged with the literal `tag`.

    `alias` is "A" or "B" and selects the base dataset; `tag` (e.g. "fleetA")
    is stamped onto every job record's fleet_tag field so gate greps pass.
    """
    NAME = name or ("mock-board-fleet-%s" % alias)
    if alias == "A":
        jobs, agents, probes = FLEET_A_JOBS, FLEET_A_AGENTS, FLEET_A_PROBES
    elif alias == "B":
        jobs, agents, probes = FLEET_B_JOBS, FLEET_B_AGENTS, FLEET_B_PROBES
    else:
        raise ValueError("unknown fleet alias: %r" % alias)
    jobs = _tagged(jobs, tag)
    return _board(NAME, jobs, agents, probes)


FLEET_A_JOBS = [
    {"id": 1, "display_id": "A-101", "title": "A: backend pipeline", "status": "done",
     "owner": "teddy", "fleet": "A", "updated_at": _stamp()},
    {"id": 2, "display_id": "A-102", "title": "A: two-fleet wiring", "status": "running",
     "owner": "nicke", "fleet": "A", "updated_at": _stamp()},
    {"id": 3, "display_id": "A-103", "title": "A: acceptance gate", "status": "gated",
     "owner": "dobbie", "fleet": "A", "updated_at": _stamp()},
]
FLEET_A_AGENTS = [
    {"name": "teddy", "role": "generell kodare", "seat": "teddy", "fleet": "A",
     "last_seen": _stamp()},
    {"name": "nicke", "role": "frontend/UX", "seat": "nicke", "fleet": "A",
     "last_seen": _stamp()},
]
FLEET_A_PROBES = [
    {"name": "MC API", "ok": True, "detail": "svar pa 45 ms"},
    {"name": "Databas", "ok": False, "detail": "replikering slapar"},
]

FLEET_B_JOBS = [
    {"id": 1, "display_id": "B-201", "title": "B: board wiring", "status": "running",
     "owner": "kjell", "fleet": "B", "updated_at": _stamp()},
    {"id": 2, "display_id": "B-202", "title": "B: docs fas 2", "status": "error",
     "owner": "mirre", "fleet": "B", "updated_at": _stamp()},
    {"id": 3, "display_id": "B-203", "title": "B: firmware build", "status": "pending",
     "owner": "tjomme", "fleet": "B", "updated_at": _stamp()},
    {"id": 4, "display_id": "B-204", "title": "B: cluster health", "status": "running",
     "owner": "lennart", "fleet": "B", "updated_at": _stamp()},
]
FLEET_B_AGENTS = [
    {"name": "kjell", "role": "IoT/automation", "seat": "kjell", "fleet": "B",
     "last_seen": _stamp()},
    {"name": "lennart", "role": "infra", "seat": "lennart", "fleet": "B",
     "last_seen": _stamp()},
    {"name": "mirre", "role": "docs", "seat": "mirre", "fleet": "B",
     "last_seen": _stamp()},
]
FLEET_B_PROBES = [
    {"name": "MC API", "ok": True, "detail": "svar pa 31 ms"},
    {"name": "Crew-register", "ok": True, "detail": "3 agenter registrerade"},
]

app_a = build_board("A", "fleetA")
app_b = build_board("B", "fleetB")


def _env_port():
    raw = os.environ.get("MOCK_PORT")
    if raw is None:
        return None
    return int(raw)


if __name__ == "__main__":
    port = _env_port()
    if port is not None:
        # Gate/verify.sh convention: exactly ONE board on MOCK_PORT, tagged MOCK_TAG.
        tag = os.environ.get("MOCK_TAG") or ("fleetA" if port == 18231 else "fleetB")
        alias = "A" if port == 18231 else "B"
        app = build_board(alias, tag, name="mock-board-%s" % alias)
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    else:
        # Development mode: spawn both boards.
        import multiprocessing

        def _run_a():
            uvicorn.run(app_a, host="127.0.0.1", port=18231, log_level="warning")

        def _run_b():
            uvicorn.run(app_b, host="127.0.0.1", port=18232, log_level="warning")

        pa = multiprocessing.Process(target=_run_a)
        pb = multiprocessing.Process(target=_run_b)
        pa.start()
        pb.start()
        try:
            pa.join()
            pb.join()
        except KeyboardInterrupt:
            pa.terminate()
            pb.terminate()
