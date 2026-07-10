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


def test_runner_cache_lives_under_data_dir(tmp_path):
    # The bundled runner's engine + model cache resolves under the app data dir
    # (portable root: <data_dir>/ai-cache), not the OS ~/.cache — install_llm
    # threads data_dir → configure_service(cache_root=...).
    from llm_runner.runner.lifecycle import get_service

    create_app(tmp_path)
    assert get_service().cache_root == tmp_path / "ai-cache"


def test_shared_runner_mounted(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)

    # The shared runner is mounted in-process — JustWrite gets the same
    # /v1/llm-runner/* surface JustVoice does. (Config is DB-backed now — A7
    # retired runner-manifest.json; the endpoint is /config, not /manifest.)
    r = client.get("/v1/llm-runner/config")
    assert r.status_code == 200
    body = r.json()
    assert "safetyMarginMb" in body  # camelCase wire from the runner
    assert body["llamacpp"]["binaries"]  # binaries seeded into the DB


def test_disk_usage_mounted(tmp_path):
    # The shared platform disk-usage router is mounted over the same data_dir (the
    # reclaim-disk Settings panel reads it). Every bucket key is present, and the DB
    # the server just created is counted in the `database` bucket.
    app = create_app(tmp_path)
    client = TestClient(app)

    r = client.get("/v1/disk/usage")
    assert r.status_code == 200
    body = r.json()
    for k in ("database", "appLogs", "modelsCache", "engineBuilds", "spawnLogs", "total", "diskFree", "diskTotal"):
        assert k in body
    assert body["database"] > 0  # justwrite.db exists after create_app
    assert body["diskTotal"] > 0
