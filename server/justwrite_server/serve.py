"""`justwrite-server` — run the server standalone (and as the Tauri sidecar).

The family entry shape (target-tree P3, 2026-08-08; docgen's serve.py is the
donor): `justwrite-server serve` is the canonical form — the shell and the npm
`server` script use it — and the bare form works too. cli.py died with this
piece: serve was its only command.

Seeding stays HERE, not in create_app(), on purpose: the pytest suite's
`create_app(tmp_path)` clients must start from an empty database (the family's
named winner for the seeding call-site).
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

from .app import create_app
from .version import PRODUCT, VERSION


def main() -> None:
    ap = argparse.ArgumentParser(description="JustWrite server")
    ap.add_argument("command", nargs="?", choices=["serve"], default="serve")
    ap.add_argument("--host", default=os.environ.get("JUSTWRITE_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("JUSTWRITE_PORT", "17495")))
    ap.add_argument("--data-dir", default=os.environ.get("JUSTWRITE_DATA_DIR"))
    args = ap.parse_args()

    print(f"{PRODUCT} {VERSION} — http://{args.host}:{args.port}/")
    app = create_app(Path(args.data_dir) if args.data_dir else None)

    # Seed the demo project + default LLM providers now that the DB is up
    # (create_app ran init_db). Kept here — and in the workspace-reset handler —
    # rather than in create_app(), so the pytest suite's create_app(tmp_path)
    # clients still start from an empty database.
    from .seed import seed_workspace

    seed_workspace()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
