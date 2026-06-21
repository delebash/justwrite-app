"""JwDbUsageSink — server-side dispatch usage persists to the LlmUsage table
(the shared ledger's host sink, installed by create_app) and surfaces via both
JW's own /v1/llm-usage and the shared /v1/ai-usage.
"""

from fastapi.testclient import TestClient

from justwrite_server import database
from justwrite_server.app import create_app
from justwrite_server.models import LlmUsage
from llm_runner.llm import get_llm_registry
from llm_runner.llm.base import LLMResponse
from llm_runner.llm.dispatch import chat
from llm_runner.llm.schema import LLMConfig, LLMProviderConfig


class FakeAdapter:
    provider_id = "p1"
    provider_type = "openai-compat"
    default_model = "gpt-4o-mini"

    def chat(self, messages, *, model=None, temperature=0.7, max_tokens=None, system=None, think=False, extra=None):
        return LLMResponse(text="hi", model=model or self.default_model, prompt_tokens=1000, completion_tokens=500)


def _registered_client(tmp_path):
    c = TestClient(create_app(tmp_path))  # create_app installs the JwDbUsageSink
    reg = get_llm_registry()
    reg._adapters = {}
    reg.register(FakeAdapter())
    return c


def _cfg():
    return LLMConfig(providers=[LLMProviderConfig(
        id="p1", name="P1", providerType="openai-compat", defaultModel="gpt-4o-mini")])


def test_dispatch_usage_persists_to_db(tmp_path):
    c = _registered_client(tmp_path)
    resp = chat(config=_cfg(), feature="critique", messages=[], temperature=0.2)
    assert resp.text == "hi"

    # Persisted as a real LlmUsage row (not the in-memory ring).
    db = database.SessionLocal()
    try:
        rows = db.query(LlmUsage).all()
    finally:
        db.close()
    assert len(rows) == 1
    row = rows[0]
    assert row.feature == "critique" and row.provider_id == "p1" and row.model == "gpt-4o-mini"
    assert row.prompt_tokens == 1000 and row.completion_tokens == 500
    assert row.cost > 0  # gpt-4o-mini is priced (0.15 in / 0.60 out per 1M)

    # Surfaces via JW's own usage UI endpoint…
    usage = c.get("/v1/llm-usage").json()
    assert usage["totals"]["calls"] == 1
    assert usage["log"][0]["feature"] == "critique"
    # …and the shared cross-app endpoint (the sink's snapshot).
    shared = c.get("/v1/ai-usage").json()
    assert shared["total_calls"] == 1
    assert shared["by_feature"]["critique"]["calls"] == 1


def test_clear_usage_via_shared_endpoint(tmp_path):
    c = _registered_client(tmp_path)
    chat(config=_cfg(), feature="critique", messages=[], temperature=0.2)
    assert c.delete("/v1/ai-usage").json() == {"cleared": True}
    db = database.SessionLocal()
    try:
        assert db.query(LlmUsage).count() == 0
    finally:
        db.close()
