"""Workspace seeding — the default LLM providers the server creates on a fresh
install, and the ON-DEMAND demo book (QC-40, user 2026-07-10: the demo is no
longer seeded at boot — a fresh install has NO projects and the renderer lands
in its blank "Untitled project" fallback; "Try tutorial project" creates the
demo via POST /v1/projects/demo).

seed_workspace() opens its own session from database.SessionLocal, which
create_app(tmp_path) wired up via init_db — so constructing a client first
points the seeders at the test's tmp database.
"""

from fastapi.testclient import TestClient

from justwrite_server import book_io, database
from justwrite_server.app import create_app
from justwrite_server.demo_seed import DEMO_PROJECT_ID, demo_book_snapshot
from justwrite_server.seed import seed_workspace
from llm_runner.llm.seed import DEFAULT_PROVIDERS, seed_default_providers


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_seed_creates_providers_but_no_demo(tmp_path):
    c = _c(tmp_path)
    # Nothing until seeded — create_app stays pure so the rest of the suite
    # starts empty.
    assert c.get("/v1/projects").json() == []

    seed_workspace()

    # QC-40: no demo project, no active pointer — the fresh workspace is EMPTY
    # (the renderer mints its blank "Untitled project" fallback).
    assert c.get("/v1/projects").json() == []
    settings = c.get("/v1/settings").json()
    assert "activeProjectId" not in settings
    assert "demoSeeded" not in settings

    providers = c.get("/v1/llm-providers").json()["providers"]
    assert len(providers) == len(DEFAULT_PROVIDERS)
    by_id = {p["id"]: p for p in providers}
    assert {"local-llamacpp", "openai", "claude", "openrouter"} <= set(by_id)
    # The shared response shape carries providerType (behavior-preserving map:
    # claude/gemini stay openai-compat until the native adapters are verified).
    assert by_id["openai"]["providerType"] == "openai"
    assert by_id["claude"]["providerType"] == "openai-compat"
    assert by_id["local-llamacpp"]["providerType"] == "local-llamacpp"
    # Seeded providers are registered into the shared adapter registry at boot.
    assert all(p["registered"] for p in providers)


def test_demo_created_on_demand(tmp_path):
    c = _c(tmp_path)
    seed_workspace()

    # The tutorial button's endpoint creates the demo with its fixed id…
    r = c.post("/v1/projects/demo").json()
    assert r == {"id": DEMO_PROJECT_ID, "title": "The Cartographer's Daughter",
                 "author": "Mira Halden", "created": True}
    assert [p["id"] for p in c.get("/v1/projects").json()] == [DEMO_PROJECT_ID]
    # …a second click returns the SAME project (never a duplicate)…
    r2 = c.post("/v1/projects/demo").json()
    assert r2["created"] is False and r2["id"] == DEMO_PROJECT_ID
    assert len(c.get("/v1/projects").json()) == 1
    # …and after the user deletes it, the button can bring it back.
    assert c.delete(f"/v1/projects/{DEMO_PROJECT_ID}").status_code == 204
    assert c.post("/v1/projects/demo").json()["created"] is True
    assert [p["id"] for p in c.get("/v1/projects").json()] == [DEMO_PROJECT_ID]
    # It never touches the active pointer — the renderer switches itself.
    assert "activeProjectId" not in c.get("/v1/settings").json()


def test_demo_book_has_full_structure(tmp_path):
    _c(tmp_path)
    db = database.SessionLocal()
    try:
        book_io.decompose(db, DEMO_PROJECT_ID, demo_book_snapshot())
        db.commit()
        snap = book_io.assemble(db, DEMO_PROJECT_ID)
    finally:
        db.close()

    assert len(snap["parts"]) == 3
    assert sum(len(p["chapters"]) for p in snap["parts"]) == 13
    assert len(snap["characters"]) == 8
    assert len(snap["locations"]) == 6
    assert len(snap["objects"]) == 5
    assert len(snap["strands"]) == 5
    assert len(snap["groups"]) == 3
    assert len(snap["notes"]) == 3
    assert len(snap["worldbuilding"]) == 5
    assert len(snap["worldbuildingCategories"]) == 6
    assert len(snap["statuses"]) == 7
    # Character extras survive for the three characters that have them.
    assert set(snap["characterExtras"]) == {"c1", "c3", "c4"}
    # Scene ids are minted scn_{chId}_{i+1}, and a strand beat references one.
    assert snap["scenes"]["ch4"][0]["id"] == "scn_ch4_1"
    s2 = next(s for s in snap["strands"] if s["id"] == "s2")
    assert s2["beats"][0]["sceneId"] == "scn_ch4_1"
    # Scene links round-trip.
    assert snap["scenes"]["ch1"][2]["characters"] == ["c1", "c2"]
    # Per-entity events, including the "setting" world timeline.
    assert len(snap["events"]["setting"]) == 6


def test_seed_is_idempotent(tmp_path):
    c = _c(tmp_path)
    seed_workspace()
    seed_workspace()  # second boot
    # Still no projects (QC-40); providers not duplicated.
    assert c.get("/v1/projects").json() == []
    assert len(c.get("/v1/llm-providers").json()["providers"]) == len(DEFAULT_PROVIDERS)


def test_boot_never_resurrects_a_deleted_demo(tmp_path):
    c = _c(tmp_path)
    seed_workspace()
    c.post("/v1/projects/demo")
    assert c.delete(f"/v1/projects/{DEMO_PROJECT_ID}").status_code == 204
    seed_workspace()  # next boot seeds nothing (QC-40) — the deletion stands
    assert c.get("/v1/projects").json() == []


def test_providers_merge_missing_without_clobbering(tmp_path):
    c = _c(tmp_path)
    # A user-customized list: one built-in id with an edited key, plus a custom
    # row — added through the per-provider router (the bulk PUT is gone).
    assert c.post("/v1/llm-providers", json={
        "id": "openai", "name": "OpenAI", "providerType": "openai", "apiKey": "sk-user",
    }).status_code == 201
    assert c.post("/v1/llm-providers", json={
        "id": "my-ollama", "name": "My box", "providerType": "openai-compat",
    }).status_code == 201

    db = database.SessionLocal()
    try:
        added = seed_default_providers(db)
        db.commit()
    finally:
        db.close()

    assert added == len(DEFAULT_PROVIDERS) - 1  # every built-in except the present "openai"
    providers = {p["id"]: p for p in c.get("/v1/llm-providers").json()["providers"]}
    # Missing built-ins added; the user's edit + custom row preserved.
    assert "claude" in providers and "local-llamacpp" in providers
    assert providers["openai"]["hasApiKey"] is True  # the user's key survived the merge
    assert providers["my-ollama"]["name"] == "My box"


def test_reset_reseeds_workspace(tmp_path):
    c = _c(tmp_path)
    seed_workspace()
    # Add some user data on top of the seed.
    c.put("/v1/projects/prj_user", json={"project": {"title": "Mine"}})
    c.patch("/v1/settings", json={"ui": {"x": 1}})

    assert c.post("/v1/data/reset").status_code == 200

    # User project gone; reset behaves like first run — an EMPTY workspace
    # (QC-40: no demo, the renderer mints its blank fallback), providers back.
    assert c.get("/v1/projects").json() == []
    settings = c.get("/v1/settings").json()
    assert "ui" not in settings
    assert "demoSeeded" not in settings
    assert len(c.get("/v1/llm-providers").json()["providers"]) == len(DEFAULT_PROVIDERS)
