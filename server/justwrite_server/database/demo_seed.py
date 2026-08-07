# SPDX-License-Identifier: MIT
"""Data-driven sample loader for the JustWrite demo/tutorial book.

The sample is no longer hardcoded Python (it was a 536-line module until
2026-07-12). Samples now ship as **exported book folders** under the repo-root
`justwrite-app/samples/` (moved OUT of the Python package 2026-07-13):

    samples/<name>/book.json     # the exportSnapshot() / book_io.decompose shape
    samples/<name>/images/       # optional — the book's image files, when it has any

`book.json` is exactly what the app itself exports (Settings → Backups, or the
per-project export), so a sample is just an exported project checked into the repo.
Adding or swapping a sample = drop a folder in `samples/`; no code change. The
"Try tutorial project" button seeds `DEFAULT_SAMPLE` (POST /v1/projects/demo →
`create_demo_project` in seed.py → `book_io.decompose`).

At read time the loader is STATE-INDEPENDENT (`_samples_dir()`): it prefers the
copy `create_app` materializes into `<data_dir>/samples/` (so the samples ride the
portable data root a relocate carries), and falls back to the bundled source —
`JUSTWRITE_SAMPLES_SRC` if set, else the repo-root `samples/` — whenever AppState
is unset (direct-call tests / pre-boot) or the data-dir copy is missing/partial.

The bundled tutorial is "The Ninth Facet" (Tamsin Vale). Its authoring source is
not in the repo — to edit it, open the sample in the app, edit, and re-export the
folder over this one.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..app_state import get_state

# Which bundled sample the tutorial button seeds.
DEFAULT_SAMPLE = "the-ninth-facet"

# Fixed id so a reset-then-reseed produces the same project (reset-safe, never
# duplicated) and the demo gate is unambiguous.
DEMO_PROJECT_ID = "prj_sample_ninth_facet"


def _dir_has_sample(d: Path) -> bool:
    """True when `d` is a dir holding at least one `<name>/book.json` sample."""
    return d.is_dir() and any((p / "book.json").is_file() for p in d.iterdir() if p.is_dir())


def _bundled_samples_dir() -> Path:
    """The samples source SHIPPED with the app: `JUSTWRITE_SAMPLES_SRC` when set
    (the packaged build points it at the bundled resource — DEFERRED wiring), else
    the repo-root `justwrite-app/samples/` (`parents[3]` from this file — it sits
    in `server/justwrite_server/database/`, and samples live outside the Python
    package)."""
    env = os.environ.get("JUSTWRITE_SAMPLES_SRC")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3] / "samples"


def _samples_dir() -> Path:
    """Where to READ bundled samples from — state-independent.

    Prefer the copy `create_app` materializes under the live data dir, but
    `get_state()` raises `RuntimeError` when AppState is unset (direct-call tests,
    pre-boot) and a materialize can be absent/partial — so fall back to the bundled
    source whenever the data-dir copy is unusable. Keeps `test_a_sample_is_bundled`
    green without relying on a global-state leak.
    """
    try:
        d = get_state().data_dir / "samples"
        if _dir_has_sample(d):
            return d
    except RuntimeError:
        pass
    return _bundled_samples_dir()


def list_samples() -> list[str]:
    """Every bundled sample name (a folder under samples/ with a book.json)."""
    d = _samples_dir()
    if not d.is_dir():
        return []
    return sorted(p.name for p in d.iterdir() if (p / "book.json").is_file())


def load_sample(name: str = DEFAULT_SAMPLE) -> dict:
    """Load a sample's book.json — the snapshot shape `book_io.decompose` consumes
    (the same shape `assemble` emits and the app's project export produces)."""
    path = _samples_dir() / name / "book.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_sample_images(name: str = DEFAULT_SAMPLE) -> dict[str, bytes]:
    """Every file under samples/<name>/images/ as {filename: bytes} — the image
    payload the export/import format carries alongside book.json. Empty when the
    sample ships no images/ folder (the bundled sample is image-less today)."""
    img_dir = _samples_dir() / name / "images"
    if not img_dir.is_dir():
        return {}
    return {p.name: p.read_bytes() for p in img_dir.iterdir() if p.is_file()}


def demo_book_snapshot() -> dict:
    """The tutorial sample as the snapshot `book_io.decompose` consumes."""
    return load_sample(DEFAULT_SAMPLE)


def demo_sample_images() -> dict[str, bytes]:
    """The tutorial sample's image files (empty for the image-less bundled book)."""
    return load_sample_images(DEFAULT_SAMPLE)
