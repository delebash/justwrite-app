"""P0 — the JustWrite server boots, serves /v1/health, creates SQLite, and
mounts the shared llm-runner router in-process (same router JustVoice uses).
"""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def test_health_and_db(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)

    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["dbReady"] is True
    assert str(tmp_path) == body["dataDir"]
    assert (tmp_path / "justwrite.db").is_file()


def test_shared_runner_mounted(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)

    # The shared runner is mounted in-process — JustWrite gets the same
    # /v1/llm-runner/* surface JustVoice does.
    r = client.get("/v1/llm-runner/manifest")
    assert r.status_code == 200
    assert "flagPresets" in r.json()  # camelCase wire from the runner
