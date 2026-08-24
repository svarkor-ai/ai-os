"""M3 aosb-main - FastAPI assembly only.

Route surface: "/", "/health", "/static/*", "/aosb/api/*". The loopback bind
lives in the run invocation (run/mc-dashboard), not here. The web root
(templates + static) is resolved relative to this package unless overridden
via AOS_WEB_ROOT for deployment/testing. /health optionally reports per-fleet
endpoints; it never reports auth values.
"""
import os
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.proxy import router as proxy_router

_BASE = Path(os.environ.get("AOS_WEB_ROOT", str(Path(__file__).resolve().parent.parent)))
STATIC_DIR = _BASE / "static"
TEMPLATES_DIR = _BASE / "templates"

_settings = get_settings()

app = FastAPI(title=_settings.app_name)

app.include_router(proxy_router)

STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
async def health(fleet: str | None = Query(default=None)):
    if fleet is not None:
        if fleet not in _settings.fleets:
            return JSONResponse(status_code=400, content={"detail": "unknown fleet"})
        f = _settings.fleets[fleet]
        return {"fleet": fleet, "base_url": f["base_url"]}
    return {
        "app": _settings.app_name,
        "fleets": {alias: {"base_url": f["base_url"]} for alias, f in _settings.fleets.items()},
    }


@app.get("/", include_in_schema=False)
async def index():
    index_file = TEMPLATES_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    # Frontend templates are a separate deliverable; don't crash assembly
    # when they are not present yet.
    return JSONResponse({"app": _settings.app_name, "status": "backend up"})
