# SPDX-License-Identifier: MIT
"""The Python half of the JustWrite seed + storage parity check (compare-seed.mjs drives it).

    <JustWrite venv python> compare-seed.py run <data_dir> <ops.json> <answers.json>
    <JustWrite venv python> compare-seed.py dump <db file> <out.json>

`run` boots the real Python server (create_app + seed_workspace — the `serve` boot), replays
the request list through TestClient, writes each answer to <answers.json>, and copies the
database at every SNAPSHOT step with SQLite's backup API (page copy — rowids kept, unlike
VACUUM). `dump` reads a database the one way both sides are compared: sqlite_master in rowid
order, and every table's cells as SQLite's quote() (type and bytes) in rowid order.

The Python server it reads was deleted on 2026-10-08, after the port was checked; to run this
again, check out the commit before the deletion.
"""

from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import sys
import zipfile
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))


def answer(r) -> dict:
    ctype = r.headers.get("content-type", "")
    out = {"status": r.status_code}
    if ctype.startswith("application/zip"):
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        out["zip"] = [[i.filename, hashlib.sha256(zf.read(i)).hexdigest()] for i in zf.infolist()]
        out["disposition"] = r.headers.get("content-disposition")
    elif "json" in ctype:
        out["json"] = r.json()
    elif r.content:
        out["sha256"] = hashlib.sha256(r.content).hexdigest()
        out["type"] = ctype
    return out


def run(data_dir: str, ops_file: str, answers_file: str) -> None:
    from fastapi.testclient import TestClient

    from justwrite_server.app import create_app
    from justwrite_server.database import session as _db
    from justwrite_server.database.seed import seed_workspace

    app = create_app(Path(data_dir))
    seed_workspace()  # the serve boot
    c = TestClient(app)
    answers = []
    for op in json.loads(Path(ops_file).read_text(encoding="utf-8")):
        if op[0] == "SNAPSHOT":
            src = sqlite3.connect(str(_db._db_path))
            dst = sqlite3.connect(op[1])
            src.backup(dst)
            dst.close()
            src.close()
            continue
        method, url, body = op
        kw = {}
        if body is not None:
            kw = {"content": body.encode("utf-8"), "headers": {"content-type": "application/json"}}
        answers.append([method, url, answer(c.request(method, url, follow_redirects=False, **kw))])
    Path(answers_file).write_text(json.dumps(answers, ensure_ascii=False), encoding="utf-8")


def dump(db_file: str, out_file: str) -> None:
    con = sqlite3.connect(db_file)
    master = [list(r) for r in con.execute("select type, name, tbl_name, sql from sqlite_master order by rowid")]
    tables = {}
    for (name,) in con.execute("select name from sqlite_master where type = 'table' order by rowid"):
        cols = [r[1] for r in con.execute(f'pragma table_info("{name}")')]
        sel = ", ".join(f'quote("{c}")' for c in cols)
        rows = [list(r) for r in con.execute(f'select {sel} from "{name}" order by rowid')]
        tables[name] = {"cols": cols, "rows": rows}
    con.close()
    Path(out_file).write_text(json.dumps({"master": master, "tables": tables}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, *args = sys.argv[1:]
    {"run": run, "dump": dump}[cmd](*args)
