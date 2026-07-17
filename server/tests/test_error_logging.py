"""Every handled error reaches the server log (2026-07-17, #6). The motivating
bug: a preset PUT with a bad field was rejected 422 by FastAPI's DEFAULT validation
handler, which logs NOTHING — so a failed write left zero server trace and the whole
set-as-default debugging was blind. These pin that (a) a 422 now logs at WARNING with
method+path, (b) it returns our problem+json shape (not FastAPI's default), and
(c) a 4xx HTTPException logs too."""

import logging

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_422_validation_failure_is_logged_and_problem_json(tmp_path, caplog):
    c = _c(tmp_path)
    with caplog.at_level(logging.WARNING, logger="justwrite_server.errors"):
        # temperature must be a float — a string fails body validation → 422.
        r = c.post("/v1/ai/engine-presets", json={"name": "x", "temperature": "not-a-number"})
    assert r.status_code == 422
    # OUR handler, not FastAPI's default: problem+json + a JSON-safe errors list.
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["status"] == 422 and body["type"].endswith("/validation-error")
    assert isinstance(body["errors"], list) and body["errors"]
    # The whole point: it left a trace, naming the path.
    assert any("/v1/ai/engine-presets" in rec.message and rec.levelno == logging.WARNING
               for rec in caplog.records)


def test_4xx_httpexception_is_logged(tmp_path, caplog):
    c = _c(tmp_path)
    with caplog.at_level(logging.WARNING, logger="justwrite_server.errors"):
        # PUT a preset id that doesn't exist → 404 HTTPException (presets_api).
        r = c.put("/v1/ai/engine-presets/does-not-exist", json={"id": "does-not-exist", "name": "x"})
    assert r.status_code == 404
    assert any("does-not-exist" in rec.message and rec.levelno == logging.WARNING
               for rec in caplog.records)
