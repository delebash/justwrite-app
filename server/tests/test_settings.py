"""/v1/settings — the renderer's preferences document (real rows, not kv blobs)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_empty(tmp_path):
    assert _c(tmp_path).get("/v1/settings").json() == {}


def test_patch_returns_merged_document(tmp_path):
    c = _c(tmp_path)
    merged = c.patch("/v1/settings", json={"ui": {"sidebarCollapsed": True}, "activeProjectId": "prj1"}).json()
    assert merged == {"ui": {"sidebarCollapsed": True}, "activeProjectId": "prj1"}
    assert c.get("/v1/settings").json() == merged


def test_partial_patch_keeps_other_sections(tmp_path):
    c = _c(tmp_path)
    c.patch("/v1/settings", json={"ui": {"a": 1}, "ai": {"defaultLlmId": "x"}})
    # Patching one section leaves siblings untouched...
    c.patch("/v1/settings", json={"activeProjectId": "prj2"})
    doc = c.get("/v1/settings").json()
    assert doc["ui"] == {"a": 1}
    assert doc["ai"] == {"defaultLlmId": "x"}
    assert doc["activeProjectId"] == "prj2"


def test_section_value_is_replaced_wholesale(tmp_path):
    c = _c(tmp_path)
    # A section is the unit of replacement (no deep merge), so a key dropped from
    # the new value is actually gone — e.g. clearing a model-tier override.
    c.patch("/v1/settings", json={"ai": {"modelTiers": {"m1": "fast", "m2": "guided"}}})
    c.patch("/v1/settings", json={"ai": {"modelTiers": {"m1": "fast"}}})
    assert c.get("/v1/settings").json()["ai"] == {"modelTiers": {"m1": "fast"}}


def test_values_are_real_json_not_strings(tmp_path):
    c = _c(tmp_path)
    c.patch("/v1/settings", json={"ui": {"nested": {"on": True, "n": 3}, "list": [1, 2]}})
    ui = c.get("/v1/settings").json()["ui"]
    assert ui["nested"] == {"on": True, "n": 3}
    assert ui["list"] == [1, 2]


def test_persist_across_instances_and_clear(tmp_path):
    c = _c(tmp_path)
    c.patch("/v1/settings", json={"ui": {"sidebarCollapsed": True}})
    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/settings").json() == {"ui": {"sidebarCollapsed": True}}
    assert c2.delete("/v1/settings").status_code == 204
    assert c2.get("/v1/settings").json() == {}
