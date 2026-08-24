"""M2 aosb-proxy - the only network path to either board.

GET /aosb/api/{rest}?fleet=<A|B> forwards to fleets[alias].base_url/api/mc/{rest}
with that fleet's auth header, and CONSUMES+STRIPS the fleet param before
sending it on. Write verbs and anything outside the GET whitelist are refused
with a literal 403 and never touch the board (I1). Unknown fleet -> 400.
Transport failures -> 502, timeouts -> 504. Only content-type is echoed back.
"""
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from app.config import get_settings

router = APIRouter(prefix="/aosb/api")

_WHITELIST = {"jobs", "agents", "events", "overview", "approvals", "artifacts"}
_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
_TIMEOUT_SECS = 5.0


@router.api_route("/{rest:path}", methods=_METHODS)
async def aosb_proxy(rest: str, request: Request):
    if request.method != "GET":
        return JSONResponse(status_code=403, content={"detail": "write/unknown route blocked by proxy"})

    first_seg = rest.split("/", 1)[0]
    if first_seg not in _WHITELIST:
        return JSONResponse(status_code=403, content={"detail": "write/unknown route blocked by proxy"})

    settings = get_settings()
    fleet = request.query_params.get("fleet")
    if not fleet or fleet not in settings.fleets:
        return JSONResponse(status_code=400, content={"detail": "unknown fleet"})

    target = settings.fleets[fleet]
    # CONSUME + STRIP the fleet selector so it never reaches the board (FIX#2).
    out_params = {k: v for k, v in request.query_params.items() if k != "fleet"}
    url = target["base_url"] + "/api/mc/" + rest
    headers = {"Authorization": "Bearer " + target["token"]}

    client, owned = _board_client(request, fleet)
    try:
        resp = await client.get(url, params=out_params, headers=headers)
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"detail": "board unreachable"})
    except httpx.HTTPError:
        return JSONResponse(status_code=502, content={"detail": "board unreachable"})
    finally:
        if owned:
            await client.aclose()
    # echo back content + content-type only (I2/C5b)
    media = resp.headers.get("content-type") or "application/json"
    return Response(content=resp.content, status_code=resp.status_code, media_type=media)


def _board_client(request, fleet):
    seam = getattr(request.app.state, "board_clients", None)
    if seam and fleet in seam:
        return seam[fleet], False
    settings = get_settings()
    target = settings.fleets[fleet]
    client = httpx.AsyncClient(
        base_url=target["base_url"],
        timeout=_TIMEOUT_SECS,
        follow_redirects=False,
    )
    return client, True
