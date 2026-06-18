"""Filesystem locations for the JustWrite server."""

from __future__ import annotations

from pathlib import Path

import platformdirs

APP_NAME = "JustWrite"


def default_data_dir() -> Path:
    """Per-user data directory (SQLite DB + future artifacts)."""
    return Path(platformdirs.user_data_dir(APP_NAME))
