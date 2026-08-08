"""/v1/prefs — the family door over the SAME renderer document /v1/settings serves (P9).

Pins the mapping: the two wires read and write the same rows, and the prefs
DELETE keeps the D3b folder-path whitelist exactly like the settings DELETE."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_prefs_and_settings_serve_the_same_document(tmp_path):
    c = _c(tmp_path)
    assert c.get("/v1/prefs").json() == {}
    c.patch("/v1/settings", json={"ui": {"sidebarCollapsed": True}})
    assert c.get("/v1/prefs").json() == {"ui": {"sidebarCollapsed": True}}


def test_prefs_patch_lands_in_the_settings_document(tmp_path):
    c = _c(tmp_path)
    merged = c.patch("/v1/prefs", json={"ui": {"a": 1}, "activeProjectId": "prj1"}).json()
    assert merged == {"ui": {"a": 1}, "activeProjectId": "prj1"}
    assert c.get("/v1/settings").json() == merged


def test_prefs_patch_is_wholesale_per_section(tmp_path):
    c = _c(tmp_path)
    c.patch("/v1/prefs", json={"ai": {"flags": {"m1": "fast", "m2": "slow"}}})
    c.patch("/v1/prefs", json={"ai": {"flags": {"m1": "fast"}}})
    assert c.get("/v1/prefs").json()["ai"] == {"flags": {"m1": "fast"}}


def test_prefs_delete_keeps_the_d3b_folder_path_config(tmp_path):
    c = _c(tmp_path)
    c.patch("/v1/prefs", json={"ui": {"a": 1}, "autosaveDir": "D:/autosave", "chooserDirs": {"import": "E:/in"}})
    assert c.delete("/v1/prefs").status_code == 204
    doc = c.get("/v1/prefs").json()
    assert "ui" not in doc
    assert doc["autosaveDir"] == "D:/autosave"
    assert doc["chooserDirs"] == {"import": "E:/in"}
