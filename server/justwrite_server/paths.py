"""Filesystem locations for the JustWrite server.

Resolution order (THE family policy — the shape lives in the kit, never
here: `llm_runner.platform.data_paths`):
  1. Explicit `--data-dir` CLI flag
  2. `JUSTWRITE_DATA_DIR` — the user's choice; also how the desktop shell
     hands down its resolved root
  3. `data/` beside the app (the DEFAULT — portable, in the install dir)
  4. The OS app-data dir, only when the install dir is not writable
"""

from __future__ import annotations

from pathlib import Path

from llm_runner.platform import resolve_data_dir

APP_NAME = "JustWrite"

# The checkout root in a source install: server/justwrite_server/paths.py →
# repo. (Frozen builds ignore this — the kit uses the executable's folder.)
SOURCE_ROOT = Path(__file__).resolve().parents[2]


def default_data_dir() -> Path:
    """The app's data root, per the ONE family policy (user ruling
    2026-08-14 — *"absolutely no data ... stored anywhere but where the user
    has set the storage directory, which by default will be the install
    directory for the app"*).

    The desktop shell already resolved this shape itself (a portable `data/`
    beside the exe) and hands the result down via `JUSTWRITE_DATA_DIR`, so
    this function governs HEADLESS runs — which is precisely where the old
    `platformdirs.user_data_dir(APP_NAME)` default quietly created
    `AppData/Local/JustWrite/JustWrite` behind the user's back. Shell and
    server now implement the identical ladder; keep them in lock-step."""
    return resolve_data_dir(
        app_name=APP_NAME,
        env_var="JUSTWRITE_DATA_DIR",
        source_root=SOURCE_ROOT,
    )
