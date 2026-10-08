# SPDX-License-Identifier: MIT
"""Dump JustWrite's seed DATA (what app.py hands install_llm) as JSON, for the check that the
JavaScript seed modules hold exactly the same values in the same order
(`tests/seed_data.test.js`).

    <JustWrite venv python> server/scripts/dump-seed-data.py

Writes `server/tests/fixtures/python-seed-data.json`. Re-run when a Python seed changes (and
re-run port-seed-modules.py) until the Python server is deleted.

The Python server it reads was deleted on 2026-10-08, after the port was checked; to run this
again, check out the commit before the deletion.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))


def plain(v):
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return plain(dataclasses.asdict(v))
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    return v


def main() -> None:
    from justwrite_server import feature_catalog as fc
    from justwrite_server import seed_feature_prompts as fp
    from justwrite_server import seed_presets as sp

    data = {
        "FEATURE_CATALOG": plain(fc.FEATURE_CATALOG),
        "DEFAULT_FEATURE_PROMPTS": plain(fp.DEFAULT_FEATURE_PROMPTS),
        "FEATURE_PROMPT_HEALS": plain(fp.FEATURE_PROMPT_HEALS),
        "DEFAULT_ENGINE_PRESETS": plain(sp.DEFAULT_ENGINE_PRESETS),
        "DEFAULT_MODEL_CATALOG_EXTRA": plain(sp.DEFAULT_MODEL_CATALOG_EXTRA),
        "DEFAULT_FEATURE_PRESETS": plain(sp.DEFAULT_FEATURE_PRESETS),
        "DEFAULT_PRESET_ID": sp.DEFAULT_PRESET_ID,
        "DEFAULT_TEST_SAMPLES": plain(sp.DEFAULT_TEST_SAMPLES),
        "JW_CURATED_CATALOG": plain(sp.JW_CURATED_CATALOG),
        "JW_EMBED_TEMPLATES": plain(sp.JW_EMBED_TEMPLATES),
        "JW_CLASS_TUNES": plain(sp.JW_CLASS_TUNES),
        "JW_CLASS_TUNE_IDENTITY": plain(sp.JW_CLASS_TUNE_IDENTITY),
    }
    out = SERVER / "tests" / "fixtures" / "python-seed-data.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out.relative_to(SERVER)}")


if __name__ == "__main__":
    main()
