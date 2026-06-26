"""/v1/ai/routing — the Features-tab editor over the shared routing store, and the
shared build_llm_config that turns saved routing (default + per-job map + explicit
pins) + the feature→job map into the dispatch view. Job-native; behaviour test."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app
from justwrite_server.feature_catalog import FEATURE_CATALOG
from llm_runner.llm import build_llm_config


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_catalog_size(tmp_path):
    _c(tmp_path)
    assert len(FEATURE_CATALOG) == 20


def test_get_routing_returns_full_catalog_unpinned(tmp_path):
    c = _c(tmp_path)
    body = c.get("/v1/ai/routing").json()
    assert body["default"] == {"llmId": "", "model": "", "embeddingId": "", "embeddingModel": ""}
    feats = {f["key"]: f for f in body["features"]}
    assert set(feats) == {e.key for e in FEATURE_CATALOG}
    assert feats["critique"]["label"] == "Critique"
    assert feats["critique"]["providerId"] == "" and feats["critique"]["model"] == ""


def test_put_persists_jobs_and_pins_and_drives_dispatch(tmp_path):
    c = _c(tmp_path)
    # Classify a feature into a job via the real feature-jobs endpoint.
    assert c.put("/v1/ai/feature-jobs", json={"featureKey": "critique", "jobId": "analysis"}).status_code == 200

    payload = {
        "default": {"llmId": "openai", "embeddingId": "openai", "embeddingModel": "text-embedding-3-small"},
        "jobs": {
            "prose": {"providerId": "local-llamacpp", "model": "qwen3-4b"},
            "analysis": {"providerId": "claude", "model": "claude-sonnet-4-6"},
        },
        "pins": {
            "critique": {"providerId": "openai", "model": "gpt-4o"},
            # An all-empty pin is "inherit the job" and must NOT persist.
            "chat": {"providerId": "", "model": ""},
        },
    }
    assert c.put("/v1/ai/routing", json=payload).status_code == 200

    got = c.get("/v1/ai/routing").json()
    assert got["default"]["embeddingId"] == "openai"
    assert got["default"]["embeddingModel"] == "text-embedding-3-small"
    assert got["jobs"]["prose"]["model"] == "qwen3-4b"
    feats = {f["key"]: f for f in got["features"]}
    assert feats["critique"]["providerId"] == "openai" and feats["critique"]["model"] == "gpt-4o"
    assert feats["chat"]["providerId"] == ""  # empty pin dropped

    # The wiring: build_llm_config() reflects the saved jobs + feature→job map + pins.
    cfg = build_llm_config()
    assert cfg.jobs["prose"].providerId == "local-llamacpp"
    assert cfg.jobs["analysis"].model == "claude-sonnet-4-6"
    assert cfg.feature_jobs["critique"] == "analysis"
    pins = {p.feature: p for p in cfg.feature_pins}
    assert pins["critique"].providerId == "openai" and pins["critique"].model == "gpt-4o"
    assert "chat" not in pins  # empty pin not persisted


def test_feature_inherits_its_job_in_dispatch(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/ai/feature-jobs", json={"featureKey": "brainstorm", "jobId": "prose"})
    c.put("/v1/ai/routing", json={"jobs": {"prose": {"providerId": "openai", "model": "gpt-4o"}}})
    cfg = build_llm_config()
    # brainstorm has no explicit pin → it resolves through its job (prose).
    assert "brainstorm" not in {p.feature for p in cfg.feature_pins}
    assert cfg.feature_jobs["brainstorm"] == "prose"
    assert cfg.jobs["prose"].model == "gpt-4o"
