"""/v1/server-auth — the bearer-token door persists (the P5 dormant-bug pin).

The route bound `SessionLocal` by from-import at module import time — before
init_db ever runs — so its None-guards made GET report no-auth and PUT 503
unconditionally, and nothing covered the route. This file pins the roundtrip
against the late-binding form (`database.session` module-attr access).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def test_server_auth_roundtrip_persists_tokens(tmp_path):
    c = TestClient(create_app(tmp_path))
    # Empty by default — auth off.
    assert c.get("/v1/server-auth").json() == {"tokens": [], "requireForLoopback": False}

    r = c.put("/v1/server-auth", json={"tokens": ["s3cret", "  "]})
    assert r.status_code == 200
    assert r.json() == {"tokens": ["s3cret"], "requireForLoopback": False}

    # Tokens now gate /v1 for non-loopback clients (TestClient is one), so read
    # it back WITH the bearer — proves the config actually reached the DB.
    body = c.get("/v1/server-auth",
                 headers={"Authorization": "Bearer s3cret"}).json()
    assert body == {"tokens": ["s3cret"], "requireForLoopback": False}


def test_server_auth_rejects_non_string_tokens(tmp_path):
    c = TestClient(create_app(tmp_path))
    assert c.put("/v1/server-auth", json={"tokens": "nope"}).status_code == 400
