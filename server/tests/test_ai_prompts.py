"""/v1/ai/prompts — the Lab prompt editor: list / view / edit / reset, all
backed by the DB (FeaturePromptStore)."""

from fastapi.testclient import TestClient

from justwrite_server import database
from justwrite_server.app import create_app
from justwrite_server.seed_feature_prompts import DEFAULT_FEATURE_PROMPTS
from llm_runner.llm import seed as _llm_seed


def _client(tmp_path):
    c = TestClient(create_app(tmp_path))
    db = database.SessionLocal()
    try:
        _llm_seed.seed_default_feature_prompts(db)  # shared seeder reads JW's registered prompts
        db.commit()
    finally:
        db.close()
    return c


def test_list_returns_seeded_prompts(tmp_path):
    c = _client(tmp_path)
    r = c.get("/v1/ai/prompts")
    assert r.status_code == 200, r.text
    prompts = r.json()["prompts"]
    assert len(prompts) == len(DEFAULT_FEATURE_PROMPTS)
    crit = next(p for p in prompts if p["key"] == "critique")
    assert "fiction editor" in crit["system"] and crit["builtIn"] is True
    assert crit["feature"] == "critique"


def test_get_single_and_unknown(tmp_path):
    c = _client(tmp_path)
    assert c.get("/v1/ai/prompts/critique").status_code == 200
    assert c.get("/v1/ai/prompts/nope").status_code == 404


def test_edit_then_reset_round_trips(tmp_path):
    c = _client(tmp_path)
    # Edit the critique system prompt — persists to the DB.
    r = c.put("/v1/ai/prompts/critique", json={
        "feature": "critique", "system": "EDITED PROMPT", "userTemplate": "{{chapter_text}}",
        "temperature": 0.1, "think": False,
    })
    assert r.status_code == 200, r.text
    assert r.json()["system"] == "EDITED PROMPT" and r.json()["temperature"] == 0.1
    # The edit is read back (DB is the source of truth).
    assert c.get("/v1/ai/prompts/critique").json()["system"] == "EDITED PROMPT"
    # Reset restores the seeded default.
    r = c.post("/v1/ai/prompts/critique/reset")
    assert r.status_code == 200, r.text
    assert "fiction editor" in r.json()["system"] and r.json()["temperature"] == 0.4


def test_edit_changes_what_run_sends(tmp_path):
    # Editing the prompt in the Lab changes what /v1/ai/run sends to the LLM —
    # proves the endpoint reads the (edited) DB row, not a code constant.
    from justwrite_server.models import Setting
    import json as _json
    from llm_runner.llm import get_llm_registry
    from llm_runner.llm.base import LLMResponse

    class Fake:
        provider_id = "p1"
        provider_type = "openai-compat"
        default_model = "m"
        last: dict = {}

        def chat(self, messages, *, model=None, temperature=0.7, max_tokens=None, system=None, think=False, extra=None):
            Fake.last = {"system": system}
            return LLMResponse(text="{}", model=model or self.default_model, prompt_tokens=1, completion_tokens=1)

    c = _client(tmp_path)
    reg = get_llm_registry()
    reg._adapters = {}
    reg.register(Fake())
    db = database.SessionLocal()
    try:
        db.add(Setting(key="ai", value=_json.dumps({"defaultLlmId": "p1", "featurePins": {}})))
        db.commit()
    finally:
        db.close()

    c.put("/v1/ai/prompts/critique", json={"system": "LAB-EDITED SYSTEM", "userTemplate": "{{chapter_text}}", "temperature": 0.4})
    r = c.post("/v1/ai/run", json={"action": "critique", "variables": {"chapter_text": "x"}})
    assert r.status_code == 200, r.text
    assert Fake.last["system"] == "LAB-EDITED SYSTEM"


def test_reset_unknown_default_400(tmp_path):
    c = _client(tmp_path)
    assert c.post("/v1/ai/prompts/custom-thing/reset").status_code == 400


def test_entity_sweep_schema_has_character_aliases_only():
    """E3 (RAG build): the entitySweep json_schema proposes aliases on the
    CHARACTER item only — locations/objects (the shared _ENTITY_ITEM) must
    not grow an aliases field."""
    import json

    from justwrite_server.seed_feature_prompts import DEFAULT_FEATURE_PROMPTS

    schema = json.loads(DEFAULT_FEATURE_PROMPTS["entitySweep"]["json_schema"])
    char_props = schema["properties"]["characters"]["items"]["properties"]
    assert char_props["aliases"] == {"type": "array", "items": {"type": "string"}}
    for kind in ("locations", "objects"):
        assert "aliases" not in schema["properties"][kind]["items"]["properties"]
    # The prompt text describes the same field.
    assert "aliases" in DEFAULT_FEATURE_PROMPTS["entitySweep"]["system"]
