"""Per-project ZIP export / import (api/book_transfer_api.py) + the ONE shared import
core the sample seeder rides (book_io.import_book_snapshot).

The whole point of server-executes over the desktop bridge: this round-trip —
including the image bytes and the cover image — is verifiable here, no Tauri.
"""

import base64
import io
import zipfile

from fastapi.testclient import TestClient

from justwrite_server.app import create_app

# A real 1x1 transparent PNG so the image round-trip exercises actual bytes.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _upload(c, name):
    return c.post("/v1/images", json={
        "name": name, "mime": "image/png", "dataBase64": base64.b64encode(PNG).decode(),
    }).json()["id"]


def test_export_import_round_trip_with_images(tmp_path):
    c = _c(tmp_path)
    # A source project with an entity image AND a project cover image (the two
    # image holders externalize/internalize must both cover).
    entity_sid = _upload(c, "char.png")
    cover_sid = _upload(c, "cover.png")
    snap = {
        "project": {"title": "My Book", "author": "A", "coverImage": {
            "id": "img_cover", "addedAt": 1, "kind": "server", "serverId": cover_sid,
            "name": "cover.png", "mime": "image/png",
        }},
        "characters": [{"id": "c1", "name": "Cael"}],
        "images": {"c1": [{
            "id": "img_1", "addedAt": 2, "kind": "server", "serverId": entity_sid,
            "name": "char.png", "mime": "image/png",
        }]},
    }
    assert c.put("/v1/projects/src/book", json=snap).status_code == 204

    # Export → a real zip named after the book, folder structure inside.
    r = c.get("/v1/projects/src/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert 'filename="My Book.zip"' in r.headers.get("content-disposition", "")
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert "My Book/book.json" in names
    assert sum(1 for n in names if n.startswith("My Book/images/")) == 2  # entity + cover

    # Import → a NEW project; images re-uploaded as fresh blobs, bytes preserved.
    meta = c.post("/v1/projects/import", json={
        "zipBase64": base64.b64encode(r.content).decode(),
    }).json()
    new_id = meta["id"]
    assert new_id != "src" and meta["title"] == "My Book"

    book = c.get(f"/v1/projects/{new_id}/book").json()
    assert book["project"]["title"] == "My Book"
    # Cover survived, with a NEW serverId (not the source's), identical bytes.
    new_cover = book["project"]["coverImage"]
    assert new_cover["serverId"] and new_cover["serverId"] != cover_sid
    assert c.get(f"/v1/images/{new_cover['serverId']}").content == PNG
    # Entity image survived likewise.
    new_img = book["images"]["c1"][0]
    assert new_img["serverId"] and new_img["serverId"] != entity_sid
    assert c.get(f"/v1/images/{new_img['serverId']}").content == PNG

    # Both projects still exist (import doesn't disturb the source).
    assert {p["id"] for p in c.get("/v1/projects").json()} >= {"src", new_id}


def test_image_less_book_round_trips(tmp_path):
    # The common case (the bundled sample is image-less): no images/ in the zip.
    c = _c(tmp_path)
    snap = {"project": {"title": "Plain"}, "characters": [{"id": "c1", "name": "X"}]}
    assert c.put("/v1/projects/p/book", json=snap).status_code == 204
    r = c.get("/v1/projects/p/export")
    assert r.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert "Plain/book.json" in zf.namelist()
    assert not any(n.startswith("Plain/images/") for n in zf.namelist())
    meta = c.post("/v1/projects/import", json={
        "zipBase64": base64.b64encode(r.content).decode(),
    }).json()
    book = c.get(f"/v1/projects/{meta['id']}/book").json()
    assert book["project"]["title"] == "Plain"
    assert [ch["id"] for ch in book["characters"]] == ["c1"]


def test_export_missing_project_404(tmp_path):
    c = _c(tmp_path)
    assert c.get("/v1/projects/nope/export").status_code == 404


def test_import_rejects_bad_input(tmp_path):
    c = _c(tmp_path)
    assert c.post("/v1/projects/import", json={"zipBase64": "!!!"}).status_code == 400
    assert c.post("/v1/projects/import", json={
        "zipBase64": base64.b64encode(b"not a zip").decode(),
    }).status_code == 400
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("random.txt", "x")
    assert c.post("/v1/projects/import", json={
        "zipBase64": base64.b64encode(buf.getvalue()).decode(),
    }).status_code == 400
