"""CSRF Origin guard (csrf.py) — the no-token "do the vector directly" hardening."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_cross_site_mutation_rejected(tmp_path):
    c = _c(tmp_path)
    # A malicious page's cross-site mutating request is rejected (the CSRF vector).
    r = c.put("/v1/projects/x/book", json={"project": {"title": "T"}},
              headers={"origin": "http://evil.example"})
    assert r.status_code == 403


def test_no_origin_and_app_origin_allowed(tmp_path):
    c = _c(tmp_path)
    # No Origin (non-browser client / the Tauri reqwest path) → allowed.
    assert c.put("/v1/projects/a/book", json={"project": {"title": "T"}}).status_code == 204
    # The app's own dev origin → allowed (so dev:vite + the headless smoke work).
    assert c.put("/v1/projects/b/book", json={"project": {"title": "T"}},
                 headers={"origin": "http://localhost:1420"}).status_code == 204


def test_same_origin_mutation_allowed(tmp_path):
    """The SERVER-HOSTED UI (headless mode: `serve` + a browser on the dist/ mount)
    is same-origin, and browsers DO send Origin on same-origin mutations. Without
    the same-origin allowance every write from that UI 403'd (found 2026-07-15
    driving the server-hosted UI; the dev-origin smoke never hit it). The origin is
    derived per-request, so a non-default host/port works too."""
    c = _c(tmp_path)
    r = c.put("/v1/projects/s/book", json={"project": {"title": "T"}},
              headers={"origin": "http://testserver"})  # TestClient's own origin
    assert r.status_code == 204


def test_cross_site_read_allowed(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/projects/x/book", json={"project": {"title": "T"}})
    # GET is not the CSRF vector (and CORS blocks the page from reading the body).
    r = c.get("/v1/projects/x/book", headers={"origin": "http://evil.example"})
    assert r.status_code == 200
