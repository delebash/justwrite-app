"""/v1/images — server-side image blob store (P4)."""

import base64

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_upload_fetch_delete(tmp_path):
    c = _c(tmp_path)
    png = b"\x89PNG\r\n\x1a\n" + b"fake-image-bytes"
    b64 = base64.b64encode(png).decode()
    r = c.post("/v1/images", json={"name": "a.png", "mime": "image/png", "dataBase64": b64})
    assert r.status_code == 200
    image_id = r.json()["id"]
    assert r.json()["name"] == "a.png"

    g = c.get(f"/v1/images/{image_id}")
    assert g.status_code == 200
    assert g.content == png
    assert g.headers["content-type"].startswith("image/png")

    assert c.delete(f"/v1/images/{image_id}").status_code == 204
    assert c.get(f"/v1/images/{image_id}").status_code == 404


def test_fetch_missing_404(tmp_path):
    assert _c(tmp_path).get("/v1/images/nope").status_code == 404


def test_bad_base64_rejected(tmp_path):
    c = _c(tmp_path)
    r = c.post("/v1/images", json={"name": "x", "mime": "image/png", "dataBase64": "!!!not-base64!!!"})
    assert r.status_code == 400
