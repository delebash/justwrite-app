"""/v1/ai/routing — the Features-tab editor over the shared routing store (the global
default LLM + embedding), and the shared build_llm_config that turns it into the
dispatch view. Per-feature pins were removed 2026-07-15 (the action's preset owns
routing). Behaviour test."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app
from justwrite_server.feature_catalog import FEATURE_CATALOG
from llm_runner.llm import build_llm_config


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_catalog_size(tmp_path):
    _c(tmp_path)
    assert len(FEATURE_CATALOG) == 22  # +characterProfile (E) +characterVoice (WS8)


def test_get_routing_returns_full_catalog(tmp_path):
    c = _c(tmp_path)
    body = c.get("/v1/ai/routing").json()
    assert body["default"] == {"llmId": "", "model": "", "embeddingId": "", "embeddingModel": ""}
    feats = {f["key"]: f for f in body["features"]}
    assert set(feats) == {e.key for e in FEATURE_CATALOG}
    assert feats["critique"]["label"] == "Critique"
    # Per-feature pins are gone — the row is catalog metadata only, no `pins` map.
    assert "providerId" not in feats["critique"]
    assert "pins" not in body


def test_put_persists_default_and_drives_dispatch(tmp_path):
    c = _c(tmp_path)
    payload = {
        "default": {"llmId": "openai", "embeddingId": "openai", "embeddingModel": "text-embedding-3-small"},
    }
    assert c.put("/v1/ai/routing", json=payload).status_code == 200

    got = c.get("/v1/ai/routing").json()
    assert got["default"]["embeddingId"] == "openai"
    assert got["default"]["embeddingModel"] == "text-embedding-3-small"

    # The feature-pin layer RETIRED entirely (kit 1952c6a — presets own routing);
    # LLMConfig no longer carries the attribute at all. Pin the absence so a
    # resurrection has to come back through a deliberate change, not a leftover.
    cfg = build_llm_config()
    assert not hasattr(cfg, "feature_pins")
