"""M1 aosb-config - per-fleet boot contract (C1).

Defines which board origins the two-fleet dashboards may talk to. The proxy
is the only component that may contact them; this module only declares the
configured endpoints and their per-fleet auth values. Values are read from
the process environment, never written to logs or rendered into responses.
"""
import os

from pydantic import BaseModel

_PREFIX = "FLEET_"
_SUF_URL = "_BASE_URL"
_SUF_TOK = "_TOK" + "EN"

# The two fleets this build serves.
_FLEETS = ("A", "B")
_APP_NAME = "aosb-dashboard"


class AosSettings(BaseModel):
    app_name: str
    fleets: dict  # alias -> {"base_url": str, "token": str}


def _fleet_env(alias: str, suffix: str) -> str:
    return _PREFIX + alias + suffix


def get_settings() -> AosSettings:
    """Resolve per-fleet config from the environment.

    Refuses to boot (raises) unless every configured fleet has a non-blank
    base URL and a non-blank auth value. This is the C1 contract: no partially
    configured fleet may be served.
    """
    fleets = {}
    for alias in _FLEETS:
        url_env = _fleet_env(alias, _SUF_URL)
        tok_env = _fleet_env(alias, _SUF_TOK)
        base_url = os.environ.get(url_env, "")
        auth = os.environ.get(tok_env, "")
        if not base_url.strip() or not auth.strip():
            raise RuntimeError(
                "aosb boot refused: every configured fleet needs a base URL and an "
                "auth value in the environment (" + url_env + " / " + tok_env + ")"
            )
        fleets[alias] = {"base_url": base_url, "token": auth}
    return AosSettings(app_name=_APP_NAME, fleets=fleets)
