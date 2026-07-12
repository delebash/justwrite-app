# SPDX-License-Identifier: GPL-3.0-or-later
"""Data-driven sample loader for the JustWrite demo/tutorial book.

The sample is no longer hardcoded Python (it was a 536-line module until
2026-07-12). Samples now ship as **exported book folders** under `samples/`:

    samples/<name>/book.json     # the exportSnapshot() / book_io.decompose shape
    samples/<name>/images/       # optional — the book's image files, when it has any

`book.json` is exactly what the app itself exports (Settings → Backups, or the
per-project export), so a sample is just an exported project checked into the repo.
Adding or swapping a sample = drop a folder in `samples/`; no code change. The
"Try tutorial project" button seeds `DEFAULT_SAMPLE` (POST /v1/projects/demo →
`create_demo_project` in seed.py → `book_io.decompose`).

The bundled tutorial is "The Ninth Facet" (Tamsin Vale). Its authoring source is
not in the repo — to edit it, open the sample in the app, edit, and re-export the
folder over this one.
"""

from __future__ import annotations

import json
from pathlib import Path

_SAMPLES_DIR = Path(__file__).parent / "samples"

# Which bundled sample the tutorial button seeds.
DEFAULT_SAMPLE = "the-ninth-facet"

# Fixed id so a reset-then-reseed produces the same project (reset-safe, never
# duplicated) and the demo gate is unambiguous.
DEMO_PROJECT_ID = "prj_sample_ninth_facet"


def list_samples() -> list[str]:
    """Every bundled sample name (a folder under samples/ with a book.json)."""
    if not _SAMPLES_DIR.is_dir():
        return []
    return sorted(p.name for p in _SAMPLES_DIR.iterdir() if (p / "book.json").is_file())


def load_sample(name: str = DEFAULT_SAMPLE) -> dict:
    """Load a sample's book.json — the snapshot shape `book_io.decompose` consumes
    (the same shape `assemble` emits and the app's project export produces)."""
    path = _SAMPLES_DIR / name / "book.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def demo_book_snapshot() -> dict:
    """The tutorial sample as the snapshot `book_io.decompose` consumes."""
    return load_sample(DEFAULT_SAMPLE)
