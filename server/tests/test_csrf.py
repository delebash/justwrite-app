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


def test_cross_site_read_allowed(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/projects/x/book", json={"project": {"title": "T"}})
    # GET is not the CSRF vector (and CORS blocks the page from reading the body).
    r = c.get("/v1/projects/x/book", headers={"origin": "http://evil.example"})
    assert r.status_code == 200
