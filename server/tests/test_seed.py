"""Workspace seeding — the default LLM providers the server creates on a fresh
install, and the ON-DEMAND sample book (QC-40, user 2026-07-10: not seeded at
boot — a fresh install has NO projects and the renderer lands on its welcome
screen; "Try tutorial project" creates the sample via POST /v1/projects/demo).

The sample is DATA-DRIVEN (2026-07-12): its content is a bundled book folder
(`samples/<name>/book.json`), not hardcoded Python. So these tests assert the
MECHANISM and the STRUCTURE — the sample loads, creates a normal editable
project, and round-trips — not the specific book. Swap the sample folder and
they stay green.

seed_workspace() opens its own session from database.SessionLocal, which
create_app(tmp_path) wired up via init_db — so constructing a client first
points the seeders at the test's tmp database.
"""

from fastapi.testclient import TestClient

from justwrite_server import book_io, database
from justwrite_server.app import create_app
from justwrite_server.database.demo_seed import DEMO_PROJECT_ID, demo_book_snapshot, list_samples
from justwrite_server.database.seed import seed_workspace
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
    # (the renderer shows the welcome screen; zero projects is a valid state).
    assert c.get("/v1/projects").json() == []
    settings = c.get("/v1/settings").json()
    assert "activeProjectId" not in settings
    assert "demoSeeded" not in settings

    providers = c.get("/v1/llm-providers").json()["providers"]
    assert len(providers) == len(DEFAULT_PROVIDERS)
    by_id = {p["id"]: p for p in providers}
    assert {"local-llamacpp", "openai", "claude", "openrouter"} <= set(by_id)
    # The shared response shape carries providerType. Native SDK adapters back
    # claude/gemini/ollama now (#15 C1, the 2026-07-17 SDK pivot), so the seed rows
    # carry the real types — no behavior-preserving openai-compat map any more.
    assert by_id["openai"]["providerType"] == "openai"
    assert by_id["claude"]["providerType"] == "anthropic"
    assert by_id["local-llamacpp"]["providerType"] == "local-llamacpp"
    # Seeded providers are registered into the shared adapter registry at boot.
    assert all(p["registered"] for p in providers)


def test_demo_created_on_demand(tmp_path):
    c = _c(tmp_path)
    seed_workspace()

    # The tutorial button's endpoint creates the sample project with its fixed
    # id, carrying whatever title/author the bundled sample declares (content-
    # agnostic — swap the sample folder and this stays green)…
    r = c.post("/v1/projects/demo").json()
    assert r["id"] == DEMO_PROJECT_ID and r["created"] is True
    assert isinstance(r["title"], str) and r["title"]
    assert "author" in r
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


def test_sample_round_trips_as_an_editable_project(tmp_path):
    # The bundled sample decomposes into a project and assembles back — a valid,
    # editable book. Checks are SHAPE-only (content-agnostic), so any exported
    # book dropped into samples/ passes; the fixtures below verify the seams the
    # renderer depends on (minted scene ids, extras keys, strand→scene links).
    _c(tmp_path)
    db = database.SessionLocal()
    try:
        book_io.decompose(db, DEMO_PROJECT_ID, demo_book_snapshot())
        db.commit()
        snap = book_io.assemble(db, DEMO_PROJECT_ID)
    finally:
        db.close()

    # Non-empty core structure.
    assert snap["project"]["title"]
    assert snap["parts"] and sum(len(p["chapters"]) for p in snap["parts"]) >= 1
    assert snap["characters"]
    all_scene_ids = {s["id"] for ch in snap["scenes"].values() for s in ch}
    assert all_scene_ids  # at least one scene

    # Scene ids are minted scn_{chId}_{i+1}.
    for ch_id, scenes in snap["scenes"].items():
        for i, s in enumerate(scenes):
            assert s["id"] == f"scn_{ch_id}_{i + 1}"

    # Character extras only exist for real characters.
    char_ids = {c["id"] for c in snap["characters"]}
    assert set(snap["characterExtras"]) <= char_ids

    # Every strand beat that names a scene points at a scene that exists.
    for strand in snap["strands"]:
        for beat in strand.get("beats", []):
            if beat.get("sceneId"):
                assert beat["sceneId"] in all_scene_ids, f"dangling beat {beat['id']}"


def test_a_sample_is_bundled():
    # A bundled sample folder exists (samples/<name>/book.json) and the default
    # one loads as a valid snapshot with the exact keys book_io consumes.
    assert list_samples(), "no bundled sample folders found under samples/"
    snap = demo_book_snapshot()
    assert set(snap) == {
        "project", "parts", "scenes", "characters", "characterExtras", "locations",
        "objects", "groups", "strands", "notes", "architecture", "worldbuilding",
        "worldbuildingCategories", "tagVocabularies", "statuses", "images", "events",
        "trash", "dailyRecaps", "reverseOutline", "beatSheets", "plotHoles",
        "voiceCanonChapterIds", "relationshipArcs", "marketingPack", "worldRules",
    }


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
    # (QC-40: no demo; the renderer lands on the welcome screen), providers back.
    assert c.get("/v1/projects").json() == []
    settings = c.get("/v1/settings").json()
    assert "ui" not in settings
    assert "demoSeeded" not in settings
    assert len(c.get("/v1/llm-providers").json()["providers"]) == len(DEFAULT_PROVIDERS)


def test_seed_presets_refs_and_samples(tmp_path):
    """The 2026-07-15 one-source mint: 10 built-in presets, 37 per-action refs, the
    catch-all default, and one test-sample row per (action, blob). Every count is
    DERIVED from the seed source, never hardcoded."""
    from justwrite_server import seed_presets as SP
    from llm_runner.llm import stores

    _c(tmp_path)
    seed_workspace()

    presets = stores.get_engine_preset_store().list()
    refs = stores.get_feature_preset_ref_store().list()
    samples = stores.get_test_sample_store().list_for_action()

    # 10 built-in presets, exactly the mint ids.
    assert {p.id for p in presets} == {d["id"] for d in SP.DEFAULT_ENGINE_PRESETS}
    assert len(presets) == len(SP.DEFAULT_ENGINE_PRESETS) == 10
    # every preset carries its OWN temperature (no None abstains any more).
    assert all(p.temperature is not None for p in presets)

    # 38 per-action refs, exactly the mint map; each points at a real preset.
    # (37 → 38: +characterProfile on p_extract — E, 2026-07-18.)
    assert refs == SP.DEFAULT_FEATURE_PRESETS
    assert len(refs) == 39
    ids = {p.id for p in presets}
    assert all(pid in ids for pid in refs.values())

    # the catch-all default preset (⚑3).
    assert stores.get_default_preset_id() == SP.DEFAULT_PRESET_ID == "p_prose_edit"

    # test samples: ONE row per (action, blob) — the count is derived from the list,
    # and every seeded action has at least one sample (the author-once fan-out).
    expected = sum(len(r["actions"]) for r in SP.DEFAULT_TEST_SAMPLES)
    assert len(samples) == expected
    assert {r["action"] for r in samples} == set(refs)


def test_curated_catalog_and_measured_knowledge_are_jw_data_now(tmp_path):
    """Decision ④ (family parity batch 2026-08-05): the writing-curated catalog +
    its measured class tunes + the embed task templates moved from the kit's
    shared seed into JW's own — ids unchanged, so existing DBs keep everything.
    This guards the moved data end-to-end: it must SERVE through the app, and the
    embed ladder's rank facts (which the kit's test_embed_templates used to pin)
    hold here now."""
    from justwrite_server import seed_presets as SP
    from llm_runner.llm import db as _db, stores

    c = _c(tmp_path)
    seed_workspace()

    # The whole catalog = the daily driver + the moved curated ladder, exact ids.
    rows = {r.id: r for r in stores.get_model_catalog_store().list()}
    expect = {d["id"] for d in SP.DEFAULT_MODEL_CATALOG_EXTRA} | {d["id"] for d in SP.JW_CURATED_CATALOG}
    assert set(rows) == expect and len(SP.JW_CURATED_CATALOG) == 10

    # The embed ladder facts (moved with the rows): proven 8B outranks the
    # untested KaLM contender ON PURPOSE; the 4B is the always-eligible CPU band.
    ranks = {d["id"]: d["quality_rank"] for d in SP.JW_CURATED_CATALOG if d.get("embedding")}
    assert ranks["qwen3-embedding-8b"] < ranks["kalm-embedding-gemma3-12b"] < ranks["qwen3-embedding-4b"]
    assert rows["qwen3-embedding-4b"].tier == "cpu"

    # The instruct-side embed templates seed for all three rows.
    st = stores.get_embed_template_store()
    for tpl in SP.JW_EMBED_TEMPLATES:
        row = st.get(tpl["id"])
        assert row is not None and row.queryTemplate.startswith("Instruct: ")

    # The 13 measured class-tune rows (incl. the author's 8 GB/32 GB n_cpu_moe 21)
    # seed under their measured ids.
    s = database.SessionLocal()
    try:
        pairs = {(r.model_id, r.class_key) for r in s.query(_db.ClassTune).all()}
        got = {r.flag_name: r.flag_value for r in s.query(_db.ClassTune).filter(
            _db.ClassTune.model_id == "gemma-4-26b-a4b-qat",
            _db.ClassTune.class_key == "dgpu-vram8|ram32").all()}
    finally:
        s.close()
    assert {(t["model_id"], t["class_key"]) for t in SP.JW_CLASS_TUNES} <= pairs
    assert len(SP.JW_CLASS_TUNES) == 13
    assert got.get("n_cpu_moe") == "21" and got.get("ctx_len") == "32768"

    # And the moved rows actually SERVE — the catalog endpoint carries the ladder.
    served = {r["id"] for r in c.get("/v1/ai/model-catalog").json()["rows"]}
    assert expect <= served
