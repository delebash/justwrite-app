"""/v1/ai/routing — the Features-tab editor over JW's routing tables
(routing_configs + routing_pins), and the config.py wiring that makes saved
routing actually drive dispatch. Behavioural: storage-agnostic by design."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app
from justwrite_server.feature_catalog import FEATURE_CATALOG
from justwrite_server.llm.config import DEFAULT_FEATURE_ROLES, llm_config


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_catalog_role_map_matches_feature_catalog():
    # DEFAULT_FEATURE_ROLES is derived from the one catalog source (no drift).
    assert DEFAULT_FEATURE_ROLES == {e.key: e.role for e in FEATURE_CATALOG}
    assert len(FEATURE_CATALOG) == 20


def test_get_routing_returns_full_catalog_unpinned(tmp_path):
    c = _c(tmp_path)
    body = c.get("/v1/ai/routing").json()
    assert body["default"] == {"llmId": "", "model": "", "embeddingId": "", "embeddingModel": ""}
    feats = {f["key"]: f for f in body["features"]}
    assert set(feats) == {e.key for e in FEATURE_CATALOG}
    assert feats["critique"]["label"] == "Critique"
    assert feats["critique"]["defaultRole"] == "accuracy"
    assert feats["critique"]["providerId"] == "" and feats["critique"]["role"] == ""


def test_put_persists_and_drives_dispatch_config(tmp_path):
    c = _c(tmp_path)
    payload = {
        "default": {"llmId": "openai", "embeddingId": "openai", "embeddingModel": "text-embedding-3-small"},
        "quick": {"providerId": "local-llamacpp", "model": "qwen3-4b"},
        "accuracy": {"providerId": "claude", "model": "claude-sonnet-4-6"},
        "pins": {
            "critique": {"providerId": "openai", "model": "gpt-4o", "role": ""},
            "brainstorm": {"providerId": "", "model": "", "role": "quick"},
            # An all-empty pin is "inherit default" and must NOT persist.
            "chat": {"providerId": "", "model": "", "role": ""},
        },
    }
    assert c.put("/v1/ai/routing", json=payload).status_code == 200

    got = c.get("/v1/ai/routing").json()
    # The default embedding provider + model round-trip (the Default-embedding picker).
    assert got["default"]["embeddingId"] == "openai"
    assert got["default"]["embeddingModel"] == "text-embedding-3-small"
    feats = {f["key"]: f for f in got["features"]}
    assert feats["critique"]["providerId"] == "openai" and feats["critique"]["model"] == "gpt-4o"
    assert feats["brainstorm"]["role"] == "quick"
    assert feats["chat"]["providerId"] == "" and feats["chat"]["role"] == ""  # dropped

    # The wiring: llm_config() reflects the saved roles + pins.
    cfg = llm_config()
    assert cfg.llm_roles.quick.providerId == "local-llamacpp"
    assert cfg.llm_roles.accuracy.model == "claude-sonnet-4-6"
    pins = {p.feature: p for p in cfg.feature_pins}
    assert pins["critique"].providerId == "openai" and pins["critique"].model == "gpt-4o"
    assert pins["brainstorm"].role == "quick" and not pins["brainstorm"].providerId
    assert "chat" not in pins  # empty pin not persisted


def test_default_only_falls_back_to_both_roles(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/ai/routing", json={"default": {"llmId": "openai", "model": "gpt-4o", "embeddingId": ""}})
    cfg = llm_config()
    # No explicit roles → both resolve to the default provider + its chosen model.
    assert cfg.llm_roles.quick.providerId == "openai" and cfg.llm_roles.quick.model == "gpt-4o"
    assert cfg.llm_roles.accuracy.providerId == "openai" and cfg.llm_roles.accuracy.model == "gpt-4o"
