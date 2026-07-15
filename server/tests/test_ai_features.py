"""/v1/ai/run — server-side feature execution: renders the action's server-side
prompt template and dispatches through the shared llm_runner dispatch, honoring
the user's default provider / feature pins from settings.
"""


from fastapi.testclient import TestClient

from justwrite_server import database
from justwrite_server.app import create_app
from llm_runner.llm import get_llm_registry
from llm_runner.llm import seed as _llm_seed
from llm_runner.llm.base import LLMResponse, StreamDelta


class FakeAdapter:
    provider_id = "p1"
    provider_type = "openai-compat"
    default_model = "gpt-4o-mini"
    last: dict = {}

    def chat(self, messages, *, model=None, temperature=None, max_tokens=None, system=None, think=False, extra=None):
        FakeAdapter.last = {
            "messages": messages, "system": system, "model": model,
            "temperature": temperature, "think": think,
        }
        return LLMResponse(text='{"notes":[]}', model=model or self.default_model, prompt_tokens=5, completion_tokens=2)

    def stream_chat(self, messages, *, model=None, temperature=0.7, max_tokens=None, system=None, think=False, extra=None):
        FakeAdapter.last = {"messages": messages, "system": system}
        yield StreamDelta(text="hi ")
        yield StreamDelta(text="there")
        yield StreamDelta(done=True, prompt_tokens=4, completion_tokens=3)


def _client(tmp_path, *, default_id="p1"):
    c = TestClient(create_app(tmp_path))
    reg = get_llm_registry()
    reg._adapters = {}
    reg.register(FakeAdapter())
    db = database.SessionLocal()
    try:
        _llm_seed.seed_default_feature_prompts(db)  # shared seeder reads JW's registered prompts
        db.commit()
    finally:
        db.close()
    # Routing lives in the shared routing store (real tables) — set the global default
    # provider the dispatch reads. Per-feature pins are gone (2026-07-15 — the action's
    # preset owns routing); no preset is seeded here, so critique takes the no-preset route.
    from llm_runner.llm import stores
    from llm_runner.llm.routing_api import RoutingConfig, RoutingDefaults

    stores.get_routing_store().set_routing(RoutingConfig(default=RoutingDefaults(llmId=default_id)))
    return c


def test_run_critique_dispatches_server_side(tmp_path):
    c = _client(tmp_path)
    r = c.post("/v1/ai/run", json={
        "action": "critique",
        "variables": {"chapter_label": "Chapter 4 — The Map\n\n", "chapter_text": "He ran."},
    })
    assert r.status_code == 200, r.text
    assert r.json()["content"] == '{"notes":[]}'
    assert r.json()["model"] == "gpt-4o-mini"
    # The server rendered the user template + passed the server-side system prompt.
    user = FakeAdapter.last["messages"][0].content
    assert "Chapter 4 — The Map" in user and "BEGIN CHAPTER" in user and "He ran." in user
    assert "fiction editor" in (FakeAdapter.last["system"] or "")
    # No preset seeded here → the no-preset route: temperature is NOT sent (None → the
    # adapter omits it, never fabricated), think off. (Preset-param plumbing is proven
    # in the runner suite + the seed-count tests.)
    assert FakeAdapter.last["think"] is False and FakeAdapter.last["temperature"] is None


def test_run_unregistered_provider_override_501(tmp_path):
    # A request provider override to an unregistered provider surfaces 501 cleanly (the
    # Lab's per-call route override; JW per-feature pins are gone 2026-07-15).
    c = _client(tmp_path)
    r = c.post("/v1/ai/run", json={"action": "critique", "variables": {"chapter_text": "x"},
                                   "providerId": "ghost"})
    assert r.status_code == 501


def test_unknown_action_404(tmp_path):
    c = _client(tmp_path)
    assert c.post("/v1/ai/run", json={"action": "nope", "variables": {}}).status_code == 404


def test_migrated_actions_render_and_dispatch(tmp_path):
    c = _client(tmp_path)
    cases = [
        ("foreshadowing", {"chapter_label": "Ch 1\n\n", "chapter_text": "He hid the key."}, "He hid the key."),
        ("critiqueStructure", {"chapter_label": "", "chapter_text": "Tense scene."}, "Tense scene."),
        ("readerKnowledge", {"user_content": "READER KNOWS: x\n--- BEGIN CHAPTER ---\ny\n--- END CHAPTER ---"}, "BEGIN CHAPTER"),
        ("entitySweep", {"user_content": "Already in bible: (none)\nHalvard drew his sword."}, "Halvard"),
        ("characterAudit", {"user_content": "CHARACTER PROFILE\nName: Mara\nShe smiled coldly."}, "Mara"),
        ("relationshipArc", {"user_content": "PROFILE A — Mara\nPROFILE B — Joss"}, "PROFILE A"),
        ("voiceDrift", {"user_content": "OUTLIER — Ch 5\nlots of dialogue"}, "OUTLIER"),
        ("beatSheet", {"user_content": "FRAMEWORK: Save the Cat\nCh.1 opening image"}, "FRAMEWORK"),
        ("reverseOutline", {"user_content": "The book has 5 chapters.\nCh.1 inciting"}, "5 chapters"),
        ("marketingPack", {"user_content": "TITLE: The Map\nGENRE: thriller"}, "TITLE"),
        ("multiReaderGenre", {"chapter_label": "Ch 1\n\n", "chapter_text": "A cold hook."}, "A cold hook."),
        ("multiReaderBookClub", {"chapter_label": "", "chapter_text": "She wept."}, "She wept."),
        ("sensory", {"user_content": "Subject: a tannery at dawn"}, "tannery"),
        ("unstuck", {"user_content": "BEGIN PROSE\nShe stared at the door."}, "stared at the door"),
        ("recap", {"user_content": "Today: 1200 words on Chapter 4."}, "Chapter 4"),
        ("briefing", {"user_content": "Gap: 3 days. Last chapter: The Map."}, "The Map"),
        ("brainstorm", {"label": "Character names", "user_content": "Seed: exiled queens"}, "exiled queens"),
        ("brainstormPlot", {"kind": "plot twists", "user_content": "Seed: detective story"}, "detective story"),
    ]
    for action, variables, needle in cases:
        r = c.post("/v1/ai/run", json={"action": action, "variables": variables})
        assert r.status_code == 200, f"{action}: {r.text}"
        assert needle in FakeAdapter.last["messages"][0].content  # template rendered the variables


def test_plotholes_renders_world_rules_into_system(tmp_path):
    # plotHoles templates the SYSTEM prompt — the project's world-rules section
    # is substituted server-side via {{world_rules_section}}.
    c = _client(tmp_path)
    r = c.post("/v1/ai/run", json={
        "action": "plotHoles",
        "variables": {"user_content": "chapter digest", "world_rules_section": "\n\nEXTRA: magic costs blood."},
    })
    assert r.status_code == 200, r.text
    assert "magic costs blood" in FakeAdapter.last["system"]
    assert "plot holes" in FakeAdapter.last["system"]  # base prompt still present
    assert FakeAdapter.last["messages"][0].content == "chapter digest"


def test_stream_endpoint_emits_sse(tmp_path):
    c = _client(tmp_path)
    r = c.post("/v1/ai/stream", json={
        "action": "critique",
        "variables": {"chapter_label": "", "chapter_text": "x"},
    })
    assert r.status_code == 200
    body = r.text  # TestClient buffers the streamed body
    assert '{"delta": "hi "}' in body and '{"delta": "there"}' in body
    assert '"done": true' in body and '"completionTokens": 3' in body
    assert "data: [DONE]" in body


def test_stream_unknown_action_404(tmp_path):
    c = _client(tmp_path)
    assert c.post("/v1/ai/stream", json={"action": "nope", "variables": {}}).status_code == 404


def test_provider_override_routes_to_named_provider(tmp_path):
    # The Writer Lab runs one action against a specific provider/model override.
    c = _client(tmp_path)

    class Fake2:
        provider_id = "p2"
        provider_type = "openai-compat"
        default_model = "m2"

        def chat(self, messages, *, model=None, temperature=0.7, max_tokens=None, system=None, think=False, extra=None):
            return LLMResponse(text="from-p2", model=model or self.default_model, prompt_tokens=1, completion_tokens=1)

    get_llm_registry().register(Fake2())
    r = c.post("/v1/ai/run", json={
        "action": "critique", "variables": {"chapter_text": "x"},
        "providerId": "p2", "model": "m2",
    })
    assert r.status_code == 200, r.text
    assert r.json()["content"] == "from-p2" and r.json()["model"] == "m2"
