"""/v1/llm-usage — the LLM cost/token ledger (real rows, not a kv blob)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _row(**kw):
    base = {"feature": "rewrite", "providerId": "openai", "model": "gpt-4o-mini",
            "promptTokens": 100, "completionTokens": 50, "cost": 0.01, "at": 1}
    base.update(kw)
    return base


def test_empty(tmp_path):
    r = _c(tmp_path).get("/v1/llm-usage").json()
    assert r["log"] == []
    assert r["totals"]["calls"] == 0
    assert r["totals"]["byFeature"] == {} and r["totals"]["byProvider"] == {}


def test_post_and_totals(tmp_path):
    c = _c(tmp_path)
    assert c.post("/v1/llm-usage", json=_row(at=1)).status_code == 204
    assert c.post("/v1/llm-usage", json=_row(at=2, feature="expand", promptTokens=200, completionTokens=80, cost=0.02)).status_code == 204
    assert c.post("/v1/llm-usage", json=_row(at=3, providerId="anthropic", cost=0.05)).status_code == 204

    r = c.get("/v1/llm-usage").json()
    t = r["totals"]
    assert t["calls"] == 3
    assert t["promptTokens"] == 400  # 100 + 200 + 100
    assert t["completionTokens"] == 180
    assert abs(t["cost"] - 0.08) < 1e-9
    # Grouped aggregates
    assert t["byFeature"]["rewrite"]["calls"] == 2
    assert t["byFeature"]["expand"]["calls"] == 1
    assert t["byProvider"]["openai"]["calls"] == 2
    assert t["byProvider"]["anthropic"]["calls"] == 1
    # Log is oldest-first
    assert [row["at"] for row in r["log"]] == [1, 2, 3]
    assert r["log"][0]["providerId"] == "openai"


def test_limit_returns_recent_but_totals_cover_all(tmp_path):
    c = _c(tmp_path)
    for i in range(5):
        c.post("/v1/llm-usage", json=_row(at=i + 1, cost=1.0))
    r = c.get("/v1/llm-usage", params={"limit": 2}).json()
    assert [row["at"] for row in r["log"]] == [4, 5]  # last 2, oldest-first
    assert r["totals"]["calls"] == 5                  # totals still cover all
    assert abs(r["totals"]["cost"] - 5.0) < 1e-9


def test_persist_across_instances_and_clear(tmp_path):
    c = _c(tmp_path)
    c.post("/v1/llm-usage", json=_row(at=1))
    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/llm-usage").json()["totals"]["calls"] == 1
    assert c2.delete("/v1/llm-usage").status_code == 204
    assert c2.get("/v1/llm-usage").json()["totals"]["calls"] == 0
