"""Application-wide state — singleton via set_state/get_state, mirroring
JustVoice. P0 holds the data dir; stores arrive with the entity tables.
"""

from __future__ import annotations

from pathlib import Path


class AppState:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        data_dir.mkdir(parents=True, exist_ok=True)


_STATE: AppState | None = None


def set_state(state: AppState) -> None:
    global _STATE
    _STATE = state


def get_state() -> AppState:
    if _STATE is None:
        raise RuntimeError("AppState not initialized — call set_state() during boot")
    return _STATE
